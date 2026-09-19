"use client";

import { FileUploadControl } from "./FileUploadControl";
import { YearSelect } from "./YearSelect";
import type { StepProps, YearFileRow } from "./types";

export function TaxDeclarationStep({
  draft,
  uploadingKeys,
  uploadProgress,
  uploadErrors,
  readOnly,
  onDraftChange,
  onUpload,
}: StepProps) {
  const rows: YearFileRow[] = [...draft.taxDeclarations];
  while (rows.length < 3) rows.push({});

  function updateRow(index: number, row: YearFileRow) {
    const nextRows = rows.map((current, currentIndex) => (currentIndex === index ? row : current));
    onDraftChange({ ...draft, taxDeclarations: nextRows });
  }

  return (
    <div className="space-y-5">
      {rows.map((row, index) => {
        const fieldKey = `taxDeclarations.${index}.file`;
        const isRequiredRow = index === 0;

        return (
          <div className="form-row" key={index}>
            <YearSelect
              id={`taxDeclarations.${index}.year`}
              value={row.year}
              required={isRequiredRow}
              disabled={readOnly}
              onChange={(year) => updateRow(index, { ...row, year })}
            />
            <FileUploadControl
              id={fieldKey}
              label="فایل اظهارنامه"
              required={isRequiredRow}
              value={row.file}
              readOnly={readOnly}
              uploading={Boolean(uploadingKeys?.[fieldKey])}
              progress={uploadProgress[fieldKey]}
              error={uploadErrors[fieldKey]}
              onUpload={async (file) => { await onUpload(fieldKey, file); }}
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
