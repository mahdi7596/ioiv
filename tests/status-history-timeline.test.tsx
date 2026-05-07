import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusHistoryTimeline } from "@/components/admin/StatusHistoryTimeline";

describe("StatusHistoryTimeline", () => {
  it("groups status history rows by date on a single right-side rail", () => {
    const markup = renderToStaticMarkup(
      <StatusHistoryTimeline
        items={[
          {
            id: "history-1",
            previousStatus: "SUBMITTED",
            newStatus: "NEEDS_EDIT",
            note: "برای تست کردن",
            createdAt: new Date("2026-04-29T12:00:00.000Z"),
          },
          {
            id: "history-2",
            previousStatus: "SUBMITTED",
            newStatus: "VALIDATION_COMPLETED",
            note: null,
            createdAt: new Date("2026-04-29T09:00:00.000Z"),
          },
        ]}
      />,
    );

    expect(markup).toContain("status-history-timeline__rail");
    expect(markup).toContain("status-history-timeline__date-marker");
    expect(markup.match(/۱۴۰۵\/۲\/۹/g)).toHaveLength(1);
    expect(markup).toContain("status-history-timeline__connector");
  });
});
