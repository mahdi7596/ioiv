# Phase 4 — R3 OTP verification limits, 2026-09-19

**COMPLETE locally. R3 locally VERIFIED_FIXED. Overall launch NO-GO. Phase5 NOT_STARTED.**
Owner authorized Phase4 only and explicitly approved D3 (“agreed”) after the privacy/
retention explanation. D1/D2 stay settled. No production or later-phase authorization.

## Delivered behavior

Every real-code comparison first commits an atomic reservation against the latest OTP,
with at most five guesses including correct guesses. Locks precede database-clock expiry
checks, both at reservation and final consumption. User creation/admin-active lookup and
consumption are transactional; only the winning commit may issue a cookie. Expired,
consumed or exhausted codes cannot log in. A crash/lost response spends capacity; a
consumed code is never reopened after failed cookie delivery or unknown commit outcome.

Shared PostgreSQL accounting also bounds unusable-code/dummy comparisons. Verification
limits are30/mobile+purpose,120/trusted address,300/unknown address and3000/global per
rolling hour. No Phase5 request/SMS behavior change. Dedicated-secret HMAC identifiers
rotate hourly, counting current+previous epochs. One database admission instant defines
both epoch and event timestamps, preventing an hour-boundary reset. No raw mobile/IP/OTP/
JWT in new accounting or changed verification diagnostics. Unknown/unqualified address
uses a shared bounded budget; only explicitly qualified X-Real-IP is trusted, never XFF.

Inactive keys expire after2 hours and are pruned on admission and required hourly
maintenance. Even continuously active personal identifiers rotate away: about4 hours
maximum with healthy hourly maintenance, comfortably inside approved24 hours. This does
not promise erasure from backups/WAL or while DB/maintenance is unavailable. Verification
fails closed if required pruning/config/database access fails; cleanup precedes recovery.
Global fingerprint prevents mixed worker secrets from silently resetting live budgets.

Persian invalid/expired400, shared-limit429 and temporary-failure503 messages use current
UI. Failed codes clear before re-entry so intermediate edits do not burn extra guesses.
Admin errors announce role=alert. Payment coordination/response validation, existing
business workflow and disabled facilities are preserved.

## Verified evidence

| Evidence | Result |
| --- | --- |
| final3-tests.log | 440/440 tests,73 files;26 new restricted-role OTP DB cases plus39 payment DB cases |
| baseline-r3.log | Desired-safe twelve-request regression fails on untouched HEAD auth.ts:12 real comparisons rather than5; fixed source restored in isolated copy |
| processes-final.log | Four processes/twelve wrong or correct guesses; <=5 real comparisons/one authorization; SIGKILL after reserve and after consume with safe restart |
| browser-ui-final.log | Production Next + actual restricted DB, applicant/admin at390/1440; loading, invalid/429 alerts, exactly one request per code entry, recovery, real cookies, refresh, signed-out denial, no overflow |
| browser-ui-final.log | Two simultaneous Next processes:12 wrong HTTP requests reserve5, no cookie;12 correct requests issue exactly one cookie; unavailable loopback DB returns503 without cookie |
| final4-build.log / final-types.log / final-lint.log | Production build/types pass; zero lint errors, one existing public-image warning |
| migration-recovery.log / runtime-role.log | Injected migration rollback/rerun, PUBLIC helper denial, existing canonical role regression pass |
| maintenance.log | Actual cleanup CLI succeeds with restricted role; unit test proves no success log before commit |
| payment-processes.log | Five existing payment process/crash regression scenarios pass |
| resource-check-final.log | PostgreSQL16.14,28 migrations, zero enabled facilities; runtime has no elevated attributes, schema CREATE, Admin UPDATE or bucket DELETE |
| independent-review.md | Independent code and evidence reviews; findings fixed and reviewed |
| source-comparison.json | 58 source/harness hashes match tested copy; tracked runtime-env example reviewed separately;59 restart hashes total |
| shutdown.json | Owned container removed by verified ID/label; eight recorded Next PIDs absent/ports closed; workers/browser/reviewers completed |

Representative final mobile applicant and desktop admin screenshots were visually inspected.
The first browser screenshot exposed intermediate auto-submits; the fixed final screenshot
and exactly-one-request assertions establish the correction. Historical failures/adjustments
are retained in entry-and-attempt-history.md and their logs, not hidden or suppressed.

Controlled failures cover lock contention/timeouts, expiry during comparison and unchanged
row-lock wait, database permission failure/recovery, user-write rollback, failed cleanup,
missing/mismatched config, cookie failure, worker death and actual unavailable DB connection.
Lost commit acknowledgement is injected at the Prisma promise boundary **after a real DB
commit**; this is not a network-level PostgreSQL protocol fault. Hour-boundary testing
injects the database-clock result while exercising actual SQL accounting/storage.

## Schema, operations and limits

Migration20260919120000_otp_verification_limits adds AuthVerifyBucket/index, narrow
security-definer pruning and active-admin lock/read helpers. Runtime gets accounting
SELECT/INSERT/UPDATE and helper EXECUTE, no broad DELETE or admin writes. Existing OTPs,
users, payments/files are not backfilled or rewritten. Historical attempts>5 remain
unusable. DEPLOYMENT.md documents backups, mutation pause/drain, migration/grants/client
regeneration, secrets/proxy qualification, hourly scheduler and monitored nonzero/missed
runs, failure recovery and compatible-writer rollback. Old count-after-bcrypt writers
must not overlap. The cron example is not an installed/qualified scheduler or alert.

Local Node26/PostgreSQL16 fixtures do not qualify actual Node22 release images, staging
proxy/CDN, capacity or real SMS/payment providers. No live SMS/charge/refund, production
migration/deployment/backup, programme activation or complete Phase18 journey occurred.
Global/unknown address budgets may deny legitimate traffic during abuse; qualify trusted
attribution/load and monitoring before launch. Session lifecycle after successful login
is unchanged. Later R4/R5/R6/R9 and other phase findings remain open.

## Replay and restart

Entry/exit master HEAD29705da7e148b75a56d3a4aedc3565530c1d6974. All42 Phase3 hashes matched
on entry; only package/schema/grants among them changed in Phase4. All other Phase3
source hashes remain unchanged. September16 audit SHA256 remains
2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
All work uncommitted; no reset/stash/commit/push or unrelated edit removal.

environment.json identifies the removed labelled fixture, scratch copy and former port.
Do not reuse those destinations. Replay creates a fresh labelled container with automatic
loopback port, excludes .env* from copied source and explicitly allow-lists configuration,
including blank SMS/gateway credentials. setup.py/run.py record orchestration; inspect
before reuse and preserve fresh resource identity. Apply all migrations and canonical
restricted grants, generate client, then run the logged commands. Browser harness takes
PHASE1_PLAYWRIGHT/PHASE1_SCREENSHOTS, creates automatic ports and blocks external fetch.
No application test hook was added. Scratch paths/env are disposable, not restart state.

Durable attempts: A1 identity/D3; A2 locks/admin permissions and pg_sleep harness correction;
A3 baseline/full tests/privacy logging/commit diagnostics; A4 retention and browser assertion
corrections; A5 single-instant epoch fix and DB-clock fixture; A6 visual retry correction,
final UI/type/lint/build and shutdown. No consecutive unresolved no-progress attempts.

**Stop here. Begin Phase5 only after explicit owner continuation**, using this checkpoint,
central review/progress ledger and freshly verified source/resources. No background agent
or scheduled automation will advance the plan.
