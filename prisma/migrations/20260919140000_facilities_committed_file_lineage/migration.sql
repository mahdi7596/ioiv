BEGIN;
LOCK TABLE "FacilitiesFileBinding", "FacilitiesFileUpload", "FacilitiesFileUploadAttempt", "FacilitiesFileDeletionTombstone", "QuestionnaireTemplateVersion" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "FacilitiesFileUpload" ADD COLUMN "committedPredecessorId" TEXT,
 ADD COLUMN "committedRevisionNumber" INTEGER, ADD COLUMN "retryToken" TEXT;
CREATE TABLE "FacilitiesFileLineageRepair" (
 "uploadId" TEXT PRIMARY KEY, "bindingId" TEXT NOT NULL,
 "attemptedRevisionNumber" INTEGER NOT NULL, "attemptedPredecessorId" TEXT,
 "committedRevisionNumber" INTEGER NOT NULL, "committedPredecessorId" TEXT,
 "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Do not infer success from attempt sequence or silently repair ambiguous histories.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM (
   SELECT u.*, lag("id") OVER (PARTITION BY "bindingId" ORDER BY "revisionNumber") AS expected
   FROM "FacilitiesFileUpload" u WHERE "lifecycleStatus"='PASSED'
  ) u WHERE u."replacesUploadId" IS DISTINCT FROM u.expected
 ) OR EXISTS (
  SELECT 1 FROM "FacilitiesFileBinding" b WHERE b."currentUploadId" IS NOT NULL AND
  b."currentUploadId" IS DISTINCT FROM (SELECT u."id" FROM "FacilitiesFileUpload" u
   WHERE u."bindingId"=b."id" AND u."lifecycleStatus"='PASSED' ORDER BY u."revisionNumber" DESC LIMIT 1)
 ) OR EXISTS (
  SELECT 1 FROM "FacilitiesFileBinding" b WHERE b."currentUploadId" IS NULL
   AND b."scope" <> 'QUESTIONNAIRE_TEMPLATE'
   AND EXISTS (SELECT 1 FROM "FacilitiesFileUpload" u WHERE u."bindingId"=b."id" AND u."lifecycleStatus"='PASSED')
 ) OR EXISTS (
  SELECT 1 FROM "FacilitiesFileBinding" b JOIN "FacilitiesFileUpload" u ON u."id"=b."currentUploadId"
  LEFT JOIN "StoredFile" f ON f."id"=u."storedFileId"
  WHERE f."id" IS NULL OR f."scanStatus" <> 'PASSED'
   OR EXISTS (SELECT 1 FROM "FacilitiesFileDeletionTombstone" t WHERE t."uploadId"=u."id")
 ) THEN RAISE EXCEPTION 'facilities lineage migration requires manual ambiguity review'; END IF;
END $$;
INSERT INTO "FacilitiesFileLineageRepair" ("uploadId","bindingId","attemptedRevisionNumber","attemptedPredecessorId","committedRevisionNumber","committedPredecessorId")
 SELECT "id","bindingId","revisionNumber","replacesUploadId",
 row_number() OVER (PARTITION BY "bindingId" ORDER BY "revisionNumber"),
 lag("id") OVER (PARTITION BY "bindingId" ORDER BY "revisionNumber")
 FROM "FacilitiesFileUpload" WHERE "lifecycleStatus"='PASSED';
ALTER TABLE "FacilitiesFileUpload" DISABLE TRIGGER "FacilitiesFileUpload_integrity";
UPDATE "FacilitiesFileUpload" u SET "committedRevisionNumber"=r."committedRevisionNumber", "committedPredecessorId"=r."committedPredecessorId"
 FROM "FacilitiesFileLineageRepair" r WHERE r."uploadId"=u."id";
