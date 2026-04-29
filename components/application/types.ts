export type FileRef = {
  fileId: string;
  name: string;
};

export type YearFileRow = {
  year?: string;
  file?: FileRef;
};

export type TrialBalanceDraft = {
  generalLedger?: FileRef;
  subsidiaryLedger?: FileRef;
};

export type CreditReportsDraft = {
  company?: FileRef;
  ceo?: FileRef;
  boardMember?: FileRef;
};

export type ApplicationDraft = {
  currentStep: number;
  taxDeclarations: YearFileRow[];
  financials: YearFileRow[];
  trialBalance: TrialBalanceDraft;
  creditReports: CreditReportsDraft;
};

export type StepProps = {
  applicationId: string;
  draft: ApplicationDraft;
  readOnly?: boolean;
  uploadingKey?: string;
  uploadProgress: Record<string, number>;
  uploadErrors: Record<string, string>;
  onDraftChange: (draft: ApplicationDraft) => void;
  onUpload: (fieldKey: string, file: File) => Promise<FileRef | null>;
};
