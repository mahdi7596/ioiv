import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZarinpalRejectedError, ZarinpalUnavailableError } from "@/lib/payments/zarinpal-errors";

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
      updateMany: vi.fn(),
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

vi.mock("@/lib/payments/legacy-notifications", () => ({
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
    amountToman: 3000000,
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
    mocks.db.payment.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.application.update.mockResolvedValue({ id: "app_1" });
    mocks.db.statusHistory.create.mockResolvedValue({ id: "history_1" });
    mocks.db.$transaction.mockImplementation(async (work: unknown) => typeof work === "function" ? (work as (tx: typeof mocks.db) => unknown)(mocks.db) : work);
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
    expect(mocks.db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay_1", status: { not: PaymentStatus.VERIFIED } },
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

    expect(mocks.db.payment.updateMany).toHaveBeenCalledWith(
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

  it("marks the attempt failed only when Zarinpal explicitly rejects the authority", async () => {
    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalRejectedError(-51, { code: -51, message: "Session is not valid" }));

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
      "/payment/return?status=failed&paymentId=pay_1",
    );

    expect(mocks.db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pay_1" }, data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
    );
    expect(mocks.db.application.update).toHaveBeenCalledWith({ where: { id: "app_1" }, data: { status: ApplicationStatus.DRAFT } });
    expect(mocks.notifyUserOfSubmission).not.toHaveBeenCalled();
  });

  it("keeps the attempt open and reports pending when the gateway gives no trustworthy answer", async () => {
    for (const error of [new ZarinpalUnavailableError("HTTP_5XX", 502), new TypeError("fetch failed"), Object.assign(new Error("aborted"), { name: "TimeoutError" })]) {
      vi.clearAllMocks();
      mocks.db.payment.findUnique.mockResolvedValue(payment());
      mocks.verifyZarinpalPayment.mockRejectedValue(error);

      await expectRedirect(
        "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
        "/payment/return?status=pending&paymentId=pay_1",
      );

      expect(mocks.db.payment.update).not.toHaveBeenCalled();
      expect(mocks.db.application.update).not.toHaveBeenCalled();
      expect(mocks.db.$transaction).not.toHaveBeenCalled();
      expect(mocks.notifyUserOfSubmission).not.toHaveBeenCalled();
      expect(mocks.loggerError).toHaveBeenCalledWith("payment_verification_unavailable", error, expect.objectContaining({ paymentId: "pay_1" }));
    }
  });

  it("never marks a gateway-confirmed payment failed when persisting it fails", async () => {
    mocks.db.$transaction.mockRejectedValueOnce(new Error("connection reset"));

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
      "/payment/return?status=pending&paymentId=pay_1",
    );

    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledOnce();
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.db.payment.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
    );
    expect(mocks.db.application.update).not.toHaveBeenCalledWith({ where: { id: "app_1" }, data: { status: ApplicationStatus.DRAFT } });
    expect(mocks.notifyUserOfSubmission).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "payment_verification_persist_failed",
      expect.any(Error),
      expect.objectContaining({ paymentId: "pay_1", applicationId: "app_1", referenceId: "ref_123" }),
    );
  });

  it("lets only one of two concurrent deliveries write history and notify", async () => {
    // The second delivery verifies too (Zarinpal answers "already verified") but
    // loses the conditional update: no history row, no SMS, still a success page.
    mocks.db.payment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const url = "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK";

    await expectRedirect(url, "/payment/return?status=success&paymentId=pay_1");
    await expectRedirect(url, "/payment/return?status=success&paymentId=pay_1");

    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledTimes(2);
    expect(mocks.db.statusHistory.create).toHaveBeenCalledOnce();
    expect(mocks.db.application.update).toHaveBeenCalledOnce();
    expect(mocks.notifyUserOfSubmission).toHaveBeenCalledOnce();
    expect(mocks.notifyAdminOfSubmission).toHaveBeenCalledOnce();
    expect(mocks.loggerInfo).toHaveBeenCalledWith("payment_verification_already_settled", expect.objectContaining({ paymentId: "pay_1" }));
  });

  it("does not verify a second capture when the application already has a verified payment", async () => {
    mocks.db.payment.findUnique.mockResolvedValue(
      payment({
        id: "pay_2",
        authority: "authority_2",
        application: {
          id: "app_1",
          mobile: "09123456789",
          status: ApplicationStatus.SUBMITTED,
          payments: [
            { id: "pay_1", status: PaymentStatus.VERIFIED },
            { id: "pay_2", status: PaymentStatus.INITIATED },
          ],
        },
      }),
    );

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_2&Authority=authority_2&Status=OK",
      "/payment/return?status=success&paymentId=pay_1",
    );

    expect(mocks.verifyZarinpalPayment).not.toHaveBeenCalled();
    expect(mocks.db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pay_2" }, data: expect.objectContaining({ status: PaymentStatus.FAILED, rawData: expect.objectContaining({ reason: "duplicate_payment_not_verified" }) }) }),
    );
    expect(mocks.db.application.update).not.toHaveBeenCalled();
    expect(mocks.notifyUserOfSubmission).not.toHaveBeenCalled();
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
