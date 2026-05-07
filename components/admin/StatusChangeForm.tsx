"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui/toast";
import { getAllowedNextApplicationStatuses } from "@/lib/application/status-transitions";
import { changeSubmissionStatus } from "@/lib/actions/admin";
import { applicationStatusLabels } from "./StatusBadge";

const noTransitionMessages: Record<string, string> = {
  DRAFT: "این پرونده هنوز برای بررسی مدیریتی ارسال نشده است. پس از تکمیل ارسال و پرداخت، امکان تغییر وضعیت فعال می‌شود.",
  PENDING_PAYMENT: "این پرونده در انتظار پرداخت است. پس از تایید پرداخت، امکان تغییر وضعیت مدیریتی فعال می‌شود.",
  VALIDATION_COMPLETED: "فرآیند اعتبارسنجی این پرونده به پایان رسیده و وضعیت دیگری برای آن قابل انتخاب نیست.",
};

export function StatusChangeForm({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: string;
}) {
  const options = getAllowedNextApplicationStatuses(currentStatus);
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData>();
  const [selectedStatus, setSelectedStatus] = useState<string>(options[0] || "");
  const [isPending, startTransition] = useTransition();
  const noTransitionMessage =
    noTransitionMessages[currentStatus] || "در وضعیت فعلی امکان تغییر وضعیت وجود ندارد.";
  const selectedStatusLabel = applicationStatusLabels[selectedStatus] || selectedStatus;
  const isFinalDecision = selectedStatus === "VALIDATION_COMPLETED";
  const certificate = pendingFormData?.get("certificate");
  const canConfirm = !isFinalDecision || (certificate instanceof File && certificate.size > 0);

  if (options.length === 0) {
    return (
      <section className="panel status-change-panel status-change-panel--empty space-y-3" aria-label="تغییر وضعیت پرونده">
        <h2 className="text-xl font-bold text-stone-950">تغییر وضعیت</h2>
        <p className="text-sm text-stone-700">{noTransitionMessage}</p>
      </section>
    );
  }

  return (
    <form
      className="panel status-change-panel space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const formStatus = String(formData.get("status") || "");

        setSelectedStatus(formStatus);
        setPendingFormData(formData);
        setIsConfirming(true);
      }}
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="status-change-panel__summary">
        <div>
          <h2 className="text-lg font-bold text-stone-950">تغییر وضعیت</h2>
          <p className="text-sm text-stone-600">
            وضعیت فعلی: {applicationStatusLabels[currentStatus] || currentStatus}
          </p>
        </div>
        {!isExpanded ? (
          <button
            type="button"
            className="button button--primary"
            onClick={() => setIsExpanded(true)}
          >
            تغییر وضعیت
          </button>
        ) : null}
      </div>
      {isExpanded ? (
        <>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-800">وضعیت جدید</label>
            <select
              name="status"
              className="w-full rounded-md border border-stone-300 px-3 py-2"
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
            >
              {options.map((value) => (
                <option key={value} value={value}>
                  {applicationStatusLabels[value]}
                </option>
              ))}
            </select>
          </div>
          {selectedStatus === "VALIDATION_COMPLETED" ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-stone-800" htmlFor="validation-certificate">
                فایل PDF گواهی
              </label>
              <input
                id="validation-certificate"
                name="certificate"
                type="file"
                accept="application/pdf,.pdf"
                required
                className="w-full rounded-md border border-stone-300 px-3 py-2"
              />
              <p className="text-xs text-stone-500">
                برای پایان فرآیند اعتبارسنجی، بارگذاری فایل PDF گواهی الزامی است.
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-800">توضیح مدیر برای کاربر</label>
            <textarea
              name="note"
              rows={3}
              className="w-full rounded-md border border-stone-300 px-3 py-2"
              placeholder="در صورت نیاز، توضیحی برای کاربر بنویسید."
            />
          </div>
          <div className="status-change-panel__actions">
            <button
              type="submit"
              disabled={isPending}
              className="button button--primary"
            >
              تغییر وضعیت
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setIsExpanded(false)}
              disabled={isPending}
            >
              انصراف
            </button>
          </div>
        </>
      ) : null}
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
      {isConfirming ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="status-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-confirm-title"
          >
            <div className="space-y-2">
              <h3 id="status-confirm-title" className="text-xl font-bold text-stone-950">
                تایید تغییر وضعیت
              </h3>
              <p className="text-sm text-stone-700">
                وضعیت پرونده به «{selectedStatusLabel}» تغییر می‌کند.
              </p>
              {isFinalDecision ? (
                <p className="status-confirm-modal__warning">
                  بعد از تغییر وضعیت به پایان فرآیند اعتبارسنجی، پرونده برای کاربر قابل ویرایش نیست.
                </p>
              ) : null}
            </div>
            <div className="status-change-panel__actions">
              <button
                type="button"
                className="button button--primary"
                disabled={isPending || !canConfirm}
                onClick={() => {
                  if (!pendingFormData) return;

                  const confirmedFormData = new FormData();
                  pendingFormData.forEach((value, key) => {
                    confirmedFormData.append(key, value);
                  });

                  startTransition(async () => {
                    try {
                      await changeSubmissionStatus(confirmedFormData);
                      setMessage("وضعیت ذخیره شد");
                      setIsExpanded(false);
                      setIsConfirming(false);
                      setPendingFormData(undefined);
                      showToast({ type: "success", message: "وضعیت پرونده ذخیره شد" });
                      router.push("/admin/submissions");
                    } catch (error) {
                      const errorMessage = error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود";
                      setMessage(errorMessage);
                      showToast({ type: "error", message: errorMessage });
                    }
                  });
                }}
              >
                تایید و ذخیره
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={isPending}
                onClick={() => {
                  setIsConfirming(false);
                  setPendingFormData(undefined);
                }}
              >
                بازگشت
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
