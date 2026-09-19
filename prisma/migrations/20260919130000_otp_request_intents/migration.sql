BEGIN;
CREATE TABLE "AuthRequestIntent" (
  "id" TEXT PRIMARY KEY,
  "mobileKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "claimedAt" TIMESTAMPTZ
);
CREATE INDEX "AuthRequestIntent_createdAt_idx" ON "AuthRequestIntent"("createdAt");
CREATE FUNCTION public.prune_auth_request_intents() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE removed INTEGER;
BEGIN
  DELETE FROM public."AuthRequestIntent" WHERE "createdAt" < clock_timestamp() - interval '2 hours';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_auth_request_intents() FROM PUBLIC;
COMMIT;
