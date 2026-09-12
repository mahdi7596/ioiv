BEGIN;

DO $$
DECLARE missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count FROM unnest(ARRAY['EXPORT_SUCCEEDED','EXPORT_FAILED','AUDIT_VIEWED','FILE_DOWNLOADED','QUESTIONNAIRE_DOWNLOADED','RECONCILIATION_COMPLETED','QUARANTINE_EXPIRED']) expected(value)
  WHERE NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'FacilitiesAuditAction' AND e.enumlabel = expected.value);
  IF missing_count <> 0 THEN RAISE EXCEPTION 'M8 audit enum values missing'; END IF;
END $$;

DO $$
DECLARE missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count FROM unnest(ARRAY['FacilitiesApplication_createdAt_id_idx','FacilitiesApplication_status_createdAt_id_idx','FacilitiesApplication_intakeId_createdAt_id_idx','FacilitiesApplication_intakeSupplierId_createdAt_id_idx','FacilitiesAuditLog_createdAt_id_idx','FacilitiesAuditLog_action_outcome_createdAt_id_idx']) expected(value)
  WHERE to_regclass('public."' || expected.value || '"') IS NULL;
  IF missing_count <> 0 THEN RAISE EXCEPTION 'M8 indexes missing'; END IF;
END $$;

DO $$
BEGIN
  IF position(
    'NEW."lifecycleStatus" IN (''PENDING'', ''FAILED'')'
    IN pg_get_functiondef('enforce_facilities_file_upload_integrity'::regproc)
  ) = 0 THEN
    RAISE EXCEPTION 'M8 unavailable upload expiry transition is missing';
  END IF;
END $$;

INSERT INTO "FacilitiesAuditLog" ("id","actorType","action","entityType","entityId","metadata","requestId")
VALUES ('m8-audit-valid','SYSTEM','RECONCILIATION_COMPLETED','FacilitiesFileReconciliation','m8-run','{"recordCount":2,"retentionHours":24,"filterKeys":["status"]}','00000000-0000-4000-8000-000000000008');

DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesAuditLog" ("id","actorType","action","entityType","metadata") VALUES ('m8-audit-unsafe','SYSTEM','EXPORT_FAILED','FacilitiesExport','{"storageKey":"private/path"}');
    RAISE EXCEPTION 'unsafe audit metadata was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'unsafe audit metadata was accepted' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    UPDATE "FacilitiesAuditLog" SET "entityType" = 'mutated' WHERE "id" = 'm8-audit-valid';
    RAISE EXCEPTION 'audit mutation was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'audit mutation was accepted' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
