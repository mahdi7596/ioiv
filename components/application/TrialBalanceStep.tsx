"use client";

import { FileUploadControl } from "./FileUploadControl";
import type { StepProps } from "./types";

export function TrialBalanceStep({
  draft,
  uploadingKey,
  uploadProgress,
  uploadErrors,
  onDraftChange,
  onUpload,
}: StepProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FileUploadControl
        id="trialBalance.generalLedger"
        label="تراز کل"
        required
        value={draft.trialBalance.generalLedger}
        uploading={uploadingKey === "trialBalance.generalLedger"}
        progress={uploadProgress["trialBalance.generalLedger"]}
        error={uploadErrors["trialBalance.generalLedger"]}
        onUpload={async (file) => {
          const uploaded = await onUpload("trialBalance.generalLedger", file);
          if (uploaded) {
            onDraftChange({
              ...draft,
              trialBalance: { ...draft.trialBalance, generalLedger: uploaded },
            });
          }
        }}
      />
      <FileUploadControl
        id="trialBalance.subsidiaryLedger"
        label="تراز معین"
        required
        value={draft.trialBalance.subsidiaryLedger}
        uploading={uploadingKey === "trialBalance.subsidiaryLedger"}
        progress={uploadProgress["trialBalance.subsidiaryLedger"]}
        error={uploadErrors["trialBalance.subsidiaryLedger"]}
        onUpload={async (file) => {
          const uploaded = await onUpload("trialBalance.subsidiaryLedger", file);
          if (uploaded) {
            onDraftChange({
              ...draft,
              trialBalance: { ...draft.trialBalance, subsidiaryLedger: uploaded },
            });
          }
        }}
      />
    </div>
  );
}
