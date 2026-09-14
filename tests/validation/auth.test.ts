import { describe, expect, it } from "vitest";
import { mobileSchema, otpSchema, verifyOtpSchema } from "@/lib/validations/auth";

describe("auth validation", () => {
  it("accepts Iranian mobile numbers", () => {
    expect(mobileSchema.safeParse("09123456789").success).toBe(true);
  });

  it("accepts Persian and Arabic digits for mobile numbers", () => {
    expect(mobileSchema.safeParse("۰۹۱۲۳۴۵۶۷۸۹").data).toBe("09123456789");
    expect(mobileSchema.safeParse("٠٩١٢٣٤٥٦٧٨٩").data).toBe("09123456789");
    expect(mobileSchema.safeParse("۰۹۳۹۰۶۴۹۶۱۴").data).toBe("09390649614");
    expect(mobileSchema.safeParse("۰۹۱۲ ۳۴۵ ۶۷۸۹").data).toBe("09123456789");
  });

  it("rejects invalid mobile numbers", () => {
    expect(mobileSchema.safeParse("08123456789").success).toBe(false);
  });

  it("requires a six digit OTP", () => {
    expect(otpSchema.safeParse("123456").success).toBe(true);
    expect(otpSchema.safeParse("۱۲۳۴۵۶").data).toBe("123456");
    expect(otpSchema.safeParse("١٢٣٤٥٦").data).toBe("123456");
    expect(otpSchema.safeParse("1234").success).toBe(false);
    expect(otpSchema.safeParse("1234567").success).toBe(false);
  });

  it("only requires mobile, code, and mode to verify an OTP", () => {
    expect(
      verifyOtpSchema.safeParse({
        mobile: "09123456789",
        code: "123456",
        mode: "user",
      }).success,
    ).toBe(true);
  });
});
