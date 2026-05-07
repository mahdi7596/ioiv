import { ApplicationStatus } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { getApplicationAccess } from "@/lib/application/status";

describe("application access", () => {
  test("submitted and review statuses are viewable but not editable", () => {
    for (const status of [
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.VALIDATION_COMPLETED,
    ]) {
      expect(getApplicationAccess(status)).toEqual({
        canView: true,
        canEdit: false,
        canRetryPayment: false,
      });
    }
  });

  test("pending payment is viewable and retryable but not document-editable", () => {
    expect(getApplicationAccess(ApplicationStatus.PENDING_PAYMENT)).toEqual({
      canView: true,
      canEdit: false,
      canRetryPayment: true,
    });
  });

  test("draft and needs-edit statuses are viewable and editable", () => {
    expect(getApplicationAccess(ApplicationStatus.DRAFT)).toEqual({
      canView: true,
      canEdit: true,
      canRetryPayment: false,
    });
    expect(getApplicationAccess(ApplicationStatus.NEEDS_EDIT)).toEqual({
      canView: true,
      canEdit: true,
      canRetryPayment: false,
    });
  });
});
