#!/bin/sh
# Exercises backup restore plus the transactional failure/rerun recovery path.
# Both URLs must point to explicitly created, disposable local/test databases;
# this script refuses to run if either is omitted.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be the disposable source database}"
: "${M1_RESTORE_DATABASE_URL:?M1_RESTORE_DATABASE_URL must be a blank disposable restore database}"

backup_file=$(mktemp "${TMPDIR:-/tmp}/sana-m1-backup.XXXXXX.sql")
cleanup() { rm -f "$backup_file"; }
trap cleanup EXIT HUP INT TERM

# A plain logical dump is restored through psql so that this rehearsal works
# when the developer's PostgreSQL client is newer than the test server. Newer
# clients can emit SET transaction_timeout, which PostgreSQL 16 does not know;
# remove only that compatibility setting, and make every other restore error
# fatal. Production backups should use the server-compatible client image.
pg_dump --format=plain --no-owner --no-privileges --file="$backup_file" "$DATABASE_URL"
sed '/^SET transaction_timeout = 0;$/d' "$backup_file" | psql "$M1_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1

psql "$M1_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF to_regclass('public."FacilitiesApplication"') IS NULL
    OR to_regclass('public."FacilitiesAuditLog"') IS NULL THEN
    RAISE EXCEPTION 'facilities tables were not restored';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20260910173000_add_facilities_foundation' AND finished_at IS NOT NULL) THEN
    RAISE EXCEPTION 'M1 migration record was not restored';
  END IF;
END $$;
SQL

# A PostgreSQL migration runs in a transaction. Deliberately fail a disposable
# transaction and prove that the partial DDL disappears when its connection
# closes, then rerun Prisma migrations successfully against the restored copy.
set +e
psql "$M1_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TABLE "M1FailureRollbackProbe" ("id" TEXT PRIMARY KEY);
SELECT 1 / 0;
SQL
failure_status=$?
set -e
if [ "$failure_status" -eq 0 ]; then
  echo 'intentional transactional migration failure did not fail' >&2
  exit 1
fi

if [ "$(psql "$M1_RESTORE_DATABASE_URL" -Atc "SELECT to_regclass('public.\"M1FailureRollbackProbe\"') IS NULL")" != "t" ]; then
  echo 'failed transaction left migration probe DDL behind' >&2
  exit 1
fi

DATABASE_URL="$M1_RESTORE_DATABASE_URL" npx prisma migrate deploy
