import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { storeOwnedFacilitiesFile } from "@/lib/facilities-files/service";
import { FilesystemFacilitiesPrivateStorage, type FacilitiesStorageKey } from "@/lib/facilities-files/storage";
async function main() {
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/phase11_facilities_cli");assert.equal(url.username,"phase1_runtime");
 const owner=new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}});
 const root=await mkdtemp(join(tmpdir(),"phase11-facilities-cli-")),storage=new FilesystemFacilitiesPrivateStorage(root);
 const bytes=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n");
 try {
  const user=await owner.user.create({data:{mobile:randomUUID()}}),company=await owner.company.create({data:{userId:user.id}});
  const binding=await db.facilitiesFileBinding.create({data:{scope:"COMPANY_PROFILE",scopeId:company.id,companyId:company.id,userId:user.id,slotKey:"r9"}});
  const upload=()=>storeOwnedFacilitiesFile({userId:user.id,bindingId:binding.id,idempotencyKey:randomUUID().replaceAll("-",""),fileName:"synthetic.pdf",bytes,storage,scanner:{scan:async()=>({status:"PASSED"})}});
  const a=await upload(),b=await upload();assert.equal(a.lifecycleStatus,"PASSED");assert.equal(b.lifecycleStatus,"PASSED");
  const old=await db.storedFile.findUniqueOrThrow({where:{id:a.fileId!}}),current=await db.storedFile.findUniqueOrThrow({where:{id:b.fileId!}});
  const run=()=>{const r=spawnSync(process.execPath,["--import","tsx","scripts/reconcile-facilities-files.ts"],{env:{...process.env,FACILITIES_UPLOAD_DIR:root},encoding:"utf8",timeout:25000});assert.ifError(r.error);return {code:r.status,output:r.stdout+r.stderr};};
  await rm(join(root,old.storageKey));await mkdir(join(root,old.storageKey));
  const failed=run();assert.equal(failed.code,2,failed.output);assert.match(failed.output,/facilities_file_reconciliation_incomplete/);assert.doesNotMatch(failed.output,/facilities_file_reconciliation_completed/);
  assert.equal(await db.facilitiesAuditLog.count({where:{action:"RECONCILIATION_COMPLETED"}}),0);assert.deepEqual(await storage.readReady(current.storageKey as FacilitiesStorageKey),bytes);
  await rm(join(root,old.storageKey),{recursive:true});await writeFile(join(root,old.storageKey),bytes);
  await owner.facilitiesFileDeletionTombstone.update({where:{uploadId:a.uploadId!},data:{nextAttemptAt:new Date(0)}});
  const recovered=run();assert.equal(recovered.code,0,recovered.output);assert.match(recovered.output,/facilities_file_reconciliation_completed/);
  await assert.rejects(access(join(root,old.storageKey)));assert.deepEqual(await storage.readReady(current.storageKey as FacilitiesStorageKey),bytes);
  assert.equal(await db.facilitiesAuditLog.count({where:{action:"RECONCILIATION_COMPLETED"}}),1);
  assert.equal(await db.facilitiesFileUpload.count({where:{bindingId:binding.id}}),2);
  console.info(JSON.stringify({actualFacilitiesCli:"passed",storageFailureExit:2,failedCompletionAudits:0,recoveryExit:0,recoveryCompletionAudits:1,currentBytesPreserved:true,uploadHistoryPreserved:true}));
 }finally{await owner.$disconnect();await db.$disconnect();await rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error("FACILITIES_CLI_FIXTURE_FAILED", error instanceof Error ? error.message : "unknown");process.exitCode=1;});
