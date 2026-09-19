BEGIN;
CREATE TABLE "LegacyFileVerification" (
 "sequence" BIGSERIAL UNIQUE NOT NULL,
 "id" TEXT PRIMARY KEY, "fileId" TEXT NOT NULL REFERENCES "ApplicationFile"("id") ON DELETE RESTRICT,
 "verdict" TEXT NOT NULL CHECK ("verdict" IN ('PASSED','FAILED','UNAVAILABLE','MISSING','CORRUPT')),
 "sha256" TEXT, "mimeType" TEXT, "byteSize" INTEGER, "scannerName" TEXT, "scannerVersion" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("verdict" <> 'PASSED' OR ("sha256" IS NOT NULL AND "byteSize" IS NOT NULL AND "sha256" ~ '^[0-9a-f]{64}$' AND "mimeType" IS NOT NULL AND "byteSize" > 0 AND "byteSize" <= 20971520))
);
CREATE INDEX "LegacyFileVerification_fileId_createdAt_idx" ON "LegacyFileVerification"("fileId", "createdAt");
CREATE FUNCTION legacy_verification_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'legacy verification evidence is immutable'; END $$;
CREATE TRIGGER legacy_verification_immutable BEFORE UPDATE OR DELETE ON "LegacyFileVerification"
 FOR EACH ROW EXECUTE FUNCTION legacy_verification_immutable();
REVOKE ALL ON "LegacyFileVerification" FROM PUBLIC;
COMMIT;
