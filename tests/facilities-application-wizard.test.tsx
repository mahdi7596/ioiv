import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/facilities-application", () => ({ createFacilitiesDraft: vi.fn(), ensureFacilitiesApplicationSlot: vi.fn(), saveFacilitiesDraftDetails: vi.fn(), updateFacilitiesApplicationDetails: vi.fn() }));
vi.mock("@/lib/actions/facilities-payment", () => ({ startFacilitiesPayment: vi.fn(), submitFacilitiesApplication: vi.fn() }));

import { FacilitiesApplicationWizard } from "@/components/facilities/FacilitiesApplicationWizard";

function data(paymentEnabledSnapshot: boolean, status = "DRAFT") {
  return {
    intakes: [{ id: "intake", name: "فراخوان", maximumAmountRial: "500000000000", supplierConfigurations: [{ id: "supplier-config", supplier: { name: "شرکت ملی نفت ایران" }, questionnaireTemplateVersion: { id: "template", versionLabel: "v1" } }] }],
    applications: [{ id: "app", status, paymentEnabledSnapshot, payments: [], officers: [], evidence: [], correctionRequests: status === "NEEDS_EDIT" ? [{ id: "correction", note: "فایل مالی را اصلاح کنید", resolvedAt: null }] : [], history: [] }],
  };
}

describe("facilities application payment confirmation UI", () => {
  it("keeps enabled-payment checkout disabled until the confirmation checkbox is selected", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true)} />);
    expect(markup).toContain("type=\"checkbox\"");
    expect(markup).toContain("تأیید و ورود به پرداخت");
    expect(markup).toContain("disabled=\"\"");
  });

  it("does not show a checkbox when payment is disabled", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(false)} />);
    expect(markup).not.toContain("type=\"checkbox\"");
    expect(markup).toContain("ارسال نهایی درخواست");
  });

  it("shows an already-submitted state after returning from a successful payment", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true, "SUBMITTED")} notice="success" />);
    expect(markup).toContain("پرداخت با موفقیت تأیید شد");
    expect(markup).toContain("در صف بررسی");
  });

  it("shows the active correction note and resubmission action without another payment", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true, "NEEDS_EDIT")} />);
    expect(markup).toContain("فایل مالی را اصلاح کنید");
    expect(markup).toContain("ارسال اصلاحات");
    expect(markup).toContain("هزینه دیگری ندارد");
    expect(markup).not.toContain("تأیید و ورود به پرداخت");
  });
});
