CREATE TYPE "FacilitiesCorrectionSmsStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'CORRECTION_SMS_SENT';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'CORRECTION_SMS_FAILED';

ALTER TABLE "FacilitiesCorrectionRequest"
  ADD COLUMN "smsStatus" "FacilitiesCorrectionSmsStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "smsAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "smsLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "smsSentAt" TIMESTAMP(3),
  ADD COLUMN "smsFailureCode" TEXT,
  ADD CONSTRAINT "FacilitiesCorrectionRequest_note_length_check"
    CHECK (char_length(btrim("note")) BETWEEN 1 AND 2000),
  ADD CONSTRAINT "FacilitiesCorrectionRequest_sms_attempt_count_check"
    CHECK ("smsAttemptCount" >= 0),
  ADD CONSTRAINT "FacilitiesCorrectionRequest_sms_state_check"
    CHECK (
      ("smsStatus" = 'PENDING' AND "smsSentAt" IS NULL AND "smsFailureCode" IS NULL) OR
      ("smsStatus" = 'SENT' AND "smsAttemptCount" > 0 AND "smsLastAttemptAt" IS NOT NULL AND "smsSentAt" IS NOT NULL AND "smsFailureCode" IS NULL) OR
      ("smsStatus" = 'FAILED' AND "smsAttemptCount" > 0 AND "smsLastAttemptAt" IS NOT NULL AND "smsSentAt" IS NULL AND "smsFailureCode" IS NOT NULL)
    );

CREATE INDEX "FacilitiesCorrectionRequest_smsStatus_openedAt_idx"
  ON "FacilitiesCorrectionRequest"("smsStatus", "openedAt");

ALTER TABLE "FacilitiesApplicationOfficer"
  ADD COLUMN "sourceCompanyOfficerId" TEXT;

CREATE UNIQUE INDEX "FacilitiesApplicationOfficer_applicationId_sourceCompanyOfficerId_key"
  ON "FacilitiesApplicationOfficer"("applicationId", "sourceCompanyOfficerId");
