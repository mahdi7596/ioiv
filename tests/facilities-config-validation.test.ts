import { describe, expect, it } from "vitest";
import { intakeSchema, intakeSupplierSchema, programmeConfigurationSchema, templateLabelSchema } from "@/lib/validations/facilities-config";

describe("M4 facilities configuration validation", () => {
  it("normalizes Persian figures and accepts the configured amount/payment values", () => {
    expect(intakeSchema.parse({ name: "  فراخوان پاییز  ", isEnabled: false, maximumAmountRial: "۵۰۰۰۰۰۰۰۰۰۰۰", paymentEnabled: true, paymentAmountToman: "۳۰۰۰۰۰۰" })).toMatchObject({ name: "فراخوان پاییز", maximumAmountRial: "500000000000", paymentAmountToman: "3000000" });
  });

  it("rejects unsafe monetary values and empty version labels", () => {
    expect(() => intakeSchema.parse({ name: "x", isEnabled: true, maximumAmountRial: "0", paymentEnabled: true, paymentAmountToman: "-1" })).toThrow();
    expect(() => templateLabelSchema.parse("   ")).toThrow();
  });

  it("requires explicit configuration types and allows a supplier to remain disabled without a template", () => {
    expect(programmeConfigurationSchema.safeParse({ isEnabled: "true" }).success).toBe(false);
    expect(intakeSupplierSchema.parse({ intakeId: "intake-1", supplierId: "supplier-1", isEnabled: false, questionnaireTemplateVersionId: null })).toMatchObject({ isEnabled: false });
  });
});
