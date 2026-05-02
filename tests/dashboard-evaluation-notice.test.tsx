import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardEvaluationNotice } from "@/components/dashboard/DashboardEvaluationNotice";

describe("DashboardEvaluationNotice", () => {
  it("renders the financial evaluation guidance in a collapsible details card", () => {
    const markup = renderToStaticMarkup(<DashboardEvaluationNotice />);

    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
    expect(markup).toContain("فرایند ارزیابی مالی و اعتباری تامین‌کنندگان");
    expect(markup).toContain("متقاضیان عضویت در تامین‌کنندگان لیست بلند نفت");
    expect(markup).toContain("02186122370");
  });
});
