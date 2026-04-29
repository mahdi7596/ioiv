import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendGhasedakSms } from "@/lib/sms/ghasedak";

const originalEnv = { ...process.env };

function mockSuccessfulFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ IsSuccess: true, StatusCode: 200, Message: "ok" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Ghasedak SMS adapter", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, GHASEDAK_API_KEY: "test-api-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends OTP templates with param1 through Ghasedak template params endpoint", async () => {
    const fetchMock = mockSuccessfulFetch();

    await sendGhasedakSms({
      to: "09123456789",
      text: "fallback",
      template: "sanaotp",
      params: { code: "4321" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.ghasedak.me/rest/api/v1/WebService/SendOtpWithParams",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          ApiKey: "test-api-key",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      receptors: [{ mobile: "09123456789" }],
      templateName: "sanaotp",
      param1: "4321",
      isVoice: false,
      udh: false,
    });
  });

  it("sends no-param templates through Ghasedak OTP endpoint with empty inputs", async () => {
    const fetchMock = mockSuccessfulFetch();

    await sendGhasedakSms({
      to: "09123456789",
      text: "status changed",
      template: "sanastatus",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.ghasedak.me/rest/api/v1/WebService/SendOtpSMS",
      expect.any(Object),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      receptors: [{ mobile: "09123456789" }],
      templateName: "sanastatus",
      inputs: [],
      udh: false,
    });
  });

  it("treats unsuccessful Ghasedak JSON responses as failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ IsSuccess: false, StatusCode: 400, Message: "bad template" }),
      }),
    );

    await expect(
      sendGhasedakSms({
        to: "09123456789",
        text: "fallback",
        template: "sanastatus",
      }),
    ).rejects.toThrow("bad template");
  });
});
