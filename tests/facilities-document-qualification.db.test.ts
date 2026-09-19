import { randomUUID, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const actor=vi.hoisted(()=>({id:""}));
vi.mock("@/lib/auth/session",()=>({requireSession:async()=>({kind:"user",subjectId:actor.id})}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/payments/zarinpal",()=>({requestZarinpalPayment:vi.fn(async()=>({authority:`S${randomUUID().replaceAll("-","").padEnd(35,"0")}`,paymentUrl:"http://127.0.0.1/synthetic"})),verifyZarinpalPayment:vi.fn(async()=>({referenceId:"fixture-reference"}))}));
import {db} from "@/lib/db";
import {qualifyFacilitiesDocuments} from "@/lib/facilities-files/qualification";
import {requiredFacilitiesSlots,refreshFacilitiesProfileSnapshot,refreshFacilitiesEditableSnapshot} from "@/lib/facilities/submission";
import {storeOwnedFacilitiesFile,reconcileFacilitiesDeletion} from "@/lib/facilities-files/service";
import {FilesystemFacilitiesPrivateStorage} from "@/lib/facilities-files/storage";
import {startFacilitiesPayment,submitFacilitiesApplication,verifyFacilitiesPaymentCallback} from "@/lib/actions/facilities-payment";
import {requestZarinpalPayment,verifyZarinpalPayment} from "@/lib/payments/zarinpal";
const enabled=process.env.PHASE1_ISOLATED_DB==="true";
const owner=enabled?new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}}):null;
const passing={scan:async()=>({status:"PASSED" as const})};
const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n");
const zip=Buffer.from(zipSync({"scan.pdf":pdf}));
const word=Buffer.from(zipSync({"[Content_Types].xml":Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),"word/document.xml":Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>')}));
let root:string,storage:FilesystemFacilitiesPrivateStorage;
async function fixture(paid=true){
 const prefix=`r10${randomUUID().replaceAll("-","")}`;
 const sql=readFileSync("prisma/tests/facilities-m6-payment.integration.sql","utf8").split('INSERT INTO "FacilitiesPaymentAttempt"')[0].replace(/\\set[^\n]*\n/,"").replace("BEGIN;","").replace(/m6-payment/g,prefix).replace("M6 payment test supplier",prefix).replace("M6 payment test intake",prefix);
 await owner!.$transaction(async tx=>{for(const statement of sql.split(";").map(s=>s.trim()).filter(Boolean)){
  if(statement.includes('INSERT INTO "FacilitiesProgramConfiguration"'))continue;
  const query=statement.replace("09900000061",`user-${prefix}`).replace("09900000062",`admin-${prefix}`);
  if(statement.includes('INSERT INTO "FacilitiesApplication"')){await tx.$executeRawUnsafe("SET LOCAL session_replication_role=replica");await tx.$executeRawUnsafe(query);await tx.$executeRawUnsafe("SET LOCAL session_replication_role=origin");}else await tx.$executeRawUnsafe(query);
 }});
 const appId=`${prefix}-application`,companyId=`${prefix}-company`,userId=`${prefix}-user`;actor.id=userId;
 await owner!.company.update({where:{id:companyId},data:{name:"شرکت نمونه",nationalId:String(randomInt(10000000000,99999999999)),registrationNumber:"123",registrationPlace:"تهران",registrationDate:new Date(),registeredCapitalRial:100,contactFullName:"نماینده",contactNationalCode:"1234567890",contactMobile:"09123456789",profileCompletedAt:new Date()}});
 await owner!.companyShareholder.create({data:{companyId,fullName:"سهامدار",ownershipPercentage:100}});
 const officers=await Promise.all([true,false].map(isChiefExecutive=>owner!.companyOfficer.create({data:{companyId,fullName:isChiefExecutive?"مدیرعامل":"عضو",position:isChiefExecutive?"مدیرعامل":"عضو هیئت‌مدیره",isChiefExecutive}})));
 await owner!.facilitiesApplicationCompanySnapshot.create({data:{applicationId:appId}});
 if(!paid){await owner!.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL session_replication_role=replica");await tx.facilitiesApplication.update({where:{id:appId},data:{paymentEnabledSnapshot:false,paymentAmountTomanSnapshot:null}});});}
 const app=await db.facilitiesApplication.findUniqueOrThrow({where:{id:appId}});
 const files=[];
 for(const [profile,slots] of [[true,["profile-incorporation-notice","profile-articles-of-association","profile-board-changes-gazette","profile-capital-increase-gazette",...officers.map(o=>`officer-${o.id}-identity-package`)]],[false,requiredFacilitiesSlots]] as const){
  for(const slotKey of slots){
   const binding=await db.facilitiesFileBinding.create({data:{scope:profile?"COMPANY_PROFILE":"APPLICATION",scopeId:profile?companyId:appId,companyId,userId,applicationId:profile?null:appId,slotKey}});
   const isZip=slotKey.startsWith("officer-")||slotKey.startsWith("vat-")||["licences","active-contracts"].includes(slotKey);
   const bytes=slotKey==="questionnaire"?word:isZip?zip:pdf;const fileName=slotKey==="questionnaire"?"fixture.docx":isZip?"fixture.zip":"fixture.pdf";
   const result=await storeOwnedFacilitiesFile({userId,bindingId:binding.id,idempotencyKey:randomUUID(),bytes,fileName,scanner:passing,storage});
   expect(result.lifecycleStatus).toBe("PASSED");const file=await db.storedFile.findUniqueOrThrow({where:{id:result.fileId!}});files.push({bindingId:binding.id,slotKey,file,bytes,fileName});
  }
 }
 await db.$transaction(tx=>refreshFacilitiesProfileSnapshot(tx,app.id));
 return{app,files};
}
async function qualify(app:Awaited<ReturnType<typeof fixture>>["app"]){return db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "FacilitiesApplication" WHERE id=${app.id} FOR UPDATE`;await qualifyFacilitiesDocuments(tx,app);});}
describe.skipIf(!enabled)("R10 facilities required documents and real private bytes",{timeout:20000},()=>{
 beforeAll(async()=>{const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=="127.0.0.1"||u.username!=="phase1_runtime"||u.pathname!=="/phase1")throw new Error("unsafe fixture");root=await mkdtemp(path.join(tmpdir(),"phase10-facilities-"));process.env.FACILITIES_UPLOAD_DIR=root;storage=new FilesystemFacilitiesPrivateStorage(root);});
 beforeEach(()=>vi.clearAllMocks());
 afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});await owner?.$disconnect();await db.$disconnect();});
 it("qualifies application and officer/profile evidence, starts valid payment",async()=>{const f=await fixture();await expect(qualify(f.app)).resolves.toBeUndefined();expect(await startFacilitiesPayment({applicationId:f.app.id,confirmed:true})).toMatchObject({state:"redirect"});expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);});
 it.each(["insurance","profile-articles-of-association","officer"])("blocks missing %s bytes without new payment",async slot=>{const f=await fixture();const file=f.files.find(x=>x.slotKey===slot||slot==="officer"&&x.slotKey.startsWith("officer-"))!;await unlink(path.join(root,file.file.storageKey));await expect(startFacilitiesPayment({applicationId:f.app.id,confirmed:true})).rejects.toThrow("مدرک");expect(requestZarinpalPayment).not.toHaveBeenCalled();});
 it("rejects changed hash and foreign caller ownership",async()=>{const f=await fixture();await expect(qualify({...f.app,userId:"foreign"})).rejects.toThrow("مدرک");const file=f.files.find(x=>x.slotKey==="insurance")!;await writeFile(path.join(root,file.file.storageKey),pdf.toString().replace("Catalog","Catxlog"));await expect(qualify(f.app)).rejects.toThrow("مدرک");});
 it("free submission also checks actual bytes",async()=>{const f=await fixture(false);expect(await submitFacilitiesApplication({applicationId:f.app.id})).toMatchObject({state:"submitted"});expect(requestZarinpalPayment).not.toHaveBeenCalled();});
 it("capture survives missing profile file and repaired paid draft submits without another charge",async()=>{
  const f=await fixture();await startFacilitiesPayment({applicationId:f.app.id,confirmed:true});const payment=await db.facilitiesPaymentAttempt.findFirstOrThrow({where:{applicationId:f.app.id}});const file=f.files.find(x=>x.slotKey==="profile-articles-of-association")!;await unlink(path.join(root,file.file.storageKey));
  expect(await verifyFacilitiesPaymentCallback({paymentId:payment.id,authority:payment.authority!,gatewayStatus:"OK"})).toMatchObject({state:"success"});
  expect((await db.facilitiesApplication.findUniqueOrThrow({where:{id:f.app.id}})).status).toBe("DRAFT");expect((await db.facilitiesPaymentAttempt.findUniqueOrThrow({where:{id:payment.id}})).status).toBe("VERIFIED");
  const repair=await storeOwnedFacilitiesFile({userId:f.app.userId,bindingId:file.bindingId,idempotencyKey:randomUUID(),bytes:pdf,fileName:"repair.pdf",scanner:passing,storage});expect(repair.lifecycleStatus).toBe("PASSED");
  expect(await submitFacilitiesApplication({applicationId:f.app.id})).toMatchObject({state:"submitted"});
  await verifyFacilitiesPaymentCallback({paymentId:payment.id,authority:payment.authority!,gatewayStatus:"OK"});expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);expect(verifyZarinpalPayment).toHaveBeenCalledTimes(1);
  expect(await db.facilitiesStatusHistory.count({where:{applicationId:f.app.id,newStatus:"SUBMITTED"}})).toBe(1);
 });
 it("paid pending crash is recoverable by browser retry without provider calls",async()=>{
  const f=await fixture();await startFacilitiesPayment({applicationId:f.app.id,confirmed:true});const p=await db.facilitiesPaymentAttempt.findFirstOrThrow({where:{applicationId:f.app.id}});
  await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "FacilitiesApplication" WHERE id=${f.app.id} FOR UPDATE`;await tx.facilitiesPaymentAttempt.update({where:{id:p.id},data:{status:"VERIFIED",referenceId:"captured-before-crash"}});await tx.paymentObligation.update({where:{facilitiesApplicationId:f.app.id},data:{state:"SETTLED"}});});
  const file=f.files.find(x=>x.slotKey==="insurance")!;await unlink(path.join(root,file.file.storageKey));
  expect(await startFacilitiesPayment({applicationId:f.app.id,confirmed:false})).toMatchObject({ok:true});expect((await db.facilitiesApplication.findUniqueOrThrow({where:{id:f.app.id}})).status).toBe("DRAFT");expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);expect(verifyZarinpalPayment).not.toHaveBeenCalled();
 });
 it("snapshot maintenance cannot delete submitted snapshots or grant direct deletion",async()=>{
  const f=await fixture(false);await submitFacilitiesApplication({applicationId:f.app.id});
  await expect(db.$executeRaw`SELECT public.clear_editable_facilities_shareholders(${f.app.id})`).rejects.toThrow("not editable");
  await expect(db.facilitiesApplicationShareholder.deleteMany({where:{applicationId:f.app.id}})).rejects.toThrow();
  expect(await db.facilitiesApplicationShareholder.count({where:{applicationId:f.app.id}})).toBe(1);
 });

 it("wizard snapshot refresh and submission serialize in application-first order",async()=>{
  const f=await fixture(false);let release!:()=>void;let enter!:()=>void;const reached=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);
  const refresh=db.$transaction(async tx=>{await refreshFacilitiesEditableSnapshot(tx,f.app.id);enter();await gate;});await reached;
  const pending=submitFacilitiesApplication({applicationId:f.app.id});release();await refresh;await expect(pending).resolves.toMatchObject({state:"submitted"});
  expect(await db.facilitiesStatusHistory.count({where:{applicationId:f.app.id,newStatus:"SUBMITTED"}})).toBe(1);
 });

 it("paid correction checks profile bytes then accepts repair without new charge",async()=>{
  const f=await fixture();await startFacilitiesPayment({applicationId:f.app.id,confirmed:true});const p=await db.facilitiesPaymentAttempt.findFirstOrThrow({where:{applicationId:f.app.id}});await verifyFacilitiesPaymentCallback({paymentId:p.id,authority:p.authority!,gatewayStatus:"OK"});
  await db.facilitiesApplication.update({where:{id:f.app.id},data:{status:"UNDER_REVIEW"}});await db.facilitiesApplication.update({where:{id:f.app.id},data:{status:"NEEDS_EDIT"}});
  const admin=await owner!.admin.findFirstOrThrow({where:{id:f.app.id.replace(/application$/,"admin")}});
  await db.facilitiesCorrectionRequest.create({data:{applicationId:f.app.id,sequence:1,reviewerId:admin.id,note:"لطفاً اساسنامه شرکت را اصلاح کنید"}});
  const file=f.files.find(x=>x.slotKey==="profile-articles-of-association")!;await unlink(path.join(root,file.file.storageKey));
  await expect(submitFacilitiesApplication({applicationId:f.app.id})).rejects.toThrow("اساسنامه");
  expect((await db.facilitiesApplication.findUniqueOrThrow({where:{id:f.app.id}})).status).toBe("NEEDS_EDIT");
  expect((await storeOwnedFacilitiesFile({userId:f.app.userId,bindingId:file.bindingId,idempotencyKey:randomUUID(),bytes:pdf,fileName:"corrected.pdf",scanner:passing,storage})).lifecycleStatus).toBe("PASSED");
  expect(await submitFacilitiesApplication({applicationId:f.app.id})).toMatchObject({state:"submitted"});expect(await submitFacilitiesApplication({applicationId:f.app.id})).toMatchObject({state:"already-submitted"});
  expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);expect(verifyZarinpalPayment).toHaveBeenCalledTimes(1);expect(await db.facilitiesCorrectionRequest.count({where:{applicationId:f.app.id,resolvedAt:{not:null}}})).toBe(1);
 });
 it.each(["scope","slot","unscanned","quarantined","stale"])("actual submission gate rejects synthetic %s metadata corruption",async mode=>{
  const f=await fixture(false);const file=f.files.find(x=>x.slotKey==="insurance")!;const binding=await db.facilitiesFileBinding.findUniqueOrThrow({where:{id:file.bindingId}});
  let predecessor:string|undefined;
  if(mode==="stale") {predecessor=binding.currentUploadId!;await storeOwnedFacilitiesFile({userId:f.app.userId,bindingId:file.bindingId,idempotencyKey:randomUUID(),bytes:pdf,fileName:"new.pdf",scanner:passing,storage});}
  // Deliberately corrupt an isolated owner fixture; runtime triggers still forbid these mutations.
  await owner!.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL session_replication_role=replica");
   if(mode==="scope")await tx.facilitiesFileBinding.update({where:{id:file.bindingId},data:{scope:"COMPANY_PROFILE",scopeId:f.app.companyId,applicationId:null}});
   if(mode==="slot")await tx.facilitiesFileBinding.update({where:{id:file.bindingId},data:{slotKey:"wrong-slot"}});
   if(mode==="unscanned")await tx.storedFile.update({where:{id:file.file.id},data:{scanStatus:"PENDING",scannedAt:null}});
   if(mode==="quarantined")await tx.facilitiesFileUpload.update({where:{id:binding.currentUploadId!},data:{lifecycleStatus:"UNAVAILABLE",committedRevisionNumber:null}});
   if(mode==="stale")await tx.facilitiesFileBinding.update({where:{id:file.bindingId},data:{currentUploadId:predecessor}});
  });
  await expect(submitFacilitiesApplication({applicationId:f.app.id})).rejects.toThrow();expect(requestZarinpalPayment).not.toHaveBeenCalled();expect(verifyZarinpalPayment).not.toHaveBeenCalled();expect((await db.facilitiesApplication.findUniqueOrThrow({where:{id:f.app.id}})).status).toBe("DRAFT");
 });
 it("profile replacement and predecessor cleanup are fenced through qualification commit",async()=>{
  const f=await fixture();const file=f.files.find(x=>x.slotKey==="profile-articles-of-association")!;const old=await db.facilitiesFileBinding.findUniqueOrThrow({where:{id:file.bindingId}});
  await storeOwnedFacilitiesFile({userId:f.app.userId,bindingId:file.bindingId,idempotencyKey:randomUUID(),bytes:pdf,fileName:"new.pdf",scanner:passing,storage});const tomb=await db.facilitiesFileDeletionTombstone.findUniqueOrThrow({where:{uploadId:old.currentUploadId!}});
  let release!:()=>void;let enter!:()=>void;const reached=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);
  const qualification=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "FacilitiesApplication" WHERE id=${f.app.id} FOR UPDATE`;await qualifyFacilitiesDocuments(tx,f.app);enter();await gate;});await reached;
  try{expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(false);await expect(db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='100ms'");await tx.$queryRaw`SELECT id FROM "Company" WHERE id=${f.app.companyId} FOR UPDATE`;})).rejects.toThrow();}finally{release();}await qualification;
  expect(await reconcileFacilitiesDeletion({tombstoneId:tomb.id,storage})).toBe(true);await expect(qualify(f.app)).resolves.toBeUndefined();
 });
 it("officer pruning retains evidence-referenced rows and removes only unreferenced rows",async()=>{
  const f=await fixture();await startFacilitiesPayment({applicationId:f.app.id,confirmed:true});const p=await db.facilitiesPaymentAttempt.findFirstOrThrow({where:{applicationId:f.app.id}});await verifyFacilitiesPaymentCallback({paymentId:p.id,authority:p.authority!,gatewayStatus:"OK"});await db.facilitiesApplication.update({where:{id:f.app.id},data:{status:"UNDER_REVIEW"}});await db.facilitiesApplication.update({where:{id:f.app.id},data:{status:"NEEDS_EDIT"}});
  const board=await db.facilitiesApplicationEvidence.findFirstOrThrow({where:{applicationId:f.app.id,kind:"credit-board"}});const extra=await db.facilitiesApplicationOfficer.create({data:{applicationId:f.app.id,fullName:"قدیمی",position:"عضو",isChiefExecutive:false}});
  const ceo=await db.facilitiesApplicationOfficer.findFirstOrThrow({where:{applicationId:f.app.id,isChiefExecutive:true}});
  await db.$executeRaw`SELECT public.prune_editable_facilities_officers(${f.app.id}, ${[ceo.id]}::text[])`;
  expect(await db.facilitiesApplicationOfficer.findUnique({where:{id:board.officerId!}})).not.toBeNull();expect(await db.facilitiesApplicationOfficer.findUnique({where:{id:extra.id}})).toBeNull();
 });
 it("blocked wizard refresh does not acquire snapshot before application",async()=>{
  const f=await fixture(false);let release!:()=>void;let enter!:()=>void;const reached=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let refreshPid=0;
  const holding=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "FacilitiesApplication" WHERE id=${f.app.id} FOR UPDATE`;enter();await gate;await tx.$executeRawUnsafe("SET LOCAL lock_timeout='200ms'");await tx.facilitiesApplicationCompanySnapshot.update({where:{applicationId:f.app.id},data:{name:"همزمان"}});});await reached;
  const refresh=db.$transaction(async tx=>{const [row]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`;refreshPid=row.pid;await refreshFacilitiesEditableSnapshot(tx,f.app.id);});
  try{const deadline=Date.now()+2000;while(true){const rows=await owner!.$queryRaw<Array<{wait_event_type:string}>>`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${refreshPid}`;if(rows[0]?.wait_event_type==="Lock")break;if(Date.now()>deadline)throw new Error("refresh never blocked");await new Promise(r=>setTimeout(r,5));}}finally{release();}await holding;await refresh;
 });

});
