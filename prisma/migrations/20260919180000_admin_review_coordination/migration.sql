BEGIN;
CREATE FUNCTION public.lock_review_admin(target_id TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public."Admin" WHERE id=target_id FOR SHARE;
END $$;
REVOKE ALL ON FUNCTION public.lock_review_admin(TEXT) FROM PUBLIC;
ALTER TABLE public."FacilitiesApplication" ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION public.increment_facilities_review_version() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 NEW."reviewVersion" := OLD."reviewVersion" + 1;
 RETURN NEW;
END $$;
CREATE TRIGGER facilities_review_version BEFORE UPDATE ON public."FacilitiesApplication"
FOR EACH ROW EXECUTE FUNCTION public.increment_facilities_review_version();
COMMIT;
