import { describe, expect, it } from "vitest";

import { getAllowedNextApplicationStatuses } from "@/lib/application/status-transitions";

describe("application status transitions", () => {
  it("allows review decisions from submitted applications", () => {
    expect(getAllowedNextApplicationStatuses("SUBMITTED")).toEqual([
      "UNDER_REVIEW",
      "NEEDS_EDIT",
      "ACCEPTED",
      "REJECTED",
    ]);
  });

  it("does not offer admin transitions for draft applications", () => {
    expect(getAllowedNextApplicationStatuses("DRAFT")).toEqual([]);
  });

  it("allows resubmitted needs-edit applications to return to review", () => {
    expect(getAllowedNextApplicationStatuses("NEEDS_EDIT")).toEqual(["UNDER_REVIEW"]);
  });
});
