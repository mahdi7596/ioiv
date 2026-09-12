-- A later M4 replacement of this function accidentally omitted the original
-- reason/status/document-kind guards. Restore the complete safe metadata contract.
CREATE OR REPLACE FUNCTION validate_facilities_audit_metadata() RETURNS trigger AS $$
DECLARE forbidden_key TEXT;
BEGIN
  IF jsonb_typeof(NEW."metadata") <> 'object' OR octet_length(NEW."metadata"::text) > 4096 THEN
    RAISE EXCEPTION 'FacilitiesAuditLog metadata must be a small object';
  END IF;

  SELECT key INTO forbidden_key FROM jsonb_object_keys(NEW."metadata") AS key
    WHERE key <> ALL (ARRAY['reasonCode', 'fieldKeys', 'documentKind', 'fileId', 'uploadId', 'revisionId', 'intakeId', 'supplierId', 'templateVersionId', 'paymentAttemptId', 'correctionRequestId', 'previousStatus', 'newStatus', 'status', 'changedFields'])
    LIMIT 1;
  IF forbidden_key IS NOT NULL THEN
    RAISE EXCEPTION 'FacilitiesAuditLog metadata key % is not permitted', forbidden_key;
  END IF;

  IF NEW."metadata" ? 'reasonCode' AND (
    jsonb_typeof(NEW."metadata"->'reasonCode') <> 'string'
    OR NEW."metadata"->>'reasonCode' !~ '^[A-Z0-9_.-]{1,100}$'
  ) THEN
    RAISE EXCEPTION 'FacilitiesAuditLog reasonCode is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('fileId', 'uploadId', 'revisionId', 'intakeId', 'supplierId', 'templateVersionId', 'paymentAttemptId', 'correctionRequestId')
      AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' !~ '^[A-Za-z0-9_-]{1,64}$')
  ) THEN
    RAISE EXCEPTION 'FacilitiesAuditLog identifier metadata is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('previousStatus', 'newStatus', 'status')
      AND (
        jsonb_typeof(item.value) <> 'string'
        OR item.value #>> '{}' NOT IN ('DRAFT', 'PENDING_PAYMENT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_EDIT', 'VALIDATION_COMPLETED')
      )
  ) THEN
    RAISE EXCEPTION 'FacilitiesAuditLog status metadata is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('fieldKeys', 'changedFields')
      AND (
        jsonb_typeof(item.value) <> 'array'
        OR jsonb_array_length(item.value) > 50
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(item.value) AS value_text
          WHERE value_text !~ '^[A-Za-z0-9_.-]{1,100}$'
        )
      )
  ) THEN
    RAISE EXCEPTION 'FacilitiesAuditLog field metadata is invalid';
  END IF;

  IF NEW."metadata" ? 'documentKind' AND (
    jsonb_typeof(NEW."metadata"->'documentKind') <> 'string'
    OR NEW."metadata"->>'documentKind' !~ '^[A-Z_]{1,100}$'
  ) THEN
    RAISE EXCEPTION 'FacilitiesAuditLog documentKind is invalid';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
