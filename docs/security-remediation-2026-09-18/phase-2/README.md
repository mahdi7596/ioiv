# Phase 2 — R1 cancellation and verified-state protection

Local implementation and verification complete; final review/shutdown checkpoint recorded
in the progress ledger. Overall launch verdict remains **NO-GO**. Phase3 not started.
No deployment, production migration, real payment/SMS, refund or facilities activation.

## Changes

Legacy browser NOK now follows the same durable server verification as OK. No callback
can mark a verified payment failed or reset its application from an old snapshot. Provider
rejection/uncertainty retains the original obligation and approved support guidance.
Legacy capture settles payment evidence while only DRAFT/PENDING_PAYMENT may move to
SUBMITTED and create submission history/a new notification intent. Later review status,
submittedAt and notes survive. Existing intent dispatch stays once-claimed, not exactly-once SMS.

Correction submission rechecks ownership, verified payment and current state under the
application lock, writes one history row and never creates a new fee/notification intent.
Request completion conditionally changes DRAFT to PENDING_PAYMENT. Admin status updates
compare status and updatedAt so a stale review decision loses with Persian 409 and no
history/SMS. A newly uploaded certificate is deleted only on confirmed transaction conflict
rollback; the existing certificate stays intact. Generic/ambiguous storage/transaction recovery,
full administrative qualification and R11 closure remain Phase12 and relevant upload phases.

The return screen now directs users to current dashboard status instead of falsely asserting
that every replay just put a reviewed case into the queue. Existing components/layout remain.
No schema/grant/retention changes or data repairs; Phase1's 27 migrations remain prerequisites.

## Evidence

| Evidence | Result and scope |
| --- | --- |
| design.md | Entry master/HEAD, 33/33 Phase1 hash match, audit hash and scope/model/rollback |
| baseline-r1.log | Eight desired-safe tests fail against unchanged Phase1 implementation; deterministic real DB barriers. Correction case proves absent history, not duplicate submission |
| final-tests.log | 341/341 tests, 69 files; includes 30 restricted-role real PostgreSQL cases (14 Phase2 additions and 16 Phase1 regressions) |
| final-delta.log | 66/66 in 5 files after app-URL validation refinement; includes all 30 real DB cases |
| processes.log | Five Phase1 separate-process/SIGKILL recovery scenarios rerun successfully with local HTTP provider |
| final-build.log | Production build passes with actual application changes and new CAS cleanup |
| final-types.log | Standalone types pass after generated Next route types exist; browser-script-types.log also passes |
| final-lint.log | No errors; one existing public-page image warning |
| browser-expanded.log | Production Next + restricted runtime: 390/1440px NOK pending/refresh, captured-evidence replay, review/correction preserved, correction button commits once without repayment, signed-out denial, no horizontal overflow |
| screenshots/ | Pending and verified return screens both widths; mobile pending and desktop verified visually inspected |
| independent-review.md | Separate code and evidence reviewers, findings/corrections/qualification |
| environment.json / shutdown.json | Exact fresh fixture and confirmed owned-resource shutdown |
| source-hashes.json / workspace-status.txt | Restart identity; changes remain uncommitted |

Thirty DB cases use real restricted-role writes/transactions with deterministic barriers.
Provider fetch results are controlled. Revoke/grant failure injection proves rollback and
capture replay; SMS failure cannot downgrade payment. Facilities readiness/materialization
are stubbed to isolate payment coordination; only synthetic existing application seed insertion
uses owner trigger bypass with programme unavailable. Actual runtime operations use all guards.
The admin DB tests stub authorization to a seeded admin; existing permission units remain green.
Certificate conflict uses synthetic staged bytes and real unlink/DB rollback, not a scanner test.

Browser uses installed Chrome via Playwright, a private temporary profile, synthetic signed
sessions and durable CAPTURED evidence. All browser requests outside localhost are blocked;
server has no external credentials. SMS deliberately fails locally for absent credentials,
leaving the single intent UNKNOWN without affecting payment. Minimal legacy fixture has no
complete facilities company profile; dashboard can redirect to that existing profile requirement.
Correction success is asserted in the DB, not inferred from navigation. No real provider
capture, OTP browser login, complete facilities profile/documents, scanner or accessibility
certification is claimed. Local Node26.7.0/PostgreSQL16.13 differ from target Node22 images.

## Adjustments preserved

- focused.log: real DB 24/24; callback unit failed due a queued mock response surviving
  clearAllMocks. Reset that mock's response queue. No production relaxation.
- focused2.log: real DB 29/29; old admin unit expected an update without CAS. Assertion
  updated to require the guard; final green suite retains permissions checks.
- types.log/build.log: new awaited-result barrier doubles needed an explicit test-only cast
  because Prisma exposes fluent relation methods; initial standalone types also lacked generated
  RouteContext. Build generated types; no application suppression or skipped type checking.
- browser.log: bundled headless binary missing. Used existing installed Chrome.
- browser2.log: correction succeeded but fixture dashboard redirected to facilities-profile;
  asserted existing redirect and actual DB commit. Final browser pass includes both widths.

## Safe replay

Recreate a **new**, task-labelled PostgreSQL16 container on an automatically allocated
127.0.0.1 port. Never reuse the recorded port without verifying identity. Use an isolated
copy of source/dependencies excluding .env*, .git and .next; pass a strict environment
allow-list and explicit synthetic credentials. Do not source the workspace environment.

Apply migrations as its owner; create `phase1_runtime` LOGIN NOSUPERUSER NOCREATEDB
NOCREATEROLE NOINHERIT and apply `prisma/facilities-runtime-role-grants.sql`. Database is
named `phase1` solely because the existing guarded harness requires that name; it is a
fresh Phase2 container, not a retained/shared Phase1 database. Record the new container
ID, label, port and source identity before tests.

Set DATABASE_URL to that restricted role, PHASE1_OWNER_URL to the isolated owner URL,
PHASE1_ISOLATED_DB=true, ZARINPAL_SANDBOX=true, blank provider/SMS credentials,
synthetic SESSION_SECRET, localhost APP_URL, temporary UPLOAD_DIR, and read-only
GIT_DIR/GIT_WORK_TREE for source-manifest tests. Then in the copied source:

```
npx vitest run --maxWorkers=1
npx tsx prisma/tests/payment-coordination/processes.ts
npm run build
npx tsc --noEmit
npm run lint
```

Build before standalone tsc in a new copy for Next RouteContext. The DB tests set only
synthetic merchant identifiers and replace fetch; process harness redirects to its local
provider. Do not run DB mutation suites concurrently with browser state assertions.

Start production Next on 127.0.0.1:3198 with this restricted environment. Set
PHASE1_PLAYWRIGHT to the installed Playwright index.mjs, PHASE1_SCREENSHOTS to an
owned output directory, and run:

```
npx tsx prisma/tests/payment-coordination/phase2-browser.ts
```

Browser harness launches installed Chrome and closes it in finally. Stop the owned server,
verify its PID identity, remove only the matching container ID/task label, and save fresh
shutdown/source evidence. No reliance on current shell/session memory is needed.

No fresh migration failure/restore rehearsal was needed: Phase2 adds no migrations or grants.
Phase1 migration evidence remains valid for its identical schema inputs. No actual sandbox,
staging proxy/scanner, image scan, production backup/restore or full Phase18 journey ran.
These remain release blockers. Owner D1/D2 decisions remain settled; no automatic refund,
new admin reconciliation UI, scheduled investigation or response-time promise is introduced.
