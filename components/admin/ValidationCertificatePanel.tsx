"use client";

import { Download, FileCheck2, Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { showToast } from "@/components/ui/toast";
import { replaceValidationCertificate } from "@/lib/actions/admin";
import type { ValidationCertificateFile } from "@/lib/application/certificate";

const numberFormatter = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
});

function formatFileSize(size: number) {
  if (size < 1024) return `${numberFormatter.format(size)} بایت`;
  if (size < 1024 * 1024) return `${numberFormatter.format(size / 1024)} کیلوبایت`;
  return `${numberFormatter.format(size / 1024 / 1024)} مگابایت`;
}

export function ValidationCertificatePanel({
  applicationId,
  currentStatus,
  certificate,
  canDownload = true,
  canReplace = true,
}: {
  applicationId: string;
  currentStatus: string;
  certificate?: ValidationCertificateFile;
  canDownload?: boolean;
  canReplace?: boolean;
}) {
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const canReplaceCertificate = canReplace && currentStatus === "VALIDATION_COMPLETED";

  return (
    <section className="panel space-y-4" aria-label="گواهی پایان فرآیند اعتبارسنجی">
      <div className="status-change-panel__summary">
        <div>
          <h2 className="text-xl font-bold text-stone-950">گواهی پایان فرآیند اعتبارسنجی</h2>
          <p className="text-sm text-stone-600">
            فایل PDF گواهی پس از پایان فرآیند برای کاربر قابل دانلود است.
          </p>
        </div>
      </div>

      {certificate ? (
        <article className="file-item">
          <div>
            <span className="file-item__field">
              <FileCheck2 aria-hidden="true" size={16} strokeWidth={2} />
              گواهی اعتبارسنجی
            </span>
            <span className="file-item__name">{certificate.originalName}</span>
            <div className="file-item__meta">
              <span>{formatFileSize(certificate.size)}</span>
              <span>{certificate.createdAt.toLocaleDateString("fa-IR")}</span>
            </div>
          </div>
          {canDownload ? (
            <a
              className="button button--ghost"
              href={`/api/files/${certificate.id}`}
              aria-label={`دانلود ${certificate.originalName}`}
            >
              <Download aria-hidden="true" size={17} strokeWidth={2} />
              دانلود
            </a>
          ) : null}
        </article>
      ) : (
        <p className="empty-state">هنوز گواهی برای این پرونده ثبت نشده است.</p>
      )}

      {canReplaceCertificate ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);

            startTransition(async () => {
              try {
                await replaceValidationCertificate(formData);
                setMessage("گواهی با موفقیت ذخیره شد");
                showToast({ type: "success", message: "گواهی با موفقیت ذخیره شد" });
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "بارگذاری گواهی ناموفق بود";
                setMessage(errorMessage);
                showToast({ type: "error", message: errorMessage });
              }
            });
          }}
        >
          <input type="hidden" name="applicationId" value={applicationId} />
          <div className="field">
            <label htmlFor="replacement-validation-certificate">تعویض فایل PDF گواهی</label>
            <input
              id="replacement-validation-certificate"
              name="certificate"
              type="file"
              accept="application/pdf,.pdf"
              required
            />
          </div>
          <button type="submit" className="button button--primary" disabled={isPending}>
            <Upload aria-hidden="true" size={18} strokeWidth={2} />
            بارگذاری گواهی
          </button>
          {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
