export const APPLICATION_ROUND = "1403";
export const PAYMENT_AMOUNT_TOMAN = 3_000_000;
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Every field key the company-registration wizard may upload to. The key is
 * joined into the on-disk path, so it must never be accepted unvalidated.
 * Producers: components/application/*Step.tsx; consumers: SubmissionFiles and
 * lib/export/submissions.ts. The admin-only validation certificate key lives in
 * lib/application/certificate.ts and is allowed separately by the storage layer.
 */
export const LEGACY_UPLOAD_FIELD_KEY_PATTERN =
  /^(taxDeclarations\.(0|[1-9][0-9]?)\.file|financials\.(0|[1-9][0-9]?)\.file|humanResources\.insuranceList|trialBalance\.(generalLedger|subsidiaryLedger)|creditReports\.(company|ceo|boardMember))$/;

/** Identifiers that are safe to use as a single path segment (cuid and seeded ids). */
export const SAFE_PATH_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const INVALID_UPLOAD_REQUEST_MESSAGE = "درخواست بارگذاری معتبر نیست";

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".zip",
  ".xls",
  ".xlsx",
  ".csv",
] as const;
