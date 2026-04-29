"use client";

import { useMemo, useState, useTransition } from "react";
import { saveApplicationDraft } from "@/lib/actions/application";
import { showToast } from "@/components/ui/toast";
import { CreditReportStep } from "./CreditReportStep";
import { FinalPaymentStep } from "./FinalPaymentStep";
import { FinancialStatementsStep } from "./FinancialStatementsStep";
import { StepIndicator } from "./StepIndicator";
import { TaxDeclarationStep } from "./TaxDeclarationStep";
import { TrialBalanceStep } from "./TrialBalanceStep";
import type { ApplicationDraft, FileRef } from "./types";

const steps = [
  "اظهارنامه مالیاتی",
  "صورت‌های مالی حسابرسی شده",
  "تراز کل و معین",
  "گزارش اعتبارسنجی",
  "تایید نهایی و پرداخت",
];

type ApplicationWizardProps = {
  applicationId: string;
  initialStep: number;
  initialDraft: ApplicationDraft;
  readOnly?: boolean;
  hasVerifiedPayment?: boolean;
};

export function ApplicationWizard({
  applicationId,
  initialStep,
  initialDraft,
  readOnly,
  hasVerifiedPayment = false,
}: ApplicationWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [draft, setDraft] = useState<ApplicationDraft>(initialDraft);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const title = useMemo(() => steps[currentStep - 1] ?? steps[0], [currentStep]);

  function persistDraft(nextDraft = draft, nextStep = currentStep) {
    if (readOnly) return;

    startTransition(async () => {
      try {
        await saveApplicationDraft({ ...nextDraft, currentStep: nextStep });
        showToast({ type: "success", message: "پیش‌نویس ذخیره شد" });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "ذخیره پیش‌نویس ناموفق بود";
        showToast({ type: "error", message: errorMessage });
      }
    });
  }

  function moveToStep(nextStep: number) {
    const boundedStep = Math.min(steps.length, Math.max(1, nextStep));
    setCurrentStep(boundedStep);
    setDraft((current) => ({ ...current, currentStep: boundedStep }));
    if (!readOnly) {
      persistDraft({ ...draft, currentStep: boundedStep }, boundedStep);
    }
  }

  function updateDraft(nextDraft: ApplicationDraft) {
    if (readOnly) return;

    setDraft(nextDraft);
    persistDraft(nextDraft, nextDraft.currentStep);
  }

  async function uploadFile(fieldKey: string, file: File): Promise<FileRef | null> {
    if (readOnly) return null;

    setUploadingKey(fieldKey);

    try {
      setUploadErrors((current) => ({ ...current, [fieldKey]: "" }));
      setUploadProgress((current) => ({ ...current, [fieldKey]: 0 }));

      const uploaded = await uploadWithProgress(applicationId, fieldKey, file, (progress) => {
        setUploadProgress((current) => ({ ...current, [fieldKey]: progress }));
      });

      showToast({ type: "success", message: "فایل با موفقیت بارگذاری شد" });
      return uploaded;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "بارگذاری فایل ناموفق بود";
      setUploadErrors((current) => ({ ...current, [fieldKey]: errorMessage }));
      showToast({ type: "error", message: errorMessage });
      return null;
    } finally {
      setUploadingKey(undefined);
    }
  }

  const stepProps = {
    applicationId,
    draft,
    readOnly,
    uploadingKey,
    uploadProgress,
    uploadErrors,
    onDraftChange: updateDraft,
    onUpload: uploadFile,
  };

  return (
    <div className="panel wizard">
      <div className="wizard__progress">
        <StepIndicator currentStep={currentStep} totalSteps={steps.length} title={title} />
      </div>

      <section className="wizard__body">
        <div className="wizard__step" key={currentStep}>
        <h2 className="text-xl font-bold text-stone-950">{title}</h2>
        <div className="mt-5">
          {currentStep === 1 ? <TaxDeclarationStep {...stepProps} /> : null}
          {currentStep === 2 ? <FinancialStatementsStep {...stepProps} /> : null}
          {currentStep === 3 ? <TrialBalanceStep {...stepProps} /> : null}
          {currentStep === 4 ? <CreditReportStep {...stepProps} /> : null}
          {currentStep === 5 ? (
            <FinalPaymentStep
              draft={draft}
              acceptedTerms={acceptedTerms}
              readOnly={readOnly}
              hasVerifiedPayment={hasVerifiedPayment}
              onAcceptedTermsChange={setAcceptedTerms}
            />
          ) : null}
        </div>
        </div>
      </section>

      <div className="sticky-actions">
        <button
          type="button"
          onClick={() => moveToStep(currentStep - 1)}
          disabled={currentStep === 1 || isPending}
          className="button button--ghost"
        >
          مرحله قبل
        </button>
        <button
          type="button"
          onClick={() => persistDraft()}
          disabled={isPending || readOnly}
          className="button button--ghost"
        >
          ذخیره
        </button>
        <button
          type="button"
          onClick={() => moveToStep(currentStep + 1)}
          disabled={currentStep === steps.length || isPending}
          className="button button--primary"
        >
          مرحله بعد
        </button>
      </div>
    </div>
  );
}

function uploadWithProgress(
  applicationId: string,
  fieldKey: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<FileRef> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("fieldKey", fieldKey);
    formData.set("file", file);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      }
    };

    request.onload = () => {
      let data: { fileId?: string; name?: string; error?: string } = {};

      try {
        data = JSON.parse(request.responseText || "{}");
      } catch {
        reject(new Error("پاسخ بارگذاری معتبر نیست"));
        return;
      }

      if (request.status < 200 || request.status >= 300 || !data.fileId || !data.name) {
        reject(new Error(data.error || "بارگذاری فایل ناموفق بود"));
        return;
      }

      onProgress(100);
      resolve({ fileId: data.fileId, name: data.name });
    };

    request.onerror = () => reject(new Error("ارتباط هنگام بارگذاری قطع شد"));
    request.open("POST", "/api/uploads");
    request.send(formData);
  });
}
