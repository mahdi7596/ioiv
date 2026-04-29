"use client";

import { FileUploadControl } from "./FileUploadControl";
import { YearSelect } from "./YearSelect";
import type { StepProps, YearFileRow } from "./types";

const defaultRows: YearFileRow[] = [{}, {}, {}];

export function TaxDeclarationStep({
  draft,
  uploadingKey,
  uploadProgress,
  uploadErrors,
  readOnly,
  onDraftChange,
  onUpload,
}: StepProps) {
  const rows = draft.taxDeclarations.length >= 3 ? draft.taxDeclarations : defaultRows;

  function updateRow(index: number, row: YearFileRow) {
    const nextRows = rows.map((current, currentIndex) => (currentIndex === index ? row : current));
    onDraftChange({ ...draft, taxDeclarations: nextRows });
  }

  return (
    <div className="space-y-5">
      {rows.map((row, index) => {
        const fieldKey = `taxDeclarations.${index}.file`;

        return (
          <div className="form-row" key={index}>
            <YearSelect
              id={`taxDeclarations.${index}.year`}
              value={row.year}
              required
              disabled={readOnly}
              onChange={(year) => updateRow(index, { ...row, year })}
            />
            <FileUploadControl
              id={fieldKey}
              label="فایل اظهارنامه"
              required
              value={row.file}
              readOnly={readOnly}
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

      {readOnly ? null : (
        <button
          type="button"
          onClick={() => onDraftChange({ ...draft, taxDeclarations: [...rows, {}] })}
          className="button button--ghost"
        >
          افزودن سال
        </button>
      )}
    </div>
  );
}
