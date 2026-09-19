export type FileRef = {
  fileId: string;
  generation?: number;
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

export type HumanResourcesDraft = {
  employeeCount?: number;
  insuranceList?: FileRef;
};

export type CreditReportsDraft = {
  company?: FileRef;
  ceo?: FileRef;
  boardMember?: FileRef;
};

export type ApplicationDraft = {
  draftVersion?: number;
  currentStep: number;
  taxDeclarations: YearFileRow[];
  financials: YearFileRow[];
  humanResources: HumanResourcesDraft;
  trialBalance: TrialBalanceDraft;
  creditReports: CreditReportsDraft;
};

export type StepProps = {
  applicationId: string;
  draft: ApplicationDraft;
  readOnly?: boolean;
  uploadingKeys?: Record<string, boolean>;
  uploadProgress: Record<string, number>;
  uploadErrors: Record<string, string>;
  onDraftChange: (draft: ApplicationDraft) => void;
  onUpload: (fieldKey: string, file: File) => Promise<FileRef | null>;
};
