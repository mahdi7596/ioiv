import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusHistoryTimelineItem } from "@/components/admin/StatusHistoryTimelineItem";

describe("StatusHistoryTimelineItem", () => {
  it("renders a connected transition row with the message icon inline with the message", () => {
    const markup = renderToStaticMarkup(
      <StatusHistoryTimelineItem
        item={{
          id: "history-1",
          previousStatus: "SUBMITTED",
          newStatus: "NEEDS_EDIT",
          note: "برای تست کردن",
          createdAt: new Date("2026-04-29T12:00:00.000Z"),
        }}
      />,
    );

    expect(markup).toContain("status-history-timeline__connector");
    expect(markup).toContain("status-history-timeline__joiner");
    expect(markup).toContain("status-history-note__icon");
    expect(markup.indexOf("status-history-note__icon")).toBeLessThan(markup.indexOf("برای تست کردن"));
  });
});
