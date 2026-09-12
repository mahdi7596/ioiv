-- Disposable PostgreSQL integration checks for M1. Apply migrations and run the
-- M1 seed first, then run this file with psql. It rolls all fixture data back.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User" ("id", "mobile", "updatedAt") VALUES
  ('m1-facilities-user', '09900000001', CURRENT_TIMESTAMP),
  ('m1-facilities-other-user', '09900000002', CURRENT_TIMESTAMP);
INSERT INTO "Admin" ("id", "name", "mobile", "role", "updatedAt") VALUES
  ('m1-facilities-admin', 'M1 integration reviewer', '09900000003', 'SUPER_ADMIN', CURRENT_TIMESTAMP);
INSERT INTO "Company" ("id", "userId", "updatedAt") VALUES
  ('m1-facilities-company', 'm1-facilities-user', CURRENT_TIMESTAMP);
INSERT INTO "StoredFile" ("id", "storageKey", "originalName", "fileType", "detectedMimeType", "byteSize", "sha256", "scanStatus", "scannedAt") VALUES
  ('m1-facilities-word', 'm1/test/template.docx', 'template.docx', 'DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1, repeat('a', 64), 'PASSED', CURRENT_TIMESTAMP),
  ('m1-facilities-other-word', 'm1/test/other-template.docx', 'other-template.docx', 'DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1, repeat('c', 64), 'PASSED', CURRENT_TIMESTAMP),
  ('m1-facilities-zip', 'm1/test/document.zip', 'document.zip', 'ZIP', 'application/zip', 1, repeat('b', 64), 'PASSED', CURRENT_TIMESTAMP);
INSERT INTO "FacilitySupplier" ("id", "name", "updatedAt") VALUES
  ('m1-facilities-supplier', 'M1 integration supplier', CURRENT_TIMESTAMP),
  ('m1-facilities-other-supplier', 'M1 integration other supplier', CURRENT_TIMESTAMP);
INSERT INTO "FacilityIntake" ("id", "name", "isEnabled", "updatedAt") VALUES
  ('m1-facilities-intake', 'M1 integration intake', true, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesProgramConfiguration" ("program", "isEnabled", "updatedAt") VALUES
  ('FACILITIES', true, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileBinding" ("id", "scope", "scopeId", "adminId", "slotKey", "updatedAt") VALUES
  ('m1-template-binding', 'QUESTIONNAIRE_TEMPLATE', 'm1-facilities-supplier', 'm1-facilities-admin', 'questionnaire-template-m1', CURRENT_TIMESTAMP),
  ('m1-other-template-binding', 'QUESTIONNAIRE_TEMPLATE', 'm1-facilities-other-supplier', 'm1-facilities-admin', 'questionnaire-template-m1-other', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "storedFileId", "lifecycleStatus", "reservedByteSize", "updatedAt") VALUES
  ('m1-template-upload', 'm1-template-binding', 'm1-template-upload-key', 1, 'm1-facilities-word', 'PASSED', 1, CURRENT_TIMESTAMP),
  ('m1-other-template-upload', 'm1-other-template-binding', 'm1-other-template-key', 1, 'm1-facilities-other-word', 'PASSED', 1, CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileBinding" SET "currentUploadId" = 'm1-template-upload', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm1-template-binding';
UPDATE "FacilitiesFileBinding" SET "currentUploadId" = 'm1-other-template-upload', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm1-other-template-binding';
INSERT INTO "QuestionnaireTemplateVersion" ("id", "supplierId", "versionLabel", "storedFileId") VALUES
  ('m1-facilities-template', 'm1-facilities-supplier', 'v1', 'm1-facilities-word'),
  ('m1-facilities-other-template', 'm1-facilities-other-supplier', 'v1', 'm1-facilities-other-word');
INSERT INTO "FacilityIntakeSupplier" ("id", "intakeId", "supplierId", "isEnabled", "questionnaireTemplateVersionId", "updatedAt") VALUES
  ('m1-facilities-intake-supplier', 'm1-facilities-intake', 'm1-facilities-supplier', true, 'm1-facilities-template', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesApplication" (
  "id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId",
  "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "updatedAt"
) VALUES (
  'm1-facilities-application', 'm1-facilities-user', 'm1-facilities-company', 'm1-facilities-intake', 'm1-facilities-intake-supplier', 'm1-facilities-template',
  'FIXED_CAPITAL', 0, 500000000000, true, 3000000, CURRENT_TIMESTAMP
);

DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesApplication" ("id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId", "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "updatedAt")
    VALUES ('m1-bad-owner', 'm1-facilities-other-user', 'm1-facilities-company', 'm1-facilities-intake', 'm1-facilities-intake-supplier', 'm1-facilities-template', 'FIXED_CAPITAL', 0, 500000000000, true, 3000000, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'ownership trigger was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%must own%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "FacilitiesApplication" ("id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId", "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "updatedAt")
    VALUES ('m1-bad-template', 'm1-facilities-user', 'm1-facilities-company', 'm1-facilities-intake', 'm1-facilities-intake-supplier', 'm1-facilities-other-template', 'FIXED_CAPITAL', 0, 500000000000, true, 3000000, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'supplier/template trigger was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%supplier and questionnaire%' THEN RAISE; END IF;
  END;
END $$;

UPDATE "FacilitiesProgramConfiguration" SET "isEnabled" = false WHERE "program" = 'FACILITIES';
DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesApplication" ("id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId", "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "updatedAt")
    VALUES ('m1-disabled-program', 'm1-facilities-user', 'm1-facilities-company', 'm1-facilities-intake', 'm1-facilities-intake-supplier', 'm1-facilities-template', 'FIXED_CAPITAL', 0, 500000000000, true, 3000000, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'disabled facilities programme was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%supplier and questionnaire%' THEN RAISE; END IF;
  END;
END $$;
UPDATE "FacilitiesProgramConfiguration" SET "isEnabled" = true WHERE "program" = 'FACILITIES';
UPDATE "FacilityIntake" SET "isEnabled" = false WHERE "id" = 'm1-facilities-intake';
DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesApplication" ("id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId", "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "updatedAt")
    VALUES ('m1-disabled-intake', 'm1-facilities-user', 'm1-facilities-company', 'm1-facilities-intake', 'm1-facilities-intake-supplier', 'm1-facilities-template', 'FIXED_CAPITAL', 0, 500000000000, true, 3000000, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'disabled intake was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%supplier and questionnaire%' THEN RAISE; END IF;
  END;
END $$;
UPDATE "FacilityIntake" SET "isEnabled" = true WHERE "id" = 'm1-facilities-intake';

INSERT INTO "CompanyOfficer" ("id", "companyId", "fullName", "position", "isChiefExecutive", "updatedAt") VALUES
  ('m1-facilities-ceo', 'm1-facilities-company', 'CEO', 'مدیرعامل', true, CURRENT_TIMESTAMP);
DO $$ BEGIN
  BEGIN
    INSERT INTO "CompanyOfficer" ("id", "companyId", "fullName", "position", "isChiefExecutive", "updatedAt") VALUES
      ('m1-facilities-second-ceo', 'm1-facilities-company', 'Second CEO', 'مدیرعامل', true, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'CEO partial unique index was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FacilitiesYearDocument" ("id", "applicationId", "kind", "year", "storedFileId") VALUES
      ('m1-bad-vat', 'm1-facilities-application', 'VAT_DECLARATION', 1401, 'm1-facilities-zip');
    RAISE EXCEPTION 'VAT year trigger was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%VAT declaration year%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "FacilitiesApplicationDocument" ("id", "applicationId", "kind", "storedFileId") VALUES
      ('m1-bad-questionnaire', 'm1-facilities-application', 'COMPLETED_QUESTIONNAIRE', 'm1-facilities-zip');
    RAISE EXCEPTION 'questionnaire file-type trigger was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%completed questionnaire%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO "FacilitiesPaymentAttempt" ("id", "applicationId", "amountToman", "gateway", "authority", "referenceId", "status", "updatedAt") VALUES
  ('m1-facilities-payment', 'm1-facilities-application', 3000000, 'test', 'm1-authority', 'm1-reference', 'VERIFIED', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesAuditLog" ("id", "actorType", "action", "entityType", "metadata") VALUES
  ('m1-facilities-audit', 'SYSTEM', 'APPLICATION_CREATED', 'FacilitiesApplication', '{"status":"DRAFT"}');
INSERT INTO "FacilitiesStatusHistory" ("id", "applicationId", "newStatus", "actorType") VALUES
  ('m1-facilities-history', 'm1-facilities-application', 'DRAFT', 'SYSTEM');
DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesPaymentAttempt" ("id", "applicationId", "amountToman", "gateway", "authority", "referenceId", "status", "updatedAt") VALUES
      ('m1-facilities-second-payment', 'm1-facilities-application', 3000000, 'test', 'm1-second-authority', 'm1-second-reference', 'VERIFIED', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'verified-payment partial unique index was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE "FacilitiesAuditLog" SET "entityType" = 'changed' WHERE "id" = 'm1-facilities-audit';
    RAISE EXCEPTION 'append-only audit trigger was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "FacilitiesAuditLog" ("id", "actorType", "action", "entityType", "metadata") VALUES
      ('m1-facilities-audit-bad-metadata', 'SYSTEM', 'APPLICATION_CREATED', 'FacilitiesApplication', '{"documentContent":"forbidden"}');
    RAISE EXCEPTION 'audit metadata allow-list was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%not permitted%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "FacilitiesAuditLog" ("id", "actorType", "action", "entityType", "metadata") VALUES
      ('m1-facilities-audit-sensitive-reason', 'SYSTEM', 'APPLICATION_CREATED', 'FacilitiesApplication', '{"reasonCode":"this contains document contents"}');
    RAISE EXCEPTION 'audit reason-code validation was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%reasonCode%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE "FacilitiesStatusHistory" SET "note" = 'changed' WHERE "id" = 'm1-facilities-history';
    RAISE EXCEPTION 'append-only status-history trigger was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE "Company" SET "userId" = 'm1-facilities-other-user' WHERE "id" = 'm1-facilities-company';
    RAISE EXCEPTION 'referenced company ownership was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ownership cannot change%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE "QuestionnaireTemplateVersion" SET "versionLabel" = 'changed' WHERE "id" = 'm1-facilities-template';
    RAISE EXCEPTION 'referenced questionnaire template was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%immutable%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
