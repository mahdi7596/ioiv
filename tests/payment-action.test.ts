// File qualification is covered by document-qualification.db.test.ts with real bytes.
vi.mock("@/lib/uploads/qualification", () => ({ qualifyLegacyDocuments: vi.fn(async () => undefined) }));
import { installCoordinationMock } from "./payment-coordination-mock";
import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";
import { ZarinpalRejectedError, ZarinpalUnavailableError } from "@/lib/payments/zarinpal-errors";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requestZarinpalPayment: vi.fn(),
  verifyZarinpalPayment: vi.fn(),
  sendSms: vi.fn(),
  db: {
    application: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    statusHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/lib/payments/zarinpal", () => ({
  requestZarinpalPayment: mocks.requestZarinpalPayment,
  verifyZarinpalPayment: mocks.verifyZarinpalPayment,
}));

vi.mock("@/lib/sms", () => ({
  sendSms: mocks.sendSms,
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

function completeApplication(overrides: Record<string, unknown> = {}) {
  const file = { fileId: "file_1", name: "doc.pdf" };

  return {
    id: "app_1",
    userId: "user_1",
    mobile: "09123456789",
    status: ApplicationStatus.DRAFT,
    currentStep: 6,
    taxDeclarations: [{ year: "1402", file }],
    financials: [{ year: "1402", file }],
    humanResources: { employeeCount: 10, insuranceList: file },
    trialBalance: { generalLedger: file, subsidiaryLedger: file },
    creditReports: { company: file, ceo: file, boardMember: file },
    payments: [],
    ...overrides,
  };
}

describe("payment action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = "https://sana.ioiv.ir";
    installCoordinationMock(mocks.db, "legacy", () => mocks.db.application.findFirst());
    mocks.requireSession.mockResolvedValue({ subjectId: "user_1", kind: "user" });
    mocks.db.application.findFirst.mockResolvedValue(completeApplication());
    mocks.db.payment.create.mockResolvedValue({ id: "pay_1", amountToman: PAYMENT_AMOUNT_TOMAN });
    mocks.db.payment.update.mockResolvedValue({ id: "pay_1" });
    mocks.db.payment.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.application.update.mockResolvedValue({ id: "app_1" });
    mocks.db.statusHistory.create.mockResolvedValue({ id: "history_1" });
    mocks.db.$transaction.mockImplementation(async (work: unknown) => typeof work === "function" ? (work as (tx: typeof mocks.db) => unknown)(mocks.db) : work);
    mocks.sendSms.mockResolvedValue({ ok: true });
    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalRejectedError(-51, { code: -51 }));
    mocks.requestZarinpalPayment.mockResolvedValue({
      authority: "authority_1",
      paymentUrl: "https://sandbox.zarinpal.com/pg/StartPay/authority_1",
    });
  });

  it("starts payment only after server-side final validation passes", async () => {
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toEqual({
      ok: true,
      redirectTo: "https://sandbox.zarinpal.com/pg/StartPay/authority_1",
    });

    expect(mocks.db.application.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: expect.objectContaining({
        taxDeclarations: [{ year: "1402", file: { fileId: "file_1", name: "doc.pdf" } }],
        financials: [{ year: "1402", file: { fileId: "file_1", name: "doc.pdf" } }],
      }),
    });
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: {
        applicationId: "app_1",
        amountToman: PAYMENT_AMOUNT_TOMAN,
        status: PaymentStatus.INITIATED,
      },
    });
    expect(mocks.requestZarinpalPayment).toHaveBeenCalledWith({
      amountToman: PAYMENT_AMOUNT_TOMAN,
      description: "پرداخت ثبت پرونده سامانه اعتبار سنجی سانا",
      callbackUrl: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
      mobile: "09123456789",
    });
    expect(mocks.db.$transaction).toHaveBeenCalled();
    expect(mocks.db.application.updateMany).toHaveBeenCalledWith({
      where: { id: "app_1", status: ApplicationStatus.DRAFT },
      data: { status: ApplicationStatus.PENDING_PAYMENT },
    });
    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { authority: "authority_1" },
    });
  });

  it("does not create a payment request when final validation fails", async () => {
    mocks.db.application.findFirst.mockResolvedValue(
      completeApplication({ trialBalance: { generalLedger: { fileId: "file_1", name: "doc.pdf" } } }),
    );
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(
      startPayment(
        completeApplication({ trialBalance: { generalLedger: { fileId: "file_1", name: "doc.pdf" } } }),
      ),
    ).resolves.toEqual({
      ok: false,
      message: expect.stringContaining("مدارک الزامی"),
    });
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
  });

  it("preserves uncertain request instead of marking it failed", async () => {
    mocks.requestZarinpalPayment.mockRejectedValue(new Error("provider down"));
    const { startPayment } = await import("@/lib/actions/payment");
    await expect(startPayment(completeApplication())).resolves.toMatchObject({ ok: false, message: expect.stringContaining("نتیجه پرداخت شما") });
    expect(mocks.db.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.db.payment.update).not.toHaveBeenCalled();
  });

  it("submits corrections without repayment when a needs-edit application already has verified payment", async () => {
    mocks.db.application.findFirst.mockResolvedValue(
      completeApplication({
        status: ApplicationStatus.NEEDS_EDIT,
        payments: [{ id: "verified_1", status: PaymentStatus.VERIFIED }],
      }),
    );
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toEqual({
      ok: true,
      redirectTo: "/dashboard",
    });

    expect(mocks.db.application.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: expect.objectContaining({ status: ApplicationStatus.SUBMITTED }),
    });
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
  });

  it("blocks another authority for uncertain existing history: retries a pending payment by failing previous initiated attempts and creating a fresh request", async () => {
    mocks.db.application.findFirst.mockResolvedValue(completeApplication({ status: ApplicationStatus.PENDING_PAYMENT, payments: [{ id: "old_pay", status: PaymentStatus.INITIATED, amountToman: PAYMENT_AMOUNT_TOMAN }] }));
    const { startPayment } = await import("@/lib/actions/payment");
    await expect(startPayment(completeApplication())).resolves.toMatchObject({ ok: false, message: expect.stringContaining("نتیجه پرداخت شما") });
    expect(mocks.db.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
  });

  it("completes the submission without a new charge when the open attempt was already paid at the gateway", async () => {
    mocks.db.application.findFirst.mockResolvedValue(
      completeApplication({
        status: ApplicationStatus.PENDING_PAYMENT,
        payments: [{ id: "old_pay", status: PaymentStatus.INITIATED, authority: "authority_old", amountToman: PAYMENT_AMOUNT_TOMAN }],
      }),
    );
    mocks.verifyZarinpalPayment.mockResolvedValue({ referenceId: "ref_old" });
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toEqual({
      ok: true,
      redirectTo: "/payment/return?paymentId=old_pay",
    });

    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledWith({ amountToman: PAYMENT_AMOUNT_TOMAN, authority: "authority_old" });
    expect(mocks.db.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "old_pay", status: { not: PaymentStatus.VERIFIED } }, data: expect.objectContaining({ status: PaymentStatus.VERIFIED, referenceId: "ref_old" }) }),
    );
    expect(mocks.db.application.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app_1" }, data: expect.objectContaining({ status: ApplicationStatus.SUBMITTED }) }),
    );
    expect(mocks.db.payment.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }));
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.sendSms).toHaveBeenCalled();
  });

  it("refuses to start a second charge while the open attempt cannot be verified", async () => {
    mocks.db.application.findFirst.mockResolvedValue(
      completeApplication({
        status: ApplicationStatus.PENDING_PAYMENT,
        payments: [{ id: "old_pay", status: PaymentStatus.INITIATED, authority: "authority_old", amountToman: PAYMENT_AMOUNT_TOMAN }],
      }),
    );
    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalUnavailableError("HTTP_5XX", 503));
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toMatchObject({ ok: false, message: expect.stringContaining("نتیجه پرداخت شما") });

    expect(mocks.db.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.db.payment.update).not.toHaveBeenCalled();
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
  });

  it("blocks another authority for uncertain existing history: closes an open attempt the gateway rejects and then starts a fresh request", async () => {
    mocks.db.application.findFirst.mockResolvedValue(completeApplication({ status: ApplicationStatus.PENDING_PAYMENT, payments: [{ id: "old_pay", status: PaymentStatus.INITIATED, authority: "authority_old", amountToman: PAYMENT_AMOUNT_TOMAN }] }));
    const { startPayment } = await import("@/lib/actions/payment");
    await expect(startPayment(completeApplication())).resolves.toMatchObject({ ok: false, message: expect.stringContaining("نتیجه پرداخت شما") });
    expect(mocks.db.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
  });

  it("does not create another payment when a verified payment already exists", async () => {
    mocks.db.application.findFirst.mockResolvedValue(
      completeApplication({
        status: ApplicationStatus.SUBMITTED,
        payments: [{ id: "verified_1", status: PaymentStatus.VERIFIED }],
      }),
    );
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toEqual({
      ok: false,
      message: "وضعیت پرونده تغییر کرده است. پرداخت شما ثبت شده؛ صفحه را تازه‌سازی کنید تا وضعیت فعلی را ببینید.",
    });

    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
  });

  it("blocks another authority for uncertain existing history: returns a pending-payment retry to draft when the fresh gateway request fails", async () => {
    mocks.db.application.findFirst.mockResolvedValue(completeApplication({ status: ApplicationStatus.PENDING_PAYMENT, payments: [{ id: "old_pay", status: PaymentStatus.INITIATED, amountToman: PAYMENT_AMOUNT_TOMAN }] }));
    const { startPayment } = await import("@/lib/actions/payment");
    await expect(startPayment(completeApplication())).resolves.toMatchObject({ ok: false, message: expect.stringContaining("نتیجه پرداخت شما") });
    expect(mocks.db.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
  });

});
