-- M2 private facilities file lifecycle. This is additive and deliberately does
-- not touch legacy Application/ApplicationFile tables, legacy physical paths,
-- or existing workflow data.

CREATE TYPE "FacilitiesFileBindingScope" AS ENUM ('COMPANY_PROFILE', 'APPLICATION');
CREATE TYPE "FacilitiesFileLifecycleStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'UNAVAILABLE', 'CORRUPT', 'INTERRUPTED', 'DUPLICATE', 'OVERSIZED', 'DISALLOWED');
CREATE TYPE "FacilitiesFileFailureReason" AS ENUM ('STORAGE_UNAVAILABLE', 'STORAGE_WRITE_FAILED', 'SCANNER_UNAVAILABLE', 'SCAN_FAILED', 'CONTENT_TYPE_MISMATCH', 'CONTENT_CORRUPT', 'UPLOAD_INTERRUPTED', 'DUPLICATE_REQUEST', 'FILE_TOO_LARGE', 'APPLICATION_QUOTA_EXCEEDED', 'DISALLOWED_TYPE', 'OWNERSHIP_DENIED', 'REPLACEMENT_FAILED', 'DELETION_FAILED');
CREATE TYPE "FacilitiesFileDeletionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'RETRY_REQUIRED');

CREATE TABLE "FacilitiesFileBinding" (
  "id" TEXT NOT NULL,
  "scope" "FacilitiesFileBindingScope" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "applicationId" TEXT,
  "slotKey" TEXT NOT NULL,
  "currentUploadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesFileBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesFileBinding_slot_key_check" CHECK ("slotKey" ~ '^[A-Za-z0-9_.-]{1,100}$')
);

CREATE TABLE "FacilitiesFileUploadAttempt" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "lifecycleStatus" "FacilitiesFileLifecycleStatus" NOT NULL,
  "failureReason" "FacilitiesFileFailureReason",
  "uploadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesFileUploadAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesFileUploadAttempt_idempotency_key_check" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT "FacilitiesFileUploadAttempt_status_reason_check" CHECK (
    (("lifecycleStatus" IN ('PENDING', 'PASSED')) AND "failureReason" IS NULL)
    OR ("lifecycleStatus" = 'FAILED' AND "failureReason" IN ('STORAGE_WRITE_FAILED', 'SCAN_FAILED', 'REPLACEMENT_FAILED'))
    OR ("lifecycleStatus" = 'UNAVAILABLE' AND "failureReason" IN ('STORAGE_UNAVAILABLE', 'SCANNER_UNAVAILABLE'))
    OR ("lifecycleStatus" = 'CORRUPT' AND "failureReason" = 'CONTENT_CORRUPT')
    OR ("lifecycleStatus" = 'INTERRUPTED' AND "failureReason" = 'UPLOAD_INTERRUPTED')
    OR ("lifecycleStatus" = 'DUPLICATE' AND "failureReason" = 'DUPLICATE_REQUEST')
    OR ("lifecycleStatus" = 'OVERSIZED' AND "failureReason" IN ('FILE_TOO_LARGE', 'APPLICATION_QUOTA_EXCEEDED'))
    OR ("lifecycleStatus" = 'DISALLOWED' AND "failureReason" IN ('CONTENT_TYPE_MISMATCH', 'DISALLOWED_TYPE', 'OWNERSHIP_DENIED'))
  )
);