ALTER TABLE "FacilitiesFileUpload" ENABLE TRIGGER "FacilitiesFileUpload_integrity";
DROP INDEX "FacilitiesFileUpload_replacesUploadId_key";
CREATE UNIQUE INDEX "FacilitiesFileUpload_committedPredecessorId_key" ON "FacilitiesFileUpload"("committedPredecessorId");
CREATE UNIQUE INDEX "FacilitiesFileUpload_bindingId_committedRevisionNumber_key" ON "FacilitiesFileUpload"("bindingId","committedRevisionNumber");
ALTER TABLE "FacilitiesFileUpload" ADD CONSTRAINT "FacilitiesFileUpload_committedPredecessorId_fkey" FOREIGN KEY ("committedPredecessorId") REFERENCES "FacilitiesFileUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "FacilitiesFileUpload_committed_lineage_check" CHECK (
  ("lifecycleStatus"='PASSED' AND "committedRevisionNumber" IS NOT NULL AND "committedRevisionNumber">0) OR
  ("lifecycleStatus"<>'PASSED' AND "committedRevisionNumber" IS NULL AND "committedPredecessorId" IS NULL));
CREATE FUNCTION prevent_facilities_lineage_repair_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'facilities lineage repair evidence is immutable'; END $$;
CREATE TRIGGER "FacilitiesFileLineageRepair_immutable" BEFORE UPDATE OR DELETE ON "FacilitiesFileLineageRepair" FOR EACH ROW EXECUTE FUNCTION prevent_facilities_lineage_repair_mutation();
REVOKE ALL ON "FacilitiesFileLineageRepair" FROM PUBLIC;

CREATE OR REPLACE FUNCTION enforce_facilities_file_upload_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 b "FacilitiesFileBinding"%ROWTYPE; predecessor "FacilitiesFileUpload"%ROWTYPE;
 admission BOOLEAN; committing BOOLEAN; total BIGINT;
