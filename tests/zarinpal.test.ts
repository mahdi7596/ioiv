import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("zarinpal payment adapter", () => {
  const merchantId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env = {
      ...originalEnv,
      ZARINPAL_MERCHANT_ID: merchantId,
      ZARINPAL_SANDBOX: "true",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests payment through sandbox v4 endpoint with callback metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { authority: "A000000000000000000000000000000123456" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestZarinpalPayment } = await import("@/lib/payments/zarinpal");

    const result = await requestZarinpalPayment({
      amountToman: 3000000,
      description: "ثبت پرونده",
      callbackUrl: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
      mobile: "09123456789",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox.zarinpal.com/pg/v4/payment/request.json",
      expect.objectContaining({
        method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          merchant_id: merchantId,
          amount: 3000000,
          currency: "IRT",
          description: "ثبت پرونده",
          callback_url: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
          metadata: { mobile: "09123456789" },
        }),
      }),
    );
    expect(result).toEqual({
      authority: "A000000000000000000000000000000123456",
      paymentUrl: "https://sandbox.zarinpal.com/pg/StartPay/A000000000000000000000000000000123456",
    });
  });

  it("retries a transient fetch failure before returning the payment authority", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { authority: "A000000000000000000000000000000123456" } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { requestZarinpalPayment } = await import("@/lib/payments/zarinpal");

    await expect(
      requestZarinpalPayment({
        amountToman: 3000000,
        description: "ثبت پرونده",
        callbackUrl: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
        mobile: "09123456789",
      }),
    ).resolves.toEqual({
      authority: "A000000000000000000000000000000123456",
      paymentUrl: "https://sandbox.zarinpal.com/pg/StartPay/A000000000000000000000000000000123456",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("verifies production payments and returns the reference id", async () => {
    process.env.ZARINPAL_SANDBOX = "false";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ref_id: 123456789 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { verifyZarinpalPayment } = await import("@/lib/payments/zarinpal");

    await expect(
      verifyZarinpalPayment({
        amountToman: 3000000,
        authority: "A000000000000000000000000000000123456",
      }),
    ).resolves.toEqual({ referenceId: "123456789" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://payment.zarinpal.com/pg/v4/payment/verify.json",
      expect.objectContaining({
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: 3000000,
          currency: "IRT",
          authority: "A000000000000000000000000000000123456",
        }),
      }),
    );
  });

  it("requires a merchant id before calling Zarinpal", async () => {
    delete process.env.ZARINPAL_MERCHANT_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { requestZarinpalPayment } = await import("@/lib/payments/zarinpal");

    await expect(
      requestZarinpalPayment({
        amountToman: 3000000,
        description: "ثبت پرونده",
        callbackUrl: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
        mobile: "09123456789",
      }),
    ).rejects.toThrow("ZARINPAL_MERCHANT_ID is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the merchant id to be a UUID before calling Zarinpal", async () => {
    process.env.ZARINPAL_MERCHANT_ID = "replace-with-zarinpal-merchant-id";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { requestZarinpalPayment } = await import("@/lib/payments/zarinpal");

    await expect(
      requestZarinpalPayment({
        amountToman: 3000000,
        description: "ثبت پرونده",
        callbackUrl: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
        mobile: "09123456789",
      }),
    ).rejects.toThrow("ZARINPAL_MERCHANT_ID must be a valid UUID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows the Zarinpal sandbox merchant UUID", async () => {
    process.env.ZARINPAL_MERCHANT_ID = "00000000-0000-0000-0000-000000000000";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { authority: "A000000000000000000000000000000123456" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestZarinpalPayment } = await import("@/lib/payments/zarinpal");

    await requestZarinpalPayment({
      amountToman: 3000000,
      description: "ثبت پرونده",
      callbackUrl: "http://localhost:3000/api/payment/callback?paymentId=pay_1",
      mobile: "09123456789",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox.zarinpal.com/pg/v4/payment/request.json",
      expect.objectContaining({
        body: expect.stringContaining("00000000-0000-0000-0000-000000000000"),
      }),
    );
  });

  it("reports provider failures without leaking merchant credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        errors: {
          code: -9,
          message: "Validation error",
          merchant_id: merchantId,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestZarinpalPayment } = await import("@/lib/payments/zarinpal");

    await expect(
      requestZarinpalPayment({
        amountToman: 3000000,
        description: "ثبت پرونده",
        callbackUrl: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
        mobile: "09123456789",
      }),
    ).rejects.toThrow(/Zarinpal request failed/);

    await expect(
      requestZarinpalPayment({
        amountToman: 3000000,
        description: "ثبت پرونده",
        callbackUrl: "https://sana.ioiv.ir/api/payment/callback?paymentId=pay_1",
        mobile: "09123456789",
      }),
    ).rejects.not.toThrow(merchantId);
  });

  it("treats successful HTTP responses with an errors object as provider failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {},
        errors: {
          code: -51,
          message: "Session is not valid",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { verifyZarinpalPayment } = await import("@/lib/payments/zarinpal");

    await expect(
      verifyZarinpalPayment({
        amountToman: 3000000,
        authority: "authority_1",
      }),
    ).rejects.toThrow("Zarinpal request failed");
  });
});
