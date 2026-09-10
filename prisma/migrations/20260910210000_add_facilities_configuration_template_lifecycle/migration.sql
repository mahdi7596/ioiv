-- M4 configuration keeps questionnaire templates in the existing private-file
-- lifecycle, but gives them a SUPER_ADMIN-owned immutable scope. No legacy
-- table or applicant-facing workflow is changed.
ALTER TYPE "FacilitiesFileBindingScope" ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_TEMPLATE';
ALTER TYPE "FacilitiesAuditAction" ADD VALUE IF NOT EXISTS 'PROGRAMME_CONFIGURED';

ALTER TABLE "FacilitiesFileBinding" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "FacilitiesFileBinding" ALTER COLUMN "companyId" DROP NOT NULL;
ALTER TABLE "FacilitiesFileBinding" ADD COLUMN "adminId" TEXT;
ALTER TABLE "FacilitiesFileBinding" ADD CONSTRAINT "FacilitiesFileBinding_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FacilitiesFileBinding_adminId_idx" ON "FacilitiesFileBinding"("adminId");

CREATE OR REPLACE FUNCTION enforce_facilities_file_binding_integrity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."scope" IS DISTINCT FROM OLD."scope" OR NEW."scopeId" IS DISTINCT FROM OLD."scopeId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."adminId" IS DISTINCT FROM OLD."adminId" OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId" OR NEW."slotKey" IS DISTINCT FROM OLD."slotKey"
  ) THEN RAISE EXCEPTION 'facilities file binding scope is immutable'; END IF;
  IF NEW."scope" = 'COMPANY_PROFILE' THEN
    IF NEW."adminId" IS NOT NULL OR NEW."userId" IS NULL OR NEW."companyId" IS NULL OR NEW."applicationId" IS NOT NULL OR NEW."scopeId" <> NEW."companyId" THEN RAISE EXCEPTION 'company-profile binding ownership is invalid'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "Company" c WHERE c."id" = NEW."companyId" AND c."userId" = NEW."userId") THEN RAISE EXCEPTION 'facilities file binding user must own the selected company'; END IF;
  ELSIF NEW."scope" = 'APPLICATION' THEN
    IF NEW."adminId" IS NOT NULL OR NEW."userId" IS NULL OR NEW."companyId" IS NULL OR NEW."applicationId" IS NULL OR NEW."scopeId" <> NEW."applicationId" THEN RAISE EXCEPTION 'application binding ownership is invalid'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "FacilitiesApplication" a WHERE a."id" = NEW."applicationId" AND a."companyId" = NEW."companyId" AND a."userId" = NEW."userId") THEN RAISE EXCEPTION 'facilities file binding must match application ownership'; END IF;
  ELSIF NEW."scope" = 'QUESTIONNAIRE_TEMPLATE' THEN
    IF NEW."adminId" IS NULL OR NEW."userId" IS NOT NULL OR NEW."companyId" IS NOT NULL OR NEW."applicationId" IS NOT NULL THEN RAISE EXCEPTION 'template binding ownership is invalid'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "Admin" a WHERE a."id" = NEW."adminId" AND a."active" AND a."role" = 'SUPER_ADMIN') THEN RAISE EXCEPTION 'template binding requires an active super admin'; END IF;
  ELSE RAISE EXCEPTION 'unsupported facilities file binding scope'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE FUNCTION prevent_template_binding_replacement() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FacilitiesFileBinding" b WHERE b."id" = NEW."bindingId" AND b."scope" = 'QUESTIONNAIRE_TEMPLATE')
     AND (NEW."revisionNumber" <> 1 OR NEW."replacesUploadId" IS NOT NULL) THEN
    RAISE EXCEPTION 'questionnaire template bindings are single-version';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesFileUpload_template_no_replacement" BEFORE INSERT ON "FacilitiesFileUpload"
  FOR EACH ROW EXECUTE FUNCTION prevent_template_binding_replacement();

