#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL must be an isolated test database}"
npx prisma migrate deploy
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/tests/facilities-m8-operations.integration.sql
