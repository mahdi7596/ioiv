import { describe, expect, it } from "vitest";
import { getCompanyNationalIdInlineError } from "@/components/auth/RegistrationForm";

describe("registration form validation", () => {
  it("shows inline errors for short and long company national IDs", () => {
    expect(getCompanyNationalIdInlineError("123456789")).toBe(
      "شناسه ملی شرکت باید ۱۱ رقم باشد",
    );
    expect(getCompanyNationalIdInlineError("123456789012")).toBe(
      "شناسه ملی شرکت باید ۱۱ رقم باشد",
    );
  });

  it("allows empty and exactly 11 digit company national ID states", () => {
    expect(getCompanyNationalIdInlineError("")).toBeUndefined();
    expect(getCompanyNationalIdInlineError("۱۲۳۴۵۶۷۸۹۰")).toBe("شناسه ملی شرکت باید ۱۱ رقم باشد");
    expect(getCompanyNationalIdInlineError("12345678901")).toBeUndefined();
  });
});
