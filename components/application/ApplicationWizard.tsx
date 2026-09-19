"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { saveApplicationDraft } from "@/lib/actions/application";
import { showToast } from "@/components/ui/toast";
import { CreditReportStep } from "./CreditReportStep";
import { FinalPaymentStep } from "./FinalPaymentStep";
import { FinancialStatementsStep } from "./FinancialStatementsStep";
import { HumanResourcesStep } from "./HumanResourcesStep";
import { StepIndicator } from "./StepIndicator";
import { TaxDeclarationStep } from "./TaxDeclarationStep";
import { TrialBalanceStep } from "./TrialBalanceStep";
import { legacyReferences, setLegacyFile } from "@/lib/uploads/slots";
import type { ApplicationDraft, FileRef } from "./types";

const steps = [
  "اظهارنامه مالیاتی",
  "صورت‌های مالی حسابرسی شده",
  "مرحله ی منابع انسانی",
  "تراز کل و معین سال 1404",
  "گزارش اعتبارسنجی",
  "تایید نهایی و پرداخت",
];

type ApplicationWizardProps = {
  applicationId: string;
  initialStep: number;
  initialDraft: ApplicationDraft;
  initialGenerations?: Record<string, number>;
  readOnly?: boolean;
  canRetryPayment?: boolean;
  hasVerifiedPayment?: boolean;
  latestPaymentStatus?: string;
  paymentCoordinationState?: string;
};

