"use client";

import { useState, useTransition } from "react";
import { showToast } from "@/components/ui/toast";
import { changeSubmissionStatus } from "@/lib/actions/admin";

const options = [
  ["UNDER_REVIEW", "در حال بررسی"],
  ["NEEDS_EDIT", "نیازمند ویرایش"],
  ["ACCEPTED", "پذیرفته شده"],
  ["REJECTED", "رد شده"],
];

export function StatusChangeForm({ applicationId }: { applicationId: string }) {
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          try {
            await changeSubmissionStatus(formData);
            setMessage("وضعیت ذخیره شد");
            showToast({ type: "success", message: "وضعیت پرونده ذخیره شد" });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود";
            setMessage(errorMessage);
            showToast({ type: "error", message: errorMessage });
          }
        });
      }}
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-800">وضعیت جدید</label>
        <select name="status" className="w-full rounded-md border border-stone-300 px-3 py-2">
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-800">یادداشت مدیر</label>
        <textarea name="note" rows={4} className="w-full rounded-md border border-stone-300 px-3 py-2" />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="button button--primary"
      >
        ذخیره وضعیت
      </button>
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
    </form>
  );
}
