import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { stageLegacyUpload } from "@/lib/uploads/candidates";
import { commitApplicantUpload } from "@/lib/uploads/coordination";
import { db } from "@/lib/db";
import { maintenancePage, advanceMaintenanceCursor, rotatedMaintenanceQueues } from "@/lib/maintenance/cursor";
const enabled = process.env.PHASE1_ISOLATED_DB === "true";
const owner = enabled ? new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}}) : null;
function cli(script: string, overrides: Record<string,string> = {}) {
  return new Promise<{code:number|null;output:string}>((resolve,reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", `scripts/${script}.ts`], {env:{...process.env,...overrides},stdio:["ignore","pipe","pipe"]});
    let output="";child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>output+=b);
    child.once("error",reject);child.once("exit",code=>resolve({code,output}));
  });
}
describe.runIf(enabled)("R9 actual restricted maintenance CLI",{timeout:30000},()=>{
 beforeAll(()=>{const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=="127.0.0.1"||u.pathname!=="/phase1"||u.username!=="phase1_runtime")throw Error("unsafe fixture");});
 beforeEach(async()=>{await owner!.$executeRaw`TRUNCATE "OtpCode", "MaintenanceCursor"`;});
 afterAll(async()=>{await db.$disconnect();await owner?.$disconnect();});
 it("prunes expired 24h-old codes and preserves recent and still-live codes",async()=>{
  const old=new Date(Date.now()-25*3600000),future=new Date(Date.now()+3600000);
  await owner!.otpCode.createMany({data:[{id:"old",mobile:"fixture",purpose:"USER_LOGIN",codeHash:"fixture",createdAt:old,expiresAt:old},{id:"recent",mobile:"fixture",purpose:"USER_LOGIN",codeHash:"fixture",expiresAt:new Date()},{id:"live",mobile:"fixture",purpose:"USER_LOGIN",codeHash:"fixture",createdAt:old,expiresAt:future}]});
  const r=await cli("prune-otp-codes");expect(r.code,r.output).toBe(0);expect(r.output).toContain("otp_prune_completed");expect((await owner!.otpCode.findMany()).map(x=>x.id).sort()).toEqual(["live","recent"]);
 });
 it("reports bounded backlog nonzero and resumes in a new process",async()=>{
  await owner!.$executeRaw`INSERT INTO "OtpCode" (id,mobile,purpose,"codeHash","createdAt","expiresAt") SELECT 'batch-'||n,'fixture','USER_LOGIN','fixture',now()-interval '25 hours',now()-interval '24 hours' FROM generate_series(1,5001) n`;
  const first=await cli("prune-otp-codes");expect(first.code,first.output).toBe(2);expect(first.output).toContain("BACKLOG_REMAINS");expect(await owner!.otpCode.count()).toBe(1);
  expect((await cli("prune-otp-codes")).code).toBe(0);expect(await owner!.otpCode.count()).toBe(0);
 });
 it.each(["OtpCode","ApplicationFile","LegacyFileVerification","MaintenanceCursor"])("does not grant unrestricted DELETE/TRUNCATE on %s",async table=>{
  await expect(db.$executeRawUnsafe(`DELETE FROM "${table}"`)).rejects.toThrow();await expect(db.$executeRawUnsafe(`TRUNCATE "${table}"`)).rejects.toThrow();
 });
 it("OTP lock contention is nonzero and does not collide with orphan coordination",async()=>{
  await owner!.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(730180805)`;const r=await cli("prune-otp-codes");expect(r.code,r.output).toBe(2);expect(r.output).toContain("LOCK_HELD");},{timeout:15000});
  await owner!.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(730180801)`;const r=await cli("prune-otp-codes");expect(r.code,r.output).toBe(0);},{timeout:15000});
 });
 it("DB failure never reports completion",async()=>{
  const url=new URL(process.env.DATABASE_URL!);url.port="1";const r=await cli("prune-otp-codes",{DATABASE_URL:url.toString()});expect(r.code).toBe(1);expect(r.output).not.toContain("otp_prune_completed");
 });
 it("PUBLIC cannot execute the fixed-search-path definer",async()=>{
  const rows=await owner!.$queryRaw<Array<{prosecdef:boolean;proconfig:string[];public_execute:boolean}>>`SELECT prosecdef,proconfig,EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute FROM pg_proc WHERE oid='public.prune_expired_otp_codes()'::regprocedure`;
  expect(rows[0]).toMatchObject({prosecdef:true,public_execute:false,proconfig:["search_path=pg_catalog, public"]});
 });
 it("durable cursor moves past failed rows and wraps",async()=>{
  const rows=[{id:"a"},{id:"b"},{id:"c"}];const read=async(after:string|null)=>rows.filter(r=>!after||r.id>after).slice(0,1);
  expect(await maintenancePage("fixture",read)).toEqual([{id:"a"}]);await advanceMaintenanceCursor("fixture","a");expect(await maintenancePage("fixture",read)).toEqual([{id:"b"}]);await advanceMaintenanceCursor("fixture","c");expect(await maintenancePage("fixture",read)).toEqual([{id:"a"}]);
 });
 it.each([["reconcile-legacy-files",730180806],["reconcile-facilities-files",730180800]] as const)("%s lock contention has an actual nonzero exit",async(script,key)=>{
  await owner!.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::integer)`;const r=await cli(script);expect(r.code,r.output).toBe(2);expect(r.output).toContain("LOCK_HELD");},{timeout:15000});
 });
 it("facilities invalid orphan retention is incomplete through the IPC worker",async()=>{
  const r=await cli("reconcile-facilities-files",{FACILITIES_ORPHAN_TTL_MS:"1"});expect(r.code,r.output).toBe(2);expect(r.output).toContain("TTL_INVALID");expect(r.output).not.toContain("facilities_file_reconciliation_completed");
 });
 it.each(["parent death", "coordination connection death"])("stops IPC work on %s without success", async mode => {
  const child=spawn(process.execPath,["--import","tsx","prisma/tests/maintenance/worker.ts"],{env:process.env,stdio:["ignore","pipe","pipe"]});
  let output="",workerPid=0;
  const exited=new Promise<number|null>(resolve=>child.once("exit",resolve));
  try {
   await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error("worker barrier timeout")),10000);
    child.stdout.on("data",b=>{output+=b;const match=output.match(/WORKER_READY (\d+)/);if(match){workerPid=Number(match[1]);clearTimeout(timer);resolve();}});
    child.stderr.on("data",b=>output+=b);child.once("error",reject);
   });
   if(mode==="parent death") child.kill("SIGKILL");
   else {
    const rows=await owner!.$queryRaw<Array<{terminated:boolean}>>`SELECT pg_terminate_backend(pid) AS terminated FROM pg_locks WHERE locktype='advisory' AND objid=730180899 AND granted`;
    expect(rows).toEqual([{terminated:true}]);
   }
   await exited;
   const until=Date.now()+5000;let alive=true;
   while(alive&&Date.now()<until){try{process.kill(workerPid,0);await new Promise(r=>setTimeout(r,25));}catch{alive=false;}}
   expect(alive,output).toBe(false);
   expect(await rotatedMaintenanceQueues("fixture-queue-order", ["blocking", "healthy"])).toEqual(["healthy", "blocking"]);
   expect(output).not.toContain("fixture_maintenance_completed");
  } finally {child.kill("SIGKILL");if(workerPid)try{process.kill(workerPid,"SIGKILL");}catch{ /* already stopped */ }}
 });

 it("actual legacy command deletes only the predecessor and aged uncommitted bytes",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"phase11-files-"));const previous=process.env.UPLOAD_DIR;process.env.UPLOAD_DIR=root;
  try {
   const id=randomUUID(),user=await owner!.user.create({data:{mobile:id}}),app=await owner!.application.create({data:{userId:user.id,mobile:id,companyNationalId:id}});
   const stage=()=>stageLegacyUpload({applicationId:app.id,fieldKey:"creditReports.ceo",file:new File(["safe,synthetic\n1,2\n"],"fixture.csv"),scanner:{scan:async()=>({status:"PASSED" as const})}});
   const old=await stage();await commitApplicantUpload({applicationId:app.id,userId:user.id,fieldKey:"creditReports.ceo",stored:old,expectedGeneration:0});
   const current=await stage();await commitApplicantUpload({applicationId:app.id,userId:user.id,fieldKey:"creditReports.ceo",stored:current,expectedGeneration:1});
   const abandoned=await stage();
   await owner!.$transaction(async tx=>{await tx.$executeRawUnsafe('ALTER TABLE "LegacyUploadCandidate" DISABLE TRIGGER legacy_candidate_guard');await tx.$executeRaw`UPDATE "LegacyUploadCandidate" SET "createdAt"=now()-interval '25 hours' WHERE id=${abandoned.candidateId}`;await tx.$executeRawUnsafe('ALTER TABLE "LegacyUploadCandidate" ENABLE TRIGGER legacy_candidate_guard');});
   const result=await cli("reconcile-legacy-files",{UPLOAD_DIR:root});expect([0,2],result.output).toContain(result.code);expect(result.output).not.toContain("_failed");
   await expect(access(old.storagePath)).rejects.toThrow();await expect(access(abandoned.storagePath)).rejects.toThrow();expect((await readFile(current.storagePath)).toString()).toContain("safe,synthetic");
   expect(await owner!.applicationFile.count({where:{applicationId:app.id}})).toBe(2);
   // A directory at the fenced abandoned path injects a real unlink failure.
   await mkdir(abandoned.storagePath);
   const failed=await cli("reconcile-legacy-files",{UPLOAD_DIR:root});expect(failed.code,failed.output).toBe(2);expect(failed.output).toContain("legacy_file_reconciliation_incomplete");
   expect((await readFile(current.storagePath)).toString()).toContain("safe,synthetic");
   await rm(abandoned.storagePath,{recursive:true});
   await cli("reconcile-legacy-files",{UPLOAD_DIR:root});
   expect((await owner!.legacyUploadCandidate.findUniqueOrThrow({where:{id:abandoned.candidateId}})).deletedAt).not.toBeNull();
  } finally {if(previous===undefined)delete process.env.UPLOAD_DIR;else process.env.UPLOAD_DIR=previous;await rm(root,{recursive:true,force:true});}
 });

 it("restart executes healthy queue ahead of a previously killed blocking queue",async()=>{
  await advanceMaintenanceCursor("fixture-queue-order","1");
  const child=spawn(process.execPath,["--import","tsx","prisma/tests/maintenance/worker.ts"],{env:process.env,stdio:["ignore","pipe","pipe"]});
  let output="",workerPid=0;
  const exited=new Promise(resolve=>child.once("exit",resolve));
  try {
   await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error("worker barrier timeout")),10000);
    child.stdout.on("data",b=>{output+=b;const match=output.match(/WORKER_READY (\d+)/);if(match){workerPid=Number(match[1]);clearTimeout(timer);resolve();}});child.once("error",reject);
   });
   expect(output.indexOf("HEALTHY_QUEUE_EXECUTED")).toBeGreaterThanOrEqual(0);expect(output.indexOf("HEALTHY_QUEUE_EXECUTED")).toBeLessThan(output.indexOf("WORKER_READY"));
  }finally{child.kill("SIGKILL");await exited;if(workerPid)try{process.kill(workerPid,"SIGKILL");}catch{/* stopped */}}
 });

});