BEGIN
 -- Orphan deletion holds the exclusive counterpart and checks for any live PENDING
 -- operation. Admission must become visible before storage work can begin.
 PERFORM pg_advisory_xact_lock_shared(730180801);
 SELECT * INTO b FROM "FacilitiesFileBinding" WHERE "id"=NEW."bindingId";
 IF NOT FOUND THEN RAISE EXCEPTION 'facilities file upload requires a binding'; END IF;
 -- Scope first, then binding. Service writers take the same order before touching uploads.
 IF b."applicationId" IS NOT NULL THEN
  PERFORM 1 FROM "FacilitiesApplication" WHERE "id"=b."applicationId" FOR UPDATE;
 ELSIF b."companyId" IS NOT NULL THEN
  PERFORM 1 FROM "Company" WHERE "id"=b."companyId" FOR UPDATE;
 END IF;
 SELECT * INTO b FROM "FacilitiesFileBinding" WHERE "id"=NEW."bindingId" FOR UPDATE;
 admission := TG_OP='INSERT' OR (OLD."lifecycleStatus"='UNAVAILABLE' AND NEW."lifecycleStatus"='PENDING');
 committing := NEW."lifecycleStatus"='PASSED' AND (TG_OP='INSERT' OR OLD."lifecycleStatus"<>'PASSED');
 IF TG_OP='UPDATE' THEN
  IF NEW."bindingId" IS DISTINCT FROM OLD."bindingId" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
   OR NEW."revisionNumber" IS DISTINCT FROM OLD."revisionNumber" OR NEW."replacesUploadId" IS DISTINCT FROM OLD."replacesUploadId"
   OR NEW."reservedByteSize" IS DISTINCT FROM OLD."reservedByteSize" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
   RAISE EXCEPTION 'facilities file upload identity and reservation are immutable'; END IF;
  IF OLD."lifecycleStatus"<>'PENDING' AND NOT(OLD."lifecycleStatus"='UNAVAILABLE' AND NEW."lifecycleStatus" IN ('PENDING','FAILED'))
   AND NEW."lifecycleStatus" IS DISTINCT FROM OLD."lifecycleStatus" THEN
   RAISE EXCEPTION 'terminal facilities file lifecycle status is immutable'; END IF;
  IF NOT committing AND (NEW."committedRevisionNumber" IS DISTINCT FROM OLD."committedRevisionNumber" OR NEW."committedPredecessorId" IS DISTINCT FROM OLD."committedPredecessorId") THEN
   RAISE EXCEPTION 'committed facilities lineage is immutable'; END IF;
  IF NEW."retryToken" IS DISTINCT FROM OLD."retryToken" AND NOT (OLD."lifecycleStatus"='UNAVAILABLE' AND NEW."lifecycleStatus"='PENDING' AND NEW."retryToken" IS NOT NULL) THEN
   RAISE EXCEPTION 'facilities retry ownership is immutable outside admission'; END IF;
  IF OLD."lifecycleStatus"='PASSED' AND NEW."storedFileId" IS DISTINCT FROM OLD."storedFileId" AND NEW."storedFileId" IS NOT NULL THEN
   RAISE EXCEPTION 'passed facilities content is immutable'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW."revisionNumber"<>COALESCE((SELECT max("revisionNumber")+1 FROM "FacilitiesFileUpload" WHERE "bindingId"=b."id"),1) THEN
  RAISE EXCEPTION 'facilities file revisions must be monotonic'; END IF;
 IF admission OR committing THEN
  IF b."applicationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FacilitiesApplication" WHERE "id"=b."applicationId" AND "status" IN ('DRAFT','NEEDS_EDIT')) THEN
   RAISE EXCEPTION 'facilities application is not editable'; END IF;
  IF b."scope"='COMPANY_PROFILE' AND EXISTS (SELECT 1 FROM "FacilitiesApplication" WHERE "companyId"=b."companyId" AND "status" IN ('PENDING_PAYMENT','SUBMITTED','UNDER_REVIEW')) THEN
   RAISE EXCEPTION 'facilities profile documents are not editable'; END IF;
  IF b."scope"='QUESTIONNAIRE_TEMPLATE' AND NOT EXISTS (SELECT 1 FROM "Admin" WHERE "id"=b."adminId" AND "active" AND "role"='SUPER_ADMIN') THEN
   RAISE EXCEPTION 'facilities template owner is not authorized'; END IF;
  IF TG_OP='UPDATE' AND admission AND (NEW."retryToken" IS NULL OR NEW."retryToken" IS NOT DISTINCT FROM OLD."retryToken") THEN
   RAISE EXCEPTION 'facilities retry requires a fresh ownership token'; END IF;
  IF NEW."replacesUploadId" IS DISTINCT FROM b."currentUploadId" THEN RAISE EXCEPTION 'facilities replacement base is stale'; END IF;
  IF NEW."createdAt" <= clock_timestamp()-interval '24 hours' THEN RAISE EXCEPTION 'facilities upload retention expired'; END IF;
  IF NEW."replacesUploadId" IS NOT NULL THEN
   SELECT * INTO predecessor FROM "FacilitiesFileUpload" WHERE "id"=NEW."replacesUploadId";
   IF predecessor."bindingId" IS DISTINCT FROM b."id" OR predecessor."lifecycleStatus"<>'PASSED' THEN RAISE EXCEPTION 'facilities replacement requires a passed current predecessor'; END IF;
   IF EXISTS(SELECT 1 FROM "FacilitiesFileDeletionTombstone" WHERE "uploadId"=predecessor."id") THEN RAISE EXCEPTION 'facilities predecessor pending deletion'; END IF;
  END IF;
 END IF;
 IF committing THEN
  NEW."committedPredecessorId" := NEW."replacesUploadId";
  NEW."committedRevisionNumber" := COALESCE(predecessor."committedRevisionNumber",0)+1;
 END IF;
 IF NEW."lifecycleStatus"='PASSED' THEN
  IF NEW."storedFileId" IS NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "FacilitiesFileDeletionTombstone" WHERE "uploadId"=NEW."id" AND "status"='SUCCEEDED') THEN
    RAISE EXCEPTION 'passed facilities file upload requires a scanned, size-verified stored file'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM "StoredFile" WHERE "id"=NEW."storedFileId" AND "scanStatus"='PASSED' AND "byteSize"=NEW."reservedByteSize") THEN
   RAISE EXCEPTION 'passed facilities file upload requires a scanned, size-verified stored file'; END IF;
 END IF;
 IF b."applicationId" IS NOT NULL AND (admission OR committing) AND NEW."lifecycleStatus" IN ('PENDING','PASSED') THEN
  -- Overlay this row; charge current plus all pending, with one bounded predecessor credit.
  WITH candidate AS (
   SELECT "id","bindingId","replacesUploadId","reservedByteSize","lifecycleStatus","storedFileId" FROM "FacilitiesFileUpload" WHERE "id"<>NEW."id"
   UNION ALL SELECT NEW."id",NEW."bindingId",NEW."replacesUploadId",NEW."reservedByteSize",'PENDING'::"FacilitiesFileLifecycleStatus",NEW."storedFileId"
  ), charges AS (
   SELECT x."id", COALESCE(c."reservedByteSize",0)::bigint AS current_bytes,
    COALESCE(sum(p."reservedByteSize"),0)::bigint AS pending_bytes,
    COALESCE(sum(p."reservedByteSize") FILTER (WHERE p."replacesUploadId"=x."currentUploadId"),0)::bigint AS eligible_bytes
   FROM "FacilitiesFileBinding" x
   LEFT JOIN candidate c ON c."id"=x."currentUploadId" AND c."storedFileId" IS NOT NULL
   LEFT JOIN candidate p ON p."bindingId"=x."id" AND p."lifecycleStatus"='PENDING' AND p."id" IS DISTINCT FROM x."currentUploadId"
   WHERE x."applicationId"=b."applicationId" GROUP BY x."id",c."reservedByteSize"
  ) SELECT COALESCE(sum(current_bytes+pending_bytes-least(current_bytes,eligible_bytes)),0) INTO total FROM charges;
  IF total>157286400 THEN RAISE EXCEPTION 'facilities application file quota exceeds 150 MiB'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_facilities_file_binding_current_upload() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u "FacilitiesFileUpload"%ROWTYPE; total BIGINT;
