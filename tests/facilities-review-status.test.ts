import { describe, expect, it } from "vitest";

import { FACILITIES_REVIEW_VISIBLE_STATUSES, isFacilitiesApplicationEditable } from "@/lib/facilities/review-status";

describe("facilities M7 visibility and edit states", () => {
  it("exposes only submitted workflow states to reviewers", () => {
    expect(FACILITIES_REVIEW_VISIBLE_STATUSES).toEqual(["SUBMITTED", "UNDER_REVIEW", "NEEDS_EDIT", "VALIDATION_COMPLETED"]);
    expect(FACILITIES_REVIEW_VISIBLE_STATUSES).not.toContain("DRAFT");
    expect(FACILITIES_REVIEW_VISIBLE_STATUSES).not.toContain("PENDING_PAYMENT");
  });

  it("allows applicant mutations only in draft and correction", () => {
    expect(isFacilitiesApplicationEditable("DRAFT")).toBe(true);
    expect(isFacilitiesApplicationEditable("NEEDS_EDIT")).toBe(true);
    for (const status of ["PENDING_PAYMENT", "SUBMITTED", "UNDER_REVIEW", "VALIDATION_COMPLETED"]) {
      expect(isFacilitiesApplicationEditable(status)).toBe(false);
    }
  });
});
