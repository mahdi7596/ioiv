"use client";

import { keepAsciiDigits } from "@/lib/input/digits";
import { FileUploadControl } from "./FileUploadControl";
import type { StepProps } from "./types";

export function HumanResourcesStep({
  draft,
  uploadingKey,
  uploadProgress,
  uploadErrors,
  readOnly,
  onDraftChange,
  onUpload,
}: StepProps) {
  const fieldKey = "humanResources.insuranceList";
  const employeeCount = draft.humanResources.employeeCount;

  return (
    <div className="space-y-5">
      <div className="field">
        <label htmlFor="humanResources.employeeCount">
          تعداد نیروی انسانی بر اساس اخرین لیست بیمه <span className="text-red-600">*</span>
        </label>
        <input
          id="humanResources.employeeCount"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          dir="ltr"
          value={employeeCount ?? ""}
          disabled={readOnly}
          onChange={(event) => {
            const digits = keepAsciiDigits(event.target.value);
            const nextCount = digits ? Number(digits) : undefined;

            onDraftChange({
              ...draft,
              humanResources: {
                ...draft.humanResources,
                employeeCount: nextCount && nextCount > 0 ? nextCount : undefined,
              },
            });
          }}
        />
      </div>

      <FileUploadControl
        id={fieldKey}
        label="اپلود لیست بیمه"
        required
        value={draft.humanResources.insuranceList}
        readOnly={readOnly}
        uploading={uploadingKey === fieldKey}
        progress={uploadProgress[fieldKey]}
        error={uploadErrors[fieldKey]}
        onUpload={async (file) => {
          const uploaded = await onUpload(fieldKey, file);
          if (uploaded) {
            onDraftChange({
              ...draft,
              humanResources: { ...draft.humanResources, insuranceList: uploaded },
            });
          }
        }}
      />
    </div>
  );
}
