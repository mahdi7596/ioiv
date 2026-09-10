#!/bin/sh
set -e

# Schema migrations are an explicit maintenance operation run with the
# migration-owner credential. Normal application startup must use the restricted
# runtime credential and must never mutate the schema.
exec "$@"
