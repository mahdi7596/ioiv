-- AUDIT ONLY: successful execution confirms the existing replacement defect.
-- Run only against an isolated migrated database. All fixture writes roll back.
-- Fixture prefix reused from prisma/tests/facilities-private-files.integration.sql.
-- Focused M2 persistence checks. Run only against an isolated database after
-- migrations and seed data. Every fixture is rolled back.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User" ("id", "mobile", "updatedAt") VALUES
  ('m2-file-user', '09900000011', CURRENT_TIMESTAMP),
  ('m2-file-other-user', '09900000012', CURRENT_TIMESTAMP);
INSERT INTO "Company" ("id", "userId", "updatedAt") VALUES
  ('m2-file-company', 'm2-file-user', CURRENT_TIMESTAMP);
INSERT INTO "Admin" ("id", "name", "mobile", "role", "updatedAt") VALUES
  ('m2-file-admin', 'M2 file integration admin', '09900000013', 'SUPER_ADMIN', CURRENT_TIMESTAMP);
INSERT INTO "StoredFile" ("id", "storageKey", "originalName", "fileType", "detectedMimeType", "byteSize", "sha256", "scanStatus", "scannedAt") VALUES
  ('m2-file-template', 'm2-private-template', 'template.docx', 'DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1, repeat('a', 64), 'PASSED', CURRENT_TIMESTAMP),
  ('m2-file-passed-25m', 'm2-private-passed-25m', 'safe.pdf', 'PDF', 'application/pdf', 26214400, repeat('b', 64), 'PASSED', CURRENT_TIMESTAMP),
  ('m2-file-passed-25m-replacement', 'm2-private-passed-25m-replacement', 'replacement.pdf', 'PDF', 'application/pdf', 26214400, repeat('c', 64), 'PASSED', CURRENT_TIMESTAMP),
  ('m2-file-pending-1b', 'm2-private-pending-1b', 'pending.pdf', 'PDF', 'application/pdf', 1, repeat('d', 64), 'PENDING', NULL);
INSERT INTO "FacilitySupplier" ("id", "name", "updatedAt") VALUES ('m2-file-supplier', 'M2 file integration supplier', CURRENT_TIMESTAMP);
INSERT INTO "FacilityIntake" ("id", "name", "isEnabled", "updatedAt") VALUES ('m2-file-intake', 'M2 file integration intake', true, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesProgramConfiguration" ("program", "isEnabled", "updatedAt") VALUES ('FACILITIES', true, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileBinding" ("id", "scope", "scopeId", "adminId", "slotKey", "updatedAt") VALUES
  ('m2-template-binding', 'QUESTIONNAIRE_TEMPLATE', 'm2-file-supplier', 'm2-file-admin', 'questionnaire-template-m2', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "storedFileId", "lifecycleStatus", "reservedByteSize", "updatedAt") VALUES
  ('m2-template-upload', 'm2-template-binding', 'm2-template-upload-key', 1, 'm2-file-template', 'PASSED', 1, CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileBinding" SET "currentUploadId" = 'm2-template-upload', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm2-template-binding';
INSERT INTO "QuestionnaireTemplateVersion" ("id", "supplierId", "versionLabel", "storedFileId") VALUES ('m2-file-template-version', 'm2-file-supplier', 'v1', 'm2-file-template');
INSERT INTO "FacilityIntakeSupplier" ("id", "intakeId", "supplierId", "isEnabled", "questionnaireTemplateVersionId", "updatedAt") VALUES ('m2-file-intake-supplier', 'm2-file-intake', 'm2-file-supplier', true, 'm2-file-template-version', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesApplication" (
  "id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId",
  "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "updatedAt"
) VALUES ('m2-file-application', 'm2-file-user', 'm2-file-company', 'm2-file-intake', 'm2-file-intake-supplier', 'm2-file-template-version', 'FIXED_CAPITAL', 0, 500000000000, true, 3000000, CURRENT_TIMESTAMP);

INSERT INTO "FacilitiesFileBinding" ("id", "scope", "scopeId", "userId", "companyId", "applicationId", "slotKey", "updatedAt") VALUES
  ('m2-file-binding-1', 'APPLICATION', 'm2-file-application', 'm2-file-user', 'm2-file-company', 'm2-file-application', 'tax-declaration-1404', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUploadAttempt" ("id", "bindingId", "idempotencyKey", "lifecycleStatus", "failureReason", "updatedAt") VALUES
  ('m2-file-rejected-attempt', 'm2-file-binding-1', 'm2-file-rejected-idempotency-0001', 'DISALLOWED', 'CONTENT_TYPE_MISMATCH', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "reservedByteSize", "updatedAt") VALUES
  ('m2-file-upload-1', 'm2-file-binding-1', 'm2-file-idempotency-0001', 1, 26214400, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUploadAttempt" ("id", "bindingId", "idempotencyKey", "lifecycleStatus", "updatedAt") VALUES
  ('m2-file-pending-attempt', 'm2-file-binding-1', 'm2-file-idempotency-0001', 'PENDING', CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileUploadAttempt" SET "uploadId" = 'm2-file-upload-1', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm2-file-pending-attempt';

DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesFileBinding" ("id", "scope", "scopeId", "userId", "companyId", "applicationId", "slotKey", "updatedAt")
    VALUES ('m2-file-bad-owner', 'APPLICATION', 'm2-file-application', 'm2-file-other-user', 'm2-file-company', 'm2-file-application', 'bad-owner', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'file binding ownership trigger was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%must match application ownership%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "FacilitiesFileUploadAttempt" ("id", "bindingId", "idempotencyKey", "lifecycleStatus", "failureReason", "updatedAt")
    VALUES ('m2-file-rejected-attempt-duplicate', 'm2-file-binding-1', 'm2-file-rejected-idempotency-0001', 'DISALLOWED', 'CONTENT_TYPE_MISMATCH', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'rejected upload-attempt idempotency uniqueness was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "reservedByteSize", "updatedAt")
    VALUES ('m2-file-duplicate-idempotency', 'm2-file-binding-1', 'm2-file-idempotency-0001', 2, 1, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'upload idempotency uniqueness was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE "FacilitiesFileUpload" SET "storedFileId" = 'm2-file-pending-1b', "lifecycleStatus" = 'PASSED' WHERE "id" = 'm2-file-upload-1';
    RAISE EXCEPTION 'pending scanner result was accepted as passed content';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%scanned, size-verified%' THEN RAISE; END IF;
  END;
END $$;

UPDATE "FacilitiesFileUpload" SET "storedFileId" = 'm2-file-passed-25m', "lifecycleStatus" = 'PASSED' WHERE "id" = 'm2-file-upload-1';
UPDATE "FacilitiesFileBinding" SET "currentUploadId" = 'm2-file-upload-1', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm2-file-binding-1';


SAVEPOINT audit_case;
INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "replacesUploadId", "reservedByteSize", "updatedAt") VALUES
 ('audit-failed-replacement', 'm2-file-binding-1', 'audit-replacement-key-0002', 2, 'm2-file-upload-1', 1, CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileUpload" SET "lifecycleStatus" = 'FAILED', "failureReason" = 'SCAN_FAILED' WHERE "id" = 'audit-failed-replacement';
DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "replacesUploadId", "reservedByteSize", "updatedAt")
    SELECT 'audit-retry-replacement', 'm2-file-binding-1', 'audit-replacement-key-0003', MAX("revisionNumber") + 1, 'm2-file-upload-1', 1, CURRENT_TIMESTAMP
    FROM "FacilitiesFileUpload" WHERE "bindingId" = 'm2-file-binding-1';
    RAISE EXCEPTION 'AUDIT: expected defect no longer reproduced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'facilities file replacement requires the preceding passed revision' THEN RAISE; END IF;
    RAISE NOTICE 'REPRODUCED after FAILED: third revision blocked while original passed file remains current: %', SQLERRM;
  END;
END $$;
ROLLBACK TO SAVEPOINT audit_case;

SAVEPOINT audit_case;
INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "replacesUploadId", "reservedByteSize", "updatedAt") VALUES
 ('audit-failed-replacement', 'm2-file-binding-1', 'audit-replacement-key-0002', 2, 'm2-file-upload-1', 1, CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileUpload" SET "lifecycleStatus" = 'UNAVAILABLE', "failureReason" = 'SCANNER_UNAVAILABLE' WHERE "id" = 'audit-failed-replacement';
DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "replacesUploadId", "reservedByteSize", "updatedAt")
    SELECT 'audit-retry-replacement', 'm2-file-binding-1', 'audit-replacement-key-0003', MAX("revisionNumber") + 1, 'm2-file-upload-1', 1, CURRENT_TIMESTAMP
    FROM "FacilitiesFileUpload" WHERE "bindingId" = 'm2-file-binding-1';
    RAISE EXCEPTION 'AUDIT: expected defect no longer reproduced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'facilities file replacement requires the preceding passed revision' THEN RAISE; END IF;
    RAISE NOTICE 'REPRODUCED after UNAVAILABLE: third revision blocked while original passed file remains current: %', SQLERRM;
  END;
END $$;
ROLLBACK TO SAVEPOINT audit_case;

ROLLBACK;
