"use client";

import { FileUploadControl } from "./FileUploadControl";
import type { StepProps } from "./types";

export function TrialBalanceStep({
  draft,
  uploadingKeys,
  uploadProgress,
  uploadErrors,
  readOnly,
  onUpload,
}: StepProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FileUploadControl
        id="trialBalance.generalLedger"
        label="تراز کل سال 1404"
        required
        value={draft.trialBalance.generalLedger}
        readOnly={readOnly}
        uploading={Boolean(uploadingKeys?.["trialBalance.generalLedger"])}
        progress={uploadProgress["trialBalance.generalLedger"]}
        error={uploadErrors["trialBalance.generalLedger"]}
        onUpload={async (file) => { await onUpload("trialBalance.generalLedger", file); }}
      />
      <FileUploadControl
        id="trialBalance.subsidiaryLedger"
        label="تراز معین سال 1404"
        required
        value={draft.trialBalance.subsidiaryLedger}
        readOnly={readOnly}
        uploading={Boolean(uploadingKeys?.["trialBalance.subsidiaryLedger"])}
        progress={uploadProgress["trialBalance.subsidiaryLedger"]}
        error={uploadErrors["trialBalance.subsidiaryLedger"]}
        onUpload={async (file) => { await onUpload("trialBalance.subsidiaryLedger", file); }}
      />
    </div>
  );
}
