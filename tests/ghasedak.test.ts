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

  it("sends OTP templates with param1 through Ghasedak verify endpoint", async () => {
    const fetchMock = mockSuccessfulFetch();

    await sendGhasedakSms({
      to: "09123456789",
      text: "fallback",
      template: "sanaotp",
      params: { code: "4321" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smsapp.ir/v2/send/verify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
          apikey: "test-api-key",
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).toBe("type=1&receptor=09123456789&template=sanaotp&param1=4321");
  });

  it("sends recipient params as param1 through Ghasedak verify endpoint", async () => {
    const fetchMock = mockSuccessfulFetch();

    await sendGhasedakSms({
      to: "09123456789",
      text: "status changed",
      template: "sanastatus",
      params: { recipient: "کاربر" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smsapp.ir/v2/send/verify",
      expect.any(Object),
    );
    expect(fetchMock.mock.calls[0][1].body).toBe(
      "type=1&receptor=09123456789&template=sanastatus&param1=%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1",
    );
  });

  it("treats unsuccessful Ghasedak JSON responses as failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: "error", message: "bad template" }),
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
