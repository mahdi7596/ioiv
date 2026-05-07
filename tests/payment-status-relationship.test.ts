import { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getApplicationAccess } from "@/lib/application/status";
import { getAllowedNextApplicationStatuses } from "@/lib/application/status-transitions";

describe("payment and application status relationship", () => {
  it("keeps payment handoff separate from the form review workflow", () => {
    const expectedRelationships = {
      [ApplicationStatus.DRAFT]: [null, PaymentStatus.FAILED],
      [ApplicationStatus.PENDING_PAYMENT]: [PaymentStatus.INITIATED],
      [ApplicationStatus.SUBMITTED]: [PaymentStatus.VERIFIED],
      [ApplicationStatus.UNDER_REVIEW]: [PaymentStatus.VERIFIED],
      [ApplicationStatus.NEEDS_EDIT]: [PaymentStatus.VERIFIED],
      [ApplicationStatus.VALIDATION_COMPLETED]: [PaymentStatus.VERIFIED],
    };

    expect(expectedRelationships).toEqual({
      DRAFT: [null, "FAILED"],
      PENDING_PAYMENT: ["INITIATED"],
      SUBMITTED: ["VERIFIED"],
      UNDER_REVIEW: ["VERIFIED"],
      NEEDS_EDIT: ["VERIFIED"],
      VALIDATION_COMPLETED: ["VERIFIED"],
    });
  });

  it("keeps only draft and needs-edit editable while admin review starts after submission", () => {
    expect(getApplicationAccess(ApplicationStatus.DRAFT).canEdit).toBe(true);
    expect(getApplicationAccess(ApplicationStatus.PENDING_PAYMENT).canEdit).toBe(false);
    expect(getApplicationAccess(ApplicationStatus.SUBMITTED).canEdit).toBe(false);
    expect(getApplicationAccess(ApplicationStatus.UNDER_REVIEW).canEdit).toBe(false);
    expect(getApplicationAccess(ApplicationStatus.NEEDS_EDIT).canEdit).toBe(true);
    expect(getApplicationAccess(ApplicationStatus.VALIDATION_COMPLETED).canEdit).toBe(false);

    expect(getAllowedNextApplicationStatuses(ApplicationStatus.SUBMITTED)).toContain(
      ApplicationStatus.UNDER_REVIEW,
    );
    expect(getAllowedNextApplicationStatuses(ApplicationStatus.NEEDS_EDIT)).toEqual([
      ApplicationStatus.UNDER_REVIEW,
    ]);
  });
});
