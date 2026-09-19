# Phase 3 — R12 gateway response validation

Local verification complete; final independent approval and resource shutdown checkpoint
are recorded in the progress ledger. Overall launch **NO-GO**. Phase4 not started.

## Behavior

New gateway responses require complete, noncontradictory envelopes and numeric success
codes (request100; verify100/101). References must be positive safe numeric integers;
authorities must be36 ASCII alphanumeric characters with A production/S sandbox prefix.
Optional authority/amount/currency echoes must agree with the outbound server values.
Malformed/contradictory responses never become capture or explicit rejection. Documented
negative codes only classify rejection with empty data; logs omit provider-controlled prose.
Stored amounts now also drive legacy request creation, matching reservation and verification.

Original-authority coordination, no remote replay after UNKNOWN, no second charge, durable
capture recovery and Phase2 verified-state protection remain. Explicit rejection permits
sequential verification of the original authority; code101 with a valid reference settles
once. Browser Status/ref_id/amount cannot provide proof. Existing Persian pending/support
copy and UI are unchanged; facilities remains disabled.

No schema/migration/grant/config/retention change or historical data rewrite. R12 validates
new provider responses; old durable CAPTURED evidence remains preserved/replayable without
retroactive certification. Follow Phase1/2 compatible-writer rollback and backup constraints.

## Evidence

| File | Result / qualification |
| --- | --- |
| design.md / contract.md | Entry39/39 Phase2 hashes, scope, live official docs and contract limitations |
| baseline-r12.log | New63 desired-safe adapter cases against unchanged Phase2:42 failures,21 passes; missing code/ref/envelope/authority controls reproduce |
| focused.log | 105/105:63 new adapter,12 existing adapter,30 prior restricted-role DB cases |
| final-tests.log | 413/413 across70 files, including39 restricted-role PostgreSQL cases (9 new R12) |
| processes.log | Five separate-process/SIGKILL cases; actual adapter to local HTTP provider, no additional authority after uncertainty |
| build.log | Production build passes |
| final-types.log / final-lint.log | Types pass; no lint errors, one existing public-page image warning |
| browser-final.log / screenshots | Production Next→actual adapter→local HTTP provider→restricted DB at390/1440px; forged success neutral, malformed reference pending/no replay, rejection→101 once, stored amount/exact authority, refresh, signed-out denial, no overflow |
| independent-review.md | Separate contract/code and evidence/test reviewers; findings/resolutions |
| environment.json / shutdown.json | Fresh owned resources and cleanup identity |
| source-hashes.json / workspace-status.txt | Durable restart identity; all changes uncommitted |

Mobile pending and desktop success screenshots visually inspected. Browser uses synthetic
signed sessions and minimal legacy fixtures, not OTP login or complete document journeys.
Its preload exists only under prisma/tests and redirects sandbox fetch to a loopback HTTP
provider while denying other external fetch. Browser intercept also blocks external origins.
No application test hook or gateway configuration override was added. The browser harness
owns and closes provider/Next/Chrome including launch failures; no provider credentials.

DB tests use real restricted-role locks, transactions and append-only evidence. Facilities
readiness/materialization are stubbed only to isolate payment behavior; synthetic existing
application seeding uses owner trigger bypass without enabling the programme, runtime guards
remain active. Existing role-revoke failure injection and durable capture/notification cases
rerun. Local Node26/PostgreSQL16 differ from intended Node22 release images.

Attempts retained: tests.log411/413 and tests2.log412/413 failed due missing amount in payment
mock and wrong confirmation property in new facilities fixture. Corrected fixtures, preserving
application validation; final413/413 passes. Evidence review found browser startup cleanup
outside try/finally; expanded guarded cleanup then browser-final/types/lint rerun pass.
No tests removed, security relaxed, or application types suppressed.

## Replay

Use a fresh task-labelled PostgreSQL16 container with an automatically assigned loopback
port. Never reuse the recorded port or an inherited .env. Copy source/dependencies excluding
.env*, .git and .next. Apply all27 migrations as isolated owner; create phase1_runtime
NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT and apply canonical grants. Harness names
phase1/phase1_runtime identify guarded fixture schema, not old retained resources.

Pass an explicit environment allow-list: new restricted DATABASE_URL, PHASE1_OWNER_URL,
PHASE1_ISOLATED_DB=true, ZARINPAL_SANDBOX=true, blank provider/SMS credentials, synthetic
SESSION_SECRET, localhost APP_URL, temporary UPLOAD_DIR, read-only GIT_DIR/GIT_WORK_TREE.
Do not run DB mutation suites concurrently with browser assertions. Commands from copied source:

```
node_modules/.bin/vitest run --maxWorkers=1
node_modules/.bin/tsx prisma/tests/payment-coordination/processes.ts
npm run build
node_modules/.bin/tsc --noEmit
npm run lint
```

Set PHASE1_PLAYWRIGHT to installed Playwright index.mjs and PHASE1_SCREENSHOTS to an owned
output directory; installed Chrome is used:

```
node_modules/.bin/tsx prisma/tests/payment-coordination/phase3-browser.ts
```

It allocates fresh provider/application ports and closes owned processes. Verify matching
container ID/task label before removal, preserve exact run logs/hashes and shutdown identity.
The scratch directory/env is disposable, not required for restart. setup.py/run.py preserve
this run's orchestration as reference; inspect paths before reuse and create new identities.

Not run: actual Zarinpal sandbox/SMS, scanner, staging proxy/capacity/alerts, production
backups/restore/deploy, release-image scans or complete Phase18 journeys. No migration
rehearsal repeated because migration/grant inputs match Phase2. Official IRT/verify wording
ambiguity and remote timeout finality remain actual-provider qualification limits; no claim
that documents or local HTTP fixtures qualify the provider. No production action or live
charge/SMS/refund/programme enablement occurred. D1/D2 settled; later decisions remain open.
