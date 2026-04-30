import { describe, expect, it } from "vitest";
import {
  companyNationalIdSchema,
  mobileSchema,
  otpSchema,
} from "@/lib/validations/auth";

describe("auth validation", () => {
  it("accepts Iranian mobile numbers", () => {
    expect(mobileSchema.safeParse("09123456789").success).toBe(true);
  });

  it("accepts Persian and Arabic digits for mobile numbers", () => {
    expect(mobileSchema.safeParse("۰۹۱۲۳۴۵۶۷۸۹").data).toBe("09123456789");
    expect(mobileSchema.safeParse("٠٩١٢٣٤٥٦٧٨٩").data).toBe("09123456789");
  });

  it("rejects invalid mobile numbers", () => {
    expect(mobileSchema.safeParse("08123456789").success).toBe(false);
  });

  it("requires a four digit OTP", () => {
    expect(otpSchema.safeParse("1234").success).toBe(true);
    expect(otpSchema.safeParse("۱۲۳۴").data).toBe("1234");
    expect(otpSchema.safeParse("١٢٣٤").data).toBe("1234");
    expect(otpSchema.safeParse("12345").success).toBe(false);
  });

  it("requires company national ID digits", () => {
    expect(companyNationalIdSchema.safeParse("12345678901").success).toBe(true);
    expect(companyNationalIdSchema.safeParse("۱۲۳۴۵۶۷۸۹۰۱").data).toBe("12345678901");
    expect(companyNationalIdSchema.safeParse("abc").success).toBe(false);
  });
});
