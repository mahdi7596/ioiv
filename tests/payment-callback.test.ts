// File qualification is covered by document-qualification.db.test.ts with real bytes.
vi.mock("@/lib/uploads/qualification", () => ({ qualifyLegacyDocuments: vi.fn(async () => undefined) }));
import { installCoordinationMock } from "./payment-coordination-mock";
import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZarinpalRejectedError, ZarinpalUnavailableError } from "@/lib/payments/zarinpal-errors";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  verifyZarinpalPayment: vi.fn(),
  dispatched: false,
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
  dispatchSubmissionIntent: async (id: string, mobile: string) => { if (mocks.dispatched) return; mocks.dispatched = true; await Promise.all([mocks.notifyAdminOfSubmission(id), mocks.notifyUserOfSubmission(mobile, id)]); },
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
    mocks.dispatched = false;
    installCoordinationMock(mocks.db, "legacy", async () => {
      const p = await mocks.db.payment.findUnique();
      return { id: p.applicationId, ...p.application, payments: p.application.payments ?? [p] };
    });
    mocks.db.payment.findUnique.mockResolvedValue(payment());
    mocks.db.payment.update.mockResolvedValue({ id: "pay_1" });
    mocks.db.payment.updateMany.mockReset().mockResolvedValue({ count: 1 });
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
    expect(mocks.notifyAdminOfSubmission).toHaveBeenCalledOnce();
  });

  it("keeps a rejected authority uncertain without proving final nonpayment", async () => {
    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalRejectedError(-51, {}));
    await expectRedirect("https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK", "/payment/return?status=pending&paymentId=pay_1");
    expect(mocks.db.payment.update).not.toHaveBeenCalled();
  });

  it("keeps the attempt open and reports pending when the gateway gives no trustworthy answer", async () => {
    for (const error of [new ZarinpalUnavailableError("HTTP_5XX", 502), new TypeError("fetch failed"), Object.assign(new Error("aborted"), { name: "TimeoutError" })]) {
      vi.clearAllMocks();
    mocks.dispatched = false;
      mocks.db.payment.findUnique.mockResolvedValue(payment());
      mocks.verifyZarinpalPayment.mockRejectedValue(error);

      await expectRedirect(
        "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
        "/payment/return?status=pending&paymentId=pay_1",
      );

      expect(mocks.db.payment.update).not.toHaveBeenCalled();
      expect(mocks.db.application.update).not.toHaveBeenCalled();
      expect(mocks.db.$transaction).toHaveBeenCalled();
      expect(mocks.notifyUserOfSubmission).not.toHaveBeenCalled();

    }
  });

  it("never marks a gateway-confirmed payment failed when persisting it fails", async () => {
    mocks.db.payment.updateMany.mockRejectedValueOnce(new Error("connection reset"));

    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=OK",
      "/payment/return?status=pending&paymentId=pay_1",
    );

    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledOnce();
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(2);
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

    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledOnce();
    expect(mocks.db.statusHistory.create).toHaveBeenCalledOnce();
    expect(mocks.db.application.update).toHaveBeenCalledOnce();
    expect(mocks.notifyUserOfSubmission).toHaveBeenCalledOnce();
    expect(mocks.notifyAdminOfSubmission).toHaveBeenCalledOnce();

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
    expect(mocks.db.payment.update).not.toHaveBeenCalled();
    expect(mocks.db.application.update).not.toHaveBeenCalled();
    expect(mocks.notifyUserOfSubmission).not.toHaveBeenCalled();
  });

  it("checks cancelled callbacks server-side and keeps rejected nonpayment uncertain", async () => {
    mocks.verifyZarinpalPayment.mockRejectedValue(new ZarinpalRejectedError(-51, {}));
    await expectRedirect(
      "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=NOK",
      "/payment/return?status=pending&paymentId=pay_1",
    );
    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledOnce();
    expect(mocks.db.payment.update).not.toHaveBeenCalled();
    expect(mocks.db.application.update).not.toHaveBeenCalled();
  });

  it("accepts provider-confirmed capture despite browser cancellation", async () => {
    await expectRedirect("https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1&Authority=authority_1&Status=NOK", "/payment/return?status=success&paymentId=pay_1");
    expect(mocks.verifyZarinpalPayment).toHaveBeenCalledOnce();
    expect(mocks.db.statusHistory.create).toHaveBeenCalledOnce();
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
      "/payment/return?status=success&paymentId=pay_1",
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
      "/payment/return?status=pending&paymentId=old_pay",
    );

    expect(mocks.db.payment.update).not.toHaveBeenCalled();
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
      "/payment/return?status=success&paymentId=verified_pay",
    );

    expect(mocks.db.application.update).not.toHaveBeenCalled();
  });
});
