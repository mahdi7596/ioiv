"use client";

import { FileUploadControl } from "./FileUploadControl";
import type { StepProps } from "./types";

export function CreditReportStep({
  draft,
  uploadingKeys,
  uploadProgress,
  uploadErrors,
  readOnly,
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
          uploading={Boolean(uploadingKeys?.["creditReports.company"])}
          progress={uploadProgress["creditReports.company"]}
          error={uploadErrors["creditReports.company"]}
          onUpload={async (file) => { await onUpload("creditReports.company", file); }}
        />
        <FileUploadControl
          id="creditReports.ceo"
          label="گزارش اعتبار سنجی مدیرعامل"
          required
          value={draft.creditReports.ceo}
          readOnly={readOnly}
          uploading={Boolean(uploadingKeys?.["creditReports.ceo"])}
          progress={uploadProgress["creditReports.ceo"]}
          error={uploadErrors["creditReports.ceo"]}
          onUpload={async (file) => { await onUpload("creditReports.ceo", file); }}
        />
        <FileUploadControl
          id="creditReports.boardMember"
          label="گزارش اعتبار سنجی یکی از اعضای هیات مدیره"
          required
          value={draft.creditReports.boardMember}
          readOnly={readOnly}
          uploading={Boolean(uploadingKeys?.["creditReports.boardMember"])}
          progress={uploadProgress["creditReports.boardMember"]}
          error={uploadErrors["creditReports.boardMember"]}
          onUpload={async (file) => { await onUpload("creditReports.boardMember", file); }}
        />
      </div>
    </div>
  );
}