CREATE TABLE "FacilitiesFileUpload" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "storedFileId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "replacesUploadId" TEXT,
  "lifecycleStatus" "FacilitiesFileLifecycleStatus" NOT NULL DEFAULT 'PENDING',
  "failureReason" "FacilitiesFileFailureReason",
  "reservedByteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesFileUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesFileUpload_idempotency_key_check" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT "FacilitiesFileUpload_revision_number_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "FacilitiesFileUpload_reserved_byte_size_check" CHECK ("reservedByteSize" > 0 AND "reservedByteSize" <= 26214400),
  CONSTRAINT "FacilitiesFileUpload_status_reason_check" CHECK (
    (("lifecycleStatus" IN ('PENDING', 'PASSED')) AND "failureReason" IS NULL)
    OR ("lifecycleStatus" = 'FAILED' AND "failureReason" IN ('STORAGE_WRITE_FAILED', 'SCAN_FAILED', 'REPLACEMENT_FAILED'))
    OR ("lifecycleStatus" = 'UNAVAILABLE' AND "failureReason" IN ('STORAGE_UNAVAILABLE', 'SCANNER_UNAVAILABLE'))
    OR ("lifecycleStatus" = 'CORRUPT' AND "failureReason" = 'CONTENT_CORRUPT')
    OR ("lifecycleStatus" = 'INTERRUPTED' AND "failureReason" = 'UPLOAD_INTERRUPTED')
    OR ("lifecycleStatus" = 'DUPLICATE' AND "failureReason" = 'DUPLICATE_REQUEST')
    OR ("lifecycleStatus" = 'OVERSIZED' AND "failureReason" IN ('FILE_TOO_LARGE', 'APPLICATION_QUOTA_EXCEEDED'))
    OR ("lifecycleStatus" = 'DISALLOWED' AND "failureReason" IN ('CONTENT_TYPE_MISMATCH', 'DISALLOWED_TYPE', 'OWNERSHIP_DENIED'))
  )
);

