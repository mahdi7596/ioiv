// Actual facilities qualification is covered in facilities-document-qualification.db.test.ts.
vi.mock("@/lib/facilities-files/qualification", () => ({ qualifyFacilitiesDocuments: vi.fn(async () => undefined) }));
import { installCoordinationMock } from "./payment-coordination-mock";
import { FacilitiesPaymentStatus, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requestZarinpalPayment: vi.fn(),
  verifyZarinpalPayment: vi.fn(),
  db: {
    facilitiesApplication: { update: vi.fn(), findUnique: vi.fn() },
    facilitiesPaymentAttempt: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    facilitiesApplicationEvidence: { upsert: vi.fn() },
    facilitiesStatusHistory: { create: vi.fn() },
    facilitiesAuditLog: { create: vi.fn() },
    facilitiesCorrectionRequest: { findFirst: vi.fn(), update: vi.fn() },
    facilitiesFileBinding: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/payments/zarinpal", () => ({ requestZarinpalPayment: mocks.requestZarinpalPayment, verifyZarinpalPayment: mocks.verifyZarinpalPayment }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/facilities/submission", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/facilities/submission")>();
  return { ...actual, refreshFacilitiesProfileSnapshot: vi.fn() };
});

function application(overrides: Record<string, unknown> = {}) {
  const file = (slotKey: string, fileType = slotKey === "questionnaire" ? "DOCX" : slotKey.includes("vat") || ["licences", "active-contracts"].includes(slotKey) ? "ZIP" : "PDF") => ({
    id: `binding-${slotKey}`,
    applicationId: "app_1",
    slotKey,
    currentUpload: { lifecycleStatus: "PASSED", createdAt: new Date("2026-09-01T00:00:00.000Z"), storedFile: { id: `stored-${slotKey}`, fileType, scanStatus: "PASSED" } },
  });
  return {
    id: "app_1",
    userId: "user_1",
    companyId: "company_1",
    status: "DRAFT",
    facilityType: "FIXED_CAPITAL",
    requestedAmountRial: new Prisma.Decimal(0),
    maximumAmountRialSnapshot: new Prisma.Decimal(500000000000),
    paymentEnabledSnapshot: true,
    paymentAmountTomanSnapshot: 3000000,
    companySnapshot: { name: "شرکت نمونه", nationalId: "۱۲۳۴۵۶۷۸۹۰۱", registrationNumber: "۱۲۳", registrationPlace: "تهران", registrationDate: new Date(), registeredCapitalRial: new Prisma.Decimal(100), contactFullName: "نماینده", contactNationalCode: "۱۲۳۴۵۶۷۸۹۰", contactMobile: "۰۹۱۲۳۴۵۶۷۸۹" },
    shareholders: [{ fullName: "سهامدار", nationalId: "۱۲۳۴۵۶۷۸۹۰", ownershipPercentage: new Prisma.Decimal(100) }],
    officers: [{ id: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true }, { id: "board_1", fullName: "عضو", position: "عضو هیئت‌مدیره", isChiefExecutive: false }],
    fileBindings: ["questionnaire", "licences", "active-contracts", "insurance", "trial-general", "trial-subsidiary", "credit-company", "credit-ceo", "credit-board", "vat-1404", "tax-1404", "financial-1404", "financial-1403"].map((slotKey) => file(slotKey)),
    evidence: [{ kind: "insurance", employeeCount: 10, officerId: null }, { kind: "credit-board", employeeCount: null, officerId: "board_1" }],
    payments: [],
    user: { mobile: "09120000000" },
    correctionRequests: [],
    history: [],
    ...overrides,
  };
}