BEGIN
 IF TG_OP='UPDATE' AND NEW."currentUploadId" IS NOT DISTINCT FROM OLD."currentUploadId" THEN RETURN NEW; END IF;
 IF NEW."currentUploadId" IS NULL THEN
  IF TG_OP='UPDATE' AND OLD."currentUploadId" IS NOT NULL AND (NEW."scope"<>'QUESTIONNAIRE_TEMPLATE' OR EXISTS(
   SELECT 1 FROM "QuestionnaireTemplateVersion" t JOIN "FacilitiesFileUpload" x ON x."storedFileId"=t."storedFileId" WHERE x."id"=OLD."currentUploadId")) THEN
   RAISE EXCEPTION 'current facilities content cannot be cleared'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."applicationId" IS NOT NULL THEN
  PERFORM 1 FROM "FacilitiesApplication" WHERE "id"=NEW."applicationId" FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM "FacilitiesApplication" WHERE "id"=NEW."applicationId" AND "status" IN ('DRAFT','NEEDS_EDIT')) THEN RAISE EXCEPTION 'facilities application is not editable'; END IF;
 ELSIF NEW."companyId" IS NOT NULL THEN
  PERFORM 1 FROM "Company" WHERE "id"=NEW."companyId" FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "FacilitiesApplication" WHERE "companyId"=NEW."companyId" AND "status" IN ('PENDING_PAYMENT','SUBMITTED','UNDER_REVIEW')) THEN RAISE EXCEPTION 'facilities profile documents are not editable'; END IF;
 END IF;
 SELECT * INTO u FROM "FacilitiesFileUpload" WHERE "id"=NEW."currentUploadId";
 IF NOT FOUND OR u."bindingId"<>NEW."id" OR u."lifecycleStatus"<>'PASSED' OR u."storedFileId" IS NULL OR u."committedRevisionNumber" IS NULL THEN
  RAISE EXCEPTION 'current facilities file upload must be a passed revision of this binding'; END IF;
 IF u."committedPredecessorId" IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD."currentUploadId" ELSE NULL END) OR
 EXISTS(SELECT 1 FROM "FacilitiesFileDeletionTombstone" WHERE "uploadId"=u."id") THEN RAISE EXCEPTION 'current facilities revision cannot regress'; END IF;
 IF NEW."applicationId" IS NOT NULL THEN
  WITH slots AS (
   SELECT "id",CASE WHEN "id"=NEW."id" THEN NEW."currentUploadId" ELSE "currentUploadId" END AS current_id
   FROM "FacilitiesFileBinding" WHERE "applicationId"=NEW."applicationId"
  ), charges AS (
   SELECT x."id",COALESCE(c."reservedByteSize",0)::bigint AS current_bytes,
    COALESCE(sum(p."reservedByteSize"),0)::bigint AS pending_bytes,
    COALESCE(sum(p."reservedByteSize") FILTER (WHERE p."replacesUploadId"=x.current_id),0)::bigint AS eligible_bytes
   FROM slots x LEFT JOIN "FacilitiesFileUpload" c ON c."id"=x.current_id
   LEFT JOIN "FacilitiesFileUpload" p ON p."bindingId"=x."id" AND p."lifecycleStatus"='PENDING' AND p."id" IS DISTINCT FROM x.current_id
   GROUP BY x."id",c."reservedByteSize"
  ) SELECT COALESCE(sum(current_bytes+pending_bytes-least(current_bytes,eligible_bytes)),0) INTO total FROM charges;
  IF total>157286400 THEN RAISE EXCEPTION 'facilities application file quota exceeds 150 MiB'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- A successful revision and its current pointer are one durable transition.
