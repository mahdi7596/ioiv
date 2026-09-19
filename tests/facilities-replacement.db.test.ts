import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {zipSync} from "fflate";
import {PrismaClient} from "@prisma/client";
import {spawn} from "node:child_process";
import {randomInt,randomUUID} from "node:crypto";
import {mkdtemp,rm,utimes} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {db} from "@/lib/db";
import {storeOwnedFacilitiesFile,retryUnavailableFacilitiesScan,reconcileFacilitiesDeletion,reconcileTerminalFacilitiesQuarantine,expireFacilitiesUpload,createAdminQuestionnaireTemplateBinding,scheduleUnpublishedTemplateDeletion} from "@/lib/facilities-files/service";
import {FilesystemFacilitiesPrivateStorage,type FacilitiesStorageKey} from "@/lib/facilities-files/storage";
import {reconcileFacilitiesOrphans} from "@/lib/facilities-files/orphan-reconciliation";
import type {FacilitiesFileScanner} from "@/lib/facilities-files/scanner";
const enabled=process.env.PHASE1_ISOLATED_DB==="true";
const owner=enabled?new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}}):null;
const bytes=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n");
const passed:FacilitiesFileScanner={scan:async()=>({status:"PASSED"})};
const failed:FacilitiesFileScanner={scan:async()=>({status:"FAILED",reason:"MALWARE_DETECTED"})};
const unavailable:FacilitiesFileScanner={scan:async()=>({status:"UNAVAILABLE",reason:"SCANNER_UNAVAILABLE"})};
const roots:string[]=[];
let userId:string,bindingId:string,root:string,storage:FilesystemFacilitiesPrivateStorage;
function key(){return randomUUID().replaceAll("-","");}
function upload(scanner=passed,idempotencyKey=key(),targetStorage=storage){return storeOwnedFacilitiesFile({userId,bindingId,idempotencyKey,fileName:"synthetic.pdf",bytes,storage:targetStorage,scanner});}
async function current(){return owner!.facilitiesFileBinding.findUniqueOrThrow({where:{id:bindingId},include:{currentUpload:{include:{storedFile:true}}}});}
function gate(){let enter!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>enter=r),wait=new Promise<void>(r=>release=r);return{reached,release,scanner:{scan:async()=>{enter();await wait;return {status:"PASSED" as const};}}};}
async function oldEnough(id:string){
 // Clock fixture only: production trigger makes createdAt immutable. Owner disables
 // exactly that trigger in a transaction to model data already older than24h.
 await owner!.$transaction(async tx=>{await tx.$executeRawUnsafe('ALTER TABLE "FacilitiesFileUpload" DISABLE TRIGGER "FacilitiesFileUpload_integrity"');await tx.$executeRaw`UPDATE "FacilitiesFileUpload" SET "createdAt"=clock_timestamp()-interval '25 hours' WHERE "id"=${id}`;await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');await tx.$executeRawUnsafe('ALTER TABLE "FacilitiesFileUpload" ENABLE TRIGGER "FacilitiesFileUpload_integrity"');});
}
describe.runIf(enabled)("R7 restricted PostgreSQL replacement and actual storage",{timeout:20000},()=>{
 beforeAll(async()=>{const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=="127.0.0.1"||u.pathname!=="/phase1"||u.username!=="phase1_runtime")throw Error("unsafe fixture");for(const pending of await owner!.facilitiesFileUpload.findMany({where:{lifecycleStatus:"PENDING",binding:{slotKey:"r7",user:{mobile:{startsWith:"096"}}}},select:{id:true}})){await oldEnough(pending.id);await expireFacilitiesUpload(pending.id);}});
 beforeEach(async()=>{vi.restoreAllMocks();root=await mkdtemp(join(tmpdir(),"sana-phase8-files-"));roots.push(root);storage=new FilesystemFacilitiesPrivateStorage(root);const user=await owner!.user.create({data:{mobile:`096${randomInt(10000000,99999999)}`}});userId=user.id;const company=await owner!.company.create({data:{userId}});const b=await owner!.facilitiesFileBinding.create({data:{scope:"COMPANY_PROFILE",scopeId:company.id,companyId:company.id,userId,slotKey:"r7"}});bindingId=b.id;});
 afterAll(async()=>{await Promise.all(roots.map(p=>rm(p,{recursive:true,force:true})));vi.restoreAllMocks();await db.$disconnect();await owner?.$disconnect();});
 it("orphan purge defers during a held scan and preserves the committed bytes",async()=>{
  await upload();const g=gate(),pending=upload(g.scanner);await g.reached;
  try { expect((await reconcileFacilitiesOrphans({storage,ttlMs:60000})).skipped).toBe("ACTIVE_UPLOAD"); }
  finally { g.release(); }
  expect((await pending).lifecycleStatus).toBe("PASSED");
  expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("orphan listing may pause beyond transaction timeout without deleting a recovered current",async()=>{
  await upload();const p=await upload(unavailable);const u=await owner!.facilitiesFileUpload.findUniqueOrThrow({where:{id:p.uploadId},include:{storedFile:true}});
  await utimes(join(root,u.storedFile!.storageKey),new Date(0),new Date(0));
  const list=storage.listKeysOlderThan.bind(storage);let entered!:()=>void,release!:()=>void;
  const reached=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r);
  vi.spyOn(storage,"listKeysOlderThan").mockImplementationOnce(async ttl=>{entered();await wait;return list(ttl);});
  const purge=reconcileFacilitiesOrphans({storage,ttlMs:60000});await reached;
  await new Promise(r=>setTimeout(r,5100));
  try{expect(await retryUnavailableFacilitiesScan({uploadId:p.uploadId!,storage,scanner:passed})).toBe(true);}finally{release();}
  expect((await purge).purged).toBe(0);
  expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("orphan purge removes only aged unreferenced objects after upload completion",async()=>{
  await upload();const orphan=storage.createStagingKey();await storage.writeStaging(orphan,bytes);await utimes(join(root,orphan),new Date(0),new Date(0));
  expect((await reconcileFacilitiesOrphans({storage,ttlMs:60000})).purged).toBe(1);
  expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("runtime cannot commit PASSED metadata separately from its current pointer",async()=>{
  const first=await upload();const old=(await current()).currentUpload!.storedFile!;
  const f=await owner!.storedFile.create({data:{storageKey:storage.createReadyKey(),originalName:old.originalName,fileType:old.fileType,detectedMimeType:old.detectedMimeType,byteSize:old.byteSize,sha256:old.sha256,scanStatus:"PASSED",scannedAt:new Date()}});
  await expect(db.facilitiesFileUpload.create({data:{bindingId,idempotencyKey:key(),revisionNumber:2,replacesUploadId:first.uploadId,storedFileId:f.id,lifecycleStatus:"PASSED",reservedByteSize:bytes.length}})).rejects.toThrow();
  expect((await current()).currentUploadId).toBe(first.uploadId);expect(await db.facilitiesFileUpload.count({where:{bindingId}})).toBe(1);
 });
 it("runtime cannot authorize deletion of unavailable or actively scanned quarantine",async()=>{
  const p=await upload(unavailable);await expect(db.facilitiesFileDeletionTombstone.create({data:{uploadId:p.uploadId!}})).rejects.toThrow();
  const g=gate(),pending=retryUnavailableFacilitiesScan({uploadId:p.uploadId!,storage,scanner:g.scanner});await g.reached;
  try{await expect(db.facilitiesFileDeletionTombstone.create({data:{uploadId:p.uploadId!}})).rejects.toThrow();}finally{g.release();}
  expect(await pending).toBe(true);expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("another user cannot replace or rescan the owner's document",async()=>{
  await upload();const scan={scan:vi.fn(passed.scan)};
  await expect(storeOwnedFacilitiesFile({userId:"unrelated-user",bindingId,idempotencyKey:key(),fileName:"synthetic.pdf",bytes,storage,scanner:scan})).rejects.toThrow("FACILITIES_FILE_FORBIDDEN");
  expect(scan.scan).not.toHaveBeenCalled();expect(await db.facilitiesFileUpload.count({where:{bindingId}})).toBe(1);
 });
 it("late legacy references are denied even after a cleanup transaction times out",async()=>{
  await upload();const before=await current(),old=before.currentUpload!;await upload();const tomb=await db.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{uploadId:old.id}});
  let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r);const remove=storage.remove.bind(storage);
  vi.spyOn(storage,"remove").mockImplementationOnce(async k=>{entered();await wait;await remove(k);});
  const deleting=reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage});await reached;
  const reference=db.companyProfileDocument.create({data:{companyId:before.companyId!,kind:"INCORPORATION_NOTICE",storedFileId:old.storedFileId!}}).then(()=>null,error=>error as Error);
  try {const error=await reference;expect(error?.message).toContain("scheduled for deletion");}finally{release();}
  expect(await deleting).toBe(false);expect(await db.companyProfileDocument.count({where:{storedFileId:old.storedFileId!}})).toBe(0);
  expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);
  expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("existing legacy references retain old bytes until moved to the replacement",async()=>{
  await upload();const before=await current(),old=before.currentUpload!;const reference=await db.companyProfileDocument.create({data:{companyId:before.companyId!,kind:"INCORPORATION_NOTICE",storedFileId:old.storedFileId!}});await upload();const tomb=await db.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{uploadId:old.id}});
  expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(false);expect(await storage.readReady(old.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
  await db.companyProfileDocument.update({where:{id:reference.id},data:{storedFileId:(await current()).currentUpload!.storedFileId!}});
  expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);
 });
 it("published templates remain protected and scheduled unpublished files cannot publish",async()=>{
  const admin=await owner!.admin.create({data:{name:"Synthetic R7 template",mobile:`096${randomInt(10000000,99999999)}`,role:"SUPER_ADMIN",active:true}});
  const supplier=await owner!.facilitySupplier.create({data:{name:`R7 supplier ${key()}`}});
  const word=Buffer.from(zipSync({"[Content_Types].xml":Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),"word/document.xml":Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>')}));
  for(const published of [true,false]){
   const binding=await createAdminQuestionnaireTemplateBinding({adminId:admin.id,supplierId:supplier.id,slotKey:key()});
   const result=await storeOwnedFacilitiesFile({adminId:admin.id,bindingId:binding.id,idempotencyKey:key(),fileName:"template.docx",bytes:word,storage,scanner:passed});expect(result.lifecycleStatus).toBe("PASSED");
   const file=await db.storedFile.findUniqueOrThrow({where:{id:result.fileId!}});const publish=()=>db.questionnaireTemplateVersion.create({data:{supplierId:supplier.id,versionLabel:key(),storedFileId:file.id}});
   if(published){await publish();expect(await scheduleUnpublishedTemplateDeletion(result.uploadId!)).toBe(false);await expect(db.facilitiesFileDeletionTombstone.create({data:{uploadId:result.uploadId!}})).rejects.toThrow();expect(await storage.readReady(file.storageKey as FacilitiesStorageKey)).toEqual(word);}
   else{expect(await scheduleUnpublishedTemplateDeletion(result.uploadId!)).toBe(true);await expect(publish()).rejects.toThrow();const tomb=await db.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{uploadId:result.uploadId!}});expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);}
  }
 });
 it.each(["staging","promotion","attachment","commit","retry-claim"])("real process death at %s preserves recoverable state and current bytes",async point=>{
  const first=await upload(),old=(await current()).currentUpload!.storedFile!,k=key();const retry=point==="retry-claim"?await upload(unavailable,k):null;
  const child=spawn(process.execPath,["--import","tsx","prisma/tests/facilities-replacement/crash-worker.ts"],{env:{...process.env,R7_CRASH_POINT:point,R7_STORAGE_ROOT:root,R7_BINDING_ID:bindingId,R7_USER_ID:userId,R7_UPLOAD_KEY:k,R7_UPLOAD_ID:retry?.uploadId,R7_BYTES:bytes.toString("base64")},stdio:["ignore","ignore","ignore","ipc"]});
  try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("worker boundary timeout")),10000);child.once("message",(message:unknown)=>{clearTimeout(timer);if(message && typeof message==="object" && "ready" in message && message.ready)resolve();else reject(Error("worker fixture failed"));});child.once("exit",()=>{clearTimeout(timer);reject(Error("worker exited before boundary"));});});}
  finally{if(child.exitCode===null&&child.signalCode===null){const stopped=new Promise<void>(r=>child.once("exit",()=>r()));child.kill("SIGKILL");await stopped;}}
  console.info(JSON.stringify({fixture:"R7 process crash",point,pid:child.pid,signal:child.signalCode}));
  const live=await owner!.facilitiesFileUpload.findUniqueOrThrow({where:{bindingId_idempotencyKey:{bindingId,idempotencyKey:k}}});
  if(point==="commit"){expect(live.lifecycleStatus).toBe("PASSED");expect((await current()).currentUploadId).toBe(live.id);const replay=await upload(passed,k);expect(replay.idempotent).toBe(true);}
  else{expect(live.lifecycleStatus).toBe("PENDING");expect((await current()).currentUploadId).toBe(first.uploadId);await oldEnough(live.id);expect(await expireFacilitiesUpload(live.id)).toBe(true);if(live.storedFileId)expect(await reconcileTerminalFacilitiesQuarantine({uploadId:live.id,storage})).toBe(true);expect((await upload()).lifecycleStatus).toBe("PASSED");}
  expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
  for(const fileKey of await storage.listKeysOlderThan(0))await utimes(join(root,fileKey),new Date(0),new Date(0));
  const purged=await reconcileFacilitiesOrphans({storage,ttlMs:60000});
  expect(purged.purged).toBe(point==="staging"||point==="promotion"?1:0);
  expect(await storage.readReady(old.storageKey as FacilitiesStorageKey)).toEqual(bytes);
  expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it.each(["FAILED","UNAVAILABLE","storage"])("new-key retry after %s preserves old good bytes and commits successful lineage",async outcome=>{
  const first=await upload();expect(first.lifecycleStatus).toBe("PASSED");const old=(await current()).currentUpload!.storedFile!;
  let result;if(outcome==="storage"){const spy=vi.spyOn(storage,"writeStaging").mockRejectedValueOnce(Error("fixture unavailable"));result=await upload();spy.mockRestore();}else result=await upload(outcome==="FAILED"?failed:unavailable);
  expect(result.lifecycleStatus).not.toBe("PASSED");expect((await current()).currentUploadId).toBe(first.uploadId);expect(await storage.readReady(old.storageKey as FacilitiesStorageKey)).toEqual(bytes);
  const retried=await upload();expect(retried.lifecycleStatus).toBe("PASSED");const now=(await current()).currentUpload!;expect(now.committedPredecessorId).toBe(first.uploadId);expect(now.committedRevisionNumber).toBe(2);expect(now.revisionNumber).toBe(3);
  expect(await owner!.facilitiesFileUpload.count({where:{bindingId}})).toBe(3);
  const tomb=await owner!.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{uploadId:first.uploadId}});expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);await expect(storage.readReady(old.storageKey as FacilitiesStorageKey)).rejects.toThrow();expect(await storage.readReady(now.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
  await rm(root,{recursive:true,force:true});
 });
 it.each(["FAILED","UNAVAILABLE","storage"])("same-key replay of %s allocates no new revision and performs no scan",async outcome=>{
  await upload();const k=key(),scan={scan:vi.fn(outcome==="FAILED"?failed.scan:outcome==="UNAVAILABLE"?unavailable.scan:passed.scan)};
  const write=outcome==="storage"?vi.spyOn(storage,"writeStaging").mockRejectedValueOnce(Error("fixture storage failure")):null;
  const first=await upload(scan,k);write?.mockRestore();const count=scan.scan.mock.calls.length;
  const replay=await upload(scan,k);expect(replay.idempotent).toBe(true);expect(replay.uploadId).toBe(first.uploadId);expect(replay.lifecycleStatus).toBe(first.lifecycleStatus);expect(scan.scan).toHaveBeenCalledTimes(count);expect(await db.facilitiesFileUpload.count({where:{bindingId}})).toBe(2);
 });
 it("same-key replay cannot scan or allocate again, including rejected content",async()=>{
  const k=key(),scan={scan:vi.fn(unavailable.scan)};const first=await upload(scan,k);const again=await upload(scan,k);expect(again.idempotent).toBe(true);expect(again.uploadId).toBe(first.uploadId);expect(scan.scan).toHaveBeenCalledOnce();
  const invalid=key();const rs=await Promise.all(Array.from({length:4},()=>storeOwnedFacilitiesFile({userId,bindingId,idempotencyKey:invalid,fileName:"bad.exe",bytes:Buffer.from("bad"),storage,scanner:passed})));expect(new Set(rs.map(r=>r.attemptId)).size).toBe(1);
 });
 it("concurrent successful candidates cannot replace a newer winner",async()=>{
  await upload();const g=gate(),first=upload(g.scanner);await g.reached;const winner=await upload();g.release();const loser=await first;expect(winner.lifecycleStatus).toBe("PASSED");expect(loser.lifecycleStatus).toBe("FAILED");expect((await current()).currentUploadId).toBe(winner.uploadId);expect(await reconcileTerminalFacilitiesQuarantine({uploadId:loser.uploadId!,storage})).toBe(true);expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("A→B→C supports delayed deletion and cannot rebind old current",async()=>{
  const a=await upload(),b=await upload(),c=await upload();for(const id of [a.uploadId,b.uploadId]){const tomb=await owner!.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{uploadId:id}});expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);await db.facilitiesFileDeletionTombstone.update({where:{id:tomb.id},data:{status:"SUCCEEDED"}});expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);}
  await expect(db.facilitiesFileBinding.update({where:{id:bindingId},data:{currentUploadId:a.uploadId}})).rejects.toThrow();expect((await current()).currentUploadId).toBe(c.uploadId);
 });
 it("unavailable recovery has one acknowledged scan owner and one successful successor",async()=>{
  await upload();const pending=await upload(unavailable);const g=gate();const first=retryUnavailableFacilitiesScan({uploadId:pending.uploadId!,storage,scanner:g.scanner});await g.reached;
  expect(await retryUnavailableFacilitiesScan({uploadId:pending.uploadId!,storage,scanner:passed})).toBe(false);g.release();expect(await first).toBe(true);expect((await current()).currentUploadId).toBe(pending.uploadId);
 });
 it("expired unavailable and abandoned pending claims cannot publish or reset retention",async()=>{
  const first=await upload();const pending=await upload(unavailable);await oldEnough(pending.uploadId!);const scan={scan:vi.fn(passed.scan)};expect(await retryUnavailableFacilitiesScan({uploadId:pending.uploadId!,storage,scanner:scan})).toBe(false);expect(scan.scan).not.toHaveBeenCalled();expect((await current()).currentUploadId).toBe(first.uploadId);expect(await reconcileTerminalFacilitiesQuarantine({uploadId:pending.uploadId!,storage})).toBe(true);
  const next=await upload(unavailable);await db.facilitiesFileUpload.update({where:{id:next.uploadId},data:{lifecycleStatus:"PENDING",failureReason:null,retryToken:key()}});await oldEnough(next.uploadId!);expect(await expireFacilitiesUpload(next.uploadId!)).toBe(true);expect(await reconcileTerminalFacilitiesQuarantine({uploadId:next.uploadId!,storage})).toBe(true);
 });
 it("expiry during a retry scan cannot overwrite current or delete it",async()=>{
  const first=await upload();const p=await upload(unavailable);const g=gate();const retry=retryUnavailableFacilitiesScan({uploadId:p.uploadId!,storage,scanner:g.scanner});await g.reached;await oldEnough(p.uploadId!);expect(await expireFacilitiesUpload(p.uploadId!)).toBe(true);g.release();expect(await retry).toBe(false);expect((await current()).currentUploadId).toBe(first.uploadId);expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("stale unavailable retains original quarantine rather than replacing a newer winner",async()=>{
  await upload();const stale=await upload(unavailable),winner=await upload();const before=await owner!.facilitiesFileUpload.findUniqueOrThrow({where:{id:stale.uploadId},include:{storedFile:true}});expect(await retryUnavailableFacilitiesScan({uploadId:stale.uploadId!,storage,scanner:passed})).toBe(false);const after=await owner!.facilitiesFileUpload.findUniqueOrThrow({where:{id:stale.uploadId}});expect(after.lifecycleStatus).toBe("UNAVAILABLE");expect(after.createdAt).toEqual(before.createdAt);expect(await storage.readStaging(before.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);expect((await current()).currentUploadId).toBe(winner.uploadId);
 });
 it("lost acknowledgement after successful commit preserves current bytes",async()=>{
  await upload();const original=db.$transaction.bind(db);vi.spyOn(db,"$transaction").mockImplementation((async(...args:unknown[])=>{const result=await (original as (...a:unknown[])=>Promise<unknown>)(...args);if(result&&typeof result==="object"&&"lifecycleStatus" in result&&result.lifecycleStatus==="PASSED")throw Error("lost commit acknowledgement");return result;}) as typeof db.$transaction);
  const result=await upload();expect(result.lifecycleStatus).toBe("PASSED");expect(result.idempotent).toBe(true);expect(await storage.readReady((await current()).currentUpload!.storedFile!.storageKey as FacilitiesStorageKey)).toEqual(bytes);
 });
 it("deletion outage keeps durable intent and a later retry removes only obsolete bytes",async()=>{
  const first=await upload();await upload();const tomb=await owner!.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{uploadId:first.uploadId}});const spy=vi.spyOn(storage,"remove").mockRejectedValueOnce(Error("fixture unavailable"));expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(false);spy.mockRestore();expect((await owner!.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{id:tomb.id}})).status).toBe("RETRY_REQUIRED");expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);
 });
});
