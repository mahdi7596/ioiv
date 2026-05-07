import { describe, expect, it } from "vitest";

import { applicationStatusLabels } from "@/components/admin/StatusBadge";
import { paymentStatusLabels } from "@/components/admin/PaymentStatusBadge";

describe("status labels", () => {
  it("uses clear Persian labels for application statuses", () => {
    expect(applicationStatusLabels).toMatchObject({
      DRAFT: "پیش‌نویس",
      PENDING_PAYMENT: "در انتظار نتیجه پرداخت",
      SUBMITTED: "در صف بررسی",
      UNDER_REVIEW: "در حال بررسی",
      NEEDS_EDIT: "نیازمند اصلاح",
      VALIDATION_COMPLETED: "پایان فرآیند اعتبارسنجی",
    });
  });

  it("uses payment-specific Persian labels for payment statuses", () => {
    expect(paymentStatusLabels).toMatchObject({
      NONE: "پرداخت انجام نشده",
      INITIATED: "در انتظار نتیجه درگاه",
      VERIFIED: "پرداخت موفق",
      FAILED: "پرداخت ناموفق",
    });
  });
});