-- Deferred checking allows both statements inside one transaction, not across commits.
CREATE FUNCTION check_facilities_committed_upload_attached() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u "FacilitiesFileUpload"%ROWTYPE;
BEGIN
 SELECT * INTO u FROM "FacilitiesFileUpload" WHERE "id"=NEW."id";
 IF u."lifecycleStatus"='PASSED'
  AND NOT EXISTS (SELECT 1 FROM "FacilitiesFileBinding" WHERE "currentUploadId"=u."id")
  AND NOT EXISTS (SELECT 1 FROM "FacilitiesFileUpload" WHERE "committedPredecessorId"=u."id" AND "bindingId"=u."bindingId" AND "lifecycleStatus"='PASSED')
  AND NOT EXISTS (SELECT 1 FROM "FacilitiesFileBinding" b JOIN "FacilitiesFileDeletionTombstone" t ON t."uploadId"=u."id" WHERE b."id"=u."bindingId" AND b."scope"='QUESTIONNAIRE_TEMPLATE' AND b."currentUploadId" IS NULL)
 THEN RAISE EXCEPTION 'successful facilities revision must atomically become current'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "FacilitiesFileUpload_committed_attachment" AFTER INSERT OR UPDATE ON "FacilitiesFileUpload"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_facilities_committed_upload_attached();

CREATE OR REPLACE FUNCTION enforce_facilities_file_deletion_tombstone_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u "FacilitiesFileUpload"%ROWTYPE;
BEGIN
 SELECT * INTO u FROM "FacilitiesFileUpload" WHERE "id"=NEW."uploadId";
 IF NOT FOUND OR (NEW."status"<>'SUCCEEDED' AND u."storedFileId" IS NULL) THEN RAISE EXCEPTION 'facilities file deletion tombstone requires stored content'; END IF;
 IF u."storedFileId" IS NOT NULL THEN PERFORM 1 FROM "StoredFile" WHERE "id"=u."storedFileId" FOR UPDATE; END IF;
 IF u."lifecycleStatus" IN ('PENDING','UNAVAILABLE') THEN RAISE EXCEPTION 'active facilities quarantine cannot be deleted'; END IF;
 IF EXISTS(SELECT 1 FROM "FacilitiesFileBinding" WHERE "currentUploadId"=u."id") THEN RAISE EXCEPTION 'passed facilities file content may be deleted only after a passed replacement is current'; END IF;
 IF u."lifecycleStatus"='PASSED' AND NOT EXISTS(SELECT 1 FROM "FacilitiesFileBinding" WHERE "id"=u."bindingId" AND "scope"='QUESTIONNAIRE_TEMPLATE')
 AND NOT EXISTS(SELECT 1 FROM "FacilitiesFileUpload" WHERE "committedPredecessorId"=u."id" AND "lifecycleStatus"='PASSED') THEN
 RAISE EXCEPTION 'passed facilities file content may be deleted only after a passed replacement is current'; END IF;
 IF EXISTS(SELECT 1 FROM "QuestionnaireTemplateVersion" WHERE "storedFileId"=u."storedFileId") THEN RAISE EXCEPTION 'published questionnaire template content may not be deleted'; END IF;
 IF NEW."status"='RETRY_REQUIRED' AND NEW."lastError" IS NULL THEN RAISE EXCEPTION 'retryable facilities file deletion requires a safe failure reason'; END IF;
 IF TG_OP='UPDATE' AND (NEW."uploadId" IS DISTINCT FROM OLD."uploadId" OR (OLD."status"='SUCCEEDED' AND NEW."status" IS DISTINCT FROM OLD."status")) THEN RAISE EXCEPTION 'completed deletion is immutable'; END IF;
 RETURN NEW;
