import { describe, expect, it } from "vitest";

import { getStatusHistoryDisplay } from "@/components/admin/statusHistoryDisplay";

describe("status history display", () => {
  it("uses Persian labels and existing status variants for transitions", () => {
    expect(
      getStatusHistoryDisplay({
        previousStatus: "SUBMITTED",
        newStatus: "NEEDS_EDIT",
        note: "برای تست کردن",
      }),
    ).toEqual({
      previous: {
        label: "در صف بررسی",
        variant: "info",
      },
      next: {
        label: "نیازمند اصلاح",
        variant: "attention",
      },
      note: "برای تست کردن",
    });
  });

  it("translates legacy English history notes", () => {
    expect(
      getStatusHistoryDisplay({
        previousStatus: "PENDING_PAYMENT",
        newStatus: "SUBMITTED",
        note: "Manual test payment marked verified.",
      }).note,
    ).toBe("پرداخت تستی به صورت دستی تایید شد.");
  });
});