export function ApplicationWizard({
  applicationId,
  initialStep,
  initialDraft,
  initialGenerations = {},
  readOnly,
  canRetryPayment = false,
  hasVerifiedPayment = false,
  latestPaymentStatus,
  paymentCoordinationState,
}: ApplicationWizardProps) {
  const boundedInitialStep = Math.min(steps.length, Math.max(1, initialStep));
  const [currentStep, setCurrentStep] = useState(boundedInitialStep);
  const [draft, setDraft] = useState<ApplicationDraft>(initialDraft);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [uploadingKeys, setUploadingKeys] = useState<Record<string, boolean>>({});
  const currentDraft = useRef(initialDraft);
  const version = useRef(initialDraft.draftVersion ?? 0);
  const generations = useRef(initialGenerations);
  const queue = useRef(Promise.resolve());
  const blocked = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  function replaceDraft(next: ApplicationDraft) { currentDraft.current = next; setDraft(next); }
  function requireRefresh() { blocked.current = true; setNeedsRefresh(true); }
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.current.then(() => {
      if (blocked.current) throw new Error("برای ادامه، صفحه را تازه‌سازی کنید.");
      return operation();
    });
    queue.current = result.then(() => undefined, () => undefined);
    return result;
  }
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const title = useMemo(() => steps[currentStep - 1] ?? steps[0], [currentStep]);

  function persistDraft(nextDraft = currentDraft.current, nextStep = currentStep) {
    if (readOnly || blocked.current) return;
    startTransition(async () => {
      try {
        await enqueue(async () => {
          // Preserve files committed while this non-file edit waited in the queue.
          let outgoing = { ...nextDraft, currentStep: nextStep, draftVersion: version.current };
          for (const [slot, file] of legacyReferences(currentDraft.current)) outgoing = setLegacyFile(outgoing, slot, file);
          const saved = await saveApplicationDraft(outgoing);
          if (!saved.ok) throw new Error(saved.error);
          version.current = saved.draftVersion;
          replaceDraft({ ...currentDraft.current, draftVersion: saved.draftVersion });
        });
        showToast({ type: "success", message: "پیش‌نویس ذخیره شد" });
      } catch (error) {
        requireRefresh();
        showToast({ type: "error", message: error instanceof Error ? error.message : "ذخیره پیش‌نویس ناموفق بود" });
      }
    });
  }

  function moveToStep(nextStep: number) {
    const boundedStep = Math.min(steps.length, Math.max(1, nextStep));
    setCurrentStep(boundedStep);
    replaceDraft({ ...currentDraft.current, currentStep: boundedStep });
    if (!readOnly) {
      persistDraft({ ...currentDraft.current, currentStep: boundedStep }, boundedStep);
    }
  }

  function updateDraft(nextDraft: ApplicationDraft) {
    if (readOnly) return;

    replaceDraft(nextDraft);
    persistDraft(nextDraft, nextDraft.currentStep);
  }

  async function uploadFile(fieldKey: string, file: File): Promise<FileRef | null> {
    if (readOnly) return null;

    if (blocked.current || uploadingKeys[fieldKey]) return null;
    setUploadingKeys(current => ({ ...current, [fieldKey]: true }));

    try {
      setUploadErrors((current) => ({ ...current, [fieldKey]: "" }));
      setUploadProgress((current) => ({ ...current, [fieldKey]: 0 }));

      const uploaded = await enqueue(async () => {
        const result = await uploadWithProgress(applicationId, fieldKey, file, generations.current[fieldKey] ?? 0, (progress) => {
          setUploadProgress(current => ({ ...current, [fieldKey]: progress }));
        });
        generations.current[fieldKey] = result.generation;
        version.current = result.draftVersion;
        replaceDraft({ ...setLegacyFile(currentDraft.current, fieldKey, result), draftVersion: result.draftVersion });
        return result;
      });

      showToast({ type: "success", message: "فایل با موفقیت بارگذاری شد" });
      return uploaded;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "بارگذاری فایل ناموفق بود";
      if (!(error instanceof UploadResponseError) || error.needsRefresh) requireRefresh();
      setUploadErrors((current) => ({ ...current, [fieldKey]: errorMessage }));
      showToast({ type: "error", message: errorMessage });
      return null;
    } finally {
      setUploadingKeys(current => ({ ...current, [fieldKey]: false }));
    }
  }

  const stepProps = {
    applicationId,
    draft,
    readOnly: readOnly || needsRefresh,
    uploadingKeys,
    uploadProgress,
    uploadErrors,
    onDraftChange: updateDraft,
    onUpload: uploadFile,
  };

  return (
    <div className="panel wizard">
      {needsRefresh ? <p role="alert">وضعیت ذخیره‌سازی نیاز به بررسی دارد. برای دریافت آخرین اطلاعات، صفحه را تازه‌سازی کنید.</p> : null}
      <div className="wizard__progress">
        <StepIndicator currentStep={currentStep} totalSteps={steps.length} title={title} />
      </div>

      <section className="wizard__body">
        <div className="wizard__step" key={currentStep}>
        <h2 className="text-xl font-bold text-stone-950">{title}</h2>
        <div className="mt-5">
          {currentStep === 1 ? <TaxDeclarationStep {...stepProps} /> : null}
          {currentStep === 2 ? <FinancialStatementsStep {...stepProps} /> : null}
          {currentStep === 3 ? <HumanResourcesStep {...stepProps} /> : null}
          {currentStep === 4 ? <TrialBalanceStep {...stepProps} /> : null}
          {currentStep === 5 ? <CreditReportStep {...stepProps} /> : null}
          {currentStep === 6 ? (
            <FinalPaymentStep
              draft={draft}
              acceptedTerms={acceptedTerms}
              readOnly={readOnly || needsRefresh}
              canRetryPayment={canRetryPayment}
              hasVerifiedPayment={hasVerifiedPayment}
              latestPaymentStatus={latestPaymentStatus}
              paymentCoordinationState={paymentCoordinationState}
              isSavingDraft={isPending || needsRefresh}
              isUploading={Object.values(uploadingKeys).some(Boolean)}
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
          disabled={isPending || readOnly || needsRefresh}
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

class UploadResponseError extends Error {
  constructor(message: string, readonly needsRefresh: boolean) { super(message); }
}

function uploadWithProgress(
  applicationId: string,
  fieldKey: string,
  file: File,
  generation: number,
  onProgress: (progress: number) => void,
): Promise<FileRef & { generation: number; draftVersion: number }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("fieldKey", fieldKey);
    formData.set("file", file);
    formData.set("generation", String(generation));

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      }
    };

    request.onload = () => {
      let data: { fileId?: string; name?: string; generation?: number; draftVersion?: number; outcome?: string; error?: string } = {};

      try {
        data = JSON.parse(request.responseText || "{}");
      } catch {
        reject(new Error("پاسخ بارگذاری معتبر نیست"));
        return;
      }

      if (request.status < 200 || request.status >= 300 || !data.fileId || !data.name || typeof data.generation !== "number" || typeof data.draftVersion !== "number") {
        reject(new UploadResponseError(data.error || "بارگذاری فایل ناموفق بود", data.outcome !== "unchanged"));
        return;
      }

      onProgress(100);
      resolve({ fileId: data.fileId, name: data.name, generation: data.generation, draftVersion: data.draftVersion });
    };

    request.onerror = () => reject(new Error("ارتباط هنگام بارگذاری قطع شد"));
    request.open("POST", "/api/uploads");
    request.send(formData);
  });
}
