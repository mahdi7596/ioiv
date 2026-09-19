BEGIN;
-- Snapshot refresh needs bounded deletion, never broad runtime DELETE rights.
CREATE FUNCTION public.clear_editable_facilities_shareholders(application_id TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE live_status public."ApplicationStatus";
BEGIN
 SELECT status INTO live_status FROM public."FacilitiesApplication" WHERE id=application_id FOR UPDATE;
 IF live_status IS NULL OR live_status NOT IN ('DRAFT','NEEDS_EDIT') THEN RAISE EXCEPTION 'application snapshot is not editable'; END IF;
 DELETE FROM public."FacilitiesApplicationShareholder" WHERE "applicationId"=application_id;
END $$;
CREATE FUNCTION public.prune_editable_facilities_officers(application_id TEXT, retained_ids TEXT[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE live_status public."ApplicationStatus";
BEGIN
 SELECT status INTO live_status FROM public."FacilitiesApplication" WHERE id=application_id FOR UPDATE;
 IF live_status IS NULL OR live_status NOT IN ('DRAFT','NEEDS_EDIT') OR retained_ids IS NULL THEN RAISE EXCEPTION 'application snapshot is not editable'; END IF;
 DELETE FROM public."FacilitiesApplicationOfficer" o WHERE o."applicationId"=application_id AND NOT(o.id=ANY(retained_ids))
 AND NOT EXISTS(SELECT 1 FROM public."FacilitiesCreditReport" r WHERE r."officerSnapshotId"=o.id)
 AND NOT EXISTS(SELECT 1 FROM public."FacilitiesApplicationEvidence" e WHERE e."officerId"=o.id);
END $$;
REVOKE ALL ON FUNCTION public.clear_editable_facilities_shareholders(TEXT), public.prune_editable_facilities_officers(TEXT,TEXT[]) FROM PUBLIC;
COMMIT;