END $$;
-- Serialize template publication with binding-based cleanup and reject scheduled deletion.
CREATE OR REPLACE FUNCTION enforce_questionnaire_template_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding_id TEXT;
BEGIN
 SELECT b."id" INTO binding_id FROM "FacilitiesFileBinding" b JOIN "FacilitiesFileUpload" u ON u."id"=b."currentUploadId"
 WHERE u."storedFileId"=NEW."storedFileId" AND b."scope"='QUESTIONNAIRE_TEMPLATE' FOR UPDATE OF b;
 IF binding_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM "StoredFile" f JOIN "FacilitiesFileUpload" u ON u."storedFileId"=f."id"
  JOIN "FacilitiesFileBinding" b ON b."id"=u."bindingId" AND b."currentUploadId"=u."id"
  WHERE b."id"=binding_id AND f."id"=NEW."storedFileId" AND f."fileType" IN ('DOC','DOCX') AND f."scanStatus"='PASSED' AND u."lifecycleStatus"='PASSED'
  AND NOT EXISTS(SELECT 1 FROM "FacilitiesFileDeletionTombstone" t WHERE t."uploadId"=u."id")
 ) THEN RAISE EXCEPTION 'questionnaire template requires a passed private Word upload'; END IF;
 RETURN NEW;
END $$;
-- Legacy direct references also participate in deletion authorization. A durable
-- tombstone rejects late references even if cleanup's I/O outlives its DB lock.
CREATE FUNCTION guard_facilities_reference_against_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE column_name TEXT; file_id TEXT;
BEGIN
 FOREACH column_name IN ARRAY TG_ARGV LOOP
  file_id := to_jsonb(NEW)->>column_name;
  IF file_id IS NOT NULL THEN
   PERFORM 1 FROM "StoredFile" WHERE "id"=file_id FOR KEY SHARE;
   IF EXISTS (SELECT 1 FROM "FacilitiesFileUpload" u JOIN "FacilitiesFileDeletionTombstone" t ON t."uploadId"=u."id" WHERE u."storedFileId"=file_id) THEN
    RAISE EXCEPTION 'facilities file scheduled for deletion cannot acquire a reference'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER "CompanyProfileDocument_deletion_guard" BEFORE INSERT OR UPDATE OF "storedFileId" ON "CompanyProfileDocument" FOR EACH ROW EXECUTE FUNCTION guard_facilities_reference_against_deletion('storedFileId');
CREATE TRIGGER "FacilitiesApplicationDocument_deletion_guard" BEFORE INSERT OR UPDATE OF "storedFileId" ON "FacilitiesApplicationDocument" FOR EACH ROW EXECUTE FUNCTION guard_facilities_reference_against_deletion('storedFileId');
CREATE TRIGGER "FacilitiesYearDocument_deletion_guard" BEFORE INSERT OR UPDATE OF "storedFileId" ON "FacilitiesYearDocument" FOR EACH ROW EXECUTE FUNCTION guard_facilities_reference_against_deletion('storedFileId');
CREATE TRIGGER "FacilitiesHumanResources_deletion_guard" BEFORE INSERT OR UPDATE OF "insuranceFileId" ON "FacilitiesHumanResources" FOR EACH ROW EXECUTE FUNCTION guard_facilities_reference_against_deletion('insuranceFileId');
CREATE TRIGGER "FacilitiesTrialBalance_deletion_guard" BEFORE INSERT OR UPDATE OF "generalLedgerFileId","subsidiaryLedgerFileId" ON "FacilitiesTrialBalance" FOR EACH ROW EXECUTE FUNCTION guard_facilities_reference_against_deletion('generalLedgerFileId','subsidiaryLedgerFileId');
CREATE TRIGGER "FacilitiesCreditReport_deletion_guard" BEFORE INSERT OR UPDATE OF "storedFileId" ON "FacilitiesCreditReport" FOR EACH ROW EXECUTE FUNCTION guard_facilities_reference_against_deletion('storedFileId');
COMMIT;