CREATE TABLE "FacilitiesFileDeletionTombstone" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "status" "FacilitiesFileDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" "FacilitiesFileFailureReason",
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesFileDeletionTombstone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesFileDeletionTombstone_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "FacilitiesFileDeletionTombstone_completion_check" CHECK (
    ("status" = 'SUCCEEDED' AND "completedAt" IS NOT NULL AND "lastError" IS NULL)
    OR ("status" <> 'SUCCEEDED' AND "completedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "FacilitiesFileBinding_scopeId_slotKey_key" ON "FacilitiesFileBinding"("scopeId", "slotKey");
CREATE INDEX "FacilitiesFileBinding_userId_companyId_idx" ON "FacilitiesFileBinding"("userId", "companyId");
CREATE INDEX "FacilitiesFileBinding_applicationId_idx" ON "FacilitiesFileBinding"("applicationId");
CREATE UNIQUE INDEX "FacilitiesFileBinding_currentUploadId_key" ON "FacilitiesFileBinding"("currentUploadId");
CREATE UNIQUE INDEX "FacilitiesFileUploadAttempt_bindingId_idempotencyKey_key" ON "FacilitiesFileUploadAttempt"("bindingId", "idempotencyKey");
CREATE UNIQUE INDEX "FacilitiesFileUploadAttempt_uploadId_key" ON "FacilitiesFileUploadAttempt"("uploadId");
CREATE INDEX "FacilitiesFileUploadAttempt_lifecycleStatus_createdAt_idx" ON "FacilitiesFileUploadAttempt"("lifecycleStatus", "createdAt");
CREATE UNIQUE INDEX "FacilitiesFileUpload_storedFileId_key" ON "FacilitiesFileUpload"("storedFileId");
CREATE UNIQUE INDEX "FacilitiesFileUpload_replacesUploadId_key" ON "FacilitiesFileUpload"("replacesUploadId");
CREATE UNIQUE INDEX "FacilitiesFileUpload_bindingId_idempotencyKey_key" ON "FacilitiesFileUpload"("bindingId", "idempotencyKey");
CREATE UNIQUE INDEX "FacilitiesFileUpload_bindingId_revisionNumber_key" ON "FacilitiesFileUpload"("bindingId", "revisionNumber");
CREATE INDEX "FacilitiesFileUpload_lifecycleStatus_createdAt_idx" ON "FacilitiesFileUpload"("lifecycleStatus", "createdAt");
CREATE UNIQUE INDEX "FacilitiesFileDeletionTombstone_uploadId_key" ON "FacilitiesFileDeletionTombstone"("uploadId");
CREATE INDEX "FacilitiesFileDeletionTombstone_status_nextAttemptAt_idx" ON "FacilitiesFileDeletionTombstone"("status", "nextAttemptAt");

ALTER TABLE "FacilitiesFileBinding" ADD CONSTRAINT "FacilitiesFileBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileBinding" ADD CONSTRAINT "FacilitiesFileBinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileBinding" ADD CONSTRAINT "FacilitiesFileBinding_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileUploadAttempt" ADD CONSTRAINT "FacilitiesFileUploadAttempt_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "FacilitiesFileBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileUpload" ADD CONSTRAINT "FacilitiesFileUpload_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "FacilitiesFileBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileUpload" ADD CONSTRAINT "FacilitiesFileUpload_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileUpload" ADD CONSTRAINT "FacilitiesFileUpload_replacesUploadId_fkey" FOREIGN KEY ("replacesUploadId") REFERENCES "FacilitiesFileUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileUploadAttempt" ADD CONSTRAINT "FacilitiesFileUploadAttempt_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "FacilitiesFileUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileBinding" ADD CONSTRAINT "FacilitiesFileBinding_currentUploadId_fkey" FOREIGN KEY ("currentUploadId") REFERENCES "FacilitiesFileUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesFileDeletionTombstone" ADD CONSTRAINT "FacilitiesFileDeletionTombstone_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "FacilitiesFileUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A binding is an owner-authorized, server-created scope. Company-profile
-- bindings intentionally have no application quota; application bindings must
-- exactly match the immutable facilities application owner/company tuple.
CREATE FUNCTION enforce_facilities_file_binding_integrity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."scope" IS DISTINCT FROM OLD."scope" OR NEW."scopeId" IS DISTINCT FROM OLD."scopeId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId" OR NEW."slotKey" IS DISTINCT FROM OLD."slotKey"
  ) THEN
    RAISE EXCEPTION 'facilities file binding scope is immutable';
  END IF;

  IF NEW."scope" = 'COMPANY_PROFILE' THEN
    IF NEW."applicationId" IS NOT NULL OR NEW."scopeId" <> NEW."companyId" THEN
      RAISE EXCEPTION 'company-profile file binding must use its company as scope';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "Company" c WHERE c."id" = NEW."companyId" AND c."userId" = NEW."userId") THEN
      RAISE EXCEPTION 'facilities file binding user must own the selected company';
    END IF;
  ELSIF NEW."scope" = 'APPLICATION' THEN
    IF NEW."applicationId" IS NULL OR NEW."scopeId" <> NEW."applicationId" THEN
      RAISE EXCEPTION 'application file binding must use its application as scope';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "FacilitiesApplication" a
      WHERE a."id" = NEW."applicationId" AND a."companyId" = NEW."companyId" AND a."userId" = NEW."userId"
    ) THEN
      RAISE EXCEPTION 'facilities file binding must match application ownership';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported facilities file binding scope';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesFileBinding_integrity" BEFORE INSERT OR UPDATE ON "FacilitiesFileBinding" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_file_binding_integrity();

CREATE FUNCTION enforce_facilities_file_upload_attempt_integrity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."bindingId" IS DISTINCT FROM OLD."bindingId" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR (OLD."uploadId" IS NOT NULL AND NEW."uploadId" IS DISTINCT FROM OLD."uploadId")
  ) THEN
    RAISE EXCEPTION 'facilities file upload attempt identity is immutable';
  END IF;
  IF NEW."uploadId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "FacilitiesFileUpload" u WHERE u."id" = NEW."uploadId" AND u."bindingId" = NEW."bindingId" AND u."idempotencyKey" = NEW."idempotencyKey"
  ) THEN
    RAISE EXCEPTION 'facilities file upload attempt must link to the same binding and idempotency revision';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesFileUploadAttempt_integrity" BEFORE INSERT OR UPDATE ON "FacilitiesFileUploadAttempt" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_file_upload_attempt_integrity();

