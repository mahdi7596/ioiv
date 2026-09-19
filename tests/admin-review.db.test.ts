import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const actor=vi.hoisted(()=>({admin:"",user:"",expired:false,scan:undefined as undefined|(()=>Promise<void>)}));
vi.mock("@/lib/auth/session",()=>({requireSession:async(kind:string)=>{if(actor.expired)throw Error("Unauthorized");return {kind,subjectId:kind==="admin"?actor.admin:actor.user};}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/sms",()=>({sendSms:vi.fn(async()=>({ok:true}))}));
vi.mock("@/lib/facilities-files/scanner",async original=>({...await original<typeof import("@/lib/facilities-files/scanner")>(),createFacilitiesScannerFromEnv:()=>({scan:async()=>{await actor.scan?.();return {status:"PASSED"};}})}));
import { db } from "@/lib/db";
import { changeSubmissionStatus, replaceValidationCertificate } from "@/lib/actions/admin";
import { requestFacilitiesCorrection, completeFacilitiesValidation, retryFacilitiesCorrectionSms, performFacilitiesReview } from "@/lib/actions/facilities-review";
import { startPayment } from "@/lib/actions/payment";
import { stageLegacyUpload } from "@/lib/uploads/candidates";
import { commitApplicantUpload } from "@/lib/uploads/coordination";
import { sendSms } from "@/lib/sms";
import { POST as statusPost } from "@/app/api/admin/submissions/status/route";
import { POST as certificatePost } from "@/app/api/admin/submissions/certificate/route";
const enabled=process.env.PHASE1_ISOLATED_DB==="true";
const owner=enabled?new PrismaClient({datasources:{db:{url:process.env.PHASE1_OWNER_URL}}}):null;
const pdf="%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n";
let root:string;
function gate(){let release!:()=>void,enter!:()=>void;const reached=new Promise<void>(r=>enter=r),wait=new Promise<void>(r=>release=r);return {reached,release,hold:async()=>{enter();await wait;}};}
async function legacy(status:"SUBMITTED"|"NEEDS_EDIT"|"VALIDATION_COMPLETED"="SUBMITTED",documents=false){
 const user=await owner!.user.create({data:{mobile:randomUUID()}});actor.user=user.id;
 const app=await owner!.application.create({data:{userId:user.id,mobile:user.mobile,companyNationalId:randomUUID(),taxDeclarations:[{year:"1403"}],financials:[{year:"1403"}],humanResources:{employeeCount:2}}});
 if(documents)for(const fieldKey of ["taxDeclarations.0.file","financials.0.file","humanResources.insuranceList","trialBalance.generalLedger","trialBalance.subsidiaryLedger","creditReports.company","creditReports.ceo","creditReports.boardMember"]){const stored=await stageLegacyUpload({applicationId:app.id,fieldKey,file:new File(["safe,synthetic\n1,2\n"],"fixture.csv"),scanner:{scan:async()=>({status:"PASSED"})}});await commitApplicantUpload({applicationId:app.id,userId:user.id,fieldKey,stored,expectedGeneration:0});}
 await owner!.application.update({where:{id:app.id},data:{status}});
 if(status==="NEEDS_EDIT")await owner!.payment.create({data:{applicationId:app.id,amountToman:3000000,status:"VERIFIED",referenceId:randomUUID()}});
 return db.application.findUniqueOrThrow({where:{id:app.id}});
}
function form(app:{id:string;status:string;draftVersion:number},next="NEEDS_EDIT",note="یادداشت برنده") {const f=new FormData();f.set("applicationId",app.id);f.set("expectedStatus",app.status);f.set("expectedVersion",String(app.draftVersion));f.set("status",next);f.set("note",note);if(next==="VALIDATION_COMPLETED")f.set("certificate",new File([pdf],"certificate.pdf"));return f;}
async function facilities(){
 const prefix=`r11${randomUUID().replaceAll("-","")}`;
 const sql=readFileSync("prisma/tests/facilities-m6-payment.integration.sql","utf8").split('INSERT INTO "FacilitiesPaymentAttempt"')[0].replace(/\\set[^\n]*\n/,"").replace("BEGIN;","").replace(/m6-payment/g,prefix).replace("M6 payment test supplier",prefix).replace("M6 payment test intake",prefix);
 await owner!.$transaction(async tx=>{for(const statement of sql.split(";").map(s=>s.trim()).filter(Boolean)){
  if(statement.includes('INSERT INTO "FacilitiesProgramConfiguration"'))continue;
  const q=statement.replace("09900000061",`user-${prefix}`).replace("09900000062",`admin-${prefix}`);
  if(statement.includes('INSERT INTO "FacilitiesApplication"')){await tx.$executeRawUnsafe("SET LOCAL session_replication_role=replica");await tx.$executeRawUnsafe(q);await tx.facilitiesApplication.update({where:{id:`${prefix}-application`},data:{status:"UNDER_REVIEW"}});await tx.$executeRawUnsafe("SET LOCAL session_replication_role=origin");}else await tx.$executeRawUnsafe(q);
 }});
 return db.facilitiesApplication.findUniqueOrThrow({where:{id:`${prefix}-application`}});
}
function token(app:{id:string;status:string;reviewVersion:number}){return{applicationId:app.id,expectedStatus:app.status,expectedVersion:app.reviewVersion};}
describe.runIf(enabled)("R11 restricted concurrent review",{timeout:20000},()=>{
 beforeAll(async()=>{const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=="127.0.0.1"||u.pathname!=="/phase1"||u.username!=="phase1_runtime")throw Error("unsafe fixture");root=await mkdtemp(path.join(tmpdir(),"phase12-review-"));process.env.UPLOAD_DIR=root;});
 beforeEach(async()=>{vi.restoreAllMocks();vi.mocked(sendSms).mockReset().mockResolvedValue({ok:true});actor.expired=false;actor.scan=undefined;actor.admin=(await owner!.admin.create({data:{mobile:randomUUID(),name:"Synthetic reviewer",role:"SUPER_ADMIN"}})).id;});
 afterAll(async()=>{await rm(root,{recursive:true,force:true});await owner?.$disconnect();await db.$disconnect();});
 it("competing completion/correction preserves one note/history/certificate and notification",async()=>{
  const app=await legacy(),g=gate();actor.scan=()=>g.hold();const completion=changeSubmissionStatus(form(app,"VALIDATION_COMPLETED","یادداشت بازنده")).catch(e=>e);await g.reached;
  await changeSubmissionStatus(form(app));g.release();expect(await completion).toMatchObject({status:409});
  const current=await db.application.findUniqueOrThrow({where:{id:app.id}});expect(current).toMatchObject({status:"NEEDS_EDIT",adminNote:"یادداشت برنده",draftVersion:app.draftVersion+1});expect(await db.statusHistory.count({where:{applicationId:app.id}})).toBe(1);expect(await db.applicationFile.count({where:{applicationId:app.id}})).toBe(0);expect(sendSms).toHaveBeenCalledTimes(1);
 });
 it("completion winner preserves exact certificate and stale correction gets409",async()=>{
  const app=await legacy();await changeSubmissionStatus(form(app,"VALIDATION_COMPLETED"));await expect(changeSubmissionStatus(form(app))).rejects.toMatchObject({status:409});
  const file=await db.applicationFile.findFirstOrThrow({where:{applicationId:app.id}});expect((await readFile(file.storagePath)).toString()).toBe(pdf);expect(await db.statusHistory.count({where:{applicationId:app.id}})).toBe(1);expect(sendSms).toHaveBeenCalledTimes(1);
 });
 it("missing token and stale browser note cannot silently overwrite",async()=>{const app=await legacy();const missing=form(app);missing.delete("expectedVersion");await expect(changeSubmissionStatus(missing)).rejects.toMatchObject({status:409});await changeSubmissionStatus(form(app,"UNDER_REVIEW"));await expect(changeSubmissionStatus(form(app,"NEEDS_EDIT","توضیح قدیمی"))).rejects.toMatchObject({status:409});expect(await db.statusHistory.count({where:{applicationId:app.id}})).toBe(1);});
 it.each(["inactive","role","expired"])("rechecks %s authorization after slow certificate scan",async mode=>{
  const app=await legacy(),g=gate();actor.scan=()=>g.hold();const p=changeSubmissionStatus(form(app,"VALIDATION_COMPLETED")).catch(e=>e);await g.reached;
  if(mode==="expired")actor.expired=true;else await owner!.admin.update({where:{id:actor.admin},data:mode==="inactive"?{active:false}:{role:"ENTRY_VIEWER"}});
  g.release();expect(await p).toMatchObject({status:mode==="expired"?401:403});expect(await db.statusHistory.count({where:{applicationId:app.id}})).toBe(0);expect(sendSms).not.toHaveBeenCalled();
 });
 it("expired HTTP calls return Persian401 before reading multipart",async()=>{actor.expired=true;for(const post of [statusPost,certificatePost]){const r=await post(new Request("http://localhost/api/admin",{method:"POST",body:"not multipart"}));expect(r.status).toBe(401);expect((await r.json()).error).toContain("نشست");}});
 it("certificate stale token maps to HTTP409 and preserves current bytes",async()=>{const app=await legacy("VALIDATION_COMPLETED");await replaceValidationCertificate(form(app,"VALIDATION_COMPLETED"));const r=await certificatePost(new Request("http://localhost/api/admin",{method:"POST",body:form(app,"VALIDATION_COMPLETED")}));expect(r.status).toBe(409);expect(await db.applicationFile.count({where:{applicationId:app.id}})).toBe(1);});
 it("SMS failure cannot undo transition or authorize duplicate retry",async()=>{const app=await legacy();vi.mocked(sendSms).mockRejectedValueOnce(Error("synthetic outage"));await changeSubmissionStatus(form(app));await expect(changeSubmissionStatus(form(app))).rejects.toMatchObject({status:409});expect(await db.statusHistory.count({where:{applicationId:app.id}})).toBe(1);expect(sendSms).toHaveBeenCalledTimes(1);});
 it("applicant resubmission and admin restart produce one legal winner without recharge",async()=>{
  const app=await legacy("NEEDS_EDIT",true);const results=await Promise.allSettled([changeSubmissionStatus(form(app,"UNDER_REVIEW")),startPayment(app)]);
  const live=await db.application.findUniqueOrThrow({where:{id:app.id}});expect(["SUBMITTED","UNDER_REVIEW"]).toContain(live.status);expect(await db.statusHistory.count({where:{applicationId:app.id}})).toBe(1);expect(await db.payment.count({where:{applicationId:app.id}})).toBe(1);
  if(live.status==="SUBMITTED")expect(results[0]).toMatchObject({status:"rejected",reason:{status:409}});else expect(results[1]).toMatchObject({status:"fulfilled",value:{ok:false,message:expect.stringContaining("تغییر")}});
 });
 it("facilities competing decisions record only winner note/history and at most one SMS",async()=>{
  const app=await facilities();const r=await Promise.allSettled([requestFacilitiesCorrection({...token(app),note:"مدارک را اصلاح کنید"}),completeFacilitiesValidation({...token(app),note:"تایید نهایی"})]);expect(r.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(r.find(x=>x.status==="rejected")).toMatchObject({reason:{status:409}});expect(await db.facilitiesStatusHistory.count({where:{applicationId:app.id}})).toBe(1);expect(vi.mocked(sendSms).mock.calls.length).toBeLessThanOrEqual(1);
 });
 it("facilities differing correction duplicates reject rather than claim success",async()=>{const app=await facilities();await requestFacilitiesCorrection({...token(app),note:"یادداشت نخست"});await expect(requestFacilitiesCorrection({...token(app),note:"یادداشت دیگر"})).rejects.toMatchObject({status:409});expect(await db.facilitiesCorrectionRequest.count({where:{applicationId:app.id}})).toBe(1);expect(sendSms).toHaveBeenCalledTimes(1);});
 it("successful SMS plus lost commit acknowledgement never becomes retryable",async()=>{
  const app=await facilities(),original=db.$transaction.bind(db);let calls=0;
  vi.spyOn(db,"$transaction").mockImplementation((async(...args:unknown[])=>{const r=await (original as(...a:unknown[])=>Promise<unknown>)(...args);if(++calls===3)throw Error("lost acknowledgement after SENT");return r;}) as typeof db.$transaction);
  expect(await requestFacilitiesCorrection({...token(app),note:"اصلاح مدارک"})).toMatchObject({smsSent:false});vi.restoreAllMocks();const correction=await db.facilitiesCorrectionRequest.findFirstOrThrow({where:{applicationId:app.id}});expect(correction.smsStatus).toBe("SENT");await retryFacilitiesCorrectionSms(correction.id);expect(sendSms).toHaveBeenCalledTimes(1);
 });
 it("uncertain SMS consumes claim and cannot dispatch another send",async()=>{const app=await facilities();vi.mocked(sendSms).mockRejectedValueOnce(Error("timeout"));const result=await requestFacilitiesCorrection({...token(app),note:"اصلاح مدارک"});expect(result.smsSent).toBe(false);const correction=await db.facilitiesCorrectionRequest.findUniqueOrThrow({where:{id:result.correctionId}});expect(correction).toMatchObject({smsStatus:"PENDING",smsAttemptCount:1,smsFailureCode:"DELIVERY_UNCONFIRMED"});await expect(retryFacilitiesCorrectionSms(correction.id)).rejects.toMatchObject({status:409});expect(sendSms).toHaveBeenCalledTimes(1);});
 it("resolved correction cannot trigger stale SMS retry",async()=>{const app=await facilities();const result=await requestFacilitiesCorrection({...token(app),note:"اصلاح مدارک"});await owner!.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL session_replication_role=replica");await tx.facilitiesCorrectionRequest.update({where:{id:result.correctionId},data:{resolvedAt:new Date()}});});await expect(retryFacilitiesCorrectionSms(result.correctionId)).rejects.toMatchObject({status:409});expect(sendSms).toHaveBeenCalledTimes(1);});
 it("locking helper grants no admin updates and review version cannot be forged",async()=>{await expect(db.admin.update({where:{id:actor.admin},data:{active:false}})).rejects.toThrow();const app=await facilities();const updated=await db.facilitiesApplication.update({where:{id:app.id},data:{reviewVersion:999}});expect(updated.reviewVersion).toBe(app.reviewVersion+1);await expect(completeFacilitiesValidation({...token(app),note:"قدیمی"})).rejects.toMatchObject({status:409});});
 it("postcommit claim failure reports committed correction with uncertain delivery",async()=>{
  const app=await facilities(),original=db.$transaction.bind(db);let calls=0;
  vi.spyOn(db,"$transaction").mockImplementation((async(...args:unknown[])=>{if(++calls===2)throw Error("claim unavailable");return (original as(...a:unknown[])=>Promise<unknown>)(...args);}) as typeof db.$transaction);
  expect(await requestFacilitiesCorrection({...token(app),note:"مدارک اصلاح شود"})).toMatchObject({smsSent:false});expect(await db.facilitiesCorrectionRequest.count({where:{applicationId:app.id}})).toBe(1);expect((await db.facilitiesApplication.findUniqueOrThrow({where:{id:app.id}})).status).toBe("NEEDS_EDIT");expect(sendSms).not.toHaveBeenCalled();
 });
 it("facilities action serializes expected Persian errors instead of throwing",async()=>{
  const app=await facilities();expect(await performFacilitiesReview({operation:"complete",...token(app),expectedVersion:-1})).toMatchObject({ok:false,status:409,error:expect.stringContaining("تازه")});actor.expired=true;expect(await performFacilitiesReview({operation:"complete",...token(app)})).toMatchObject({ok:false,status:401,error:expect.stringContaining("نشست")});
 });
 it("facilities rechecks revoked role after waiting for application lock",async()=>{
  const app=await facilities(),g=gate();const locked=owner!.$transaction(async tx=>{await tx.$executeRaw`SELECT id FROM "FacilitiesApplication" WHERE id=${app.id} FOR UPDATE`;await g.hold();},{timeout:15000});await g.reached;
  const auth=gate(),original=db.admin.findUnique.bind(db.admin);vi.spyOn(db.admin,"findUnique").mockImplementationOnce((async args=>{const result=await original(args);auth.release();return result;}) as typeof db.admin.findUnique);
  const result=completeFacilitiesValidation(token(app)).catch(e=>e);
  // The first read must finish before changing the role; wait on a query barrier.
  await auth.hold();await owner!.admin.update({where:{id:actor.admin},data:{role:"ENTRY_VIEWER"}});g.release();await locked;expect(await result).toMatchObject({status:403});expect(await db.facilitiesStatusHistory.count({where:{applicationId:app.id}})).toBe(0);
 });
 it("database rejects arbitrary or unspent PENDING uncertainty reasons",async()=>{
  const app=await facilities();const correction=await db.facilitiesCorrectionRequest.create({data:{applicationId:app.id,sequence:1,reviewerId:actor.admin,note:"مدارک اصلاح شود"}});
  await expect(db.facilitiesCorrectionRequest.update({where:{id:correction.id},data:{smsFailureCode:"DELIVERY_UNCONFIRMED"}})).rejects.toThrow();await expect(db.facilitiesCorrectionRequest.update({where:{id:correction.id},data:{smsAttemptCount:1,smsLastAttemptAt:new Date(),smsFailureCode:"ARBITRARY"}})).rejects.toThrow();
 });

 it("successful SMS plus rolled-back persistence leaves spent uncertainty and no retry",async()=>{
  const app=await facilities(),original=db.$transaction.bind(db);let calls=0;
  vi.spyOn(db,"$transaction").mockImplementation((async(...args:unknown[])=>{
   if(++calls===3){const work=args[0] as (tx:Prisma.TransactionClient)=>Promise<unknown>;return original(async tx=>{await work(tx);throw Error("rollback before SENT commit");});}
   return (original as(...a:unknown[])=>Promise<unknown>)(...args);
  }) as typeof db.$transaction);
  expect(await requestFacilitiesCorrection({...token(app),note:"اصلاح مدارک"})).toMatchObject({smsSent:false});vi.restoreAllMocks();const correction=await db.facilitiesCorrectionRequest.findFirstOrThrow({where:{applicationId:app.id}});expect(correction).toMatchObject({smsStatus:"PENDING",smsAttemptCount:1,smsFailureCode:"PERSISTENCE_UNCONFIRMED"});expect(await db.facilitiesAuditLog.count({where:{entityId:correction.id,action:"CORRECTION_SMS_SENT"}})).toBe(0);await expect(retryFacilitiesCorrectionSms(correction.id)).rejects.toMatchObject({status:409});expect(sendSms).toHaveBeenCalledTimes(1);
 });

});
