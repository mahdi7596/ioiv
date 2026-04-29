import { describe, expect, it } from "vitest";

import { validateStatusChangeConfirmation } from "@/lib/application/status-change-validation";

describe("status change confirmation validation", () => {
  it("requires the submitted company national ID before rejecting", () => {
    const result = validateStatusChangeConfirmation({
      nextStatus: "REJECTED",
      companyNationalId: "14001234567",
      rejectionCompanyNationalId: "",
    });

    expect(result).toEqual({
      valid: false,
      message: "برای رد پرونده باید شناسه ملی ثبت شده پرونده را وارد کنید.",
    });
  });

  it("rejects mismatched company national IDs before rejecting", () => {
    const result = validateStatusChangeConfirmation({
      nextStatus: "REJECTED",
      companyNationalId: "14001234567",
      rejectionCompanyNationalId: "14009999999",
    });

    expect(result).toEqual({
      valid: false,
      message: "شناسه ملی وارد شده با شناسه ملی پرونده مطابقت ندارد.",
    });
  });

  it("accepts the matching company national ID before rejecting", () => {
    const result = validateStatusChangeConfirmation({
      nextStatus: "REJECTED",
      companyNationalId: "14001234567",
      rejectionCompanyNationalId: " 14001234567 ",
    });

    expect(result).toEqual({ valid: true });
  });

  it("does not require a company national ID for non-rejection statuses", () => {
    const result = validateStatusChangeConfirmation({
      nextStatus: "ACCEPTED",
      companyNationalId: "14001234567",
      rejectionCompanyNationalId: "",
    });

    expect(result).toEqual({ valid: true });
  });
});
