import { ApplicationStatus } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { getApplicationAccess } from "@/lib/application/status";

describe("application access", () => {
  test("submitted and review statuses are viewable but not editable", () => {
    for (const status of [
      ApplicationStatus.PENDING_PAYMENT,
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.VALIDATION_COMPLETED,
    ]) {
      expect(getApplicationAccess(status)).toEqual({ canView: true, canEdit: false });
    }
  });

  test("draft and needs-edit statuses are viewable and editable", () => {
    expect(getApplicationAccess(ApplicationStatus.DRAFT)).toEqual({ canView: true, canEdit: true });
    expect(getApplicationAccess(ApplicationStatus.NEEDS_EDIT)).toEqual({
      canView: true,
      canEdit: true,
    });
  });
});