CREATE FUNCTION enforce_facilities_file_upload_integrity() RETURNS trigger AS $$
DECLARE
  binding_record "FacilitiesFileBinding"%ROWTYPE;
  predecessor_record "FacilitiesFileUpload"%ROWTYPE;
  existing_reserved BIGINT;
BEGIN
  SELECT * INTO binding_record FROM "FacilitiesFileBinding" WHERE "id" = NEW."bindingId";
  IF NOT FOUND THEN RAISE EXCEPTION 'facilities file upload requires a binding'; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."bindingId" IS DISTINCT FROM OLD."bindingId" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
      OR NEW."revisionNumber" IS DISTINCT FROM OLD."revisionNumber" OR NEW."replacesUploadId" IS DISTINCT FROM OLD."replacesUploadId"
      OR NEW."reservedByteSize" IS DISTINCT FROM OLD."reservedByteSize" THEN
      RAISE EXCEPTION 'facilities file upload identity and reservation are immutable';
    END IF;
    IF OLD."lifecycleStatus" <> 'PENDING'
      AND NOT (OLD."lifecycleStatus" = 'UNAVAILABLE' AND NEW."lifecycleStatus" = 'PENDING')
      AND NEW."lifecycleStatus" IS DISTINCT FROM OLD."lifecycleStatus" THEN
      RAISE EXCEPTION 'terminal facilities file lifecycle status is immutable';
    END IF;
  END IF;

  IF NEW."replacesUploadId" IS NULL THEN
    IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM "FacilitiesFileBinding" b WHERE b."id" = NEW."bindingId" AND b."currentUploadId" IS NOT NULL) THEN
      RAISE EXCEPTION 'a binding with current content requires a replacement revision';
    END IF;
    IF TG_OP = 'INSERT' AND NEW."revisionNumber" <> COALESCE((SELECT MAX(u."revisionNumber") + 1 FROM "FacilitiesFileUpload" u WHERE u."bindingId" = NEW."bindingId"), 1) THEN
      RAISE EXCEPTION 'facilities file revisions must be monotonic';
    END IF;
  ELSE
    SELECT * INTO predecessor_record FROM "FacilitiesFileUpload" WHERE "id" = NEW."replacesUploadId";
    IF NOT FOUND OR predecessor_record."bindingId" <> NEW."bindingId" THEN
      RAISE EXCEPTION 'facilities file replacement must remain in the same binding';
    END IF;
    IF predecessor_record."revisionNumber" + 1 <> NEW."revisionNumber" OR predecessor_record."lifecycleStatus" <> 'PASSED' THEN
      RAISE EXCEPTION 'facilities file replacement requires the preceding passed revision';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "FacilitiesFileBinding" b WHERE b."id" = NEW."bindingId" AND b."currentUploadId" = predecessor_record."id") THEN
      RAISE EXCEPTION 'facilities file replacement must replace the current passed revision';
    END IF;
    IF EXISTS (SELECT 1 FROM "FacilitiesFileDeletionTombstone" t WHERE t."uploadId" = predecessor_record."id") THEN
      RAISE EXCEPTION 'facilities file replacement predecessor is already pending deletion';
    END IF;
  END IF;

  IF NEW."lifecycleStatus" = 'PASSED' AND NEW."storedFileId" IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "FacilitiesFileDeletionTombstone" t WHERE t."uploadId" = NEW."id" AND t."status" = 'SUCCEEDED') THEN
      RAISE EXCEPTION 'passed facilities file upload requires a scanned, size-verified stored file';
    END IF;
  ELSIF NEW."lifecycleStatus" = 'PASSED' AND NOT EXISTS (
      SELECT 1 FROM "StoredFile" f
      WHERE f."id" = NEW."storedFileId" AND f."scanStatus" = 'PASSED' AND f."byteSize" = NEW."reservedByteSize"
  ) THEN
    RAISE EXCEPTION 'passed facilities file upload requires a scanned, size-verified stored file';
  END IF;

  -- Locking the application row serializes concurrent quota reservations. A
  -- PENDING reservation and a PASSED file both count toward 150 MiB; every
  -- terminal failure value releases the reservation without deleting evidence.
  IF binding_record."applicationId" IS NOT NULL AND (
    NEW."lifecycleStatus" = 'PENDING' OR (NEW."lifecycleStatus" = 'PASSED' AND NEW."storedFileId" IS NOT NULL)
  ) THEN
    PERFORM 1 FROM "FacilitiesApplication" WHERE "id" = binding_record."applicationId" FOR UPDATE;
    SELECT COALESCE(SUM(u."reservedByteSize"), 0) INTO existing_reserved
    FROM "FacilitiesFileUpload" u
    JOIN "FacilitiesFileBinding" b ON b."id" = u."bindingId"
    WHERE b."applicationId" = binding_record."applicationId"
      AND u."id" <> NEW."id" AND u."id" IS DISTINCT FROM NEW."replacesUploadId"
      AND (u."lifecycleStatus" = 'PENDING' OR (u."lifecycleStatus" = 'PASSED' AND u."storedFileId" IS NOT NULL));
    IF existing_reserved + NEW."reservedByteSize" > 157286400 THEN
      RAISE EXCEPTION 'facilities application file quota exceeds 150 MiB';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesFileUpload_integrity" BEFORE INSERT OR UPDATE ON "FacilitiesFileUpload" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_file_upload_integrity();

