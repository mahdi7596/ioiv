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
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/payments/zarinpal", () => ({ requestZarinpalPayment: mocks.requestZarinpalPayment, verifyZarinpalPayment: mocks.verifyZarinpalPayment }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function application(overrides: Record<string, unknown> = {}) {
  const file = (slotKey: string, fileType = slotKey === "questionnaire" ? "DOCX" : slotKey.includes("vat") || ["licences", "active-contracts"].includes(slotKey) ? "ZIP" : "PDF") => ({
    id: `binding-${slotKey}`,
    applicationId: "app_1",
    slotKey,
    currentUpload: { lifecycleStatus: "PASSED", storedFile: { id: `stored-${slotKey}`, fileType, scanStatus: "PASSED" } },
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
    companySnapshot: { name: "شرکت نمونه", nationalId: "۱۲۳۴۵۶۷۸۹۰۱", registrationNumber: "۱۲۳", registrationPlace: "تهران", registrationDate: new Date(), registeredCapitalRial: new Prisma.Decimal(100), contactFullName: "نماینده", contactNationalCode: "۱۲۳۴۵۶۷۸۹۰" },
    shareholders: [{ fullName: "سهامدار", ownershipPercentage: new Prisma.Decimal(100) }],
    officers: [{ id: "ceo_1", fullName: "مدیرعامل", position: "مدیرعامل", isChiefExecutive: true }, { id: "board_1", fullName: "عضو", position: "عضو هیئت‌مدیره", isChiefExecutive: false }],
    fileBindings: ["questionnaire", "licences", "active-contracts", "insurance", "trial-general", "trial-subsidiary", "credit-company", "credit-ceo", "credit-board", "vat-1404", "tax-1404", "financial-1404"].map((slotKey) => file(slotKey)),
    evidence: [{ kind: "insurance", employeeCount: 10, officerId: null }, { kind: "credit-board", employeeCount: null, officerId: "board_1" }],
    payments: [],
    user: { mobile: "09120000000" },
    ...overrides,
  };
}

describe("facilities payment and submission actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ kind: "user", subjectId: "user_1" });
    mocks.db.$transaction.mockImplementation(async (work: unknown) => typeof work === "function" ? (work as (tx: typeof mocks.db) => unknown)(mocks.db) : Promise.all(work as Promise<unknown>[]));
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application());
    mocks.db.facilitiesApplication.update.mockResolvedValue({ id: "app_1" });
    mocks.db.facilitiesApplicationEvidence.upsert.mockResolvedValue({ id: "evidence" });
    mocks.db.facilitiesStatusHistory.create.mockResolvedValue({ id: "history" });
    mocks.db.facilitiesAuditLog.create.mockResolvedValue({ id: "audit" });
    mocks.db.facilitiesPaymentAttempt.create.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.INITIATED });
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.INITIATED, authority: null });
    mocks.db.facilitiesPaymentAttempt.update.mockResolvedValue({ id: "pay_1" });
    mocks.requestZarinpalPayment.mockResolvedValue({ authority: "auth_1", paymentUrl: "https://sandbox.zarinpal.com/pg/StartPay/auth_1" });
    process.env.APP_URL = "https://sana.ioiv.ir";
    process.env.ZARINPAL_SANDBOX = "true";
  });

  it("uses the pinned server amount and creates only one payment handoff", async () => {
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true, employeeCount: 10, boardOfficerId: "board_1" })).resolves.toMatchObject({ ok: true, state: "redirect" });
    expect(mocks.requestZarinpalPayment).toHaveBeenCalledWith(expect.objectContaining({ amountToman: 3000000, mobile: "09120000000" }));
    expect(mocks.db.facilitiesPaymentAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountToman: 3000000, status: FacilitiesPaymentStatus.INITIATED }) }));
  });

  it("requires the confirmation checkbox before an enabled payment", async () => {
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: false, employeeCount: 10, boardOfficerId: "board_1" })).rejects.toThrow("برای ادامه");
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("submits directly without a checkbox when payment is disabled", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ paymentEnabledSnapshot: false, paymentAmountTomanSnapshot: null }));
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: false, employeeCount: 10, boardOfficerId: "board_1" })).resolves.toMatchObject({ ok: true, state: "submitted" });
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it("reuses an existing redirect instead of creating a duplicate payment", async () => {
    mocks.db.facilitiesApplication.findUnique.mockResolvedValue(application({ payments: [{ id: "pay_existing", applicationId: "app_1", amountToman: 3000000, status: FacilitiesPaymentStatus.REDIRECT_READY, authority: "auth_existing", referenceId: null }] }));
    const { startFacilitiesPayment } = await import("@/lib/actions/facilities-payment");
    await expect(startFacilitiesPayment({ applicationId: "app_1", confirmed: true, employeeCount: 10, boardOfficerId: "board_1" })).resolves.toEqual({ ok: true, state: "redirect", redirectTo: "https://sandbox.zarinpal.com/pg/StartPay/auth_existing" });
    expect(mocks.db.facilitiesPaymentAttempt.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
  });

  it("rejects forged callback authorities before contacting the gateway", async () => {
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", authority: "real_authority", status: FacilitiesPaymentStatus.REDIRECT_READY });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "forged_authority", gatewayStatus: "OK" })).resolves.toEqual({ state: "failed" });
    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
  });

  it("does not verify an already verified callback twice", async () => {
    mocks.db.facilitiesPaymentAttempt.findUnique.mockResolvedValue({ id: "pay_1", authority: "auth_1", status: FacilitiesPaymentStatus.VERIFIED });
    const { verifyFacilitiesPaymentCallback } = await import("@/lib/actions/facilities-payment");
    await expect(verifyFacilitiesPaymentCallback({ paymentId: "pay_1", authority: "auth_1", gatewayStatus: "OK" })).resolves.toEqual({ state: "success" });
    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
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
});
