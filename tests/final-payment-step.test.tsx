import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FinalPaymentStep } from "@/components/application/FinalPaymentStep";
import type { ApplicationDraft } from "@/components/application/types";

vi.mock("@/lib/actions/payment", () => ({
  startPayment: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  showToast: vi.fn(),
}));

const file = { fileId: "file_1", name: "doc.pdf" };

const completeDraft: ApplicationDraft = {
  currentStep: 6,
  taxDeclarations: [{ year: "1402", file }],
  financials: [{ year: "1402", file }],
  humanResources: { employeeCount: 10, insuranceList: file },
  trialBalance: { generalLedger: file, subsidiaryLedger: file },
  creditReports: { company: file, ceo: file, boardMember: file },
};

function renderFinalPaymentStep(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <FinalPaymentStep
      draft={completeDraft}
      acceptedTerms
      onAcceptedTermsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("FinalPaymentStep", () => {
  it("disables payment while a draft save is in progress", () => {
    const markup = renderFinalPaymentStep({ isSavingDraft: true });

    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("در حال ذخیره اطلاعات");
  });

  it("disables payment while an upload is in progress", () => {
    const markup = renderFinalPaymentStep({ isUploading: true });

    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("در حال بارگذاری فایل");
  });
});
