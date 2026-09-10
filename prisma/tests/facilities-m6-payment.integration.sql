\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User" ("id", "mobile", "updatedAt") VALUES ('m6-payment-user', '09900000061', CURRENT_TIMESTAMP);
INSERT INTO "Company" ("id", "userId", "updatedAt") VALUES ('m6-payment-company', 'm6-payment-user', CURRENT_TIMESTAMP);
INSERT INTO "FacilitySupplier" ("id", "name", "updatedAt") VALUES ('m6-payment-supplier', 'M6 payment test supplier', CURRENT_TIMESTAMP);
INSERT INTO "FacilityIntake" ("id", "name", "isEnabled", "maximumAmountRial", "paymentEnabled", "paymentAmountToman", "updatedAt") VALUES ('m6-payment-intake', 'M6 payment test intake', true, 500000000000, true, 3000000, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesProgramConfiguration" ("program", "isEnabled", "updatedAt") VALUES ('FACILITIES', true, CURRENT_TIMESTAMP);
INSERT INTO "Admin" ("id", "name", "mobile", "role", "updatedAt") VALUES ('m6-payment-admin', 'M6 Admin', '09900000062', 'SUPER_ADMIN', CURRENT_TIMESTAMP);
INSERT INTO "StoredFile" ("id", "storageKey", "originalName", "fileType", "detectedMimeType", "byteSize", "sha256", "scanStatus", "scannedAt") VALUES ('m6-payment-template-file', 'm6-payment-template', 'template.docx', 'DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1, repeat('a', 64), 'PASSED', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileBinding" ("id", "scope", "scopeId", "adminId", "slotKey", "updatedAt") VALUES ('m6-payment-template-binding', 'QUESTIONNAIRE_TEMPLATE', 'm6-payment-supplier', 'm6-payment-admin', 'questionnaire-template-m6', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "storedFileId", "lifecycleStatus", "reservedByteSize", "updatedAt") VALUES ('m6-payment-template-upload', 'm6-payment-template-binding', 'm6-payment-template-upload-key', 1, 'm6-payment-template-file', 'PASSED', 1, CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileBinding" SET "currentUploadId" = 'm6-payment-template-upload', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm6-payment-template-binding';
INSERT INTO "QuestionnaireTemplateVersion" ("id", "supplierId", "versionLabel", "storedFileId", "publishedAt") VALUES ('m6-payment-template', 'm6-payment-supplier', 'v1', 'm6-payment-template-file', CURRENT_TIMESTAMP);
INSERT INTO "FacilityIntakeSupplier" ("id", "intakeId", "supplierId", "isEnabled", "questionnaireTemplateVersionId", "updatedAt") VALUES ('m6-payment-intake-supplier', 'm6-payment-intake', 'm6-payment-supplier', true, 'm6-payment-template', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesApplication" ("id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId", "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "updatedAt") VALUES ('m6-payment-application', 'm6-payment-user', 'm6-payment-company', 'm6-payment-intake', 'm6-payment-intake-supplier', 'm6-payment-template', 'FIXED_CAPITAL', 0, 500000000000, true, 3000000, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesPaymentAttempt" ("id", "applicationId", "idempotencyKey", "amountToman", "gateway", "status", "updatedAt") VALUES ('m6-payment-attempt', 'm6-payment-application', 'm6-payment-idempotency', 3000000, 'test', 'INITIATED', CURRENT_TIMESTAMP);

DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesPaymentAttempt" ("id", "applicationId", "idempotencyKey", "amountToman", "gateway", "status", "updatedAt") VALUES ('m6-payment-duplicate-active', 'm6-payment-application', 'm6-payment-duplicate', 3000000, 'test', 'INITIATED', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'active payment uniqueness was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

UPDATE "FacilitiesApplication" SET "status" = 'PENDING_PAYMENT', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm6-payment-application';
UPDATE "FacilitiesPaymentAttempt" SET "authority" = 'm6-authority', "status" = 'REDIRECT_READY', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm6-payment-attempt';
UPDATE "FacilitiesPaymentAttempt" SET "status" = 'PENDING', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm6-payment-attempt';
UPDATE "FacilitiesPaymentAttempt" SET "referenceId" = 'm6-reference', "status" = 'VERIFIED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm6-payment-attempt';
UPDATE "FacilitiesApplication" SET "status" = 'SUBMITTED', "submittedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm6-payment-application';

DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesPaymentAttempt" ("id", "applicationId", "idempotencyKey", "amountToman", "gateway", "status", "updatedAt", "authority", "referenceId") VALUES ('m6-payment-duplicate-verified', 'm6-payment-application', 'm6-payment-duplicate-verified', 3000000, 'test', 'VERIFIED', CURRENT_TIMESTAMP, 'm6-authority-2', 'm6-reference-2');
    RAISE EXCEPTION 'verified payment uniqueness was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE "FacilitiesApplication" SET "status" = 'DRAFT' WHERE "id" = 'm6-payment-application';
    RAISE EXCEPTION 'illegal facilities application transition was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid facilities application status transition%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE "FacilitiesPaymentAttempt" SET "referenceId" = 'changed' WHERE "id" = 'm6-payment-attempt';
    RAISE EXCEPTION 'verified facilities payment immutability was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%verified facilities payment is immutable%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "FacilitiesPaymentAttempt" ("id", "applicationId", "idempotencyKey", "amountToman", "gateway", "status", "updatedAt") VALUES ('m6-payment-bad-amount', 'm6-payment-application', 'm6-payment-bad-amount', 1, 'test', 'INITIATED', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'pinned payment amount was not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%pinned application amount%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
