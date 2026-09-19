BEGIN;
LOCK TABLE "Application", "ApplicationFile" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "Application" ADD COLUMN "draftVersion" integer NOT NULL DEFAULT 0;
ALTER TABLE "ApplicationFile" ADD COLUMN "sha256" text, ADD COLUMN "scanVerdict" text,
 ADD COLUMN "scannerName" text, ADD COLUMN "scannerVersion" text, ADD COLUMN "verifiedAt" timestamp(3);
CREATE TABLE "LegacyFileBinding" (
 id text PRIMARY KEY, "applicationId" text NOT NULL REFERENCES "Application"(id),
 "slotKey" text NOT NULL, "currentFileId" text NOT NULL UNIQUE REFERENCES "ApplicationFile"(id),
 generation integer NOT NULL DEFAULT 1 CHECK(generation > 0), UNIQUE("applicationId","slotKey")
);
CREATE TABLE "LegacyFileDeletionIntent" (
 id text PRIMARY KEY, "predecessorId" text NOT NULL UNIQUE REFERENCES "ApplicationFile"(id),
 "replacementId" text NOT NULL REFERENCES "ApplicationFile"(id), "applicationId" text NOT NULL REFERENCES "Application"(id),
 "slotKey" text NOT NULL, "storagePath" text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','AUTHORIZED','SUCCEEDED','RETAINED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0), "lastError" text,
 "createdAt" timestamp(3) NOT NULL DEFAULT now(), "completedAt" timestamp(3)
);
CREATE INDEX "LegacyFileDeletionIntent_status_createdAt_idx" ON "LegacyFileDeletionIntent"(status,"createdAt");
CREATE TABLE "LegacyFileBindingRepair" (
 id text PRIMARY KEY, "applicationId" text NOT NULL, "slotKey" text NOT NULL,
 "fileId" text, reason text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

-- Enumerate original array positions. Filtering blank rows would change slot identity.
CREATE FUNCTION legacy_file_references(a "Application") RETURNS TABLE(slot text, file_id text)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT 'taxDeclarations.'||(ord-1)||'.file', value #>> '{file,fileId}'
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a."taxDeclarations")='array' THEN a."taxDeclarations" ELSE '[]'::jsonb END) WITH ORDINALITY t(value,ord)
 WHERE value #>> '{file,fileId}' IS NOT NULL
 UNION ALL SELECT 'financials.'||(ord-1)||'.file', value #>> '{file,fileId}'
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.financials)='array' THEN a.financials ELSE '[]'::jsonb END) WITH ORDINALITY t(value,ord)
 WHERE value #>> '{file,fileId}' IS NOT NULL
 UNION ALL SELECT slot, file_id FROM (VALUES
 ('humanResources.insuranceList',a."humanResources" #>> '{insuranceList,fileId}'),
 ('trialBalance.generalLedger',a."trialBalance" #>> '{generalLedger,fileId}'),
 ('trialBalance.subsidiaryLedger',a."trialBalance" #>> '{subsidiaryLedger,fileId}'),
 ('creditReports.company',a."creditReports" #>> '{company,fileId}'),
 ('creditReports.ceo',a."creditReports" #>> '{ceo,fileId}'),
 ('creditReports.boardMember',a."creditReports" #>> '{boardMember,fileId}')) v(slot,file_id) WHERE file_id IS NOT NULL
$$;
CREATE FUNCTION legacy_canonical_slot(s text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT s ~ '^(taxDeclarations\.(0|[1-9][0-9]?)\.file|financials\.(0|[1-9][0-9]?)\.file|humanResources\.insuranceList|trialBalance\.(generalLedger|subsidiaryLedger)|creditReports\.(company|ceo|boardMember)|validationCertificate)$'
$$;
INSERT INTO "LegacyFileBinding"(id,"applicationId","slotKey","currentFileId")
 SELECT 'legacy-backfill:'||a.id||':'||r.slot,a.id,r.slot,f.id
 FROM "Application" a CROSS JOIN LATERAL legacy_file_references(a) r
 JOIN "ApplicationFile" f ON f.id=r.file_id AND f."applicationId"=a.id AND f."fieldKey"=r.slot
 WHERE legacy_canonical_slot(r.slot)
 AND (SELECT count(*) FROM "Application" other CROSS JOIN LATERAL legacy_file_references(other) refs WHERE refs.file_id=f.id)=1;
INSERT INTO "LegacyFileBindingRepair"(id,"applicationId","slotKey","fileId",reason)
 SELECT 'legacy-reference:'||a.id||':'||r.slot,a.id,r.slot,r.file_id,'UNRESOLVED_SAVED_REFERENCE'
 FROM "Application" a CROSS JOIN LATERAL legacy_file_references(a) r
 WHERE NOT EXISTS(SELECT 1 FROM "LegacyFileBinding" b WHERE b."applicationId"=a.id AND b."slotKey"=r.slot);
INSERT INTO "LegacyFileBindingRepair"(id,"applicationId","slotKey","fileId",reason)
 SELECT 'legacy-unbound:'||f.id,f."applicationId",f."fieldKey",f.id,
 CASE WHEN f."fieldKey"='validationCertificate' THEN 'CERTIFICATE_WITHOUT_SAVED_POINTER' ELSE 'UNBOUND_HISTORICAL_FILE' END
 FROM "ApplicationFile" f WHERE NOT EXISTS(SELECT 1 FROM "LegacyFileBinding" b WHERE b."currentFileId"=f.id);

CREATE TABLE "LegacyUploadCandidate" (
 id text PRIMARY KEY, "applicationId" text NOT NULL REFERENCES "Application"(id),
 "slotKey" text NOT NULL, "storagePath" text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'STAGING' CHECK(status IN ('STAGING','READY','COMMITTED','ABANDONED')),
 "createdAt" timestamp(3) NOT NULL DEFAULT now(), "fileId" text UNIQUE REFERENCES "ApplicationFile"(id),
 "lastError" text, "deletedAt" timestamp(3)
);
CREATE INDEX "LegacyUploadCandidate_status_createdAt_idx" ON "LegacyUploadCandidate"(status,"createdAt");
CREATE FUNCTION guard_legacy_candidate() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(regexp_replace(NEW."storagePath",'^.*/',''),730190001));
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM "ApplicationFile" WHERE regexp_replace("storagePath",'^.*/','')=regexp_replace(NEW."storagePath",'^.*/','')) OR
   EXISTS(SELECT 1 FROM "LegacyUploadCandidate" WHERE regexp_replace("storagePath",'^.*/','')=regexp_replace(NEW."storagePath",'^.*/','')) THEN RAISE EXCEPTION 'legacy allocation object already exists'; END IF;
  IF NEW.status<>'STAGING'  OR NEW."fileId" IS NOT NULL OR NOT legacy_canonical_slot(NEW."slotKey") THEN RAISE EXCEPTION 'invalid legacy allocation'; END IF;
 ELSE
  IF (NEW.id,NEW."applicationId",NEW."slotKey",NEW."storagePath",NEW."createdAt") IS DISTINCT FROM
   (OLD.id,OLD."applicationId",OLD."slotKey",OLD."storagePath",OLD."createdAt") THEN RAISE EXCEPTION 'legacy allocation immutable'; END IF;
  IF OLD.status='COMMITTED' OR (OLD.status='ABANDONED' AND NEW.status<>'ABANDONED') THEN RAISE EXCEPTION 'legacy allocation terminal'; END IF;
  IF NEW.status='ABANDONED' AND OLD.status<>'ABANDONED' AND OLD."createdAt">clock_timestamp()-interval '24 hours' THEN RAISE EXCEPTION 'legacy allocation still active'; END IF;
  IF NEW.status='ABANDONED' AND EXISTS(SELECT 1 FROM "ApplicationFile" WHERE regexp_replace("storagePath",'^.*/','')=regexp_replace(NEW."storagePath",'^.*/','')) THEN RAISE EXCEPTION 'legacy allocation has attached file'; END IF;
  IF NEW.status='READY' AND OLD.status<>'STAGING'  THEN RAISE EXCEPTION 'legacy allocation not staging'; END IF;
  IF NEW.status='COMMITTED' THEN
   IF OLD.status<>'READY' OR NOT EXISTS(SELECT 1 FROM "ApplicationFile" f WHERE f.id=NEW."fileId" AND f."applicationId"=NEW."applicationId" AND f."fieldKey"=NEW."slotKey" AND f."storagePath"=NEW."storagePath") THEN RAISE EXCEPTION 'legacy commit allocation mismatch'; END IF;
  ELSIF NEW."fileId" IS NOT NULL THEN RAISE EXCEPTION 'legacy uncommitted allocation has file'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_candidate_guard BEFORE INSERT OR UPDATE ON "LegacyUploadCandidate" FOR EACH ROW EXECUTE FUNCTION guard_legacy_candidate();

CREATE FUNCTION guard_legacy_file_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(regexp_replace(NEW."storagePath",'^.*/',''),730190001));
 IF EXISTS(SELECT 1 FROM "ApplicationFile" WHERE "storagePath"=NEW."storagePath" OR regexp_replace("storagePath",'^.*/','')=regexp_replace(NEW."storagePath",'^.*/','')) OR
 EXISTS(SELECT 1 FROM "LegacyFileDeletionIntent" WHERE "storagePath"=NEW."storagePath") THEN
  RAISE EXCEPTION 'legacy object identity already used';
 END IF;
 IF EXISTS(SELECT 1 FROM "LegacyUploadCandidate" WHERE regexp_replace("storagePath",'^.*/','')=regexp_replace(NEW."storagePath",'^.*/','') AND (status<>'READY' OR "storagePath"<>NEW."storagePath")) THEN RAISE EXCEPTION 'legacy candidate not ready'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_file_insert BEFORE INSERT ON "ApplicationFile" FOR EACH ROW EXECUTE FUNCTION guard_legacy_file_insert();

CREATE FUNCTION guard_legacy_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE f "ApplicationFile"; prior "ApplicationFile"; app_status "ApplicationStatus";
BEGIN
 SELECT status INTO app_status FROM "Application" WHERE id=NEW."applicationId" FOR UPDATE;
 IF (NEW."slotKey"='validationCertificate' AND app_status<>'VALIDATION_COMPLETED') OR
 (NEW."slotKey"<>'validationCertificate' AND app_status NOT IN ('DRAFT','NEEDS_EDIT')) THEN RAISE EXCEPTION 'legacy binding not editable'; END IF;
 IF NEW."slotKey"<>'validationCertificate' AND EXISTS(SELECT 1 FROM "PaymentObligation" WHERE "legacyApplicationId"=NEW."applicationId" AND state NOT IN ('READY','SETTLED')) THEN RAISE EXCEPTION 'legacy payment is in progress'; END IF;
 IF NOT legacy_canonical_slot(NEW."slotKey") THEN RAISE EXCEPTION 'invalid legacy slot'; END IF;
 SELECT * INTO STRICT f FROM "ApplicationFile" WHERE id=NEW."currentFileId";
 IF f."applicationId"<>NEW."applicationId" OR f."fieldKey"<>NEW."slotKey" OR
 EXISTS(SELECT 1 FROM "LegacyFileDeletionIntent" WHERE "predecessorId"=f.id) THEN
 RAISE EXCEPTION 'legacy binding ownership or retired object'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW."applicationId"<>OLD."applicationId" OR NEW."slotKey"<>OLD."slotKey" OR
   NEW.generation<>OLD.generation+1 OR NEW."currentFileId"=OLD."currentFileId" THEN
   RAISE EXCEPTION 'invalid legacy binding revision'; END IF;
  SELECT * INTO STRICT prior FROM "ApplicationFile" WHERE id=OLD."currentFileId";
  INSERT INTO "LegacyFileDeletionIntent"(id,"predecessorId","replacementId","applicationId","slotKey","storagePath")
   VALUES('legacy-delete:'||prior.id,prior.id,f.id,NEW."applicationId",NEW."slotKey",prior."storagePath");
 ELSIF NEW.generation<>1 THEN RAISE EXCEPTION 'invalid initial legacy generation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_binding_guard BEFORE INSERT OR UPDATE ON "LegacyFileBinding" FOR EACH ROW EXECUTE FUNCTION guard_legacy_binding();

-- Deferred checks permit pointer and draft JSON to change together in either order.
CREATE FUNCTION check_legacy_current_references() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE app "Application"; app_id text;
BEGIN
 IF TG_TABLE_NAME='Application' THEN app_id := NEW.id; ELSE app_id := NEW."applicationId"; END IF;
 SELECT * INTO app FROM "Application" WHERE id=app_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM "LegacyFileBinding" b WHERE b."applicationId"=app_id AND b."slotKey"<>'validationCertificate'
  AND NOT EXISTS(SELECT 1 FROM legacy_file_references(app) r WHERE r.slot=b."slotKey" AND r.file_id=b."currentFileId")) THEN
  RAISE EXCEPTION 'legacy draft references are stale'; END IF;
 IF EXISTS(SELECT 1 FROM legacy_file_references(app) r JOIN "LegacyFileDeletionIntent" d ON d."predecessorId"=r.file_id) THEN
  RAISE EXCEPTION 'legacy draft references retired object'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER legacy_application_references AFTER INSERT OR UPDATE ON "Application"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_legacy_current_references();
CREATE CONSTRAINT TRIGGER legacy_binding_references AFTER INSERT OR UPDATE ON "LegacyFileBinding"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_legacy_current_references();

CREATE FUNCTION guard_legacy_deletion_intent() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  -- Only the binding trigger may create a predecessor intent.
  IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'legacy deletion requires binding transition'; END IF;
  RETURN NEW;
 END IF;
 IF (NEW.id,NEW."predecessorId",NEW."replacementId",NEW."applicationId",NEW."slotKey",NEW."storagePath",NEW."createdAt")
 IS DISTINCT FROM (OLD.id,OLD."predecessorId",OLD."replacementId",OLD."applicationId",OLD."slotKey",OLD."storagePath",OLD."createdAt") THEN
 RAISE EXCEPTION 'legacy deletion identity is immutable'; END IF;
 IF OLD.status='SUCCEEDED' OR (OLD.status='AUTHORIZED' AND NEW.status NOT IN ('AUTHORIZED','SUCCEEDED')) THEN
 RAISE EXCEPTION 'legacy deletion authorization is irreversible'; END IF;
 IF NEW.status IN ('AUTHORIZED','SUCCEEDED') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(regexp_replace(NEW."storagePath",'^.*/',''),730190001));
  IF EXISTS(SELECT 1 FROM "LegacyFileBinding" b JOIN "ApplicationFile" f ON f.id=b."currentFileId" WHERE f."storagePath"=NEW."storagePath") OR
   EXISTS(SELECT 1 FROM "Application" a CROSS JOIN LATERAL legacy_file_references(a) r JOIN "ApplicationFile" f ON f.id=r.file_id WHERE f."storagePath"=NEW."storagePath") OR
   EXISTS(SELECT 1 FROM "ApplicationFile" f WHERE (f."storagePath"=NEW."storagePath" OR regexp_replace(f."storagePath",'^.*/','')=regexp_replace(NEW."storagePath",'^.*/','')) AND f.id<>NEW."predecessorId") THEN
   RAISE EXCEPTION 'legacy object still referenced or shared'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_deletion_guard BEFORE INSERT OR UPDATE ON "LegacyFileDeletionIntent" FOR EACH ROW EXECUTE FUNCTION guard_legacy_deletion_intent();
CREATE FUNCTION guard_legacy_draft_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."taxDeclarations",NEW.financials,NEW."humanResources",NEW."trialBalance",NEW."creditReports",NEW."currentStep") IS DISTINCT FROM
 (OLD."taxDeclarations",OLD.financials,OLD."humanResources",OLD."trialBalance",OLD."creditReports",OLD."currentStep") AND NEW."draftVersion"<>OLD."draftVersion"+1 THEN
 RAISE EXCEPTION 'legacy draft version must advance'; END IF;
 IF NEW."draftVersion" NOT IN (OLD."draftVersion",OLD."draftVersion"+1) THEN RAISE EXCEPTION 'invalid legacy draft version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_draft_version BEFORE UPDATE ON "Application" FOR EACH ROW EXECUTE FUNCTION guard_legacy_draft_version();
CREATE FUNCTION legacy_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'legacy file identity and historical evidence are immutable'; END $$;
CREATE TRIGGER legacy_file_immutable BEFORE UPDATE OR DELETE ON "ApplicationFile" FOR EACH ROW EXECUTE FUNCTION legacy_immutable_record();
CREATE TRIGGER legacy_repair_immutable BEFORE UPDATE OR DELETE ON "LegacyFileBindingRepair" FOR EACH ROW EXECUTE FUNCTION legacy_immutable_record();
CREATE TRIGGER legacy_binding_no_delete BEFORE DELETE ON "LegacyFileBinding" FOR EACH ROW EXECUTE FUNCTION legacy_immutable_record();
CREATE TRIGGER legacy_intent_no_delete BEFORE DELETE ON "LegacyFileDeletionIntent" FOR EACH ROW EXECUTE FUNCTION legacy_immutable_record();
CREATE TRIGGER legacy_candidate_no_delete BEFORE DELETE ON "LegacyUploadCandidate" FOR EACH ROW EXECUTE FUNCTION legacy_immutable_record();
COMMIT;