CREATE FUNCTION enforce_facilities_file_binding_current_upload() RETURNS trigger AS $$
BEGIN
  IF NEW."currentUploadId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "FacilitiesFileUpload" u
    WHERE u."id" = NEW."currentUploadId" AND u."bindingId" = NEW."id" AND u."lifecycleStatus" = 'PASSED'
  ) THEN
    RAISE EXCEPTION 'current facilities file upload must be a passed revision of this binding';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesFileBinding_current_upload_integrity" BEFORE INSERT OR UPDATE OF "currentUploadId" ON "FacilitiesFileBinding" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_file_binding_current_upload();

CREATE FUNCTION enforce_facilities_file_deletion_tombstone_integrity() RETURNS trigger AS $$
DECLARE upload_record "FacilitiesFileUpload"%ROWTYPE;
BEGIN
  SELECT * INTO upload_record FROM "FacilitiesFileUpload" WHERE "id" = NEW."uploadId";
  IF NOT FOUND OR (NEW."status" <> 'SUCCEEDED' AND upload_record."storedFileId" IS NULL) THEN
    RAISE EXCEPTION 'facilities file deletion tombstone requires stored content';
  END IF;
  IF upload_record."lifecycleStatus" = 'PASSED' AND NOT EXISTS (
    SELECT 1 FROM "FacilitiesFileUpload" successor
    JOIN "FacilitiesFileBinding" binding ON binding."id" = successor."bindingId" AND binding."currentUploadId" = successor."id"
    WHERE successor."replacesUploadId" = upload_record."id" AND successor."lifecycleStatus" = 'PASSED'
  ) THEN
    RAISE EXCEPTION 'passed facilities file content may be deleted only after a passed replacement is current';
  END IF;
  IF NEW."status" = 'RETRY_REQUIRED' AND NEW."lastError" IS NULL THEN
    RAISE EXCEPTION 'retryable facilities file deletion requires a safe failure reason';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'SUCCEEDED' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'completed facilities file deletion tombstone is immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesFileDeletionTombstone_integrity" BEFORE INSERT OR UPDATE ON "FacilitiesFileDeletionTombstone" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_file_deletion_tombstone_integrity();

