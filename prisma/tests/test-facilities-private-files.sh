#!/bin/sh
# M2 database lifecycle checks. Use only with an isolated test database.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be an isolated test database}"
npx prisma migrate deploy
npm run db:seed
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/tests/facilities-private-files.integration.sql
