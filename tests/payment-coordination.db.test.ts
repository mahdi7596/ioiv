// Actual facilities qualification is covered in facilities-document-qualification.db.test.ts.
vi.mock("@/lib/facilities-files/qualification", () => ({ qualifyFacilitiesDocuments: vi.fn(async () => undefined) }));
// File qualification is covered by document-qualification.db.test.ts with real bytes.
vi.mock("@/lib/uploads/qualification", () => ({ qualifyLegacyDocuments: vi.fn(async () => undefined) }));
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const session = vi.hoisted(() => ({ id: "", admin: "" }));
vi.mock("@/lib/auth/session", () => ({ requireSession: async (kind: string) => ({ kind, subjectId: kind === "admin" ? session.admin : session.id }) }));
vi.mock("@/lib/facilities/submission", async (original) => {
  const actual = await original<typeof import("@/lib/facilities/submission")>();
  return { ...actual, refreshFacilitiesProfileSnapshot: vi.fn(), checkFacilitiesSubmissionReadiness: () => ({ ready: true, issues: [] }), deriveFacilitiesSubmissionInput: () => ({ employeeCount: 1, boardOfficerId: "fixture-board" }), materializeFacilitiesEvidence: vi.fn() };
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/admin/require-admin", () => ({ requireActiveAdmin: async () => ({ id: session.admin, active: true, role: "SUPER_ADMIN" }) }));
vi.mock("@/lib/uploads/storage", () => ({ storeUploadFile: vi.fn() }));
vi.mock("@/lib/uploads/candidates", () => ({ stageLegacyUpload: (...args: unknown[]) => vi.mocked(storeUploadFile)(...(args as Parameters<typeof storeUploadFile>)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn(async () => ({ ok: true })) }));
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeUploadFile } from "@/lib/uploads/storage";
import { readFileSync } from "node:fs";
import { startFacilitiesPayment, verifyFacilitiesPaymentCallback } from "@/lib/actions/facilities-payment";
import { dispatchSubmissionIntent } from "@/lib/payments/legacy-notifications";
import { sendSms } from "@/lib/sms";
import { db } from "@/lib/db";
import { changeSubmissionStatus } from "@/lib/actions/admin";
import { startPayment as startPaymentAction } from "@/lib/actions/payment";
import { GET as paymentCallback } from "@/app/api/payment/callback/route";
import { settleLegacyPayment } from "@/lib/payments/legacy-settlement";
import { beginPaymentVerification, claimPaymentOperation, lockPaymentApplication, paymentObligation, savePaymentResult } from "@/lib/payments/coordination";

// Explicit opt-in; the runner provides a fresh loopback DB named phase1. Never .env.
const enabled = process.env.PHASE1_ISOLATED_DB === "true";
const owner = enabled ? new PrismaClient({ datasources: { db: { url: process.env.PHASE1_OWNER_URL } } }) : null;
const file = { fileId: "synthetic-file", name: "fixture.pdf" };
const draft = { currentStep: 6, taxDeclarations: [{ year: "1402", file }], financials: [{ year: "1402", file }], humanResources: { employeeCount: 1, insuranceList: file }, trialBalance: { generalLedger: file, subsidiaryLedger: file }, creditReports: { company: file, ceo: file, boardMember: file } };
// Barriers delay awaited Prisma results, not fluent relation access; tests cast only that await-only seam.
function barrier() { let release!: () => void; let entered!: () => void; const reached = new Promise<void>(r => entered = r); const gate = new Promise<void>(r => release = r); return { reached, release, wait: async () => { entered(); await gate; } }; }
function response(data: unknown) { return new Response(JSON.stringify({ data, errors: [] }), { status: 200 }); }
let calls: Array<{ path: string; authority?: string; amount?: number }>;
let appId: string;
// Fixture submits the version the browser would have loaded; concurrency within
// startPayment still uses independent real transactions and the unchanged payment lock.
async function startPayment(input: object) {
 const current = await db.application.findUniqueOrThrow({ where: { id: appId } });
 return startPaymentAction({ ...input, draftVersion: current.draftVersion });
}
async function payment() { return db.payment.findFirstOrThrow({ where: { applicationId: appId }, include: { application: { include: { payments: true } } } }); }

async function facilitiesFixture() {
    // M6 fixture creates only synthetic metadata; payment-readiness policy is stubbed
    // above to isolate this suite to R2. No storage/scanner/provider qualification.
    const prefix = `f${randomUUID().replaceAll("-", "")}`;
    const sql = readFileSync("prisma/tests/facilities-m6-payment.integration.sql", "utf8").split('INSERT INTO "FacilitiesPaymentAttempt"')[0]
      .replace(/\\set[^\n]*\n/, "").replace("BEGIN;", "")
      .replace(/m6-payment/g, prefix).replace("M6 payment test supplier", prefix).replace("M6 payment test intake", prefix).replace("'FACILITIES', true", "'FACILITIES', false")
      .replace('INSERT INTO "FacilitiesProgramConfiguration"', 'INSERT INTO "FacilitiesProgramConfiguration"');
    // Configuration remains disabled; omit the shared singleton insert on repeated runs.
    // File success and current binding are one fixture transaction, matching R7.
    await owner!.$transaction(async tx => {
    for (const statement of sql.split(";").map(x => x.trim()).filter(Boolean)) {
      if (statement.includes('INSERT INTO "FacilitiesProgramConfiguration"')) continue;
      const query = statement.replace("09900000061", `fixture-${prefix}`).replace("09900000062", `admin-${prefix}`);
      if (statement.includes('INSERT INTO "FacilitiesApplication"')) {
        // Seed an existing application without enabling the programme. Runtime
        // transactions below still execute every normal constraint/trigger.
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica"); await tx.$executeRawUnsafe(query); await tx.$executeRawUnsafe("SET LOCAL session_replication_role = origin");
      } else await tx.$executeRawUnsafe(query);
    }
    });
    session.id = `${prefix}-user`;
    return `${prefix}-application`;
}

describe.runIf(enabled)("R2 real PostgreSQL restricted-role coordination", { timeout: 20000 }, () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/phase1" || url.username !== "phase1_runtime") throw new Error("not isolated restricted fixture");
    expect(await db.$queryRaw`SELECT current_database() AS name`).toEqual([{ name: "phase1" }]);
    session.admin = `admin-${randomUUID()}`;
    await owner!.admin.create({ data: { id: session.admin, name: "Synthetic reviewer", mobile: session.admin, role: "SUPER_ADMIN" } });
    process.env.ZARINPAL_MERCHANT_ID = "11111111-1111-1111-1111-111111111111";
  });
  beforeEach(async () => {
    calls = [];
    const id = randomUUID(); session.id = id;
    await db.user.create({ data: { id, mobile: `fixture-${id}` } });
    appId = (await db.application.create({ data: { userId: id, mobile: `fixture-${id}`, companyNationalId: id, ...draft } })).id;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string); calls.push({ path: url, authority: body.authority, amount: body.amount });
      return response(url.includes("request.json") ? { code: 100, authority: `S000${appId.replaceAll("-", "").slice(-32).padStart(32, "0")}` } : { code: 100, ref_id: 201 });
    }));
  });
  afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect(); await owner?.$disconnect(); });

  it("R12 legacy request and verification use the stored obligation amount", async () => {
    await db.$transaction(async tx => { await lockPaymentApplication(tx, "legacy", appId); await paymentObligation(tx, "legacy", appId, 765432); });
    await startPayment(draft); const p = await payment();
    expect(p.amountToman).toBe(765432); expect(calls[0].amount).toBe(765432);
    expect(await settleLegacyPayment(p, p.authority!)).toBe("verified");
    expect(calls[1]).toMatchObject({ amount: 765432, authority: p.authority });
  });

  it.each([
    { data: { ref_id: 201 }, errors: [] },
    { data: { code: 100, ref_id: 0 }, errors: [] },
    { data: { code: 100, ref_id: 201 }, errors: { code: -51 } },
    { data: { code: 100, ref_id: 201, authority: "mismatch" }, errors: [] },
  ])("R12 malformed verify %# blocks forged success, new charge and remote replay", async payload => {
    await startPayment(draft); const p = await payment();
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))); vi.stubGlobal("fetch", f);
    await expect(paymentCallback(new Request(`http://localhost/api/payment/callback?paymentId=${p.id}&Authority=${p.authority}&Status=OK&ref_id=999&amount=1`))).rejects.toThrow("status=pending");
    expect((await payment()).status).toBe("INITIATED");
    expect((await payment()).application.status).toBe("PENDING_PAYMENT");
    expect(await db.statusHistory.count({ where: { applicationId: appId } })).toBe(0);
    expect(await db.paymentNotificationIntent.count({ where: { obligation: { legacyApplicationId: appId } } })).toBe(0);
    const results = await db.paymentOperationResult.findMany({ where: { obligation: { legacyApplicationId: appId }, operation: "VERIFY" } });
    expect(results.map(r => r.outcome)).toEqual(["UNKNOWN"]);
    expect(await startPayment(draft)).toMatchObject({ ok: false });
    expect(await settleLegacyPayment(p, p.authority!)).toBe("unknown");
    expect(f).toHaveBeenCalledTimes(1); expect(await db.payment.count({ where: { applicationId: appId } })).toBe(1);
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ authority: p.authority, amount: p.amountToman });
  });

  it("R12 malformed request cannot create a payable URL or another attempt", async () => {
    const f = vi.fn().mockResolvedValue(response({ code: 101, authority: `S${"0".repeat(35)}` })); vi.stubGlobal("fetch", f);
    expect(await startPayment(draft)).toMatchObject({ ok: false });
    expect(await startPayment(draft)).toMatchObject({ ok: false });
    expect((await payment()).authority).toBeNull(); expect(f).toHaveBeenCalledTimes(1);
    expect(await db.payment.count({ where: { applicationId: appId } })).toBe(1);
  });

  it("R12 forged browser authority cannot reach the provider", async () => {
    await startPayment(draft); const p = await payment(); const before = calls.length;
    await expect(paymentCallback(new Request(`http://localhost/api/payment/callback?paymentId=${p.id}&Authority=S${"9".repeat(35)}&Status=OK`))).rejects.toThrow();
    expect(calls).toHaveLength(before); expect((await payment()).status).toBe("INITIATED");
  });

  it("R12 explicit rejection then 101 recovers only original authority and settles once", async () => {
    await startPayment(draft); const p = await payment();
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [], errors: { code: -51 } })))
      .mockResolvedValue(response({ code: 101, ref_id: 202 })); vi.stubGlobal("fetch", f);
    expect(await settleLegacyPayment(p, p.authority!)).toBe("unknown");
    expect(await settleLegacyPayment(p, p.authority!)).toBe("verified");
    expect(await settleLegacyPayment(p, p.authority!)).toBe("already-settled");
    expect(f.mock.calls.map(c => JSON.parse(c[1].body).authority)).toEqual([p.authority, p.authority]);
    expect((await payment()).referenceId).toBe("202");
    expect(await db.statusHistory.count({ where: { applicationId: appId } })).toBe(1);
    expect(await db.paymentNotificationIntent.count({ where: { obligation: { legacyApplicationId: appId } } })).toBe(1);
  });

  it("R12 facilities contradictory success remains unresolved and preserves application", async () => {
    const id = await facilitiesFixture(); await startFacilitiesPayment({ applicationId: id, confirmed: true });
    const p = await db.facilitiesPaymentAttempt.findFirstOrThrow({ where: { applicationId: id } });
    const before = await db.facilitiesApplication.findUniqueOrThrow({ where: { id } });
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { code: 100, ref_id: 201 }, errors: { code: -51 } }))); vi.stubGlobal("fetch", f);
    expect(await verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" })).toEqual({ state: "pending" });
    expect(await verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" })).toEqual({ state: "pending" });
    expect((await db.facilitiesApplication.findUniqueOrThrow({ where: { id } })).status).toBe(before.status);
    expect((await db.facilitiesPaymentAttempt.findUniqueOrThrow({ where: { id: p.id } })).status).not.toBe("VERIFIED");
    expect(await db.facilitiesPaymentAttempt.count({ where: { applicationId: id } })).toBe(1); expect(f).toHaveBeenCalledTimes(1);
    expect(await db.paymentOperationResult.count({ where: { obligation: { facilitiesApplicationId: id }, outcome: "CAPTURED" } })).toBe(0);
  });

  it("R1 delayed NOK snapshot cannot undo a committed success", async () => {
    await startPayment(draft); const p = await payment(); const b = barrier();
    const original = db.payment.findUnique.bind(db.payment);
    const spy = vi.spyOn(db.payment, "findUnique").mockImplementationOnce((async (args: Parameters<typeof original>[0]) => {
      const result = await original(args); await b.wait(); return result;
    }) as unknown as typeof original);
    const cancelled = paymentCallback(new Request(`http://localhost/api/payment/callback?paymentId=${p.id}&Authority=${p.authority}&Status=NOK`)).catch(e => e.message);
    await b.reached;
    expect(await settleLegacyPayment(p, p.authority!)).toBe("verified");
    b.release(); expect(await cancelled).toContain("status=success"); spy.mockRestore();
    expect((await payment()).status).toBe("VERIFIED");
    expect((await payment()).application.status).toBe("SUBMITTED");
    expect(await db.statusHistory.count({ where: { applicationId: appId } })).toBe(1);
    expect(await db.paymentNotificationIntent.count({ where: { obligation: { legacyApplicationId: appId } } })).toBe(1);
  });

  it.each(["SUBMITTED", "UNDER_REVIEW", "NEEDS_EDIT", "VALIDATION_COMPLETED"] as const)("R1 late capture preserves %s and does not invent a submission", async status => {
    await startPayment(draft); const p = await payment(); const b = barrier(); const fetcher = fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await b.wait(); return fetcher(...args); }));
    const settlement = settleLegacyPayment(p, p.authority!); await b.reached;
    const submittedAt = new Date("2026-09-01T00:00:00Z");
    await db.application.update({ where: { id: appId }, data: { status, submittedAt, adminNote: "preserve-review" } });
    b.release(); expect(await settlement).toBe("verified");
    expect((await payment()).application).toMatchObject({ status, submittedAt, adminNote: "preserve-review" });
    expect(await db.statusHistory.count({ where: { applicationId: appId } })).toBe(0);
    expect(await db.paymentNotificationIntent.count({ where: { obligation: { legacyApplicationId: appId } } })).toBe(0);
  });

  it("R1 late request completion cannot reset a later review status", async () => {
    const b = barrier(); const fetcher = fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await b.wait(); return fetcher(...args); }));
    const starting = startPayment(draft); await b.reached;
    await db.application.update({ where: { id: appId }, data: { status: "UNDER_REVIEW" } });
    b.release(); await starting;
    expect((await payment()).application.status).toBe("UNDER_REVIEW");
    expect((await payment()).authority).toBeTruthy();
  });

  it("R1 stale correction resubmission cannot overwrite an intervening review", async () => {
    await startPayment(draft); const p = await payment(); await settleLegacyPayment(p, p.authority!);
    await db.application.update({ where: { id: appId }, data: { status: "NEEDS_EDIT" } });
    const b = barrier(); const original = db.application.findFirst.bind(db.application);
    const spy = vi.spyOn(db.application, "findFirst").mockImplementationOnce((async (args: Parameters<typeof original>[0]) => { const result = await original(args); await b.wait(); return result; }) as unknown as typeof original);
    const resubmit = startPayment({ ...draft, currentStep: 5 }); await b.reached;
    await db.application.update({ where: { id: appId }, data: { status: "UNDER_REVIEW" } });
    b.release(); await resubmit; spy.mockRestore();
    expect((await payment()).application).toMatchObject({ status: "UNDER_REVIEW", currentStep: 6 });
    expect(await db.statusHistory.count({ where: { applicationId: appId } })).toBe(1);
  });

  it("R1 simultaneous corrections submit once without another charge or payment notification", async () => {
    await startPayment(draft); const p = await payment(); await settleLegacyPayment(p, p.authority!);
    await db.application.update({ where: { id: appId }, data: { status: "NEEDS_EDIT" } });
    await Promise.all([startPayment(draft), startPayment(draft)]);
    expect((await payment()).application.status).toBe("SUBMITTED");
    expect(await db.statusHistory.count({ where: { applicationId: appId, previousStatus: "NEEDS_EDIT" } })).toBe(1);
    expect(await db.payment.count({ where: { applicationId: appId } })).toBe(1);
    expect(calls).toHaveLength(2);
    expect(await db.paymentNotificationIntent.count({ where: { obligation: { legacyApplicationId: appId } } })).toBe(1);
  });

  it("R1 cancellation and retry cannot overlap a success verification", async () => {
    await startPayment(draft); const p = await payment(); const b = barrier(); const fetcher = fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await b.wait(); return fetcher(...args); }));
    const success = settleLegacyPayment(p, p.authority!); await b.reached;
    await expect(paymentCallback(new Request(`http://localhost/api/payment/callback?paymentId=${p.id}&Authority=${p.authority}&Status=NOK`))).rejects.toThrow("status=pending");
    expect((await startPayment(draft)).ok).toBe(false);
    b.release(); expect(await success).toBe("verified");
    expect(calls.filter(c => c.authority).map(c => c.authority)).toEqual([p.authority]);
    expect((await payment()).application.status).toBe("SUBMITTED");
    expect(await db.statusHistory.count({ where: { applicationId: appId } })).toBe(1);
  });

  it("R1 delayed admin decision loses to resubmission with no stale history or SMS", async () => {
    await startPayment(draft); const p = await payment(); await settleLegacyPayment(p, p.authority!);
    await dispatchSubmissionIntent(appId, "fixture"); vi.mocked(sendSms).mockClear();
    await db.application.update({ where: { id: appId }, data: { status: "NEEDS_EDIT" } });
    const b = barrier(); const original = db.application.findUnique.bind(db.application);
    const spy = vi.spyOn(db.application, "findUnique").mockImplementationOnce((async (args: Parameters<typeof original>[0]) => { const result = await original(args); await b.wait(); return result; }) as unknown as typeof original);
    const reviewSnapshot = await db.application.findUniqueOrThrow({where:{id:appId}});
      const form = new FormData(); form.set("expectedStatus",reviewSnapshot.status); form.set("expectedVersion",String(reviewSnapshot.draftVersion)); form.set("applicationId", appId); form.set("status", "UNDER_REVIEW");
    const reviewing = changeSubmissionStatus(form).catch(e => e); await b.reached;
    await startPayment(draft); b.release();
    expect(await reviewing).toMatchObject({ status: 409, message: expect.stringContaining("تازه‌سازی") }); spy.mockRestore();
    expect((await payment()).application.status).toBe("SUBMITTED");
    expect(await db.statusHistory.count({ where: { applicationId: appId, newStatus: "UNDER_REVIEW" } })).toBe(0);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("R1 admin decision winning before resubmit preserves actual review history", async () => {
    await startPayment(draft); const p = await payment(); await settleLegacyPayment(p, p.authority!);
    await dispatchSubmissionIntent(appId, "fixture"); vi.mocked(sendSms).mockClear();
    await db.application.update({ where: { id: appId }, data: { status: "NEEDS_EDIT" } });
    const b = barrier(); const original = db.application.findFirst.bind(db.application);
    const spy = vi.spyOn(db.application, "findFirst").mockImplementationOnce((async (args: Parameters<typeof original>[0]) => { const result = await original(args); await b.wait(); return result; }) as unknown as typeof original);
    const resubmit = startPayment(draft); await b.reached;
    const reviewSnapshot = await db.application.findUniqueOrThrow({where:{id:appId}});
      const form = new FormData(); form.set("expectedStatus",reviewSnapshot.status); form.set("expectedVersion",String(reviewSnapshot.draftVersion)); form.set("applicationId", appId); form.set("status", "UNDER_REVIEW");
    await changeSubmissionStatus(form); b.release(); await resubmit; spy.mockRestore();
    expect((await payment()).application.status).toBe("UNDER_REVIEW");
    expect(await db.statusHistory.findFirst({ where: { applicationId: appId, newStatus: "UNDER_REVIEW" } })).toMatchObject({ previousStatus: "NEEDS_EDIT" });
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it("R1 failed resubmission history rolls back state and preserves verified evidence for retry", async () => {
    await startPayment(draft); const p = await payment(); await settleLegacyPayment(p, p.authority!);
    await db.application.update({ where: { id: appId }, data: { status: "NEEDS_EDIT" } });
    await owner!.$executeRawUnsafe(`REVOKE INSERT ON "StatusHistory" FROM phase1_runtime`);
    try { await expect(startPayment(draft)).rejects.toThrow(); }
    finally { await owner!.$executeRawUnsafe(`GRANT INSERT ON "StatusHistory" TO phase1_runtime`); }
    expect((await payment()).application.status).toBe("NEEDS_EDIT");
    expect((await payment()).status).toBe("VERIFIED");
    expect((await startPayment(draft)).ok).toBe(true);
    expect(await db.statusHistory.count({ where: { applicationId: appId, previousStatus: "NEEDS_EDIT" } })).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("R1 facilities delayed cancellation preserves verification and later review", async () => {
    const id = await facilitiesFixture(); await startFacilitiesPayment({ applicationId: id, confirmed: true });
    const p = await db.facilitiesPaymentAttempt.findFirstOrThrow({ where: { applicationId: id } });
    const b = barrier(); const original = db.facilitiesPaymentAttempt.findUnique.bind(db.facilitiesPaymentAttempt);
    const spy = vi.spyOn(db.facilitiesPaymentAttempt, "findUnique").mockImplementationOnce((async (args: Parameters<typeof original>[0]) => { const result = await original(args); await b.wait(); return result; }) as unknown as typeof original);
    const cancelled = verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "NOK" }); await b.reached;
    expect(await verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" })).toEqual({ state: "success" });
    await db.facilitiesApplication.update({ where: { id }, data: { status: "UNDER_REVIEW" } });
    const before = await db.facilitiesApplication.findUniqueOrThrow({ where: { id } });
    b.release(); expect(await cancelled).toEqual({ state: "success" }); spy.mockRestore();
    expect(await db.facilitiesApplication.findUnique({ where: { id } })).toMatchObject({ status: "UNDER_REVIEW", submittedAt: before.submittedAt });
    expect(await db.facilitiesPaymentAttempt.findUnique({ where: { id: p.id } })).toMatchObject({ status: "VERIFIED" });
    expect(await db.facilitiesAuditLog.count({ where: { applicationId: id, action: "PAYMENT_VERIFIED" } })).toBe(1);
    expect(await db.facilitiesStatusHistory.count({ where: { applicationId: id, newStatus: "SUBMITTED" } })).toBe(1);
    expect(calls.filter(c => c.authority)).toHaveLength(1);
  });

  it("R1 conflicting completion retains candidate for journalled cleanup and preserves existing certificate", async () => {
    await startPayment(draft); const p = await payment(); await settleLegacyPayment(p, p.authority!);
    await dispatchSubmissionIntent(appId, "fixture"); vi.mocked(sendSms).mockClear();
    const root = await mkdtemp(join(tmpdir(), "phase2-certificate-"));
    const candidate = join(root, `${randomUUID()}.pdf`); const existing = join(root, `${randomUUID()}.pdf`);
    try {
      await writeFile(candidate, "synthetic-candidate"); await writeFile(existing, "synthetic-existing");
      const old = await db.applicationFile.create({ data: { applicationId: appId, fieldKey: "validationCertificate", originalName: "old.pdf", mimeType: "application/pdf", size: 18, storagePath: existing } });
      const b = barrier();
      vi.mocked(storeUploadFile).mockImplementationOnce(async () => { await b.wait(); return { storagePath: candidate, originalName: "candidate.pdf", mimeType: "application/pdf", size: 19 }; });
      const reviewSnapshot = await db.application.findUniqueOrThrow({where:{id:appId}});
      const form = new FormData(); form.set("expectedStatus",reviewSnapshot.status); form.set("expectedVersion",String(reviewSnapshot.draftVersion)); form.set("applicationId", appId); form.set("status", "VALIDATION_COMPLETED"); form.set("certificate", new File(["synthetic"], "candidate.pdf"));
      const completing = changeSubmissionStatus(form).catch(e => e); await b.reached;
      const correction = new FormData(); correction.set("expectedStatus",reviewSnapshot.status); correction.set("expectedVersion",String(reviewSnapshot.draftVersion)); correction.set("applicationId", appId); correction.set("status", "NEEDS_EDIT");
      await changeSubmissionStatus(correction); vi.mocked(sendSms).mockClear();
      b.release(); expect(await completing).toMatchObject({ status: 409 });
      await expect(access(candidate)).resolves.toBeUndefined();
      expect(await readFile(existing, "utf8")).toBe("synthetic-existing");
      expect(await db.applicationFile.findUnique({ where: { id: old.id } })).not.toBeNull();
      expect(await db.applicationFile.count({ where: { applicationId: appId, storagePath: candidate } })).toBe(0);
      expect(await db.statusHistory.count({ where: { applicationId: appId, newStatus: "VALIDATION_COMPLETED" } })).toBe(0);
      expect(sendSms).not.toHaveBeenCalled();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("concurrent starts cross a provider barrier only once, and replay the same URL", async () => {
    const b = barrier(); const fetcher = fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await b.wait(); return fetcher(...args); }));
    const first = startPayment(draft); await b.reached;
    const other = await Promise.all(Array.from({ length: 8 }, () => startPayment(draft)));
    expect(other.every(r => !r.ok)).toBe(true);
    expect(await db.payment.count({ where: { applicationId: appId } })).toBe(1);
    b.release(); const result = await first;
    expect(result.ok).toBe(true); expect(await startPayment(draft)).toEqual(result);
    expect(calls).toHaveLength(1);
  });

  it("serializes duplicate callbacks and creates one settlement/history/notification intent", async () => {
    await startPayment(draft); const p = await payment(); const b = barrier(); const fetcher = fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await b.wait(); return fetcher(...args); }));
    const first = settleLegacyPayment(p, p.authority!); await b.reached;
    expect(await settleLegacyPayment(p, p.authority!)).toBe("unknown");
    b.release(); expect(await first).toBe("verified");
    expect(await settleLegacyPayment(p, p.authority!)).toBe("already-settled");
    expect(calls.filter(c => c.authority)).toHaveLength(1);
    expect(await db.statusHistory.count({ where: { applicationId: appId, newStatus: "SUBMITTED" } })).toBe(1);
    expect(await db.paymentNotificationIntent.count({ where: { obligation: { legacyApplicationId: appId } } })).toBe(1);
  });

  it("old authorities before and after settlement never reach provider and retain separate evidence", async () => {
    await startPayment(draft); const p = await payment();
    for (let i = 0; i < 3; i++) {
      const old = await db.payment.create({ data: { applicationId: appId, amountToman: p.amountToman, authority: `old-${i}`, status: "FAILED" } });
      expect(await settleLegacyPayment({ ...old, application: p.application }, old.authority!)).toBe("unknown");
    }
    expect(await settleLegacyPayment(p, p.authority!)).toBe("verified");
    const old = await db.payment.create({ data: { applicationId: appId, amountToman: p.amountToman, authority: "late", status: "FAILED" } });
    expect(await settleLegacyPayment({ ...old, application: p.application }, old.authority!)).toBe("duplicate");
    expect(calls.filter(c => c.authority).map(c => c.authority)).toEqual([p.authority]);
    expect(await db.paymentOperationResult.count({ where: { obligation: { legacyApplicationId: appId }, outcome: "COMPETING_CALLBACK" } })).toBe(4);
  });

  it("unknown request timeout and expired lease never create another remote call", async () => {
    const fetchMock = vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }); vi.stubGlobal("fetch", fetchMock);
    expect((await startPayment(draft)).ok).toBe(false);
    await db.paymentObligation.update({ where: { legacyApplicationId: appId }, data: { leaseUntil: new Date(0) } });
    expect((await startPayment(draft)).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await db.payment.count({ where: { applicationId: appId } })).toBe(1);
  });

  it("verification timeout never retries remotely or creates another authority", async () => {
    await startPayment(draft); const p = await payment(); const fetchMock = vi.fn(async () => { throw new TypeError("fetch failed"); }); vi.stubGlobal("fetch", fetchMock);
    expect(await settleLegacyPayment(p, p.authority!)).toBe("unknown");
    await db.paymentObligation.update({ where: { legacyApplicationId: appId }, data: { leaseUntil: new Date(0) } });
    expect(await settleLegacyPayment(p, p.authority!)).toBe("unknown");
    expect((await startPayment(draft)).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("crash after authority evidence replays only local persistence and the original URL", async () => {
    const claim = await db.$transaction(async tx => {
      await lockPaymentApplication(tx, "legacy", appId);
      const o = await paymentObligation(tx, "legacy", appId, 3000000);
      const p = await tx.payment.create({ data: { applicationId: appId, amountToman: 3000000 } });
      return claimPaymentOperation(tx, o, "REQUEST", p.id);
    });
    await savePaymentResult(claim, "AUTHORITY", { authority: "saved-authority" });
    expect(await startPayment(draft)).toEqual({ ok: true, redirectTo: "https://sandbox.zarinpal.com/pg/StartPay/saved-authority" });
    expect(calls).toHaveLength(0);
  });

  it("capture evidence survives failed submission commit and retries without provider", async () => {
    await startPayment(draft); const p = await payment();
    const reservation = await beginPaymentVerification("legacy", appId, p.id, p.amountToman, p.authority!);
    if (reservation.kind !== "claimed") throw new Error("missing claim");
    await savePaymentResult(reservation.claim, "CAPTURED", { authority: p.authority!, referenceId: "durable-capture" });
    await owner!.$executeRawUnsafe(`REVOKE INSERT ON "StatusHistory" FROM phase1_runtime`);
    try {
      expect(await settleLegacyPayment(p, p.authority!)).toBe("verified");
      expect((await payment()).status).toBe("VERIFIED");
      expect((await payment()).application.status).toBe("PENDING_PAYMENT");
      expect((await db.paymentObligation.findUniqueOrThrow({where:{legacyApplicationId:appId}})).state).toBe("SETTLED");
    }
    finally { await owner!.$executeRawUnsafe(`GRANT INSERT ON "StatusHistory" TO phase1_runtime`); }
    expect(await settleLegacyPayment(p, p.authority!)).toBe("already-settled");
    expect((await payment()).application.status).toBe("SUBMITTED");
    expect(await db.statusHistory.count({where:{applicationId:appId,newStatus:"SUBMITTED"}})).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("restricted role rejects cross-application selection, amount mutation and result deletion", async () => {
    await startPayment(draft); const o = await db.paymentObligation.findUniqueOrThrow({ where: { legacyApplicationId: appId } });
    await expect(db.paymentObligation.update({ where: { id: o.id }, data: { amountToman: 1 } })).rejects.toThrow();
    await expect(db.paymentOperationResult.deleteMany({ where: { obligationId: o.id } })).rejects.toThrow();
    await expect(db.paymentOperationResult.updateMany({ where: { obligationId: o.id }, data: { authority: "forged" } })).rejects.toThrow();
    const other = await db.application.create({ data: { userId: session.id, mobile: "fixture-other", companyNationalId: randomUUID() } });
    await expect(db.paymentObligation.create({ data: { legacyApplicationId: other.id, legacyPaymentId: o.legacyPaymentId, amountToman: 3000000, state: "READY" } })).rejects.toThrow();
  });
  it("notification failure preserves settlement and consumes one durable intent", async () => {
    await startPayment(draft); const p = await payment();
    await settleLegacyPayment(p, p.authority!);
    vi.mocked(sendSms).mockClear().mockRejectedValueOnce(new Error("isolated SMS failure"));
    await Promise.all([dispatchSubmissionIntent(appId, "fixture-mobile"), dispatchSubmissionIntent(appId, "fixture-mobile")]);
    await dispatchSubmissionIntent(appId, "fixture-mobile");
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect((await payment()).status).toBe("VERIFIED");
    expect(await db.paymentNotificationIntent.findFirst({ where: { obligation: { legacyApplicationId: appId } } })).toMatchObject({ state: "UNKNOWN" });
  });

  it("a late original worker may persist capture after expiry without enabling takeover", async () => {
    await startPayment(draft); const p = await payment(); const b = barrier(); const fetcher = fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await b.wait(); return fetcher(...args); }));
    const first = settleLegacyPayment(p, p.authority!); await b.reached;
    await db.paymentObligation.update({ where: { legacyApplicationId: appId }, data: { leaseUntil: new Date(0) } });
    expect(await settleLegacyPayment(p, p.authority!)).toBe("unknown");
    b.release(); expect(await first).toBe("verified");
    expect(calls.filter(c => c.authority)).toHaveLength(1);
    await expect(db.paymentObligation.update({ where: { legacyApplicationId: appId }, data: { state: "READY" } })).rejects.toThrow();
  });

  it("completed rejection evidence recovers despite crash and unrelated callback evidence", async () => {
    await startPayment(draft); const p = await payment();
    const r = await beginPaymentVerification("legacy", appId, p.id, p.amountToman, p.authority!);
    if (r.kind !== "claimed") throw new Error("claim missing");
    await savePaymentResult(r.claim, "REJECTED", { authority: p.authority! });
    const old = await db.payment.create({ data: { applicationId: appId, amountToman: p.amountToman, authority: "old-after-rejection", status: "FAILED" } });
    await settleLegacyPayment({ ...old, application: p.application }, old.authority!);
    expect(await settleLegacyPayment(p, p.authority!)).toBe("verified");
    expect(calls.filter(c => c.authority).map(c => c.authority)).toEqual([p.authority]);
  });

  it("provider capture with failed evidence persistence remains blocked after DB recovery", async () => {
    await startPayment(draft); const p = await payment();
    await owner!.$executeRawUnsafe(`REVOKE INSERT ON "PaymentOperationResult" FROM phase1_runtime`);
    try { expect(await settleLegacyPayment(p, p.authority!)).toBe("persist-failed"); }
    finally { await owner!.$executeRawUnsafe(`GRANT INSERT ON "PaymentOperationResult" TO phase1_runtime`); }
    expect(await settleLegacyPayment(p, p.authority!)).toBe("unknown");
    expect((await startPayment(draft)).ok).toBe(false);
    expect(calls.filter(c => c.authority)).toHaveLength(1);
  });

  it("facilities concurrent starts/callbacks and old-authority barriers use the same durable coordination", async () => {
    const id = await facilitiesFixture();
    const b = barrier(); const fetcher = fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await b.wait(); return fetcher(...args); }));
    const first = startFacilitiesPayment({ applicationId: id, confirmed: true }); await Promise.race([b.reached, first.then(() => { throw new Error("provider barrier not reached"); })]);
    expect(await startFacilitiesPayment({ applicationId: id, confirmed: true })).toMatchObject({ state: "pending" });
    b.release(); expect(await first).toMatchObject({ state: "redirect" });
    const p = await db.facilitiesPaymentAttempt.findFirstOrThrow({ where: { applicationId: id } });
    const old = await db.facilitiesPaymentAttempt.create({ data: { applicationId: id, amountToman: p.amountToman, gateway: "fixture", authority: "old-facilities", status: "FAILED" } });
    const v = barrier(); vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { await v.wait(); return fetcher(...args); }));
    const verify = verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" }); await v.reached;
    expect(await verifyFacilitiesPaymentCallback({ paymentId: old.id, authority: old.authority!, gatewayStatus: "OK" })).toEqual({ state: "pending" });
    expect(await verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" })).toEqual({ state: "pending" });
    v.release(); expect(await verify).toEqual({ state: "success" });
    expect(await verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" })).toEqual({ state: "success" });
    expect(calls.filter(c => c.authority).map(c => c.authority)).toEqual([p.authority]);
    expect(await db.facilitiesAuditLog.count({ where: { applicationId: id, action: "PAYMENT_VERIFIED" } })).toBe(1);
    expect(await db.facilitiesStatusHistory.count({ where: { applicationId: id, newStatus: "SUBMITTED" } })).toBe(1);
  });

  it("facilities request timeout and restart preserve its only attempt", async () => {
    const id = await facilitiesFixture(); const f = vi.fn(async () => { throw new TypeError("fetch failed"); }); vi.stubGlobal("fetch", f);
    expect(await startFacilitiesPayment({ applicationId: id, confirmed: true })).toMatchObject({ state: "pending" });
    await db.paymentObligation.update({ where: { facilitiesApplicationId: id }, data: { leaseUntil: new Date(0) } });
    expect(await startFacilitiesPayment({ applicationId: id, confirmed: true })).toMatchObject({ state: "pending" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(await db.facilitiesPaymentAttempt.count({ where: { applicationId: id } })).toBe(1);
  });

  it("facilities saved capture completes after a failed DB transaction without contacting provider again", async () => {
    const id = await facilitiesFixture();
    await startFacilitiesPayment({ applicationId: id, confirmed: true });
    const p = await db.facilitiesPaymentAttempt.findFirstOrThrow({ where: { applicationId: id } });
    const r = await beginPaymentVerification("facilities", id, p.id, p.amountToman, p.authority!);
    if (r.kind !== "claimed") throw new Error("missing claim");
    await savePaymentResult(r.claim, "CAPTURED", { authority: p.authority!, referenceId: "facilities-capture" });
    await owner!.$executeRawUnsafe(`REVOKE INSERT ON "FacilitiesAuditLog" FROM phase1_runtime`);
    try { expect(await verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" })).toEqual({ state: "pending" }); }
    finally { await owner!.$executeRawUnsafe(`GRANT INSERT ON "FacilitiesAuditLog" TO phase1_runtime`); }
    expect(await verifyFacilitiesPaymentCallback({ paymentId: p.id, authority: p.authority!, gatewayStatus: "OK" })).toEqual({ state: "success" });
    expect(calls).toHaveLength(1);
    expect(await db.facilitiesPaymentAttempt.findUnique({ where: { id: p.id } })).toMatchObject({ status: "VERIFIED" });
  });

  it("facilities restores saved authority and resumes its original URL without new provider request", async () => {
    const id = await facilitiesFixture();
    const claim = await db.$transaction(async tx => {
      await lockPaymentApplication(tx, "facilities", id);
      const o = await paymentObligation(tx, "facilities", id, 3000000);
      const p = await tx.facilitiesPaymentAttempt.create({ data: { applicationId: id, amountToman: 3000000, gateway: "fixture" } });
      return claimPaymentOperation(tx, o, "REQUEST", p.id);
    });
    await savePaymentResult(claim, "AUTHORITY", { authority: "facilities-saved" });
    expect(await startFacilitiesPayment({ applicationId: id, confirmed: true })).toMatchObject({ state: "redirect", redirectTo: "https://sandbox.zarinpal.com/pg/StartPay/facilities-saved" });
    expect(calls).toHaveLength(0);
  });

});
