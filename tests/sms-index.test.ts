import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSms } from "@/lib/sms";

const originalEnv = { ...process.env };

describe("sendSms", () => {
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("can send through the provider outside production when explicitly enabled", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      SMS_SEND_IN_DEVELOPMENT: "true",
      GHASEDAK_API_KEY: "test-api-key",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", messageids: 1234 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendSms({
      to: "09123456789",
      text: "fallback",
      template: "sanaotp",
      params: { code: "1234" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
