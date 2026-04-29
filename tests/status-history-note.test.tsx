import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusHistoryNote } from "@/components/admin/StatusHistoryNote";

describe("StatusHistoryNote", () => {
  it("renders the admin message with an icon", () => {
    const markup = renderToStaticMarkup(<StatusHistoryNote note="برای تست کردن" />);

    expect(markup).toContain("برای تست کردن");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("status-history-note__icon");
  });
});
