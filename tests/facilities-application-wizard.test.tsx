import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/facilities-application", () => ({ createFacilitiesDraft: vi.fn(), ensureFacilitiesApplicationSlot: vi.fn(), saveFacilitiesDraftDetails: vi.fn(), updateFacilitiesApplicationDetails: vi.fn() }));
vi.mock("@/lib/actions/facilities-payment", () => ({ startFacilitiesPayment: vi.fn(), submitFacilitiesApplication: vi.fn() }));

import { FacilitiesApplicationWizard } from "@/components/facilities/FacilitiesApplicationWizard";
import { CreditReportStep } from "@/components/application/CreditReportStep";

function data(paymentEnabledSnapshot: boolean, status = "DRAFT") {
  return {
    intakes: [{ id: "intake", name: "فراخوان", maximumAmountRial: "500000000000", supplierConfigurations: [{ id: "supplier-config", supplier: { name: "شرکت ملی نفت ایران" }, questionnaireTemplateVersion: { id: "template", versionLabel: "v1" } }] }],
    applications: [{ id: "app", status, paymentEnabledSnapshot, payments: [], officers: [], evidence: [], correctionRequests: status === "NEEDS_EDIT" ? [{ id: "correction", note: "فایل مالی را اصلاح کنید", resolvedAt: null }] : [], history: [] }],
  };
}

describe("facilities application payment confirmation UI", () => {
  // The wizard is a four-step form; the checkout controls only render on the
  // final step, so these static renders start there via `initialStep`.
  it("keeps enabled-payment checkout disabled until the confirmation checkbox is selected", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true)} initialStep={4} />);
    expect(markup).toContain("type=\"checkbox\"");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>تأیید و ورود به پرداخت<\/button>/);
  });

  it("does not show a checkbox when payment is disabled", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(false)} initialStep={4} />);
    expect(markup).not.toContain("type=\"checkbox\"");
    expect(markup).toContain("ارسال نهایی درخواست");
  });

  it("shows an already-submitted state after returning from a successful payment", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true, "SUBMITTED")} notice="success" />);
    expect(markup).toContain("پرداخت تأیید شد");
    expect(markup).toContain("در صف بررسی");
  });

  it("shows the active correction note and resubmission action without another payment", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true, "NEEDS_EDIT")} initialStep={4} />);
    expect(markup).toContain("فایل مالی را اصلاح کنید");
    expect(markup).toContain("ارسال اصلاحات");
    expect(markup).toContain("هزینه دیگری ندارد");
    expect(markup).not.toContain("تأیید و ورود به پرداخت");
  });

  it("clamps an out-of-range initial step into the wizard", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true)} initialStep={99} />);
    expect(markup).toContain("مرحله 3 از 3");
  });

  it("shows the credit-report instructions with the facilities provider link", () => {
    const markup = renderToStaticMarkup(<FacilitiesApplicationWizard data={data(true)} initialStep={2} />);
    const normalizedText = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(normalizedText).toContain(
      "با مراجعه به سایت ics24.ir نسبت به تهیه گزارش اعتبارسنجی به تاریخ روز برای شرکت، مدیرعامل و یکی از اعضای هیات مدیره ترجیحا رئیس یا نایب رئیس هیات مدیره اقدام نمائید.",
    );
    expect(markup).toContain('href="https://ics24.ir/"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).not.toContain("mycredit.ir");
  });

  it("keeps the existing credit-report provider in the legacy workflow", () => {
    const markup = renderToStaticMarkup(
      <CreditReportStep
        applicationId="legacy-app"
        draft={{ currentStep: 5, taxDeclarations: [], financials: [], humanResources: {}, trialBalance: {}, creditReports: {} }}
        uploadProgress={{}}
        uploadErrors={{}}
        onDraftChange={vi.fn()}
        onUpload={vi.fn()}
      />,
    );
    expect(markup).toContain('href="https://www.mycredit.ir/"');
    expect(markup).not.toContain("ics24.ir");
  });
});
