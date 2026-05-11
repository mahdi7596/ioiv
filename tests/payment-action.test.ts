import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_AMOUNT_TOMAN } from "@/lib/validations/shared";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requestZarinpalPayment: vi.fn(),
  db: {
    application: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/lib/payments/zarinpal", () => ({
  requestZarinpalPayment: mocks.requestZarinpalPayment,
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

function completeApplication(overrides: Record<string, unknown> = {}) {
  const file = { fileId: "file_1", name: "doc.pdf" };

  return {
    id: "app_1",
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
    mocks.requireSession.mockResolvedValue({ subjectId: "user_1", kind: "user" });
    mocks.db.application.findFirst.mockResolvedValue(completeApplication());
    mocks.db.payment.create.mockResolvedValue({ id: "pay_1" });
    mocks.db.payment.update.mockResolvedValue({ id: "pay_1" });
    mocks.db.payment.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.application.update.mockResolvedValue({ id: "app_1" });
    mocks.db.$transaction.mockImplementation(async (operations) => operations);
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
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.db.application.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
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
      message: "مدارک الزامی پیش از پرداخت کامل نیست",
    });
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
  });

  it("marks the initiated payment failed when Zarinpal request fails without changing application status", async () => {
    mocks.requestZarinpalPayment.mockRejectedValue(new Error("provider down"));
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toEqual({
      ok: false,
      message: "شروع پرداخت ناموفق بود. کمی بعد دوباره تلاش کنید.",
    });

    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { error: "provider down" },
      },
    });
    expect(mocks.db.application.update).not.toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: { status: ApplicationStatus.DRAFT },
    });
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

  it("retries a pending payment by failing previous initiated attempts and creating a fresh request", async () => {
    mocks.db.application.findFirst.mockResolvedValue(
      completeApplication({
        status: ApplicationStatus.PENDING_PAYMENT,
        payments: [{ id: "old_pay", status: PaymentStatus.INITIATED }],
      }),
    );
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toEqual({
      ok: true,
      redirectTo: "https://sandbox.zarinpal.com/pg/StartPay/authority_1",
    });

    expect(mocks.db.payment.updateMany).toHaveBeenCalledWith({
      where: {
        applicationId: "app_1",
        status: PaymentStatus.INITIATED,
      },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { reason: "payment_retry_started" },
      },
    });
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: {
        applicationId: "app_1",
        amountToman: PAYMENT_AMOUNT_TOMAN,
        status: PaymentStatus.INITIATED,
      },
    });
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
      message: "پرداخت قبلاً ثبت شده است",
    });

    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.requestZarinpalPayment).not.toHaveBeenCalled();
  });

  it("returns a pending-payment retry to draft when the fresh gateway request fails", async () => {
    mocks.db.application.findFirst.mockResolvedValue(
      completeApplication({
        status: ApplicationStatus.PENDING_PAYMENT,
        payments: [{ id: "old_pay", status: PaymentStatus.INITIATED }],
      }),
    );
    mocks.requestZarinpalPayment.mockRejectedValue(new Error("provider down"));
    const { startPayment } = await import("@/lib/actions/payment");

    await expect(startPayment(completeApplication())).resolves.toEqual({
      ok: false,
      message: "شروع پرداخت ناموفق بود. کمی بعد دوباره تلاش کنید.",
    });

    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { error: "provider down" },
      },
    });
    expect(mocks.db.application.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: { status: ApplicationStatus.DRAFT },
    });
  });
});
