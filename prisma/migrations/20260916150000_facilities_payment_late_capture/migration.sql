-- Late capture: a gateway callback can confirm an attempt that the application
-- had already closed (a stale re-verify or an explicit rejection while the
-- applicant was still on the bank page). The money moved, so the attempt must be
-- allowed to become VERIFIED from FAILED or CANCELLED. The partial unique index
-- "FacilitiesPaymentAttempt_one_verified" still guarantees at most one VERIFIED
-- attempt per application; a second capture is deliberately left unverified so
-- the gateway reverses it.
--
-- Backwards compatible: this only relaxes the trigger, the previous application
-- version never attempts these transitions.
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
    (OLD."status" = 'TIMED_OUT' AND NEW."status" = 'VERIFIED') OR
    (OLD."status" = 'TIMED_OUT' AND NEW."status" = 'FAILED') OR
    -- Late capture (see header). Requires an authority, enforced above.
    (OLD."status" IN ('FAILED', 'CANCELLED') AND NEW."status" = 'VERIFIED' AND OLD."authority" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'invalid facilities payment state transition';
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;
