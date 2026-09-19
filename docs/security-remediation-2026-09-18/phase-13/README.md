# Phase 13 replay

Use setup.py for labelled disposable local PostgreSQL/copied source excluding .env*.
run.py sync copies authorized source; run.py LOG COMMAND executes under synthetic env.
Generate Prisma, run vitest/next build/tsc/eslint. Production browser harness is
prisma/tests/session-recovery/browser.ts via tsx with PHASE1_PLAYWRIGHT and
PHASE1_SCREENSHOTS set to the bundled Playwright and evidence screenshot directory.
Browser briefly revokes then restores SELECT on synthetic User/Admin for its runtime
role; never run against a shared or production database. checkpoint.py verifies source
and36 prior migrations. Shut down only owned resources before sealing evidence.
