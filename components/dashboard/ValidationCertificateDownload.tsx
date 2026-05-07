import { Download, FileCheck2 } from "lucide-react";
import type { ValidationCertificateFile } from "@/lib/application/certificate";

export function ValidationCertificateDownload({
  certificate,
}: {
  certificate?: ValidationCertificateFile | null;
}) {
  if (!certificate) return null;

  return (
    <article className="review-message" data-state="resolved" aria-label="گواهی اعتبارسنجی">
      <div className="review-message__header">
        <span className="review-message__icon" aria-hidden="true">
          <FileCheck2 size={21} strokeWidth={2.2} />
        </span>
        <div>
          <p className="review-message__eyebrow">گواهی اعتبارسنجی</p>
          <h2>فایل پایان فرآیند اعتبارسنجی آماده دریافت است</h2>
        </div>
      </div>
      <a
        className="button button--primary"
        href={`/api/files/${certificate.id}`}
        aria-label={`دانلود ${certificate.originalName}`}
      >
        <Download aria-hidden="true" size={18} strokeWidth={2} />
        دانلود گواهی
      </a>
    </article>
  );
}
