-- M6 is facilities-only. The legacy Payment table and its PaymentStatus enum
-- are intentionally left unchanged.
CREATE TYPE "FacilitiesPaymentStatus" AS ENUM (
  'INITIATED',
  'REDIRECT_READY',
  'PENDING',
  'VERIFIED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT'
);

DROP INDEX IF EXISTS "FacilitiesPaymentAttempt_one_verified";

ALTER TABLE "FacilitiesPaymentAttempt"
  ADD COLUMN "idempotencyKey" TEXT,
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "FacilitiesPaymentStatus"
    USING ("status"::text::"FacilitiesPaymentStatus");

ALTER TABLE "FacilitiesPaymentAttempt"
  ALTER COLUMN "status" SET DEFAULT 'INITIATED';

CREATE UNIQUE INDEX "FacilitiesPaymentAttempt_applicationId_idempotencyKey_key"
  ON "FacilitiesPaymentAttempt"("applicationId", "idempotencyKey");

CREATE UNIQUE INDEX "FacilitiesPaymentAttempt_one_active"
  ON "FacilitiesPaymentAttempt"("applicationId")
  WHERE "status" IN ('INITIATED', 'REDIRECT_READY', 'PENDING', 'TIMED_OUT');

CREATE UNIQUE INDEX "FacilitiesPaymentAttempt_one_verified"
  ON "FacilitiesPaymentAttempt"("applicationId")
  WHERE "status" = 'VERIFIED';

CREATE OR REPLACE FUNCTION enforce_facilities_payment_integrity() RETURNS trigger AS $$
DECLARE application_row RECORD;
BEGIN
  SELECT "paymentEnabledSnapshot", "paymentAmountTomanSnapshot"
    INTO application_row
    FROM "FacilitiesApplication"
    WHERE "id" = NEW."applicationId";

  IF NOT FOUND OR NOT application_row."paymentEnabledSnapshot" THEN
    RAISE EXCEPTION 'facilities payment requires an enabled payment snapshot';
  END IF;

  IF application_row."paymentAmountTomanSnapshot" IS NULL
     OR NEW."amountToman" <> application_row."paymentAmountTomanSnapshot" THEN
    RAISE EXCEPTION 'facilities payment amount must match the pinned application amount';
  END IF;

  IF NEW."status" IN ('REDIRECT_READY', 'PENDING', 'VERIFIED') AND NEW."authority" IS NULL THEN
    RAISE EXCEPTION 'facilities payment state requires a gateway authority';
  END IF;

  IF NEW."status" = 'VERIFIED' AND NEW."referenceId" IS NULL THEN
    RAISE EXCEPTION 'verified facilities payment requires a reference id';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'VERIFIED' AND (
    NEW."status" IS DISTINCT FROM OLD."status" OR
    NEW."amountToman" IS DISTINCT FROM OLD."amountToman" OR
    NEW."authority" IS DISTINCT FROM OLD."authority" OR
    NEW."referenceId" IS DISTINCT FROM OLD."referenceId"
  ) THEN
    RAISE EXCEPTION 'verified facilities payment is immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" <> NEW."status" AND NOT (
    (OLD."status" = 'INITIATED' AND NEW."status" IN ('REDIRECT_READY', 'PENDING', 'FAILED', 'CANCELLED', 'TIMED_OUT')) OR
    (OLD."status" = 'REDIRECT_READY' AND NEW."status" IN ('PENDING', 'VERIFIED', 'FAILED', 'CANCELLED', 'TIMED_OUT')) OR
    (OLD."status" = 'PENDING' AND NEW."status" IN ('VERIFIED', 'FAILED', 'CANCELLED', 'TIMED_OUT')) OR
    (OLD."status" = 'TIMED_OUT' AND NEW."status" = 'VERIFIED')
  ) THEN
    RAISE EXCEPTION 'invalid facilities payment state transition';
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER "FacilitiesPaymentAttempt_integrity"
  BEFORE INSERT OR UPDATE ON "FacilitiesPaymentAttempt"
  FOR EACH ROW EXECUTE FUNCTION enforce_facilities_payment_integrity();

CREATE OR REPLACE FUNCTION enforce_facilities_application_status_transition() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('PENDING_PAYMENT', 'SUBMITTED')) OR
    (OLD."status" = 'PENDING_PAYMENT' AND NEW."status" IN ('DRAFT', 'SUBMITTED')) OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" = 'UNDER_REVIEW') OR
    (OLD."status" = 'UNDER_REVIEW' AND NEW."status" IN ('NEEDS_EDIT', 'VALIDATION_COMPLETED')) OR
    (OLD."status" = 'NEEDS_EDIT' AND NEW."status" = 'SUBMITTED')
  ) THEN
    RAISE EXCEPTION 'invalid facilities application status transition';
  END IF;

  IF NEW."status" = 'SUBMITTED' AND NEW."paymentEnabledSnapshot" AND NOT EXISTS (
    SELECT 1 FROM "FacilitiesPaymentAttempt" p
    WHERE p."applicationId" = NEW."id"
      AND p."status" = 'VERIFIED'
      AND p."amountToman" = NEW."paymentAmountTomanSnapshot"
  ) THEN
    RAISE EXCEPTION 'facilities application requires a verified payment before submission';
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER "FacilitiesApplication_status_transition"
  BEFORE UPDATE OF "status" ON "FacilitiesApplication"
  FOR EACH ROW EXECUTE FUNCTION enforce_facilities_application_status_transition();
