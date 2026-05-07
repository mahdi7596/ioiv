import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  verifyZarinpalPayment: vi.fn(),
  notifyAdminOfSubmission: vi.fn(),
  notifyUserOfSubmission: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  db: {
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    application: {
      update: vi.fn(),
    },
    statusHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/payments/zarinpal", () => ({
  verifyZarinpalPayment: mocks.verifyZarinpalPayment,
}));

vi.mock("@/lib/actions/payment", () => ({
  notifyAdminOfSubmission: mocks.notifyAdminOfSubmission,
  notifyUserOfSubmission: mocks.notifyUserOfSubmission,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}));

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_1",
    applicationId: "app_1",
    authority: "authority_1",
    status: PaymentStatus.INITIATED,
    application: {
      id: "app_1",
      mobile: "09123456789",
      status: ApplicationStatus.PENDING_PAYMENT,
    },
    ...overrides,
  };
}

async function expectRedirect(url: string, target: string) {
  const { GET } = await import("@/app/api/payment/callback/route");

  await expect(GET(new Request(url))).rejects.toThrow(`NEXT_REDIRECT:${target}`);
}

describe("payment callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.payment.findUnique.mockResolvedValue(payment());
    mocks.db.payment.update.mockResolvedValue({ id: "pay_1" });
    mocks.db.application.update.mockResolvedValue({ id: "app_1" });
    mocks.db.statusHistory.create.mockResolvedValue({ id: "history_1" });
    mocks.db.$transaction.mockImplementation(async (operations) => operations);
    mocks.verifyZarinpalPayment.mockResolvedValue({ referenceId: "ref_123" });
    mocks.notifyAdminOfSubmission.mockResolvedValue(undefined);
    mocks.notifyUserOfSubmission.mockResolvedValue(undefined);
  });

  it("verifies matching callbacks and redirects to the success return page", async () => {
    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
      "/payment/return?status=success&paymentId=pay_1",
    );

    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledWith({
      amountToman: 3000000,
      authority: "authority_1",
    });
    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: {
        status: PaymentStatus.VERIFIED,
        referenceId: "ref_123",
        rawData: { referenceId: "ref_123" },
      },
    });
    expect(mocks.db.application.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: {
        status: ApplicationStatus.SUBMITTED,
        submittedAt: expect.any(Date),
      },
    });
    expect(mocks.db.statusHistory.create).toHaveBeenCalledOnce();
  });

  it("does not downgrade a verified payment when notification delivery fails", async () => {
    mocks.notifyAdminOfSubmission.mockRejectedValue(new Error("sms down"));

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
      "/payment/return?status=success&paymentId=pay_1",
    );

    expect(mocks.db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.VERIFIED }) }),
    );
    expect(mocks.db.payment.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
    );
    expect(mocks.db.application.update).not.toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: { status: ApplicationStatus.DRAFT },
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "payment_notification_failed",
      expect.any(Error),
      expect.objectContaining({ paymentId: "pay_1", applicationId: "app_1" }),
    );
  });

  it("treats already verified callbacks as successful without duplicate verification or history", async () => {
    mocks.db.payment.findUnique.mockResolvedValue(
      payment({
        status: PaymentStatus.VERIFIED,
        referenceId: "ref_123",
        application: {
          id: "app_1",
          mobile: "09123456789",
          status: ApplicationStatus.SUBMITTED,
        },
      }),
    );

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
      "/payment/return?status=success&paymentId=pay_1",
    );

    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.statusHistory.create).not.toHaveBeenCalled();
    expect(mocks.notifyAdminOfSubmission).not.toHaveBeenCalled();
  });

  it("marks cancelled active payments failed and returns the application to draft", async () => {
    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=NOK",
      "/payment/return?status=failed&paymentId=pay_1",
    );

    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { status: "NOK", reason: "callback_not_ok" },
      },
    });
    expect(mocks.db.application.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: { status: ApplicationStatus.DRAFT },
    });
  });

  it("does not downgrade stale failed callbacks after review has started", async () => {
    mocks.db.payment.findUnique.mockResolvedValue(
      payment({
        application: {
          id: "app_1",
          mobile: "09123456789",
          status: ApplicationStatus.UNDER_REVIEW,
        },
      }),
    );

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=NOK",
      "/payment/return?status=failed&paymentId=pay_1",
    );

    expect(mocks.db.application.update).not.toHaveBeenCalled();
  });

  it("does not return the application to draft for an old failed callback after a retry started", async () => {
    mocks.db.payment.findUnique.mockResolvedValue(
      payment({
        id: "old_pay",
        application: {
          id: "app_1",
          mobile: "09123456789",
          status: ApplicationStatus.PENDING_PAYMENT,
          payments: [{ id: "new_pay", status: PaymentStatus.INITIATED }],
        },
      }),
    );

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=old_pay&Authority=authority_1&Status=NOK",
      "/payment/return?status=failed&paymentId=old_pay",
    );

    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "old_pay" },
      data: {
        status: PaymentStatus.FAILED,
        rawData: { status: "NOK", reason: "callback_not_ok" },
      },
    });
    expect(mocks.db.application.update).not.toHaveBeenCalled();
  });

  it("does not return the application to draft for an old failed callback after another payment was verified", async () => {
    mocks.db.payment.findUnique.mockResolvedValue(
      payment({
        id: "old_pay",
        application: {
          id: "app_1",
          mobile: "09123456789",
          status: ApplicationStatus.PENDING_PAYMENT,
          payments: [{ id: "verified_pay", status: PaymentStatus.VERIFIED }],
        },
      }),
    );

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=old_pay&Authority=authority_1&Status=NOK",
      "/payment/return?status=failed&paymentId=old_pay",
    );

    expect(mocks.db.application.update).not.toHaveBeenCalled();
  });
});
