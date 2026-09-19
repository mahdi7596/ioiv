BEGIN;
CREATE TABLE "PaymentObligation" (
 "id" TEXT PRIMARY KEY,
 "legacyApplicationId" TEXT UNIQUE REFERENCES "Application"("id") ON DELETE RESTRICT,
 "facilitiesApplicationId" TEXT UNIQUE REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT,
 "legacyPaymentId" TEXT UNIQUE REFERENCES "Payment"("id") ON DELETE RESTRICT,
 "facilitiesPaymentId" TEXT UNIQUE REFERENCES "FacilitiesPaymentAttempt"("id") ON DELETE RESTRICT,
 "amountToman" INTEGER NOT NULL CHECK ("amountToman" > 0),
 "currency" TEXT NOT NULL DEFAULT 'IRT' CHECK ("currency" = 'IRT'),
 "state" TEXT NOT NULL CHECK ("state" IN ('READY','REQUESTING','PAYABLE','VERIFYING','UNCERTAIN','SETTLED')),
 "generation" INTEGER NOT NULL DEFAULT 0,
 "owner" TEXT, "operation" TEXT CHECK ("operation" IN ('REQUEST','VERIFY')),
 "leaseUntil" TIMESTAMP(3), "reason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("legacyApplicationId" IS NOT NULL)::int + ("facilitiesApplicationId" IS NOT NULL)::int = 1),
 CHECK (("legacyPaymentId" IS NULL OR "legacyApplicationId" IS NOT NULL) AND ("facilitiesPaymentId" IS NULL OR "facilitiesApplicationId" IS NOT NULL))
);
CREATE TABLE "PaymentOperationResult" (
 "id" TEXT PRIMARY KEY, "obligationId" TEXT NOT NULL REFERENCES "PaymentObligation"("id") ON DELETE RESTRICT,
 "generation" INTEGER NOT NULL, "owner" TEXT NOT NULL,
 "operation" TEXT NOT NULL CHECK ("operation" IN ('REQUEST','VERIFY','CALLBACK')),
 "outcome" TEXT NOT NULL CHECK ("outcome" IN ('AUTHORITY','CAPTURED','REJECTED','UNKNOWN','COMPETING_CALLBACK')),
 "authority" TEXT, "referenceId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("obligationId", "generation", "outcome", "owner")
);
CREATE TABLE "PaymentNotificationIntent" (
 "obligationId" TEXT PRIMARY KEY REFERENCES "PaymentObligation"("id") ON DELETE RESTRICT,
 "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING','CLAIMED','SENT','UNKNOWN')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION guard_payment_obligation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW."legacyApplicationId" IS DISTINCT FROM OLD."legacyApplicationId" OR NEW."facilitiesApplicationId" IS DISTINCT FROM OLD."facilitiesApplicationId" OR NEW."amountToman" <> OLD."amountToman" OR NEW."currency" <> OLD."currency" OR (OLD."state" = 'SETTLED' AND NEW."state" <> 'SETTLED') OR (OLD."legacyPaymentId" IS NOT NULL AND NEW."legacyPaymentId" IS DISTINCT FROM OLD."legacyPaymentId") OR (OLD."facilitiesPaymentId" IS NOT NULL AND NEW."facilitiesPaymentId" IS DISTINCT FROM OLD."facilitiesPaymentId")) THEN
  RAISE EXCEPTION 'payment obligation identity and selection are immutable';
 END IF;
 IF NEW."legacyPaymentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Payment" WHERE "id" = NEW."legacyPaymentId" AND "applicationId" = NEW."legacyApplicationId" AND "amountToman" = NEW."amountToman") THEN RAISE EXCEPTION 'invalid legacy selection'; END IF;
 IF NEW."facilitiesPaymentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FacilitiesPaymentAttempt" WHERE "id" = NEW."facilitiesPaymentId" AND "applicationId" = NEW."facilitiesApplicationId" AND "amountToman" = NEW."amountToman") THEN RAISE EXCEPTION 'invalid facilities selection'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PaymentObligation_guard" BEFORE INSERT OR UPDATE ON "PaymentObligation" FOR EACH ROW EXECUTE FUNCTION guard_payment_obligation();
CREATE FUNCTION immutable_payment_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'payment result is append only'; END $$;
CREATE TRIGGER "PaymentOperationResult_immutable" BEFORE UPDATE OR DELETE ON "PaymentOperationResult" FOR EACH ROW EXECUTE FUNCTION immutable_payment_result();
-- Preserve all history; ambiguous obligations are blocked, never repaired by deletion.
INSERT INTO "PaymentObligation" ("id","legacyApplicationId","legacyPaymentId","amountToman","state","reason")
SELECT 'legacy:' || a."id", a."id", CASE WHEN count(*) = 1 OR count(*) FILTER (WHERE p."status" = 'VERIFIED') = 1 THEN coalesce(min(p."id") FILTER (WHERE p."status" = 'VERIFIED'),min(p."id")) END,
 coalesce(min(p."amountToman") FILTER (WHERE p."status" = 'VERIFIED'),min(p."amountToman")),
 CASE WHEN bool_or(p."status" = 'VERIFIED') THEN 'SETTLED' ELSE 'UNCERTAIN' END,
 CASE WHEN count(*) FILTER (WHERE p."status" = 'VERIFIED') > 1 THEN 'HISTORICAL_MULTIPLE_CAPTURES' WHEN count(*) > 1 THEN 'HISTORICAL_MULTIPLE_ATTEMPTS' ELSE 'HISTORICAL_ATTEMPT' END
FROM "Application" a JOIN "Payment" p ON p."applicationId" = a."id" GROUP BY a."id";
INSERT INTO "PaymentObligation" ("id","facilitiesApplicationId","facilitiesPaymentId","amountToman","state","reason")
SELECT 'facilities:' || a."id", a."id", CASE WHEN count(*) = 1 OR count(*) FILTER (WHERE p."status" = 'VERIFIED') = 1 THEN coalesce(min(p."id") FILTER (WHERE p."status" = 'VERIFIED'),min(p."id")) END,
 coalesce(min(p."amountToman") FILTER (WHERE p."status" = 'VERIFIED'),min(p."amountToman")),
 CASE WHEN bool_or(p."status" = 'VERIFIED') THEN 'SETTLED' ELSE 'UNCERTAIN' END,
 CASE WHEN count(*) > 1 THEN 'HISTORICAL_MULTIPLE_ATTEMPTS' ELSE 'HISTORICAL_ATTEMPT' END
FROM "FacilitiesApplication" a JOIN "FacilitiesPaymentAttempt" p ON p."applicationId" = a."id" GROUP BY a."id";
COMMIT;
