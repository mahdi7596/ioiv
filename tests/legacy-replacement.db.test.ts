import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, access, writeFile, mkdir, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { stageLegacyUpload, reconcileLegacyCandidate } from "@/lib/uploads/candidates";
import { commitApplicantUpload, commitLegacyFile, legacyDraftData, lockLegacyApplication, validateLegacyDraft } from "@/lib/uploads/coordination";
import { cleanupLegacyReplacements, retryLegacyFileDeletion, safeDeletionPath } from "@/lib/uploads/replace";
import { legacyReferences } from "@/lib/uploads/slots";
import type { FacilitiesFileScanner } from "@/lib/facilities-files/scanner";

const io = vi.hoisted(() => ({ writeError: "", unlinkError: false }));
vi.mock("node:fs/promises", async original => {
 const actual = await original<typeof import("node:fs/promises")>();
 return { ...actual,
  writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
   if(io.writeError) throw Object.assign(new Error("synthetic capacity failure"),{code:io.writeError});
   return actual.writeFile(...args);
  },
  unlink: async (...args: Parameters<typeof actual.unlink>) => {
   if(io.unlinkError) throw Object.assign(new Error("synthetic unlink unavailable"),{code:"EACCES"});
   return actual.unlink(...args);
  },
 };
});
const actors = vi.hoisted(() => ({ userId: "", adminId: "", scanHook: undefined as undefined | (() => Promise<void>) }));
vi.mock("@/lib/auth/session", () => ({ requireSession: async (kind: string) => ({ kind, subjectId: kind === "admin" ? actors.adminId : actors.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/facilities-files/scanner", async original => ({ ...await original<typeof import("@/lib/facilities-files/scanner")>(), createFacilitiesScannerFromEnv: () => ({ scan: async () => { await actors.scanHook?.(); return { status: "PASSED" }; } }) }));
vi.mock("@/lib/payments/zarinpal", async original => ({ ...await original<typeof import("@/lib/payments/zarinpal")>(), requestZarinpalPayment: vi.fn(async () => ({ authority: "fixture-"+randomUUID(), paymentUrl: "http://127.0.0.1/synthetic-payment" })) }));
import { createSubmissionExportRow } from "@/lib/export/submissions";
import { startPayment } from "@/lib/actions/payment";
import { requestZarinpalPayment } from "@/lib/payments/zarinpal";
import { getSubmission, replaceValidationCertificate } from "@/lib/actions/admin";
function barrier() { let release!: () => void; let entered!: () => void; const reached = new Promise<void>(r => entered = r); const gate = new Promise<void>(r => release = r); return { reached, release, wait: async () => { entered(); await gate; } }; }
const enabled = process.env.PHASE1_ISOLATED_DB === "true";
const owner = enabled ? new PrismaClient({ datasources: { db: { url: process.env.PHASE1_OWNER_URL } } }) : null;
const passing: FacilitiesFileScanner = { scan: async () => ({ status: "PASSED" }) };
let root: string;
async function fixture() {
 const id = randomUUID();
 const user = await owner!.user.create({ data: { mobile: id } });
 const application = await owner!.application.create({ data: { userId: user.id, mobile: id, companyNationalId: id } });
 return { applicationId: application.id, userId: user.id };
}
async function stage(applicationId: string, fieldKey = "creditReports.ceo", content = "safe,synthetic\n1,2\n") {
 return stageLegacyUpload({ applicationId, fieldKey, file: new File([content], "fixture.csv"), scanner: passing });
}
async function upload(f: Awaited<ReturnType<typeof fixture>>, generation = 0, fieldKey = "creditReports.ceo") {
 const stored = await stage(f.applicationId, fieldKey);
 const result = await commitApplicantUpload({ ...f, fieldKey, stored, expectedGeneration: generation });
 return { stored, result };
}
async function expire(id: string) {
 // Synthetic owner-only clock fixture. Runtime cannot rewrite immutable timestamps.
 await owner!.$transaction(async tx => {
  await tx.$executeRawUnsafe('ALTER TABLE "LegacyUploadCandidate" DISABLE TRIGGER legacy_candidate_guard');
  await tx.$executeRaw`UPDATE "LegacyUploadCandidate" SET "createdAt"=now()-interval '25 hours' WHERE id=${id}`;
  await tx.$executeRawUnsafe('ALTER TABLE "LegacyUploadCandidate" ENABLE TRIGGER legacy_candidate_guard');
 });
}
describe.skipIf(!enabled)("R8 legacy replacement restricted DB and real bytes", () => {
 beforeAll(async () => { root = await mkdtemp(path.join(tmpdir(), "phase9-legacy-")); process.env.UPLOAD_DIR = root; });
 afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); await owner?.$disconnect(); await db.$disconnect(); });
 it("atomically saves current pointer, draft reference, version and exact predecessor", async () => {
  const f = await fixture(); const a = await upload(f); const b = await upload(f, 1);
  const app = await db.application.findUniqueOrThrow({ where: { id: f.applicationId } });
  expect(legacyReferences(app).get("creditReports.ceo")?.fileId).toBe(b.result.fileId);
  expect(app.draftVersion).toBe(2);
  const intent = await db.legacyFileDeletionIntent.findUniqueOrThrow({ where: { predecessorId: a.result.fileId } });
  expect(intent.replacementId).toBe(b.result.fileId);
  await cleanupLegacyReplacements(f.applicationId, "creditReports.ceo");
  await expect(access(a.stored.storagePath)).rejects.toThrow();
  expect((await readFile(b.stored.storagePath)).toString()).toContain("safe,synthetic");
  expect(await retryLegacyFileDeletion(intent.id)).toBe(true);
 });
 it("same-slot competitors leave exactly one committed winner with surviving bytes", async () => {
  const f = await fixture(); const a = await stage(f.applicationId); const b = await stage(f.applicationId);
  const results = await Promise.allSettled([a,b].map(stored => commitApplicantUpload({ ...f, fieldKey: "creditReports.ceo", stored, expectedGeneration: 0 })));
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  const binding = await db.legacyFileBinding.findFirstOrThrow({ where: { applicationId: f.applicationId }, include: { currentFile: true } });
  await expect(readFile(binding.currentFile.storagePath)).resolves.toBeTruthy();
  expect(await db.applicationFile.count({ where: { applicationId: f.applicationId } })).toBe(1);
 });
 it("different slots merge against locked current draft without overwriting siblings", async () => {
  const f=await fixture(); const slots=["creditReports.ceo","creditReports.company"];
  const staged=await Promise.all(slots.map(slot=>stage(f.applicationId,slot)));
  await Promise.all(slots.map((fieldKey,i)=>commitApplicantUpload({...f,fieldKey,stored:staged[i],expectedGeneration:0})));
  const app=await db.application.findUniqueOrThrow({where:{id:f.applicationId}});
  expect(legacyReferences(app).size).toBe(2); expect(app.draftVersion).toBe(2);
  for(const stored of staged) await expect(access(stored.storagePath)).resolves.toBeUndefined();
 });
 it("rejects stale full drafts and current-version drafts pointing to a predecessor", async()=>{
  const f=await fixture(); await upload(f); const old=await db.application.findUniqueOrThrow({where:{id:f.applicationId}}); await upload(f,1);
  await expect(db.$transaction(async tx=>{const current=await lockLegacyApplication(tx,f.applicationId);await validateLegacyDraft(tx,current,old,old.draftVersion);})).rejects.toThrow("تغییر");
  await expect(db.$transaction(async tx=>{const current=await lockLegacyApplication(tx,f.applicationId);await validateLegacyDraft(tx,current,old,current.draftVersion);})).rejects.toThrow("تغییر");
 });
 it("direct runtime writes cannot restore retired JSON or mutate file identity",async()=>{
  const f=await fixture(); const a=await upload(f); await upload(f,1);
  await expect(db.$executeRaw`UPDATE "ApplicationFile" SET "storagePath"='unsafe' WHERE id=${a.result.fileId}`).rejects.toThrow();
  await expect(db.$executeRaw`UPDATE "Application" SET "creditReports"=${JSON.stringify({ceo:{fileId:a.result.fileId,name:"x"}})}::jsonb,"draftVersion"="draftVersion"+1 WHERE id=${f.applicationId}`).rejects.toThrow();
  await expect(db.$executeRaw`DELETE FROM "ApplicationFile" WHERE id=${a.result.fileId}`).rejects.toThrow();
 });
 it("rechecks ownership and editability after staging",async()=>{
  const f=await fixture(); const stored=await stage(f.applicationId);
  await expect(commitApplicantUpload({...f,userId:"foreign",fieldKey:"creditReports.ceo",stored,expectedGeneration:0})).rejects.toThrow();
  await owner!.application.update({where:{id:f.applicationId},data:{status:"SUBMITTED"}});
  await expect(commitApplicantUpload({...f,fieldKey:"creditReports.ceo",stored,expectedGeneration:0})).rejects.toThrow();
  await expect(access(stored.storagePath)).resolves.toBeUndefined();
 });
 it("rejects leading-zero slot aliases before object allocation",async()=>{
  const f=await fixture(); await expect(stage(f.applicationId,"taxDeclarations.01.file")).rejects.toThrow();
  expect(await db.legacyUploadCandidate.count({where:{applicationId:f.applicationId}})).toBe(0);
 });
 it("scan rejection and unavailability preserve the previous current object",async()=>{
  const f=await fixture(); const a=await upload(f);
  for(const status of ["FAILED","UNAVAILABLE"] as const) await expect(stageLegacyUpload({applicationId:f.applicationId,fieldKey:"creditReports.ceo",file:new File(["safe,data"],"x.csv"),scanner:{scan:async()=>({status})}})).rejects.toThrow();
  await expect(access(a.stored.storagePath)).resolves.toBeUndefined();
  expect(await db.legacyFileDeletionIntent.count({where:{applicationId:f.applicationId}})).toBe(0);
 });
 it("enforces 20 MiB boundary without introducing aggregate quota",async()=>{
  const f=await fixture();
  await expect(stageLegacyUpload({applicationId:f.applicationId,fieldKey:"creditReports.ceo",file:new File([Buffer.alloc(20*1024*1024+1,65)],"x.csv"),scanner:passing})).rejects.toThrow("۲۰");
  const stored=await stageLegacyUpload({applicationId:f.applicationId,fieldKey:"creditReports.ceo",file:new File([Buffer.alloc(20*1024*1024,65)],"x.csv"),scanner:passing});
  await commitApplicantUpload({...f,fieldKey:"creditReports.ceo",stored,expectedGeneration:0});
  expect((await readFile(stored.storagePath)).length).toBe(20*1024*1024);
 });
 it("staged candidate cannot expire early; abandoned candidates cannot commit",async()=>{
  const f=await fixture(); const stored=await stage(f.applicationId);
  expect(await reconcileLegacyCandidate(stored.candidateId)).toBe(false);
  await expect(access(stored.storagePath)).resolves.toBeUndefined();
  await expire(stored.candidateId); expect(await reconcileLegacyCandidate(stored.candidateId)).toBe(true);
  await expect(access(stored.storagePath)).rejects.toThrow();
  await expect(commitApplicantUpload({...f,fieldKey:"creditReports.ceo",stored,expectedGeneration:0})).rejects.toThrow();
 });
 it("committed candidate survives reconciliation and lost acknowledgement",async()=>{
  const f=await fixture(); const stored=await stage(f.applicationId);
  const original=db.$transaction.bind(db);
  const spy=vi.spyOn(db,"$transaction").mockImplementationOnce((async(...args: unknown[])=>{ await (original as (...a:unknown[])=>Promise<unknown>)(...args); throw new Error("synthetic lost commit acknowledgement"); }) as typeof db.$transaction);
  await expect(commitApplicantUpload({...f,fieldKey:"creditReports.ceo",stored,expectedGeneration:0})).rejects.toThrow("acknowledgement"); spy.mockRestore();
  expect(await reconcileLegacyCandidate(stored.candidateId)).toBe(false);
  expect((await db.legacyUploadCandidate.findUniqueOrThrow({where:{id:stored.candidateId}})).status).toBe("COMMITTED");
  await expect(access(stored.storagePath)).resolves.toBeUndefined();
 });
 it("retains unsafe historical paths and rejects path traversal",async()=>{
  const f=await fixture(); const outside=path.join(path.dirname(root),"phase9-outside", "creditReports.ceo"); await mkdir(outside,{recursive:true});
  const file=path.join(outside,randomUUID()+".csv"); await writeFile(file,"preserve");
  expect(await safeDeletionPath(file,"../phase9-outside","creditReports.ceo")).toBe(false);
  await expect(access(file)).resolves.toBeUndefined(); await rm(path.dirname(outside),{recursive:true,force:true});
  expect(await safeDeletionPath(path.join(root,f.applicationId,"creditReports.ceo","historical.csv"),f.applicationId,"creditReports.ceo")).toBe(false);
 });
 it("certificate binding commits only in completed status",async()=>{
  const f=await fixture(); const stored=await stage(f.applicationId,"validationCertificate");
  await expect(db.$transaction(async tx=>{const application=await lockLegacyApplication(tx,f.applicationId);await commitLegacyFile(tx,{application,fieldKey:"validationCertificate",stored});})).rejects.toThrow();
  await owner!.application.update({where:{id:f.applicationId},data:{status:"VALIDATION_COMPLETED"}});
  await db.$transaction(async tx=>{const application=await lockLegacyApplication(tx,f.applicationId);await commitLegacyFile(tx,{application,fieldKey:"validationCertificate",stored});});
  await expect(access(stored.storagePath)).resolves.toBeUndefined();
 });
 it("preserves original tax-row positions across file persistence",async()=>{
  const f=await fixture(); await upload(f,0,"taxDeclarations.2.file");
  const app=await db.application.findUniqueOrThrow({where:{id:f.applicationId}});
  expect(app.taxDeclarations).toHaveLength(3); expect(legacyReferences(app).has("taxDeclarations.2.file")).toBe(true);
  await db.$transaction(async tx=>{const current=await lockLegacyApplication(tx,f.applicationId);await validateLegacyDraft(tx,current,current,current.draftVersion);await tx.application.update({where:{id:current.id},data:{...legacyDraftData(current),draftVersion:{increment:1}}});});
 });
 it.each(["ENOSPC","EDQUOT"])("storage %s preserves last current bytes and records recoverable allocation",async code=>{
  const f=await fixture();const a=await upload(f);io.writeError=code;
  try{await expect(stage(f.applicationId)).rejects.toThrow("capacity");}finally{io.writeError="";}
  await expect(access(a.stored.storagePath)).resolves.toBeUndefined();
  const candidate=await db.legacyUploadCandidate.findFirstOrThrow({where:{applicationId:f.applicationId,status:"STAGING"}});
  await expire(candidate.id);expect(await reconcileLegacyCandidate(candidate.id)).toBe(true);
 });
 it("unlink failure retains irreversible authorization and retries without touching current bytes",async()=>{
  const f=await fixture();const a=await upload(f);const b=await upload(f,1);const intent=await db.legacyFileDeletionIntent.findUniqueOrThrow({where:{predecessorId:a.result.fileId}});
  io.unlinkError=true;try{expect(await retryLegacyFileDeletion(intent.id)).toBe(false);}finally{io.unlinkError=false;}
  expect((await db.legacyFileDeletionIntent.findUniqueOrThrow({where:{id:intent.id}})).status).toBe("AUTHORIZED");
  await expect(db.$executeRaw`UPDATE "LegacyFileBinding" SET "currentFileId"=${a.result.fileId},generation=generation+1 WHERE "applicationId"=${f.applicationId}`).rejects.toThrow();
  expect(await retryLegacyFileDeletion(intent.id)).toBe(true);
  await expect(access(a.stored.storagePath)).rejects.toThrow();await expect(access(b.stored.storagePath)).resolves.toBeUndefined();
 });
 it.each(["allocation","bytes","commit","authorization"])("real process death at %s preserves current bytes and permits fenced recovery",async point=>{
  const f=await fixture();const a=await upload(f);
  const child=spawn(process.execPath,["--import","tsx","prisma/tests/legacy-replacement/crash-worker.ts"],{env:{...process.env,R8_CRASH_POINT:point,R8_APPLICATION_ID:f.applicationId,R8_USER_ID:f.userId},stdio:["ignore","ignore","ignore","ipc"]});
  try{
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error("crash boundary timeout")),10000);child.once("message",message=>{clearTimeout(timeout);if((message as {ready?:boolean}).ready)resolve();else reject(Error("worker failed"));});child.once("exit",()=>{clearTimeout(timeout);reject(Error("worker exited before boundary"));});});
  }finally{if(child.exitCode===null){const stopped=new Promise<void>(resolve=>child.once("exit",()=>resolve()));child.kill("SIGKILL");await stopped;}}
  const binding=await db.legacyFileBinding.findFirstOrThrow({where:{applicationId:f.applicationId},include:{currentFile:true}});
  await expect(access(binding.currentFile.storagePath)).resolves.toBeUndefined();
  const candidate=await db.legacyUploadCandidate.findFirstOrThrow({where:{applicationId:f.applicationId,id:{not:a.stored.candidateId}}});
  if(point==="allocation"||point==="bytes"){
   expect(binding.currentFileId).toBe(a.result.fileId);await expire(candidate.id);expect(await reconcileLegacyCandidate(candidate.id)).toBe(true);
   await expect(access(candidate.storagePath)).rejects.toThrow();
  }else{
   expect(binding.currentFileId).not.toBe(a.result.fileId);expect(candidate.status).toBe("COMMITTED");
   await cleanupLegacyReplacements(f.applicationId,"creditReports.ceo");await expect(access(a.stored.storagePath)).rejects.toThrow();
  }
  await expect(access(binding.currentFile.storagePath)).resolves.toBeUndefined();
 },15000);

 it("repeated abandoned sweeps remove bytes from a suspended writer that resumes late",async()=>{
  const f=await fixture();const stored=await stage(f.applicationId);
  await expire(stored.candidateId);expect(await reconcileLegacyCandidate(stored.candidateId)).toBe(true);
  // The old process resumes its exclusive write after prior ENOENT/cleanup.
  await writeFile(stored.storagePath,"late synthetic bytes",{flag:"wx"});
  await expect(db.legacyUploadCandidate.update({where:{id:stored.candidateId},data:{status:"READY"}})).rejects.toThrow();
  expect(await reconcileLegacyCandidate(stored.candidateId)).toBe(true);
  await expect(access(stored.storagePath)).rejects.toThrow();
 });
 it("preserves historical alias objects referenced by another application",async()=>{
  const first=await fixture(),other=await fixture();const canonical=await realpath(root);const basename=randomUUID()+".csv";
  const directory=path.join(canonical,first.applicationId,"creditReports.ceo");await mkdir(directory,{recursive:true});const original=path.join(directory,basename);await writeFile(original,"historical preserve");
  const aliasRoot=path.join(canonical,"alias-"+randomUUID());await symlink(canonical,aliasRoot);
  const alias=path.join(aliasRoot,first.applicationId,"creditReports.ceo",basename);
  const files=await owner!.$transaction(async tx=>{
   await tx.$executeRawUnsafe('ALTER TABLE "ApplicationFile" DISABLE TRIGGER legacy_file_insert');
   const result=[];
   for(const [f,storagePath] of [[first,original],[other,alias]] as const){
    const file=await tx.applicationFile.create({data:{applicationId:f.applicationId,fieldKey:"creditReports.ceo",originalName:"historic.csv",mimeType:"text/csv",size:19,storagePath}});result.push(file);
    await tx.legacyFileBinding.create({data:{applicationId:f.applicationId,slotKey:"creditReports.ceo",currentFileId:file.id}});
    await tx.application.update({where:{id:f.applicationId},data:{creditReports:{ceo:{fileId:file.id,name:file.originalName}},draftVersion:{increment:1}}});
   }
   await tx.$executeRawUnsafe('ALTER TABLE "ApplicationFile" ENABLE TRIGGER legacy_file_insert');return result;
  });
  // Even restricted direct allocation cannot claim an aliased historical object.
  await expect(db.legacyUploadCandidate.create({data:{id:randomUUID(),applicationId:first.applicationId,slotKey:"creditReports.ceo",storagePath:original}})).rejects.toThrow();
  await expect(db.legacyUploadCandidate.create({data:{id:randomUUID(),applicationId:first.applicationId,slotKey:"creditReports.ceo",storagePath:alias}})).rejects.toThrow();
  await upload(first,1);await cleanupLegacyReplacements(first.applicationId,"creditReports.ceo");
  const intent=await db.legacyFileDeletionIntent.findUniqueOrThrow({where:{predecessorId:files[0].id}});expect(intent.status).toBe("RETAINED");
  expect((await readFile(alias)).toString()).toBe("historical preserve");
  await expect(db.legacyFileDeletionIntent.update({where:{id:intent.id},data:{status:"AUTHORIZED"}})).rejects.toThrow();
 });

 it("precommit permission failure rolls back file, pointer, JSON, version and intent together",async()=>{
  const f=await fixture();const a=await upload(f);const before=await db.application.findUniqueOrThrow({where:{id:f.applicationId}});const staged=await stage(f.applicationId);
  await owner!.$executeRawUnsafe('REVOKE INSERT ON "LegacyFileDeletionIntent" FROM phase1_runtime');
  try{await expect(commitApplicantUpload({...f,fieldKey:"creditReports.ceo",stored:staged,expectedGeneration:1})).rejects.toThrow();}
  finally{await owner!.$executeRawUnsafe('GRANT INSERT ON "LegacyFileDeletionIntent" TO phase1_runtime');}
  expect(await db.application.findUniqueOrThrow({where:{id:f.applicationId}})).toEqual(before);
  expect(await db.applicationFile.count({where:{applicationId:f.applicationId}})).toBe(1);
  expect(await db.legacyFileDeletionIntent.count({where:{applicationId:f.applicationId}})).toBe(0);
  expect((await db.legacyUploadCandidate.findUniqueOrThrow({where:{id:staged.candidateId}})).status).toBe("READY");
  await expect(access(a.stored.storagePath)).resolves.toBeUndefined();
 });
 it("two certificate action writers cannot overwrite a decision made during staging",async()=>{
  const f=await fixture();await owner!.application.update({where:{id:f.applicationId},data:{status:"VALIDATION_COMPLETED"}});
  actors.adminId=(await owner!.admin.create({data:{name:"Synthetic",mobile:randomUUID(),role:"SUPER_ADMIN"}})).id;
  const pdf="%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n";
  let expectedVersion=0;
  const form=()=>{const d=new FormData();d.set("expectedStatus","VALIDATION_COMPLETED");d.set("expectedVersion",String(expectedVersion));d.set("applicationId",f.applicationId);d.set("certificate",new File([pdf],"certificate.pdf"));return d;};
  const b=barrier();let scans=0;actors.scanHook=async()=>{if(++scans===1)await b.wait();};
  const stale=replaceValidationCertificate(form()).catch(e=>e);await b.reached;
  await replaceValidationCertificate(form());b.release();expect(await stale).toBeInstanceOf(Error);actors.scanHook=undefined;
  const binding=await db.legacyFileBinding.findFirstOrThrow({where:{applicationId:f.applicationId},include:{currentFile:true}});
  expect(binding.generation).toBe(1);expect(await db.applicationFile.count({where:{applicationId:f.applicationId}})).toBe(1);
  await expect(access(binding.currentFile.storagePath)).resolves.toBeUndefined();
  // Revocation after initial permission check must be rechecked inside the commit lock.
  expectedVersion=(await db.application.findUniqueOrThrow({where:{id:f.applicationId}})).draftVersion;
  const c=barrier();actors.scanHook=()=>c.wait();const revoked=replaceValidationCertificate(form()).catch(e=>e);await c.reached;
  await owner!.admin.update({where:{id:actors.adminId},data:{active:false}});c.release();expect(await revoked).toMatchObject({status:403});actors.scanHook=undefined;
  expect((await db.legacyFileBinding.findUniqueOrThrow({where:{id:binding.id}})).currentFileId).toBe(binding.currentFileId);
 });
 it.each([false,true])("upload versus payment/correction stale draft (correction=%s) preserves current files and avoids provider",async correction=>{
  const f=await fixture();actors.userId=f.userId;const historic={fileId:"preserved-unknown",name:"historic.pdf"};
  await owner!.application.update({where:{id:f.applicationId},data:{taxDeclarations:[{},{},{year:"1403",file:historic}],financials:[{year:"1403",file:historic}],humanResources:{employeeCount:1,insuranceList:historic},trialBalance:{generalLedger:historic,subsidiaryLedger:historic},creditReports:{company:historic,ceo:historic,boardMember:historic},draftVersion:{increment:1}}});
  if(correction){await owner!.application.update({where:{id:f.applicationId},data:{status:"NEEDS_EDIT"}});await owner!.payment.create({data:{applicationId:f.applicationId,amountToman:3000000,status:"VERIFIED",referenceId:"synthetic-prior-payment"}});}
  const a=await upload(f,0,"taxDeclarations.2.file");const stale=await db.application.findUniqueOrThrow({where:{id:f.applicationId}});const staged=await stage(f.applicationId,"taxDeclarations.2.file");
  const b=barrier();const original=db.application.findFirst.bind(db.application);
  const spy=vi.spyOn(db.application,"findFirst").mockImplementationOnce((async args=>{const found=await original(args);await b.wait();return found;}) as typeof db.application.findFirst);
  vi.mocked(requestZarinpalPayment).mockClear();const pending=startPayment(stale);await b.reached;
  const current=await commitApplicantUpload({...f,fieldKey:"taxDeclarations.2.file",stored:staged,expectedGeneration:1});b.release();
  expect(await pending).toMatchObject({ok:false,message:expect.stringContaining("تغییر")});spy.mockRestore();expect(requestZarinpalPayment).not.toHaveBeenCalled();
  const app=await db.application.findUniqueOrThrow({where:{id:f.applicationId}});expect(legacyReferences(app).get("taxDeclarations.2.file")?.fileId).toBe(current.fileId);expect(app.taxDeclarations).toHaveLength(3);
  expect(app.status).toBe(correction?"NEEDS_EDIT":"DRAFT");await expect(access(staged.storagePath)).resolves.toBeUndefined();await expect(access(a.stored.storagePath)).resolves.toBeUndefined();
 });
 it("payment reservation fences uploads while the provider request is in flight",async()=>{
  const f=await fixture();actors.userId=f.userId;const historic={fileId:"preserved-unknown",name:"historic.pdf"};
  await owner!.application.update({where:{id:f.applicationId},data:{taxDeclarations:[{},{},{year:"1403",file:historic}],financials:[{year:"1403",file:historic}],humanResources:{employeeCount:1,insuranceList:historic},trialBalance:{generalLedger:historic,subsidiaryLedger:historic},creditReports:{company:historic,ceo:historic,boardMember:historic},draftVersion:{increment:1}}});
  for(const slot of ["financials.0.file","humanResources.insuranceList","trialBalance.generalLedger","trialBalance.subsidiaryLedger","creditReports.company","creditReports.ceo","creditReports.boardMember"]) await upload(f,0,slot);
  await upload(f,0,"taxDeclarations.2.file");const staged=await stage(f.applicationId,"taxDeclarations.2.file");const app=await db.application.findUniqueOrThrow({where:{id:f.applicationId}});
  const b=barrier();vi.mocked(requestZarinpalPayment).mockImplementationOnce(async()=>{await b.wait();return{authority:randomUUID(),paymentUrl:"http://127.0.0.1/synthetic-payment"};});
  const payment=startPayment(app);await b.reached;
  await expect(commitApplicantUpload({...f,fieldKey:"taxDeclarations.2.file",stored:staged,expectedGeneration:1})).rejects.toThrow();b.release();expect(await payment).toMatchObject({ok:true});
  const saved=await db.application.findUniqueOrThrow({where:{id:f.applicationId}});expect(saved.taxDeclarations).toHaveLength(3);expect(legacyReferences(saved).get("taxDeclarations.2.file")?.fileId).toBe(legacyReferences(app).get("taxDeclarations.2.file")?.fileId);
 });

 it("admin detail and export show authoritative files without counting retained predecessors",async()=>{
  const f=await fixture();await upload(f,0,"taxDeclarations.0.file");const current=await upload(f,1,"taxDeclarations.0.file");
  actors.adminId=(await owner!.admin.create({data:{name:"Synthetic reader",mobile:randomUUID(),role:"SUPER_ADMIN"}})).id;
  const detail=await getSubmission(f.applicationId);expect(detail?.files.map(file=>file.id)).toEqual([current.result.fileId]);
  const raw=await db.application.findUniqueOrThrow({where:{id:f.applicationId},include:{payments:true,files:true,legacyFileBindings:true}});expect(raw.files).toHaveLength(2);
  expect(createSubmissionExportRow(raw)["تعداد فایل اظهارنامه مالیاتی"]).toBe(1);
 });

});
