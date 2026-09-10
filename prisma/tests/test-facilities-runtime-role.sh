#!/bin/sh
# Disposable role-grant check. Run only against an isolated database that has
# received all migrations and seed data:
#   DATABASE_URL=... prisma/tests/test-facilities-runtime-role.sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be the disposable migration-owner connection}"
role_name=${M1_RUNTIME_TEST_ROLE:-sana_m1_runtime_test}

case "$role_name" in
  ''|*[!A-Za-z0-9_]* )
    echo 'M1_RUNTIME_TEST_ROLE must contain only letters, digits, and underscores' >&2
    exit 2
    ;;
esac

cleanup() {
  # DROP OWNED removes only grants belonging to this disposable role; it never
  # drops tables or other database objects. It is required before DROP ROLE.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "REVOKE \"$role_name\" FROM CURRENT_USER" >/dev/null 2>&1 || true
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP OWNED BY \"$role_name\"" >/dev/null 2>&1 || true
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS \"$role_name\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

cleanup
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE ROLE \"$role_name\" NOLOGIN"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "GRANT \"$role_name\" TO CURRENT_USER"
# Start from deliberately excessive privileges to prove that the canonical
# provisioner removes them before applying its allow-list.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$role_name\" SUPERUSER"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"$role_name\""
printf 'temporary-runtime-password\ntemporary-runtime-password\n' | \
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v runtime_role="$role_name" \
    -f prisma/facilities-runtime-role-provision.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v runtime_role="$role_name" <<'SQL'
SELECT NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
) AS runtime_role_attributes_restricted \gset
\if :runtime_role_attributes_restricted
\else
  \echo 'runtime role attributes were not restricted'
  SELECT 1 / 0;
\endif
SELECT (NOT (has_table_privilege(:'runtime_role', 'public."FacilitiesAuditLog"', 'UPDATE')
  OR has_table_privilege(:'runtime_role', 'public."Application"', 'DELETE')
  OR has_table_privilege(:'runtime_role', 'public."FacilitiesFileBinding"', 'DELETE')
  OR has_table_privilege(:'runtime_role', 'public."FacilitiesFileUploadAttempt"', 'DELETE')
  OR has_table_privilege(:'runtime_role', 'public."FacilitiesFileUpload"', 'DELETE')
  OR has_table_privilege(:'runtime_role', 'public."FacilitiesFileDeletionTombstone"', 'DELETE'))
  AND has_table_privilege(:'runtime_role', 'public."StoredFile"', 'DELETE')
  AND has_table_privilege(:'runtime_role', 'public."FacilitiesFileUpload"', 'SELECT,INSERT,UPDATE')
  AND has_table_privilege(:'runtime_role', 'public."FacilitiesFileUploadAttempt"', 'SELECT,INSERT,UPDATE')
) AS runtime_role_table_privileges_restricted \gset
\if :runtime_role_table_privileges_restricted
\else
  \echo 'runtime role retained excessive table privileges'
  SELECT 1 / 0;
\endif
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v runtime_role="$role_name" <<'SQL'
BEGIN;
SET LOCAL ROLE :"runtime_role";

-- A legacy runtime read and write remain available to the restricted role.
SELECT count(*) FROM "User";
INSERT INTO "OtpCode" ("id", "mobile", "codeHash", "purpose", "expiresAt") VALUES
  ('m1-runtime-role-otp', '09900000009', 'test', 'USER_LOGIN', CURRENT_TIMESTAMP + INTERVAL '5 minutes');

-- Facilities audit insertion is allowed, but both the SQL grant and trigger
-- deny mutation. Status-history mutation is denied by the same two layers.
INSERT INTO "FacilitiesAuditLog" ("id", "actorType", "action", "entityType", "metadata") VALUES
  ('m1-runtime-role-audit', 'SYSTEM', 'APPLICATION_CREATED', 'FacilitiesApplication', '{"status":"DRAFT"}');

DO $$
BEGIN
  BEGIN
    UPDATE "FacilitiesAuditLog" SET "entityType" = 'mutated' WHERE false;
    RAISE EXCEPTION 'runtime role unexpectedly updated facilities audit history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM "FacilitiesAuditLog" WHERE false;
    RAISE EXCEPTION 'runtime role unexpectedly deleted facilities audit history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE "FacilitiesStatusHistory" SET "note" = 'mutated' WHERE false;
    RAISE EXCEPTION 'runtime role unexpectedly updated facilities status history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE "AuditLog" SET "action" = 'mutated' WHERE false;
    RAISE EXCEPTION 'runtime role unexpectedly updated legacy audit history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;
SQL
