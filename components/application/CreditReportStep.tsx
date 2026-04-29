"use client";

import { FileUploadControl } from "./FileUploadControl";
import type { StepProps } from "./types";

export function CreditReportStep({
  draft,
  uploadingKey,
  uploadProgress,
  uploadErrors,
  onDraftChange,
  onUpload,
}: StepProps) {
  return (
    <div className="space-y-5">
      <p className="rounded-md bg-stone-50 p-4 text-sm leading-7 text-stone-700">
        با مراجعه به سایت https://www.mycredit.ir/ نسبت به تهیه گزارش اعتبارسنجی به تاریخ روز برای
        شرکت ، مدیرعامل و یکی از اعضای هیات مدیره ترجیحا رئیس یا نایب رئیس هیات مدیره اقدام نمائید.
      </p>
      <div className="grid gap-5">
        <FileUploadControl
          id="creditReports.company"
          label="گزارش اعتبار سنجی شرکت"
          required
          value={draft.creditReports.company}
          uploading={uploadingKey === "creditReports.company"}
          progress={uploadProgress["creditReports.company"]}
          error={uploadErrors["creditReports.company"]}
          onUpload={async (file) => {
            const uploaded = await onUpload("creditReports.company", file);
            if (uploaded) {
              onDraftChange({ ...draft, creditReports: { ...draft.creditReports, company: uploaded } });
            }
          }}
        />
        <FileUploadControl
          id="creditReports.ceo"
          label="گزارش اعتبار سنجی مدیرعامل"
          required
          value={draft.creditReports.ceo}
          uploading={uploadingKey === "creditReports.ceo"}
          progress={uploadProgress["creditReports.ceo"]}
          error={uploadErrors["creditReports.ceo"]}
          onUpload={async (file) => {
            const uploaded = await onUpload("creditReports.ceo", file);
            if (uploaded) {
              onDraftChange({ ...draft, creditReports: { ...draft.creditReports, ceo: uploaded } });
            }
          }}
        />
        <FileUploadControl
          id="creditReports.boardMember"
          label="گزارش اعتبار سنجی یکی از اعضای هیات مدیره"
          required
          value={draft.creditReports.boardMember}
          uploading={uploadingKey === "creditReports.boardMember"}
          progress={uploadProgress["creditReports.boardMember"]}
          error={uploadErrors["creditReports.boardMember"]}
          onUpload={async (file) => {
            const uploaded = await onUpload("creditReports.boardMember", file);
            if (uploaded) {
              onDraftChange({
                ...draft,
                creditReports: { ...draft.creditReports, boardMember: uploaded },
              });
            }
          }}
        />
      </div>
    </div>
  );
}
