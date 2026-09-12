import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/facilities-review", () => ({
  startFacilitiesReview: vi.fn(), requestFacilitiesCorrection: vi.fn(), completeFacilitiesValidation: vi.fn(), retryFacilitiesCorrectionSms: vi.fn(),
}));

import { FacilitiesReviewActions } from "@/components/admin/FacilitiesReviewActions";

describe("facilities review action states", () => {
  it("shows only start review for a submitted application", () => {
    const markup = renderToStaticMarkup(<FacilitiesReviewActions applicationId="app_1" status="SUBMITTED" />);
    expect(markup).toContain("شروع بررسی");
    expect(markup).not.toContain("درخواست اصلاح");
  });

  it("shows correction and completion controls while under review", () => {
    const markup = renderToStaticMarkup(<FacilitiesReviewActions applicationId="app_1" status="UNDER_REVIEW" />);
    expect(markup).toContain("درخواست اصلاح");
    expect(markup).toContain("پایان فرآیند اعتبارسنجی");
    expect(markup).toContain("maxLength=\"2000\"");
  });

  it("shows SMS retry without reopening a correction", () => {
    const markup = renderToStaticMarkup(<FacilitiesReviewActions applicationId="app_1" status="NEEDS_EDIT" failedCorrectionId="correction_1" />);
    expect(markup).toContain("تلاش مجدد برای پیامک اصلاح");
  });
});
