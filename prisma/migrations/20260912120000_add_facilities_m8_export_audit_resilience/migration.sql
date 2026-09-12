ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'EXPORT_SUCCEEDED';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'EXPORT_FAILED';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'AUDIT_VIEWED';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'FILE_DOWNLOADED';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_DOWNLOADED';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'RECONCILIATION_COMPLETED';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'QUARANTINE_EXPIRED';

CREATE INDEX IF NOT EXISTS "FacilitiesApplication_createdAt_id_idx" ON "FacilitiesApplication"("createdAt", "id");
CREATE INDEX IF NOT EXISTS "FacilitiesApplication_status_createdAt_id_idx" ON "FacilitiesApplication"("status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "FacilitiesApplication_intakeId_createdAt_id_idx" ON "FacilitiesApplication"("intakeId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "FacilitiesApplication_intakeSupplierId_createdAt_id_idx" ON "FacilitiesApplication"("intakeSupplierId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "FacilitiesAuditLog_createdAt_id_idx" ON "FacilitiesAuditLog"("createdAt", "id");
CREATE INDEX IF NOT EXISTS "FacilitiesAuditLog_action_outcome_createdAt_id_idx" ON "FacilitiesAuditLog"("action", "outcome", "createdAt", "id");

-- M8 reconciliation may terminally expire an UNAVAILABLE upload after the
-- approved 24-hour retry window. Preserve every M2 integrity rule while
-- allowing only that additional lifecycle transition.
CREATE OR REPLACE FUNCTION enforce_facilities_file_upload_integrity() RETURNS trigger AS $$
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
      AND NOT (OLD."lifecycleStatus" = 'UNAVAILABLE' AND NEW."lifecycleStatus" IN ('PENDING', 'FAILED'))
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

CREATE OR REPLACE FUNCTION validate_facilities_audit_metadata() RETURNS trigger AS $$
DECLARE forbidden_key TEXT;
BEGIN
  IF jsonb_typeof(NEW."metadata") <> 'object' OR octet_length(NEW."metadata"::text) > 4096 THEN
    RAISE EXCEPTION 'FacilitiesAuditLog metadata must be a small object';
  END IF;
  SELECT key INTO forbidden_key FROM jsonb_object_keys(NEW."metadata") AS key
    WHERE key <> ALL (ARRAY['reasonCode','fieldKeys','documentKind','fileId','uploadId','revisionId','intakeId','supplierId','templateVersionId','paymentAttemptId','correctionRequestId','previousStatus','newStatus','status','changedFields','filterKeys','recordCount','sheetRowCount','retentionHours']) LIMIT 1;
  IF forbidden_key IS NOT NULL THEN RAISE EXCEPTION 'FacilitiesAuditLog metadata key % is not permitted', forbidden_key; END IF;
  IF NEW."metadata" ? 'reasonCode' AND (jsonb_typeof(NEW."metadata"->'reasonCode') <> 'string' OR NEW."metadata"->>'reasonCode' !~ '^[A-Z0-9_.-]{1,100}$') THEN RAISE EXCEPTION 'FacilitiesAuditLog reasonCode is invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW."metadata") item WHERE item.key IN ('fileId','uploadId','revisionId','intakeId','supplierId','templateVersionId','paymentAttemptId','correctionRequestId') AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' !~ '^[A-Za-z0-9_-]{1,64}$')) THEN RAISE EXCEPTION 'FacilitiesAuditLog identifier metadata is invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW."metadata") item WHERE item.key IN ('previousStatus','newStatus','status') AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' NOT IN ('DRAFT','PENDING_PAYMENT','SUBMITTED','UNDER_REVIEW','NEEDS_EDIT','VALIDATION_COMPLETED'))) THEN RAISE EXCEPTION 'FacilitiesAuditLog status metadata is invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW."metadata") item WHERE item.key IN ('fieldKeys','changedFields','filterKeys') AND (jsonb_typeof(item.value) <> 'array' OR jsonb_array_length(item.value) > 50 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(item.value) value_text WHERE value_text !~ '^[A-Za-z0-9_.-]{1,100}$'))) THEN RAISE EXCEPTION 'FacilitiesAuditLog field metadata is invalid'; END IF;
  IF NEW."metadata" ? 'documentKind' AND (jsonb_typeof(NEW."metadata"->'documentKind') <> 'string' OR NEW."metadata"->>'documentKind' !~ '^[A-Z_]{1,100}$') THEN RAISE EXCEPTION 'FacilitiesAuditLog documentKind is invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW."metadata") item WHERE item.key IN ('recordCount','sheetRowCount','retentionHours') AND (jsonb_typeof(item.value) <> 'number' OR (item.value #>> '{}')::numeric < 0 OR (item.value #>> '{}')::numeric > 1000000)) THEN RAISE EXCEPTION 'FacilitiesAuditLog count metadata is invalid'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
