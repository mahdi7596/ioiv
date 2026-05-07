-- Replace separate accepted/rejected terminal states with one validation-completed state.
ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";

CREATE TYPE "ApplicationStatus" AS ENUM (
  'DRAFT',
  'PENDING_PAYMENT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_EDIT',
  'VALIDATION_COMPLETED'
);

ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Application"
  ALTER COLUMN "status" TYPE "ApplicationStatus"
  USING (
    CASE
      WHEN "status"::text IN ('ACCEPTED', 'REJECTED') THEN 'VALIDATION_COMPLETED'
      ELSE "status"::text
    END
  )::"ApplicationStatus";

ALTER TABLE "StatusHistory"
  ALTER COLUMN "previousStatus" TYPE "ApplicationStatus"
  USING (
    CASE
      WHEN "previousStatus"::text IN ('ACCEPTED', 'REJECTED') THEN 'VALIDATION_COMPLETED'
      ELSE "previousStatus"::text
    END
  )::"ApplicationStatus";

ALTER TABLE "StatusHistory"
  ALTER COLUMN "newStatus" TYPE "ApplicationStatus"
  USING (
    CASE
      WHEN "newStatus"::text IN ('ACCEPTED', 'REJECTED') THEN 'VALIDATION_COMPLETED'
      ELSE "newStatus"::text
    END
  )::"ApplicationStatus";

ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "ApplicationStatus_old";