describe("facilities payment and submission actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installCoordinationMock(mocks.db, "facilities", async () => {
      const app = await mocks.db.facilitiesApplication.findUnique();
      const p = await mocks.db.facilitiesPaymentAttempt.findUnique();
      return { ...app, payments: app.payments?.length ? app.payments : p?.application?.payments?.length ? p.application.payments : p?.authority ? [p] : [] };
    });
    mocks.requireSession.mockResolvedValue({ kind: "user", subjectId: "user_1" });
    mocks.db.$transaction.mockImplementation(async (work: unknown) => typeof work === "function" ? (work as (tx: typeof mocks.db) => unknown)(mocks.db) : Promise.all(work as Promise<unknown>[]));
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application());
    mocks.db.facilitiesApplication.update.mockResolvedValue({ id: "app_1" });
    mocks.db.facilitiesApplicationEvidence.upsert.mockResolvedValue({ id: "evidence" });
    mocks.db.facilitiesStatusHistory.create.mockResolvedValue({ id: "history" });
    mocks.db.facilitiesAuditLog.create.mockResolvedValue({ id: "audit" });
    mocks.db.facilitiesCorrectionRequest.findFirst.mockResolvedValue(null);
    mocks.db.facilitiesCorrectionRequest.update.mockResolvedValue({ id: "correction_1" });
    mocks.db.facilitiesFileBinding.findFirst.mockResolvedValue(null);
    mocks.db.facilitiesPaymentAttempt.create.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.INITIATED });
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.INITIATED, authority: null });
    mocks.db.facilitiesPaymentAttempt.update.mockResolvedValue({ id: "pay_1" });
    mocks.requestZarinpalPayment.mockResolvedValue({ authority: "auth_1", paymentUrl: "https://sandbox.zarinpal.com/pg/StartPay/auth_1" });
    process.env.APP_URL = "https://sana.ioiv.ir";
    process.env.ZARINPAL_SANDBOX = "true";
  });

  it("uses the pinned server amount and creates only one payment handoff", async () => {
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true })).resolves.toMatchObject({ ok: true, state: "redirect" });
    expect(mocks.requestZarinpalPayment).toHaveBeenCalledWith(expect.objectContaining({ amountToman: 3000000, mobile: "09120000000" }));
    expect(mocks.db.facilitiesPaymentAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountToman: 3000000, status: FacilitiesPaymentStatus.INITIATED }) }));
  });

  it("requires the confirmation checkbox before an enabled payment", async () => {
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: false })).rejects.toThrow("برای ادامه");
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("submits directly without a checkbox when payment is disabled", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ paymentEnabledSnapshot: false, paymentAmountTomanSnapshot: null }));
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: false })).resolves.toMatchObject({ ok: true, state: "submitted" });
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("does not create another authority for an uncoordinated historical redirect", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ payments: [{ id: "pay_existing", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.REDIRECT_READY, authority: "auth_existing", referenceId: null, createdAt: new Date(), updatedAt: new Date() }] }));
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true })).resolves.toMatchObject({ ok: true, state: "pending" });
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("rejects forged callback authorities before contacting the gateway", async () => {
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", authority: "real_authority", status: FacilitiesPaymentStatus.REDIRECT_READY });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "forged_authority", gatewayStatus: "OK" })).resolves.toEqual({ state: "failed" });
    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
  });

  it("does not verify an already verified callback twice", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "SUBMITTED" }));
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.VERIFIED });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "success" });
    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesApplication.update.mock.calls.some((call) => call[0]?.data?.status === "SUBMITTED")).toBe(false);
  });

  it("records the verified payment even when the submission step fails, and reports success", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "PENDING_PAYMENT", fileBindings: [] }));
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.REDIRECT_READY });
    mocks.verifyZarinpalPayment.mockResolvedValue({ referenceId: "ref_1" });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "success" });
    expect(mocks.db.facilitiesPaymentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: FacilitiesPaymentStatus.VERIFIED, referenceId: "ref_1" }) }));
    expect(mocks.db.facilitiesApplication.update.mock.calls.some((call) => call[0]?.data?.status === "SUBMITTED")).toBe(false);
    expect(mocks.db.facilitiesAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "APPLICATION_SUBMITTED", outcome: "FAILED", metadata: expect.objectContaining({ reasonCode: "PAID_DOCUMENT_REPAIR_REQUIRED" }) }) }));
  });

  it("keeps transport uncertainty and nonfinal rejection blocked", async () => {
    const { ZarinpalRejectedError, ZarinpalUnavailableError } = await import("@/lib/payments/zarinpal-errors");
    const open = { id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.REDIRECT_READY, application: application({ status: "PENDING_PAYMENT" }) };
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");

    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue(open);
    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalUnavailableError("HTTP_5XX", 502));
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "pending" });
    expect(mocks.db.facilitiesPaymentAttempt.update).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesApplication.update.mock.calls.some((call) => call[0]?.data?.status === "DRAFT")).toBe(false);

    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation(async (work: unknown) => typeof work === "function" ? (work as (tx: typeof mocks.db) => unknown)(mocks.db) : Promise.all(work as Promise<unknown>[]));
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue(open);
    mocks.db.facilitiesPaymentAttempt.update.mockResolvedValue({ id: "pay_1" });
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue({ status: "PENDING_PAYMENT" });
    mocks.db.facilitiesApplication.update.mockResolvedValue({ id: "app_1" });
    mocks.db.facilitiesStatusHistory.create.mockResolvedValue({ id: "history" });
    mocks.db.facilitiesAuditLog.create.mockResolvedValue({ id: "audit" });
    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalRejectedError(-51, { code: -51 }));
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "pending" });
    expect(mocks.db.facilitiesPaymentAttempt.update).not.toHaveBeenCalled();
  });

  it("does not ask the gateway about a closed attempt when the callback itself is not OK", async () => {
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.FAILED, application: application({ status: "DRAFT" }) });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "NOK" })).resolves.toEqual({ state: "failed" });
    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.update).not.toHaveBeenCalled();
  });

  it("records a late capture when the gateway confirms an attempt that was already closed, and submits", async () => {
    const closed = { id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.FAILED, application: application({ status: "DRAFT" }) };
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue(closed);
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "DRAFT" }));
    mocks.verifyZarinpalPayment.mockResolvedValue({ referenceId: "ref_late" });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");

    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "success" });

    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledWith({ amountToman: 3000000, authority: "auth_1" });
    expect(mocks.db.facilitiesPaymentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pay_1" }, data: expect.objectContaining({ status: FacilitiesPaymentStatus.VERIFIED, referenceId: "ref_late", safeMetadata: expect.objectContaining({ reasonCode: "LATE_CAPTURE" }) }) }));
    expect(mocks.db.facilitiesAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "PAYMENT_VERIFIED", metadata: expect.objectContaining({ reasonCode: "LATE_CAPTURE" }) }) }));
    expect(mocks.db.facilitiesApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED" }) }));
  });

  it("leaves a closed attempt closed when the gateway rejects it, and flags it when the gateway is unreachable", async () => {
    const { ZarinpalRejectedError, ZarinpalUnavailableError } = await import("@/lib/payments/zarinpal-errors");
    const closed = { id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.CANCELLED, application: application({ status: "DRAFT" }) };
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue(closed);
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");

    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalRejectedError(-51, { code: -51 }));
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "pending" });
    expect(mocks.db.facilitiesPaymentAttempt.update).not.toHaveBeenCalled();

    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalUnavailableError("HTTP_5XX", 503));
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "pending" });
    expect(mocks.db.facilitiesPaymentAttempt.update).not.toHaveBeenCalled();
  });

  it("never verifies a second capture when the application already holds a verified payment", async () => {
    const verifiedFirst = { id: "pay_a", amountToman: 3000000, status: FacilitiesPaymentStatus.VERIFIED, authority: "auth_a", referenceId: "ref_a", createdAt: new Date(), updatedAt: new Date() };
    const second = { id: "pay_b", applicationId: "app_1", amountToman: 3000000, authority: "auth_b", status: FacilitiesPaymentStatus.REDIRECT_READY, application: application({ status: "SUBMITTED", payments: [verifiedFirst] }) };
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue(second);
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");

    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_b", authority: "auth_b", gatewayStatus: "OK" })).resolves.toEqual({ state: "success" });

    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.update).not.toHaveBeenCalled();

    expect(mocks.db.facilitiesApplication.update).not.toHaveBeenCalled();
  });

  it("keeps a stale authority-less attempt blocked instead of assuming it never reached the gateway", async () => {
    const stale = new Date(Date.now() - 30 * 60 * 1000);
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "PENDING_PAYMENT", payments: [{ id: "pay_stale", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.TIMED_OUT, authority: null, referenceId: null, createdAt: stale, updatedAt: stale }] }));
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true })).resolves.toMatchObject({ ok: true, state: "pending" });
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("re-verifies a stale attempt that reached the gateway and submits when the gateway confirms it", async () => {
    const stale = new Date(Date.now() - 30 * 60 * 1000);
    const staleAttempt = { id: "pay_stale", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.REDIRECT_READY, authority: "auth_old", referenceId: null, createdAt: stale, updatedAt: stale };
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "PENDING_PAYMENT", payments: [staleAttempt] }));
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ ...staleAttempt, application: application({ status: "PENDING_PAYMENT" }) });
    mocks.verifyZarinpalPayment.mockResolvedValue({ referenceId: "ref_late" });
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true })).resolves.toMatchObject({ ok: true, state: "submitted" });
    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledWith({ amountToman: 3000000, authority: "auth_old" });
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED" }) }));
  });

  it("keeps a stale attempt pending when the gateway cannot be reached during re-verification", async () => {
    const stale = new Date(Date.now() - 30 * 60 * 1000);
    const staleAttempt = { id: "pay_stale", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.REDIRECT_READY, authority: "auth_old", referenceId: null, createdAt: stale, updatedAt: stale };
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "PENDING_PAYMENT", payments: [staleAttempt] }));
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ ...staleAttempt, application: application({ status: "PENDING_PAYMENT" }) });
    mocks.verifyZarinpalPayment.mockRejectedValue(new TypeError("fetch failed"));
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true })).resolves.toMatchObject({ ok: true, state: "pending" });
    expect(mocks.db.facilitiesPaymentAttempt.update.mock.calls.some((call) => call[0]?.data?.status === FacilitiesPaymentStatus.FAILED)).toBe(false);
  });

  it("blocks new payment when closed historical attempts lack finality evidence", async () => {
    const closed = [{ id: "pay_old", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.FAILED, authority: null, referenceId: null }];
    // Lock/load, then the draft-return status read, then the reload after returning to draft.
    mocks.db.facilitiesApplication.findUnique
      .mockResolvedValueOnce(application({ status: "PENDING_PAYMENT", payments: closed }))
      .mockResolvedValueOnce(application({ status: "PENDING_PAYMENT", payments: closed }))
      .mockResolvedValue(application({ status: "DRAFT", payments: closed }));
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true })).resolves.toMatchObject({ ok: true, state: "pending" });
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("verifies the gateway amount from the payment row and submits atomically", async () => {
    const pendingApplication = application({ status: "PENDING_PAYMENT" });
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.REDIRECT_READY, application: pendingApplication });
    mocks.verifyZarinpalPayment.mockResolvedValue({ referenceId: "ref_1" });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "success" });
    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledWith({ amountToman: 3000000, authority: "auth_1" });
    expect(mocks.db.facilitiesPaymentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: FacilitiesPaymentStatus.VERIFIED, referenceId: "ref_1" }) }));
    expect(mocks.db.facilitiesApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED", submittedAt: expect.any(Date) }) }));
  });

  it("accepts a delayed successful callback after a timeout without starting another payment", async () => {
    const pendingApplication = application({ status: "PENDING_PAYMENT" });
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, authority: "auth_1", status: FacilitiesPaymentStatus.TIMED_OUT, application: pendingApplication });
    mocks.verifyZarinpalPayment.mockResolvedValue({ referenceId: "ref_delayed" });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "success" });
    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledOnce();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("resubmits an open correction with the verified payment and preserves submittedAt", async () => {
    const originalSubmittedAt = new Date("2026-09-10T10:00:00.000Z");
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "NEEDS_EDIT", submittedAt: originalSubmittedAt, payments: [{ id: "verified", amountToman: 3000000, status: FacilitiesPaymentStatus.VERIFIED }] }));
    mocks.db.facilitiesCorrectionRequest.findFirst.mockResolvedValue({ id: "correction_1", openedAt: new Date("2026-08-01T00:00:00.000Z") });
    const { submitFacilitiesApplication } = await import("@/lib/actions/facilities-payment");
    await expect(submitFacilitiesApplication({ applicationId: "app_1" })).resolves.toMatchObject({ state: "submitted" });
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesCorrectionRequest.update).toHaveBeenCalledWith({ where: { id: "correction_1" }, data: { resolvedAt: expect.any(Date) } });
    const statusUpdate = mocks.db.facilitiesApplication.update.mock.calls.find((call) => call[0]?.data?.status === "SUBMITTED")?.[0];
    expect(statusUpdate.data).not.toHaveProperty("submittedAt");
  });

  it("rejects a correction resubmit when nothing was uploaded since the correction was opened", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "NEEDS_EDIT", payments: [{ id: "verified", amountToman: 3000000, status: FacilitiesPaymentStatus.VERIFIED }] }));
    // Opened after every fixture upload's createdAt (2026-09-01) and with no
    // newer company-profile document either: nothing has changed since.
    mocks.db.facilitiesCorrectionRequest.findFirst.mockResolvedValue({ id: "correction_1", openedAt: new Date("2026-09-15T00:00:00.000Z") });
    mocks.db.facilitiesFileBinding.findFirst.mockResolvedValue(null);
    const { submitFacilitiesApplication } = await import("@/lib/actions/facilities-payment");
    await expect(submitFacilitiesApplication({ applicationId: "app_1" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.db.facilitiesCorrectionRequest.update).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesApplication.update.mock.calls.some((call) => call[0]?.data?.status === "SUBMITTED")).toBe(false);
  });

  it("resubmits a correction once a company-profile document was replaced, even with no application-file change", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ status: "NEEDS_EDIT", payments: [{ id: "verified", amountToman: 3000000, status: FacilitiesPaymentStatus.VERIFIED }] }));
    mocks.db.facilitiesCorrectionRequest.findFirst.mockResolvedValue({ id: "correction_1", openedAt: new Date("2026-09-15T00:00:00.000Z") });
    mocks.db.facilitiesFileBinding.findFirst.mockResolvedValue({ id: "profile-binding-1" });
    const { submitFacilitiesApplication } = await import("@/lib/actions/facilities-payment");
    await expect(submitFacilitiesApplication({ applicationId: "app_1" })).resolves.toMatchObject({ state: "submitted" });
    expect(mocks.db.facilitiesFileBinding.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "company_1", scope: "COMPANY_PROFILE" }) }));
    expect(mocks.db.facilitiesCorrectionRequest.update).toHaveBeenCalledWith({ where: { id: "correction_1" }, data: { resolvedAt: expect.any(Date) } });
  });
});
