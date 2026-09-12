"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { showToast } from "@/components/ui/toast";
import { completeFacilitiesValidation, requestFacilitiesCorrection, retryFacilitiesCorrectionSms, startFacilitiesReview } from "@/lib/actions/facilities-review";

export function FacilitiesReviewActions({ applicationId, status, failedCorrectionId }: { applicationId: string; status: string; failedCorrectionId?: string }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(work: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        const result = await work() as { smsSent?: boolean } | undefined;
        showToast({ type: result?.smsSent === false ? "error" : "success", message: result?.smsSent === false ? "درخواست اصلاح ثبت شد، اما پیامک ارسال نشد؛ امکان تلاش مجدد وجود دارد." : success });
        setNote("");
        router.refresh();
      } catch (error) {
        showToast({ type: "error", message: error instanceof Error ? error.message : "عملیات ناموفق بود؛ دوباره تلاش کنید" });
      }
    });
  }

  return (
    <section className="panel profile-form" aria-labelledby="facilities-review-actions-heading">
      <h2 id="facilities-review-actions-heading">اقدام بررسی</h2>
      {status === "SUBMITTED" ? <button className="button button--primary" disabled={pending} onClick={() => run(() => startFacilitiesReview(applicationId), "بررسی پرونده آغاز شد")}>شروع بررسی</button> : null}
      {status === "UNDER_REVIEW" ? <>
        <label>یادداشت کارشناس<textarea value={note} maxLength={2000} rows={5} onChange={(event) => setNote(event.target.value)} placeholder="موارد لازم برای اصلاح را روشن و دقیق بنویسید" /></label>
        <div className="flex gap-3 flex-wrap">
          <button className="button button--primary" disabled={pending || !note.trim()} onClick={() => run(() => requestFacilitiesCorrection({ applicationId, note }), "درخواست اصلاح ثبت و پیامک ارسال شد")}>درخواست اصلاح</button>
          <button className="button button--ghost" disabled={pending} onClick={() => run(() => completeFacilitiesValidation({ applicationId, note }), "فرآیند اعتبارسنجی پایان یافت")}>پایان فرآیند اعتبارسنجی</button>
        </div>
      </> : null}
      {!(["SUBMITTED", "UNDER_REVIEW"].includes(status)) ? <p role="status">در وضعیت فعلی اقدام جدیدی برای این پرونده وجود ندارد.</p> : null}
      {failedCorrectionId ? <button className="button button--ghost" disabled={pending} onClick={() => run(() => retryFacilitiesCorrectionSms(failedCorrectionId), "پیامک اصلاح ارسال شد")}>تلاش مجدد برای پیامک اصلاح</button> : null}
    </section>
  );
}