-- StoredFile is immutable once it is committed to any M2 revision as well as
-- once it is referenced by an M1 evidence relation.
CREATE OR REPLACE FUNCTION prevent_referenced_stored_file_mutation() RETURNS trigger AS $$
BEGIN
  IF (NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW."originalName" IS DISTINCT FROM OLD."originalName" OR NEW."fileType" IS DISTINCT FROM OLD."fileType" OR NEW."detectedMimeType" IS DISTINCT FROM OLD."detectedMimeType" OR NEW."byteSize" IS DISTINCT FROM OLD."byteSize" OR NEW."sha256" IS DISTINCT FROM OLD."sha256") AND (
    EXISTS (SELECT 1 FROM "CompanyProfileDocument" d WHERE d."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "QuestionnaireTemplateVersion" t WHERE t."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesApplicationDocument" d WHERE d."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesYearDocument" d WHERE d."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesHumanResources" h WHERE h."insuranceFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesTrialBalance" b WHERE b."generalLedgerFileId" = OLD."id" OR b."subsidiaryLedgerFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesCreditReport" r WHERE r."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesFileUpload" u WHERE u."storedFileId" = OLD."id")
  ) THEN RAISE EXCEPTION 'referenced stored file identity is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Extend the M1 safe audit metadata allow-list only with lifecycle identifiers.
-- Names, hashes, opaque storage keys and scanner details remain disallowed.
CREATE OR REPLACE FUNCTION validate_facilities_audit_metadata() RETURNS trigger AS $$
DECLARE forbidden_key TEXT;
BEGIN
  IF jsonb_typeof(NEW."metadata") <> 'object' OR octet_length(NEW."metadata"::text) > 4096 THEN
    RAISE EXCEPTION 'FacilitiesAuditLog metadata must be a small object';
  END IF;
  SELECT key INTO forbidden_key FROM jsonb_object_keys(NEW."metadata") AS key
    WHERE key <> ALL (ARRAY['reasonCode', 'fieldKeys', 'documentKind', 'fileId', 'uploadId', 'revisionId', 'intakeId', 'supplierId', 'templateVersionId', 'paymentAttemptId', 'correctionRequestId', 'previousStatus', 'newStatus', 'status', 'changedFields']) LIMIT 1;
  IF forbidden_key IS NOT NULL THEN RAISE EXCEPTION 'FacilitiesAuditLog metadata key % is not permitted', forbidden_key; END IF;
  IF NEW."metadata" ? 'reasonCode' AND (jsonb_typeof(NEW."metadata"->'reasonCode') <> 'string' OR NEW."metadata"->>'reasonCode' !~ '^[A-Z0-9_.-]{1,100}$') THEN
    RAISE EXCEPTION 'FacilitiesAuditLog reasonCode is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('fileId', 'uploadId', 'revisionId', 'intakeId', 'supplierId', 'templateVersionId', 'paymentAttemptId', 'correctionRequestId')
      AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' !~ '^[A-Za-z0-9_-]{1,64}$')
  ) THEN RAISE EXCEPTION 'FacilitiesAuditLog identifier metadata is invalid'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('previousStatus', 'newStatus', 'status')
      AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' NOT IN ('DRAFT', 'PENDING_PAYMENT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_EDIT', 'VALIDATION_COMPLETED'))
  ) THEN RAISE EXCEPTION 'FacilitiesAuditLog status metadata is invalid'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('fieldKeys', 'changedFields')
      AND (jsonb_typeof(item.value) <> 'array' OR jsonb_array_length(item.value) > 50
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(item.value) AS value_text WHERE value_text !~ '^[A-Za-z0-9_.-]{1,100}$'))
  ) THEN RAISE EXCEPTION 'FacilitiesAuditLog field metadata is invalid'; END IF;
  IF NEW."metadata" ? 'documentKind' AND (jsonb_typeof(NEW."metadata"->'documentKind') <> 'string' OR NEW."metadata"->>'documentKind' !~ '^[A-Z_]{1,100}$') THEN
    RAISE EXCEPTION 'FacilitiesAuditLog documentKind is invalid';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
