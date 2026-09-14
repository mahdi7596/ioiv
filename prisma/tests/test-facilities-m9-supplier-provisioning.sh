#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL must be an isolated test database}"

npx prisma migrate deploy
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE "FacilitySupplier" CASCADE;
TRUNCATE TABLE "FacilitiesProgramConfiguration", "FacilityIntake", "QuestionnaireTemplateVersion", "User", "Admin" CASCADE;
SQL

npm run facilities:m9:provision-suppliers
dry_count="$(psql "$DATABASE_URL" -Atqc 'SELECT count(*) FROM "FacilitySupplier"')"
test "$dry_count" = "0"

npm run facilities:m9:provision-suppliers -- --apply
npm run facilities:m9:provision-suppliers -- --apply
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/tests/facilities-m9-supplier-provisioning.integration.sql
