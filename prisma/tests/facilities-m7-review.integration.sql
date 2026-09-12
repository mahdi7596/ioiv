\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User" ("id", "mobile", "updatedAt") VALUES ('m7-user', '09900000071', CURRENT_TIMESTAMP);
INSERT INTO "Company" ("id", "userId", "updatedAt") VALUES ('m7-company', 'm7-user', CURRENT_TIMESTAMP);
INSERT INTO "FacilitySupplier" ("id", "name", "updatedAt") VALUES ('m7-supplier', 'M7 review supplier', CURRENT_TIMESTAMP);
INSERT INTO "FacilityIntake" ("id", "name", "isEnabled", "maximumAmountRial", "paymentEnabled", "paymentAmountToman", "updatedAt") VALUES ('m7-intake', 'M7 review intake', true, 500000000000, true, 3000000, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesProgramConfiguration" ("program", "isEnabled", "updatedAt") VALUES ('FACILITIES', true, CURRENT_TIMESTAMP);
INSERT INTO "Admin" ("id", "name", "mobile", "role", "updatedAt") VALUES ('m7-admin', 'M7 Reviewer', '09900000072', 'SUPER_ADMIN', CURRENT_TIMESTAMP);
INSERT INTO "StoredFile" ("id", "storageKey", "originalName", "fileType", "detectedMimeType", "byteSize", "sha256", "scanStatus", "scannedAt") VALUES ('m7-template-file', 'm7-template', 'template.docx', 'DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1, repeat('a', 64), 'PASSED', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileBinding" ("id", "scope", "scopeId", "adminId", "slotKey", "updatedAt") VALUES ('m7-template-binding', 'QUESTIONNAIRE_TEMPLATE', 'm7-supplier', 'm7-admin', 'questionnaire-template-m7', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesFileUpload" ("id", "bindingId", "idempotencyKey", "revisionNumber", "storedFileId", "lifecycleStatus", "reservedByteSize", "updatedAt") VALUES ('m7-template-upload', 'm7-template-binding', 'm7-template-upload-key', 1, 'm7-template-file', 'PASSED', 1, CURRENT_TIMESTAMP);
UPDATE "FacilitiesFileBinding" SET "currentUploadId" = 'm7-template-upload', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm7-template-binding';
INSERT INTO "QuestionnaireTemplateVersion" ("id", "supplierId", "versionLabel", "storedFileId", "publishedAt") VALUES ('m7-template', 'm7-supplier', 'v1', 'm7-template-file', CURRENT_TIMESTAMP);
INSERT INTO "FacilityIntakeSupplier" ("id", "intakeId", "supplierId", "isEnabled", "questionnaireTemplateVersionId", "updatedAt") VALUES ('m7-intake-supplier', 'm7-intake', 'm7-supplier', true, 'm7-template', CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesApplication" ("id", "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId", "facilityType", "requestedAmountRial", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot", "status", "submittedAt", "updatedAt") VALUES ('m7-application', 'm7-user', 'm7-company', 'm7-intake', 'm7-intake-supplier', 'm7-template', 'FIXED_CAPITAL', 1000, 500000000000, true, 3000000, 'SUBMITTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "FacilitiesPaymentAttempt" ("id", "applicationId", "idempotencyKey", "amountToman", "gateway", "authority", "referenceId", "status", "updatedAt") VALUES ('m7-payment', 'm7-application', 'm7-payment-key', 3000000, 'test', 'm7-authority', 'm7-reference', 'VERIFIED', CURRENT_TIMESTAMP);

UPDATE "FacilitiesApplication" SET "status" = 'UNDER_REVIEW', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm7-application';
INSERT INTO "FacilitiesCorrectionRequest" ("id", "applicationId", "sequence", "reviewerId", "note") VALUES ('m7-correction-1', 'm7-application', 1, 'm7-admin', 'مدارک مالی را اصلاح کنید');
UPDATE "FacilitiesApplication" SET "status" = 'NEEDS_EDIT', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm7-application';

DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesCorrectionRequest" ("id", "applicationId", "sequence", "reviewerId", "note") VALUES ('m7-correction-duplicate', 'm7-application', 2, 'm7-admin', 'درخواست همزمان');
    RAISE EXCEPTION 'one-open-correction constraint was not enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE "FacilitiesCorrectionRequest" SET "smsStatus" = 'SENT' WHERE "id" = 'm7-correction-1';
    RAISE EXCEPTION 'SMS state coherence was not enforced';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FacilitiesCorrectionRequest" ("id", "applicationId", "sequence", "reviewerId", "note") VALUES ('m7-empty-note', 'm7-application', 2, 'm7-admin', '   ');
    RAISE EXCEPTION 'correction note constraint was not enforced';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

UPDATE "FacilitiesCorrectionRequest" SET "smsStatus" = 'FAILED', "smsAttemptCount" = 1, "smsLastAttemptAt" = CURRENT_TIMESTAMP, "smsFailureCode" = 'PROVIDER_ERROR' WHERE "id" = 'm7-correction-1';
UPDATE "FacilitiesCorrectionRequest" SET "smsStatus" = 'SENT', "smsAttemptCount" = 2, "smsLastAttemptAt" = CURRENT_TIMESTAMP, "smsSentAt" = CURRENT_TIMESTAMP, "smsFailureCode" = NULL WHERE "id" = 'm7-correction-1';
UPDATE "FacilitiesCorrectionRequest" SET "resolvedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm7-correction-1';
UPDATE "FacilitiesApplication" SET "status" = 'SUBMITTED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm7-application';
UPDATE "FacilitiesApplication" SET "status" = 'UNDER_REVIEW', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'm7-application';
DO $$ BEGIN
  BEGIN
    INSERT INTO "FacilitiesCorrectionRequest" ("id", "applicationId", "sequence", "reviewerId", "note") VALUES ('m7-persian-range-note', 'm7-application', 2, 'm7-admin', 'پ');
    RAISE EXCEPTION 'ROLLBACK_PERSIAN_RANGE_PROBE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_PERSIAN_RANGE_PROBE' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "FacilitiesCorrectionRequest" ("id", "applicationId", "sequence", "reviewerId", "note") VALUES ('m7-english-note', 'm7-application', 2, 'm7-admin', 'replace the document');
    RAISE EXCEPTION 'Persian correction-note constraint was not enforced';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
INSERT INTO "FacilitiesCorrectionRequest" ("id", "applicationId", "sequence", "reviewerId", "note") VALUES ('m7-correction-2', 'm7-application', 2, 'm7-admin', 'اصلاح دوم');

ROLLBACK;
