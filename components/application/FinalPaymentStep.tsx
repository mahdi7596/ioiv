"use client";

import { useRef, useState, useTransition } from "react";
import { startPayment } from "@/lib/actions/payment";
import type { ApplicationDraft } from "./types";
import { finalSubmissionSchema } from "@/lib/validations/application";
import { showToast } from "@/components/ui/toast";

type FinalPaymentStepProps = {
  draft: ApplicationDraft;
  acceptedTerms: boolean;
  onAcceptedTermsChange: (accepted: boolean) => void;
};

export function FinalPaymentStep({
  draft,
  acceptedTerms,
  onAcceptedTermsChange,
}: FinalPaymentStepProps) {
  const termsRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const taxCount = draft.taxDeclarations.filter((row) => row.year && row.file).length;
  const financialCount = draft.financials.filter((row) => row.year && row.file).length;
  const validation = finalSubmissionSchema.safeParse({ ...draft, acceptedTerms });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
        <div className="rounded-md bg-stone-50 p-4">اظهارنامه‌های تکمیل‌شده: {taxCount}</div>
        <div className="rounded-md bg-stone-50 p-4">صورت‌های مالی بارگذاری‌شده: {financialCount}</div>
        <div className="rounded-md bg-stone-50 p-4">
          تراز کل و معین:{" "}
          {draft.trialBalance.generalLedger && draft.trialBalance.subsidiaryLedger ? "تکمیل" : "ناقص"}
        </div>
        <div className="rounded-md bg-stone-50 p-4">
          گزارش‌های اعتبارسنجی:{" "}
          {draft.creditReports.company && draft.creditReports.ceo && draft.creditReports.boardMember
            ? "تکمیل"
            : "ناقص"}
        </div>
      </div>

      <label
        className="flex gap-3 rounded-md border border-stone-200 p-4 text-sm leading-7 text-stone-800"
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

      <button
        type="button"
        onClick={() => {
          if (!validation.success) {
            const errorMessage = "برای پرداخت، همه مدارک الزامی و تایید پرداخت را تکمیل کنید.";
            setMessage(errorMessage);
            showToast({ type: "error", message: errorMessage });
            termsRef.current?.focus();
            return;
          }

          startTransition(async () => {
            try {
              showToast({ type: "info", message: "در حال انتقال به پرداخت" });
              const result = await startPayment();
              window.location.assign(result.redirectTo);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "شروع پرداخت ناموفق بود";
              setMessage(errorMessage);
              showToast({ type: "error", message: errorMessage });
            }
          });
        }}
        disabled={isPending}
        className="button button--primary"
      >
        {isPending ? "در حال انتقال..." : "پرداخت و ارسال نهایی"}
      </button>
      {!validation.success ? (
        <p className="text-sm text-red-700">برای پرداخت، همه مدارک الزامی و تایید پرداخت را تکمیل کنید.</p>
      ) : null}
      {message ? <p className="text-sm text-red-700">{message}</p> : null}
    </div>
  );
}
