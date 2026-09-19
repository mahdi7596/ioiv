import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth/session", () => ({ requireSession: async () => ({ kind: "user", subjectId: actor.id }) }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/payments/zarinpal", () => ({ requestZarinpalPayment: vi.fn(async () => ({ authority: `S${randomUUID().replaceAll("-", "").padEnd(35,"0")}`, paymentUrl: "http://127.0.0.1/synthetic" })), verifyZarinpalPayment: vi.fn(async () => ({ referenceId: "fixture-reference" })) }));
import { applicationDraftSchema } from "@/lib/validations/application";
import { db } from "@/lib/db";
import { stageLegacyUpload } from "@/lib/uploads/candidates";
import { commitApplicantUpload, lockLegacyApplication } from "@/lib/uploads/coordination";
import { qualifyLegacyDocuments } from "@/lib/uploads/qualification";
import { verifyHistoricalLegacyFile } from "@/lib/uploads/historical-verification";
import { startPayment } from "@/lib/actions/payment";
import { ZarinpalRejectedError } from "@/lib/payments/zarinpal-errors";
import { settleLegacyPayment } from "@/lib/payments/legacy-settlement";
import { requestZarinpalPayment, verifyZarinpalPayment } from "@/lib/payments/zarinpal";
const enabled = process.env.PHASE1_ISOLATED_DB === "true";
const owner = enabled ? new PrismaClient({ datasources: { db: { url: process.env.PHASE1_OWNER_URL } } }) : null;
const passing = { scan: async () => ({ status: "PASSED" as const }) };
const contents = "synthetic,document\n1,2\n";
let root: string;
const slots = ["taxDeclarations.1.file", "financials.0.file", "humanResources.insuranceList", "trialBalance.generalLedger", "trialBalance.subsidiaryLedger", "creditReports.company", "creditReports.ceo", "creditReports.boardMember"];
async function fixture() {
 const user = await db.user.create({ data: { mobile: randomUUID() } }); actor.id = user.id;
 const app = await db.application.create({ data: { userId: user.id, mobile: user.mobile, companyNationalId: randomUUID(), taxDeclarations: [{}, { year: "1403" }], financials: [{ year: "1403" }], humanResources: { employeeCount: 2 } } });
 const files = [];
 for (const fieldKey of slots) {
  const stored = await stageLegacyUpload({ applicationId: app.id, fieldKey, file: new File([contents], "fixture.csv"), scanner: passing });
  const result = await commitApplicantUpload({ applicationId: app.id, userId: user.id, fieldKey, stored, expectedGeneration: 0 });
  files.push({ ...stored, ...result });
 }
 return { appId: app.id, userId: user.id, files };
}
async function current(appId: string) { return db.application.findUniqueOrThrow({ where: { id: appId } }); }
async function qualify(appId: string, draft?: object) { return db.$transaction(async tx => { const app = await lockLegacyApplication(tx, appId); await qualifyLegacyDocuments(tx, appId, draft ?? app); }); }
async function unknown(fileId: string) {
 // Explicit historical fixture only; real runtime mutation must remain forbidden.
 await owner!.$transaction(async tx => {
  await tx.$executeRawUnsafe('SET LOCAL session_replication_role=replica');
  await tx.applicationFile.update({ where: { id: fileId }, data: { sha256: null, scanVerdict: null, verifiedAt: null } });
 });
}
function barrier() { let release!: () => void; let enter!: () => void; const reached = new Promise<void>(r => enter = r); const gate = new Promise<void>(r => release = r); return { reached, release, wait: async () => { enter(); await gate; } }; }
describe.skipIf(!enabled)("R10 required files restricted PostgreSQL and actual bytes", () => {
 beforeAll(async () => { const url = new URL(process.env.DATABASE_URL!); if(url.hostname !== "127.0.0.1" || url.pathname !== "/phase1" || url.username !== "phase1_runtime") throw new Error("unsafe fixture"); root = await mkdtemp(path.join(tmpdir(), "phase10-files-")); process.env.UPLOAD_DIR = root; });
 beforeEach(() => vi.clearAllMocks());
 afterAll(async () => { if(root) await rm(root, { recursive: true, force: true }); await owner?.$disconnect(); await db.$disconnect(); });
 it("qualifies all required actual files while preserving blank row positions", async () => { const f = await fixture(); await expect(qualify(f.appId)).resolves.toBeUndefined(); expect((await current(f.appId)).taxDeclarations).toMatchObject([{}, { year: "1403" }]); });
 it.each(["fabricated", "foreign", "wrong-slot", "stale-generation"])("rejects %s references", async mode => {
  const f = await fixture(); const app = await current(f.appId); const draft = applicationDraftSchema.parse(app);
  const ref = draft.creditReports!.ceo!;
  if(mode === "fabricated") ref.fileId = "fabricated";
  if(mode === "foreign") ref.fileId = (await fixture()).files[6].fileId;
  if(mode === "wrong-slot") ref.fileId = f.files[5].fileId;
  if(mode === "stale-generation") ref.generation = (ref.generation ?? 0) + 1;
  await expect(qualify(f.appId,draft)).rejects.toThrow("مدرک");
 });
 it.each(["missing", "changed-hash", "size", "unknown"])("blocks %s before any gateway request", async mode => {
  const f = await fixture(); const file = f.files[6];
  if(mode === "missing") await unlink(file.storagePath);
  if(mode === "changed-hash") await writeFile(file.storagePath, contents.replace("1,2", "9,8"));
  if(mode === "size") await writeFile(file.storagePath, "x");
  if(mode === "unknown") await unknown(file.fileId);
  expect(await startPayment(await current(f.appId))).toMatchObject({ ok: false, message: expect.stringContaining("مدرک") });
  expect(requestZarinpalPayment).not.toHaveBeenCalled(); expect(await db.payment.count({ where: { applicationId: f.appId } })).toBe(0);
 });
 it("retains capture after file loss, permits repair, submits once without repayment", async () => {
  const f=await fixture(); expect(await startPayment(await current(f.appId))).toMatchObject({ok:true});
  const p=await db.payment.findFirstOrThrow({where:{applicationId:f.appId},include:{application:true}});
  await unlink(f.files[6].storagePath);
  expect(await settleLegacyPayment(p,p.authority!)).toBe("verified");
  expect((await current(f.appId)).status).toBe("DRAFT");
  expect((await db.payment.findUniqueOrThrow({where:{id:p.id}})).status).toBe("VERIFIED");
  expect((await db.paymentObligation.findUniqueOrThrow({where:{legacyApplicationId:f.appId}})).state).toBe("SETTLED");
  expect(await db.paymentNotificationIntent.count({where:{obligation:{legacyApplicationId:f.appId}}})).toBe(0);
  const stored=await stageLegacyUpload({applicationId:f.appId,fieldKey:"creditReports.ceo",file:new File([contents],"repair.csv"),scanner:passing});
  await commitApplicantUpload({applicationId:f.appId,userId:f.userId,fieldKey:"creditReports.ceo",stored,expectedGeneration:1});
  expect(await startPayment(await current(f.appId))).toMatchObject({ok:true});
  expect((await current(f.appId)).status).toBe("SUBMITTED");
  await settleLegacyPayment(p,p.authority!);
  expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);expect(verifyZarinpalPayment).toHaveBeenCalledTimes(1);
  expect(await db.statusHistory.count({where:{applicationId:f.appId,newStatus:"SUBMITTED"}})).toBe(1);
  expect(await db.paymentNotificationIntent.count({where:{obligation:{legacyApplicationId:f.appId}}})).toBe(1);
 });
 it("recovers original uncertain payment despite missing documents",async()=>{
  const f=await fixture(); await startPayment(await current(f.appId));
  const p=await db.payment.findFirstOrThrow({where:{applicationId:f.appId},include:{application:true}});
  vi.mocked(verifyZarinpalPayment).mockRejectedValueOnce(new ZarinpalRejectedError(-51,"synthetic completed rejection"));
  expect(await settleLegacyPayment(p,p.authority!)).toBe("unknown");
  await unlink(f.files[6].storagePath);
  expect(await startPayment(await current(f.appId))).toMatchObject({ok:true});
  expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);
  expect((await db.payment.findUniqueOrThrow({where:{id:p.id}})).status).toBe("VERIFIED");
 });
 it("UNKNOWN scan outage stays unqualified; repeatable scan restores eligibility",async()=>{
  const f=await fixture(); const file=f.files[6]; await unknown(file.fileId);
  expect(await verifyHistoricalLegacyFile(file.fileId,{scan:async()=>({status:"UNAVAILABLE"})})).toMatchObject({verdict:"UNAVAILABLE"});
  await expect(qualify(f.appId)).rejects.toThrow();
  await verifyHistoricalLegacyFile(file.fileId,passing); await expect(qualify(f.appId)).resolves.toBeUndefined();
  expect(await verifyHistoricalLegacyFile(file.fileId,passing)).toMatchObject({recorded:false});
  await verifyHistoricalLegacyFile(file.fileId,{scan:async()=>({status:"UNAVAILABLE"})});
  await expect(qualify(f.appId)).resolves.toBeUndefined();
  await verifyHistoricalLegacyFile(file.fileId,{scan:async()=>({status:"FAILED"})});
  await expect(qualify(f.appId)).rejects.toThrow();
  expect(await readFile(file.storagePath,"utf8")).toBe(contents);
 });
 it("replacement during historical scan cannot certify the superseded file",async()=>{
  const f=await fixture();const b=barrier();
  const pending=verifyHistoricalLegacyFile(f.files[6].fileId,{scan:async()=>{await b.wait();return{status:"PASSED"};}});
  await b.reached;
  const stored=await stageLegacyUpload({applicationId:f.appId,fieldKey:"creditReports.ceo",file:new File([contents],"new.csv"),scanner:passing});
  await commitApplicantUpload({applicationId:f.appId,userId:f.userId,fieldKey:"creditReports.ceo",stored,expectedGeneration:1});b.release();
  await expect(pending).rejects.toThrow("تغییر");expect(await db.legacyFileVerification.count({where:{fileId:f.files[6].fileId}})).toBe(0);
 });
 it("changed bytes during historical scan cannot acquire PASSED evidence",async()=>{
  const f=await fixture();const file=f.files[6];await unknown(file.fileId);
  await expect(verifyHistoricalLegacyFile(file.fileId,{scan:async()=>{await writeFile(file.storagePath,contents.replace("1,2","3,4"));return{status:"PASSED"};}})).rejects.toThrow("تغییر");
  expect(await db.legacyFileVerification.count({where:{fileId:file.fileId}})).toBe(0);
 });
 it("incomplete browser payload can resume the existing authority",async()=>{
  const f=await fixture();await startPayment(await current(f.appId));
  expect(await startPayment({})).toMatchObject({ok:true});expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);
 });
 it("browser retry repairs the crash boundary after capture without valid form input",async()=>{
  const f=await fixture();await startPayment(await current(f.appId));const p=await db.payment.findFirstOrThrow({where:{applicationId:f.appId}});
  await db.$transaction(async tx=>{await lockLegacyApplication(tx,f.appId);await tx.payment.update({where:{id:p.id},data:{status:"VERIFIED",referenceId:"captured-before-crash"}});await tx.paymentObligation.update({where:{legacyApplicationId:f.appId},data:{state:"SETTLED"}});});
  await unlink(f.files[6].storagePath);expect(await startPayment({})).toMatchObject({ok:true});expect((await current(f.appId)).status).toBe("DRAFT");expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);expect(verifyZarinpalPayment).not.toHaveBeenCalled();
 });
 it("paid corrections enforce files without collecting the fee again",async()=>{
  const f=await fixture();await startPayment(await current(f.appId));const p=await db.payment.findFirstOrThrow({where:{applicationId:f.appId},include:{application:true}});await settleLegacyPayment(p,p.authority!);
  await owner!.application.update({where:{id:f.appId},data:{status:"NEEDS_EDIT"}});await unlink(f.files[6].storagePath);
  expect(await startPayment(await current(f.appId))).toMatchObject({ok:false});expect((await current(f.appId)).status).toBe("NEEDS_EDIT");
  const stored=await stageLegacyUpload({applicationId:f.appId,fieldKey:"creditReports.ceo",file:new File([contents],"repair.csv"),scanner:passing});await commitApplicantUpload({applicationId:f.appId,userId:f.userId,fieldKey:"creditReports.ceo",stored,expectedGeneration:1});
  expect(await startPayment(await current(f.appId))).toMatchObject({ok:true});expect(requestZarinpalPayment).toHaveBeenCalledTimes(1);
 });
 it("a qualified application lock fences replacement until commit",async()=>{
  const f=await fixture();const b=barrier();const gate=db.$transaction(async tx=>{const app=await lockLegacyApplication(tx,f.appId);await qualifyLegacyDocuments(tx,f.appId,app);await b.wait();});await b.reached;
  try{await expect(db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='100ms'");await lockLegacyApplication(tx,f.appId);})).rejects.toThrow();}finally{b.release();}await gate;
  const stored=await stageLegacyUpload({applicationId:f.appId,fieldKey:"creditReports.ceo",file:new File([contents],"new.csv"),scanner:passing});await expect(commitApplicantUpload({applicationId:f.appId,userId:f.userId,fieldKey:"creditReports.ceo",stored,expectedGeneration:1})).resolves.toMatchObject({generation:2});
 });
 it("runtime cannot mutate evidence or insert incomplete PASSED evidence",async()=>{
  const f=await fixture();await verifyHistoricalLegacyFile(f.files[6].fileId,passing);
  await expect(db.legacyFileVerification.create({data:{fileId:f.files[6].fileId,verdict:"PASSED"}})).rejects.toThrow();
  await expect(db.legacyFileVerification.updateMany({where:{fileId:f.files[6].fileId},data:{verdict:"FAILED"}})).rejects.toThrow();
  await expect(db.legacyFileVerification.deleteMany({where:{fileId:f.files[6].fileId}})).rejects.toThrow();
 });
});
