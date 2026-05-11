"use client";

import { useRef, useState, useTransition } from "react";
import { startPayment } from "@/lib/actions/payment";
import type { ApplicationDraft } from "./types";
import { finalSubmissionSchema } from "@/lib/validations/application";
import { showToast } from "@/components/ui/toast";

type FinalPaymentStepProps = {
  draft: ApplicationDraft;
  acceptedTerms: boolean;
  readOnly?: boolean;
  canRetryPayment?: boolean;
  hasVerifiedPayment?: boolean;
  latestPaymentStatus?: string;
  isSavingDraft?: boolean;
  isUploading?: boolean;
  onAcceptedTermsChange: (accepted: boolean) => void;
};

export function FinalPaymentStep({
  draft,
  acceptedTerms,
  readOnly,
  canRetryPayment = false,
  hasVerifiedPayment = false,
  latestPaymentStatus,
  isSavingDraft = false,
  isUploading = false,
  onAcceptedTermsChange,
}: FinalPaymentStepProps) {
  const termsRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const canRetryIncompletePayment =
    canRetryPayment && latestPaymentStatus === "INITIATED" && !hasVerifiedPayment;
  const allowPaymentAction = !readOnly || canRetryIncompletePayment;
  const requiresPaymentConfirmation = !hasVerifiedPayment && !canRetryIncompletePayment;
  const effectiveAcceptedTerms =
    hasVerifiedPayment || canRetryIncompletePayment || acceptedTerms;
  const checklist = createFinalReviewChecklist(
    draft,
    effectiveAcceptedTerms,
    requiresPaymentConfirmation,
  );
  const errorItems = checklist.filter((item) => item.messages.length > 0);
  const hasChecklistErrors = errorItems.length > 0;
  const validation = finalSubmissionSchema.safeParse({
    ...draft,
    acceptedTerms: effectiveAcceptedTerms,
  });
  const blockingWorkMessage = isUploading
    ? "در حال بارگذاری فایل، لطفاً چند لحظه صبر کنید."
    : isSavingDraft
      ? "در حال ذخیره اطلاعات، لطفاً چند لحظه صبر کنید."
      : undefined;
  const hasBlockingWork = Boolean(blockingWorkMessage);
  const isPaymentReady = validation.success && !hasChecklistErrors && effectiveAcceptedTerms;
  const canStartPayment =
    validation.success &&
    !hasChecklistErrors &&
    effectiveAcceptedTerms &&
    !isPending &&
    !hasBlockingWork &&
    allowPaymentAction;

  return (
    <div className="space-y-5">
      <div className="final-review" aria-live="polite">
        {readOnly && !canRetryIncompletePayment ? (
          <div className="final-review__notice final-review__notice--info" data-variant="info" role="status">
            پرونده ثبت نهایی شده است. تا زمانی که مدیر وضعیت را به نیازمند اصلاح تغییر ندهد، امکان
            تغییر اطلاعات یا پرداخت دوباره وجود ندارد.
          </div>
        ) : canRetryIncompletePayment ? (
          <div className="final-review__notice final-review__notice--info" data-variant="info" role="status">
            پرونده در انتظار نتیجه درگاه است. اگر پرداخت را کامل نکرده‌اید یا از درگاه خارج
            شده‌اید، می‌توانید دوباره به درگاه پرداخت بروید.
          </div>
        ) : hasVerifiedPayment && !errorItems.length ? (
          <div className="final-review__notice final-review__notice--success" role="status">
            <strong>
              پس از اعمال تغییرات برای اینکه پرونده دوباره به کارشناس برگردد،بر روی دکمه
              «ارسال اصلاحات» را کلیک کنید.
            </strong>{" "}
            پرداخت قبلی با موفقیت ثبت شده و پرداخت مجدد لازم نیست.
          </div>
        ) : errorItems.length ? (
          errorItems.map((item) => (
            <section className="final-review__item" data-state="error" key={item.label}>
              <div className="final-review__header">
                <h3>{item.label}</h3>
                <span className="final-review__badge">نیازمند تکمیل</span>
              </div>
              <ul className="final-review__messages">
                {item.messages.map((itemMessage) => (
                  <li key={itemMessage}>{itemMessage}</li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <div className="final-review__notice final-review__notice--success" role="status">
            {hasVerifiedPayment
              ? "همه موارد تکمیل است و پرونده آماده ارسال اصلاحات است."
              : "همه موارد تکمیل است و پرداخت آماده شروع است."}
          </div>
        )}
      </div>

      {readOnly || hasVerifiedPayment || canRetryIncompletePayment ? null : (
        <label
          className="payment-acknowledgement"
          data-invalid={!acceptedTerms ? "true" : undefined}
        >
          <input
            ref={termsRef}
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => onAcceptedTermsChange(event.target.checked)}
            className="mt-2 h-4 w-4"
          />
          پرداخت مبلغ ۳,۰۰۰,۰۰۰ تومان غیرقابل استرداد است و با آگاهی از این موضوع ادامه می‌دهم.
        </label>
      )}

      {(readOnly && !canRetryIncompletePayment) || hasVerifiedPayment ? null : blockingWorkMessage ? (
        <div className="final-review__notice" role="status">
          {blockingWorkMessage}
        </div>
      ) : !isPaymentReady ? (
        <div className="final-review__notice" role="status">
          برای فعال شدن پرداخت، موارد قرمز بالا را تکمیل کنید و تایید پرداخت غیرقابل استرداد را بزنید.
        </div>
      ) : (
        <div className="final-review__notice final-review__notice--success" role="status">
          {canRetryIncompletePayment
            ? "پرداخت آماده تلاش دوباره است."
            : "همه موارد تکمیل است و پرداخت آماده شروع است."}
        </div>
      )}

      {!allowPaymentAction ? null : (
        <button
          type="button"
          onClick={() => {
            if (!validation.success) {
              const errorMessage = hasVerifiedPayment
                ? "برای ارسال اصلاحات، همه مدارک الزامی را تکمیل کنید."
                : "برای پرداخت، همه مدارک الزامی و تایید پرداخت را تکمیل کنید.";
              setMessage(errorMessage);
              showToast({ type: "error", message: errorMessage });
              termsRef.current?.focus();
              return;
            }

            startTransition(async () => {
              try {
                showToast({
                  type: "info",
                  message: hasVerifiedPayment ? "در حال ارسال اصلاحات" : "در حال انتقال به پرداخت",
                });
                const result = await startPayment(draft);
                if (!result.ok) {
                  setMessage(result.message);
                  showToast({ type: "error", message: result.message });
                  return;
                }
                window.location.assign(result.redirectTo);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "شروع پرداخت ناموفق بود";
                setMessage(errorMessage);
                showToast({ type: "error", message: errorMessage });
              }
            });
          }}
          disabled={!canStartPayment}
          className="button button--primary"
        >
          {isPending
            ? "در حال ارسال..."
            : canRetryIncompletePayment
              ? "تلاش دوباره برای پرداخت"
              : hasVerifiedPayment
              ? "ارسال اصلاحات"
              : "پرداخت و ارسال نهایی"}
        </button>
      )}
      {message ? <p className="final-review__form-error">{message}</p> : null}
    </div>
  );
}

type FinalReviewItem = {
  label: string;
  messages: string[];
};

function createFinalReviewChecklist(
  draft: ApplicationDraft,
  acceptedTerms: boolean,
  includePaymentConfirmation: boolean,
): FinalReviewItem[] {
  const taxMessages = getYearFileMessages(draft.taxDeclarations, true);
  const financialMessages = getYearFileMessages(draft.financials, true, {
    minimumMessage: "حداقل یک صورت مالی حسابرسی شده کامل شامل سال و فایل الزامی است.",
  });
  const humanResourcesMessages = [
    draft.humanResources.employeeCount && draft.humanResources.employeeCount > 0
      ? ""
      : "تعداد نیروی انسانی را با عدد بیشتر از صفر وارد کنید.",
    draft.humanResources.insuranceList ? "" : "لیست بیمه را بارگذاری کنید.",
  ].filter(Boolean);
  const trialBalanceMessages = [
    draft.trialBalance.generalLedger ? "" : "تراز کل را بارگذاری کنید.",
    draft.trialBalance.subsidiaryLedger ? "" : "تراز معین را بارگذاری کنید.",
  ].filter(Boolean);
  const creditReportMessages = [
    draft.creditReports.company ? "" : "گزارش اعتبارسنجی شرکت را بارگذاری کنید.",
    draft.creditReports.ceo ? "" : "گزارش اعتبارسنجی مدیرعامل را بارگذاری کنید.",
    draft.creditReports.boardMember ? "" : "گزارش اعتبارسنجی یکی از اعضای هیات مدیره را بارگذاری کنید.",
  ].filter(Boolean);

  const items: FinalReviewItem[] = [
    {
      label: "اظهارنامه‌های مالیاتی",
      messages: taxMessages,
    },
    {
      label: "صورت‌های مالی حسابرسی شده",
      messages: financialMessages,
    },
    {
      label: "مرحله ی منابع انسانی",
      messages: humanResourcesMessages,
    },
    {
      label: "تراز کل و معین",
      messages: trialBalanceMessages,
    },
    {
      label: "گزارش‌های اعتبارسنجی",
      messages: creditReportMessages,
    },
  ];

  if (includePaymentConfirmation) {
    items.push({
      label: "تایید پرداخت",
      messages: acceptedTerms
        ? []
        : ["گزینه آگاهی از غیرقابل استرداد بودن پرداخت را تایید کنید."],
    });
  }

  return items;
}

function getYearFileMessages(
  rows: ApplicationDraft["taxDeclarations"],
  requiredMinimum: boolean,
  options?: { minimumMessage?: string },
) {
  const messages: string[] = [];
  let completeRows = 0;

  rows.forEach((row, index) => {
    if (row.year && row.file) {
      completeRows += 1;
      return;
    }

    if (row.file && !row.year) {
      messages.push(`ردیف ${index + 1}: فایل بارگذاری شده اما سال انتخاب نشده است.`);
    }

    if (row.year && !row.file) {
      messages.push(`ردیف ${index + 1}: سال انتخاب شده اما فایل بارگذاری نشده است.`);
    }
  });

  if (requiredMinimum && completeRows < 1) {
    messages.push(
      options?.minimumMessage || "حداقل یک اظهارنامه مالیاتی کامل شامل سال و فایل الزامی است.",
    );
  }

  return messages;
}
