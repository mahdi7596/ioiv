# Phase 11 replay

Run from repository root. Scripts require task-labelled local disposable PostgreSQL
and copied source; do not use project .env or production databases. `environment.json`
records the completed run identity; recreate with setup.py if the container was removed.

1. `python3 docs/security-remediation-2026-09-18/phase-11/setup.py`
2. `python3 docs/security-remediation-2026-09-18/phase-11/run.py sync`
3. `python3 docs/security-remediation-2026-09-18/phase-11/migrate.py`
4. Via run.py: prisma generate, next typegen, vitest run, tsc --noEmit, eslint ., next build.
5. `migration-rehearsal.py` creates a fresh local rehearsal database, verifies rollback
   and reapplies grants; `facilities-cli.py` recreates ONLY its named synthetic fixture
   database on that verified labelled container and runs the actual facilities CLI.
6. `checkpoint.py` compares copied source and root, immutable original audit and migration
   checksums. Stop owned processes/remove only labelled task container after evidence.

See results.md for exact exercised scope and limitations. Phase10 evidence is preserved.
