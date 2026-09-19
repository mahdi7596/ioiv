BEGIN;
CREATE FUNCTION public.prune_expired_otp_codes() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE removed INTEGER;
BEGIN
 WITH candidates AS (
  SELECT id FROM public."OtpCode"
  WHERE "createdAt" < CURRENT_TIMESTAMP - interval '24 hours' AND "expiresAt" <= CURRENT_TIMESTAMP
  ORDER BY "createdAt",id LIMIT 5000 FOR UPDATE SKIP LOCKED
 ), deleted AS (
  DELETE FROM public."OtpCode" o USING candidates c WHERE o.id=c.id RETURNING o.id
 ) SELECT count(*) INTO removed FROM deleted;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.prune_expired_otp_codes() FROM PUBLIC;
CREATE TABLE "MaintenanceCursor" (name TEXT PRIMARY KEY, "afterId" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL);
REVOKE ALL ON "MaintenanceCursor" FROM PUBLIC;
COMMIT;