CREATE OR REPLACE FUNCTION enforce_facilities_file_deletion_tombstone_integrity() RETURNS trigger AS $$
DECLARE upload_record "FacilitiesFileUpload"%ROWTYPE;
BEGIN
  SELECT * INTO upload_record FROM "FacilitiesFileUpload" WHERE "id" = NEW."uploadId";
  IF NOT FOUND OR (NEW."status" <> 'SUCCEEDED' AND upload_record."storedFileId" IS NULL) THEN RAISE EXCEPTION 'facilities file deletion tombstone requires stored content'; END IF;
  IF upload_record."lifecycleStatus" = 'PASSED' AND NOT EXISTS (
    SELECT 1 FROM "FacilitiesFileBinding" b WHERE b."id" = upload_record."bindingId" AND b."scope" = 'QUESTIONNAIRE_TEMPLATE'
  ) AND NOT EXISTS (
    SELECT 1 FROM "FacilitiesFileUpload" successor JOIN "FacilitiesFileBinding" binding ON binding."id" = successor."bindingId" AND binding."currentUploadId" = successor."id"
    WHERE successor."replacesUploadId" = upload_record."id" AND successor."lifecycleStatus" = 'PASSED'
  ) THEN RAISE EXCEPTION 'passed facilities file content may be deleted only after a passed replacement is current'; END IF;
  IF EXISTS (SELECT 1 FROM "QuestionnaireTemplateVersion" t WHERE t."storedFileId" = upload_record."storedFileId") THEN RAISE EXCEPTION 'published questionnaire template content may not be deleted'; END IF;
  IF NEW."status" = 'RETRY_REQUIRED' AND NEW."lastError" IS NULL THEN RAISE EXCEPTION 'retryable facilities file deletion requires a safe failure reason'; END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'SUCCEEDED' AND NEW."status" IS DISTINCT FROM OLD."status" THEN RAISE EXCEPTION 'completed deletion is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_questionnaire_template_integrity() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "StoredFile" f
    JOIN "FacilitiesFileUpload" u ON u."storedFileId" = f."id" AND u."lifecycleStatus" = 'PASSED'
    JOIN "FacilitiesFileBinding" b ON b."id" = u."bindingId" AND b."scope" = 'QUESTIONNAIRE_TEMPLATE' AND b."currentUploadId" = u."id"
    WHERE f."id" = NEW."storedFileId" AND f."fileType" IN ('DOC', 'DOCX') AND f."scanStatus" = 'PASSED'
  ) THEN RAISE EXCEPTION 'questionnaire template requires a passed private Word upload'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_intake_supplier_template_integrity() RETURNS trigger AS $$
BEGIN
  IF NEW."isEnabled" AND NEW."questionnaireTemplateVersionId" IS NULL THEN RAISE EXCEPTION 'an enabled supplier requires a questionnaire template'; END IF;
  IF NEW."questionnaireTemplateVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "QuestionnaireTemplateVersion" t WHERE t."id" = NEW."questionnaireTemplateVersionId" AND t."supplierId" = NEW."supplierId"
  ) THEN RAISE EXCEPTION 'questionnaire template must belong to the intake supplier'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER "FacilityIntakeSupplier_template_integrity" ON "FacilityIntakeSupplier";
CREATE TRIGGER "FacilityIntakeSupplier_template_integrity" BEFORE INSERT OR UPDATE OF "supplierId", "questionnaireTemplateVersionId", "isEnabled" ON "FacilityIntakeSupplier"
  FOR EACH ROW EXECUTE FUNCTION enforce_intake_supplier_template_integrity();

CREATE FUNCTION prevent_questionnaire_template_version_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'questionnaire template versions are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "QuestionnaireTemplateVersion_prevent_mutation" BEFORE UPDATE OR DELETE ON "QuestionnaireTemplateVersion"
  FOR EACH ROW EXECUTE FUNCTION prevent_questionnaire_template_version_mutation();

-- Config actions use the existing controlled changedFields/id audit vocabulary.
CREATE OR REPLACE FUNCTION validate_facilities_audit_metadata() RETURNS trigger AS $$
DECLARE forbidden_key TEXT;
BEGIN
  IF jsonb_typeof(NEW."metadata") <> 'object' OR octet_length(NEW."metadata"::text) > 4096 THEN RAISE EXCEPTION 'FacilitiesAuditLog metadata must be a small object'; END IF;
  SELECT key INTO forbidden_key FROM jsonb_object_keys(NEW."metadata") AS key
    WHERE key <> ALL (ARRAY['reasonCode','fieldKeys','documentKind','fileId','uploadId','revisionId','intakeId','supplierId','templateVersionId','paymentAttemptId','correctionRequestId','previousStatus','newStatus','status','changedFields']) LIMIT 1;
  IF forbidden_key IS NOT NULL THEN RAISE EXCEPTION 'FacilitiesAuditLog metadata key % is not permitted', forbidden_key; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key,value) WHERE item.key IN ('fileId','uploadId','revisionId','intakeId','supplierId','templateVersionId','paymentAttemptId','correctionRequestId') AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' !~ '^[A-Za-z0-9_-]{1,64}$')) THEN RAISE EXCEPTION 'FacilitiesAuditLog identifier metadata is invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key,value) WHERE item.key IN ('fieldKeys','changedFields') AND (jsonb_typeof(item.value) <> 'array' OR jsonb_array_length(item.value)>50 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(item.value) AS value_text WHERE value_text !~ '^[A-Za-z0-9_.-]{1,100}$'))) THEN RAISE EXCEPTION 'FacilitiesAuditLog field metadata is invalid'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
