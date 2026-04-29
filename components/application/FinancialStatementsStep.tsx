"use client";

import { FileUploadControl } from "./FileUploadControl";
import { YearSelect } from "./YearSelect";
import type { StepProps, YearFileRow } from "./types";

export function FinancialStatementsStep({
  draft,
  uploadingKey,
  uploadProgress,
  uploadErrors,
  onDraftChange,
  onUpload,
}: StepProps) {
  const rows = draft.financials.length ? draft.financials : [{}];

  function updateRow(index: number, row: YearFileRow) {
    const nextRows = rows.map((current, currentIndex) => (currentIndex === index ? row : current));
    onDraftChange({ ...draft, financials: nextRows });
  }

  return (
    <div className="space-y-5">
      {rows.map((row, index) => {
        const fieldKey = `financials.${index}.file`;

        return (
          <div className="form-row" key={index}>
            <YearSelect
              id={`financials.${index}.year`}
              value={row.year}
              onChange={(year) => updateRow(index, { ...row, year })}
            />
            <FileUploadControl
              id={fieldKey}
              label="فایل صورت مالی"
              value={row.file}
              uploading={uploadingKey === fieldKey}
              progress={uploadProgress[fieldKey]}
              error={uploadErrors[fieldKey]}
              onUpload={async (file) => {
                const uploaded = await onUpload(fieldKey, file);
                if (uploaded) updateRow(index, { ...row, file: uploaded });
              }}
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onDraftChange({ ...draft, financials: [...rows, {}] })}
        className="button button--ghost"
      >
        افزودن سال
      </button>
    </div>
  );
}
