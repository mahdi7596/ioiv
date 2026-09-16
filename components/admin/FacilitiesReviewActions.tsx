"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ClipboardCheck } from "lucide-react";

import { showToast } from "@/components/ui/toast";
import { completeFacilitiesValidation, requestFacilitiesCorrection, retryFacilitiesCorrectionSms, startFacilitiesReview } from "@/lib/actions/facilities-review";

const NOTE_LIMIT = 2000;

export function FacilitiesReviewActions({ applicationId, status, failedCorrectionId }: { applicationId: string; status: string; failedCorrectionId?: string }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [showJump, setShowJump] = useState(false);
  const router = useRouter();
  const sectionRef = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const underReview = status === "UNDER_REVIEW";
  const actionable = status === "SUBMITTED" || underReview || Boolean(failedCorrectionId);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !actionable || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowJump(!entry.isIntersecting), { rootMargin: "0px 0px -96px 0px", threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [actionable]);

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

  function jumpToActions() {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (noteRef.current) window.setTimeout(() => noteRef.current?.focus(), 420);
  }

  return (
    <>
      <section ref={sectionRef} id="review-action" className="panel profile-form review-panel" aria-labelledby="facilities-review-actions-heading">
        <h2 id="facilities-review-actions-heading"><ClipboardCheck aria-hidden="true" size={19} />اقدام بررسی</h2>
        {status === "SUBMITTED" ? (
          <>
            <p className="review-panel__hint">پرونده در صف بررسی است. با شروع بررسی، وضعیت به «در حال بررسی» تغییر می‌کند.</p>
            <div className="review-actions__row">
              <button className="button button--primary" disabled={pending} onClick={() => run(() => startFacilitiesReview(applicationId), "بررسی پرونده آغاز شد")}>شروع بررسی</button>
            </div>
          </>
        ) : null}
        {underReview ? (
          <>
            <label className="review-note">
              <span>یادداشت کارشناس</span>
              <textarea ref={noteRef} className="review-note__input" value={note} maxLength={NOTE_LIMIT} rows={8} onChange={(event) => setNote(event.target.value)} placeholder="موارد لازم برای اصلاح را روشن و دقیق بنویسید" />
            </label>
            <div className="review-note__footer">
              <span>این یادداشت برای متقاضی پیامک می‌شود؛ واضح و مؤدبانه بنویسید.</span>
              <span className="review-note__counter" aria-live="polite">{note.length.toLocaleString("fa-IR")} / {NOTE_LIMIT.toLocaleString("fa-IR")}</span>
            </div>
            <div className="review-actions__row">
              <button className="button button--primary" disabled={pending || !note.trim()} onClick={() => run(() => requestFacilitiesCorrection({ applicationId, note }), "درخواست اصلاح ثبت و پیامک ارسال شد")}>درخواست اصلاح</button>
              <button className="button button--ghost" disabled={pending} onClick={() => run(() => completeFacilitiesValidation({ applicationId, note }), "فرآیند اعتبارسنجی پایان یافت")}>پایان فرآیند اعتبارسنجی</button>
            </div>
          </>
        ) : null}
        {!(["SUBMITTED", "UNDER_REVIEW"].includes(status)) ? <p role="status">در وضعیت فعلی اقدام جدیدی برای این پرونده وجود ندارد.</p> : null}
        {failedCorrectionId ? (
          <div className="review-actions__row">
            <button className="button button--ghost" disabled={pending} onClick={() => run(() => retryFacilitiesCorrectionSms(failedCorrectionId), "پیامک اصلاح ارسال شد")}>تلاش مجدد برای پیامک اصلاح</button>
          </div>
        ) : null}
      </section>
      {actionable && showJump ? (
        <button type="button" className="review-fab" onClick={jumpToActions}>
          <ClipboardCheck aria-hidden="true" size={18} />
          <span>اقدام بررسی</span>
          <ArrowDown aria-hidden="true" size={16} />
        </button>
      ) : null}
    </>
  );
}
