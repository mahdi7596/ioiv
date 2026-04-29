"use client";

import { FileUploadControl } from "./FileUploadControl";
import type { StepProps } from "./types";

export function CreditReportStep({
  draft,
  uploadingKey,
  uploadProgress,
  uploadErrors,
  readOnly,
  onDraftChange,
  onUpload,
}: StepProps) {
  return (
    <div className="space-y-5">
      <p className="credit-report-notice">
        با مراجعه به سایت{" "}
        <a href="https://www.mycredit.ir/" target="_blank" rel="noopener noreferrer">
          www.mycredit.ir
        </a>{" "}
        نسبت به تهیه گزارش اعتبارسنجی به تاریخ روز برای شرکت، مدیرعامل و یکی از اعضای هیات مدیره
        ترجیحا رئیس یا نایب رئیس هیات مدیره اقدام نمائید.
      </p>
      <div className="grid gap-5">
        <FileUploadControl
          id="creditReports.company"
          label="گزارش اعتبار سنجی شرکت"
          required
          value={draft.creditReports.company}
          readOnly={readOnly}
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
          readOnly={readOnly}
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
          readOnly={readOnly}
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
