# Phase 1 — R2 durable payment coordination

Phase 1 local implementation and verification COMPLETE. Final checkpoint recorded below.
Launch remains **NO-GO**. No production change, live payment/SMS, refund or programme
activation. Phase2 was not started; R1 cancellation/stale-state and R12 response validation
remain open. Provider qualification is explicitly not inferred from local test success.

## Changes and invariants

One typed obligation selects one attempt per legacy/facilities application. Short
application-first database transactions reserve REQUEST/VERIFY ownership before provider
I/O. Timeouts, crashes and lease expiry cannot authorize another payable attempt or an
overlapping remote call. Hidden adapter network retries are removed. Old attempts stay
preserved and competing callbacks are retained for reconciliation without verification.

Independent append-only results preserve AUTHORITY/CAPTURED evidence before later local
writes. Lost redirect/persistence replays saved authority locally; capture evidence replays
settlement without re-verification. No-result crash windows remain blocked for owner
reconciliation. Completed rejection permits only sequential same-authority checking,
never another charge. SETTLED blocks new payable eligibility. Legacy submission history
and notification intent commit once. SMS delivery is not promised exactly once.

Historical backfill preserves every attempt, including duplicates and no-authority rows.
Ambiguous history remains UNCERTAIN; verified history blocks repayment. Three additive
migrations include the coordinator and two pre-existing facilities audit schema defects
found by actual restricted-role execution. See design.md, independent-review.md,
provider-evidence.md and DEPLOYMENT.md for rollout/rollback/reconciliation constraints.

UI distinguishes continuing a saved PAYABLE authority from checking uncertainty, uses the
owner-approved Persian guidance, and resolves an old return URL against the settled
obligation. Existing components/RTL/layout are preserved.

## Evidence and limitations

- `tests-serial.log`: **326 tests / 69 files pass**, including 16 real PostgreSQL cases.
  Full suite uses one worker to avoid resource contention with unrelated local workloads;
  the tests themselves still use concurrent DB transactions and deterministic barriers.
- `processes.log`: five separate-process/SIGKILL scenarios with an actual loopback HTTP
  provider and trace. Start workers exercise shared reservation helpers; legacy settlement
  is invoked directly. Complete Next start actions are covered separately by DB/browser tests.
- `migration-recovery2.log`: populated legacy/facilities history, nine coordinator rows,
  unchanged original payment JSON, injected transactional DDL/backfill failure and rerun.
  Fresh DB and synthetic rows only; this is not a production backup/restore rehearsal.
- `db-regression-role.log`, `db-regression-m7.log`, `db-regression-m8.log`,
  `db-regression-m1-clean.log`, `db-regression-m6-clean.log`: existing DB checks pass.
  Initial m1 missing seed env and m6 name collision were fixture failures; clean DB reruns
  supplied synthetic seed config. No acceptance check was removed.
- `build-final.log`, `types-final.log`, `lint-final.log`: production build/types pass;
  lint zero errors, existing public-page image warning only after unused import cleanup.
- `browser-final.log`, `browser-qa.md`, `screenshots/`: production-mode restricted-role server,
  390px/1440px checks, real button clicks, refresh, forged-success URL, saved-authority
  redirect interception and signed-out state. Screenshots visually inspected.
- Facilities R2 DB tests stub readiness/materialization to isolate payment coordination;
  they execute real payment/application/history/audit writes and database guards. They do
  not establish complete facilities document/scanner/readiness or applicant journey quality.
- Provider fetch/loopback responses are controlled fixtures. Official current finality,
  idempotency/query contract and real sandbox behavior remain Phases3/19 launch blockers.
  Full Phase18 journeys, infrastructure, backups and actual release gates remain open.
- Local Node26.7.0/PostgreSQL16.13 differ from intended Node22 Linux release images; no
  image qualification claimed. The original September16 audit hash remains unchanged.

## Replay safely

Recreate a fresh loopback PostgreSQL container, never connect to the recorded port without
verifying new ownership. Copy source and dependencies to a disposable directory excluding
all `.env*`, `.git`, `.next`; pass a strict environment allow-list. `environment.json`
records the actual fixture used here. No production .env was read or inherited.

Apply migrations as the isolated owner, create `phase1_runtime` LOGIN NOSUPERUSER
NOCREATEDB NOCREATEROLE NOINHERIT, and apply `prisma/facilities-runtime-role-grants.sql`.
Use database name `phase1`, DATABASE_URL pointing at that restricted loopback role,
PHASE1_OWNER_URL pointing at its isolated owner, PHASE1_ISOLATED_DB=true. Set blank real
provider/SMS credentials, ZARINPAL_SANDBOX=true, a synthetic SESSION_SECRET, localhost
APP_URL and private temporary upload root. The opt-in DB tests reject other role/DB/host.

Run `npx vitest run --maxWorkers=1`, `npx tsx prisma/tests/payment-coordination/processes.ts`,
and `python3 prisma/tests/payment-coordination/migration.py` (fresh history DB name).
The process harness redirects adapter requests only to its own loopback HTTP server.
The migration harness creates its own history database within that same isolated instance.
Never run these fixtures against a production or shared staging database.

Run build/types/lint in the copied source. Start production Next on 127.0.0.1:3199 with the
restricted role and blank external credentials. Supply PHASE1_PLAYWRIGHT as an installed
Playwright module path and PHASE1_SCREENSHOTS as a temporary output directory; run the
browser.ts script. It signs only its synthetic test user and intercepts external navigation.
Stop owned server/browser processes, then remove only the container matching the saved
ID/task label. Preserve sanitized evidence and update source hashes/checkpoint.

## Final checkpoint — 2026-09-18

Phase 1 only is complete locally. Final delta checks pass: 64 tests / 7 files after
notification/UI refinements, in addition to the 326-test suite. Final production build,
types and lint pass (one pre-existing image warning). Both independent reviewers report
no remaining R2 blocker within the documented scope and evidence limits.

Final screenshots were visually inspected: uncertainty copy and actions are readable at
390px and 1440px without horizontal overflow. This is focused QA, not a full accessibility
certification. `shutdown.json` records the owned server stopped and isolated container
removed after confirming 27 migrations, no enabled facilities configuration and restricted
runtime privileges. Scratch copies are disposable; recorded ports must not be reused
without recreating and verifying ownership. No background work will advance Phase 2.

Changes remain uncommitted on master at 29705da7e148b75a56d3a4aedc3565530c1d6974.
`source-hashes.json` records changed implementation/test inputs; `workspace-status.txt`
records the final working-tree inventory. Existing unrelated changes were preserved.
Read the master prompt, central security review and progress ledger before resuming;
Phase 2 is NOT_STARTED and needs a subsequent owner instruction.
