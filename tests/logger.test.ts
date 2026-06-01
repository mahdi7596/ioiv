import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { logger, maskMobile } from "@/lib/logger";

describe("logger", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = originalEnv;
  });

  test("emits structured production info logs", () => {
    process.env.NODE_ENV = "production";

    logger.info("otp_requested", {
      mobile: maskMobile("09123456789"),
      nested: { unsafe: undefined },
    });

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      JSON.stringify({
        level: "info",
        event: "otp_requested",
        mobile: "091****6789",
        nested: {},
      }),
    );
  });

  test("keeps error message and stack with metadata", () => {
    const error = new Error("provider failed");
    error.stack = "stack trace";

    logger.error("sms_failed", error, { provider: "ghasedak" });

    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        event: "sms_failed",
        provider: "ghasedak",
        error: {
          name: "Error",
          message: "provider failed",
          stack: "stack trace",
        },
      }),
    );
  });

  test("includes nested error causes for network failures", () => {
    const error = new Error("fetch failed", {
      cause: new Error("connect ETIMEDOUT"),
    });
    error.stack = "stack trace";

    logger.error("payment_start_failed", error);

    const payload = JSON.parse(vi.mocked(console.error).mock.calls[0][0] as string);

    expect(payload).toMatchObject({
      level: "error",
      event: "payment_start_failed",
      error: {
        name: "Error",
        message: "fetch failed",
        stack: "stack trace",
        cause: {
          name: "Error",
          message: "connect ETIMEDOUT",
        },
      },
    });
    expect(payload.error.cause.stack).toEqual(expect.any(String));
  });
});
