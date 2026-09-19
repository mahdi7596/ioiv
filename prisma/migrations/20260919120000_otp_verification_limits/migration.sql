BEGIN;
CREATE TABLE "AuthVerifyBucket" (
  "key" TEXT PRIMARY KEY,
  "secretTag" TEXT,
  "attempts" TIMESTAMPTZ[] NOT NULL,
  "touchedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "AuthVerifyBucket_bounded" CHECK (cardinality("attempts") BETWEEN 1 AND 3000)
);
CREATE INDEX "AuthVerifyBucket_touchedAt_idx" ON "AuthVerifyBucket"("touchedAt");
-- Fixed-purpose maintenance capability; no ability to delete live accounting or OTPs.
CREATE FUNCTION public.prune_auth_verify_buckets() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE removed INTEGER;
BEGIN
  DELETE FROM public."AuthVerifyBucket" WHERE "touchedAt" < clock_timestamp() - interval '2 hours';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_auth_verify_buckets() FROM PUBLIC;
-- Lock/read only; runtime cannot use this capability to change admin permissions.
CREATE FUNCTION public.lock_active_otp_admin(mobile_number TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE admin_id TEXT;
BEGIN
  SELECT "id" INTO admin_id FROM public."Admin"
    WHERE "mobile" = mobile_number AND "active" = true FOR SHARE;
  RETURN admin_id;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_active_otp_admin(TEXT) FROM PUBLIC;
COMMIT;
