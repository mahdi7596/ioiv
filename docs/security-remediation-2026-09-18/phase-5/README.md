# Phase5 — R5 OTP request throttling and SMS abuse prevention

**COMPLETE locally. R5 VERIFIED_FIXED locally. Overall launch NO-GO. Phase6 NOT_STARTED.**
Owner explicitly requested Phase5 in a new task. D1/D2/D3 remain approved; no new privacy
policy, production action or later-phase authorization. Existing master checkout and all
uncommitted work preserved.

## Delivered behavior

Atomic PostgreSQL admission spends90-second mobile+purpose cooldown, five/hour rolling
mobile+purpose quota, configured address quota (default30/hour) and request-global3000/hour
before hashing/admin lookup/dispatch. Unknown addresses share the configured address
budget; only explicitly qualified X-Real-IP is canonicalized, never XFF. Verification
budgets remain separate. Both namespaces check the dedicated-secret fingerprint.

One-use durable intent and OTP replacement commit together. Fresh intent expiry follows
locks, preventing delayed work from superseding later codes. Only acknowledged claim
commit can dispatch once. SMS failures/uncertainty/crashes spend quota, no automatic paid
retry or refund. Awaited bounded provider failure leaves OTP entry available with Persian
warning, so a possibly delivered code remains usable. Explicit resend obeys quotas.
Provider delivery order and exactly-once remote delivery are not promised.

Hourly HMAC identity rotation/current+previous accounting reuses Phase4 infrastructure.
Intents hold only protected key/UUID/timestamps and prune after2hours; hourly maintenance
keeps healthy intent retention about3hours, buckets about4hours, within approved24hours.
Admission/claim requires cleanup success. No raw address stored in new OTPs, no OTP/message
logs, no new recoverable code material. No backup/WAL retention or downtime erasure promise.
Applicant/admin accessible loading/error/retry UI and90-second resend remain in existing
visual language. Admin enumeration and CSRF remain Phases7/6; no changed business workflow.

## Verification

| Check | Result |
| --- | --- |
| final2-tests.log |473 tests/75 files pass;24 request +26 verification +39 payment restricted PostgreSQL cases |
| baseline-r5.log | Desired-safe eight-request test fails against exact Phase4 auth source:8 accepted, expected1 |
| processes.log |8 independent processes send exactly1; SIGKILL after admission/claim/send and fresh-worker retry cannot resend |
| browser-final.log |2 production Next processes/8 HTTP requests send1; slow/failure/malformed/timeout, unknown/qualified address, actual DB outage503/no dispatch |
| browser-final.log |Applicant/admin390/1440 loading, uncertain entry, actual successful cookie,429/refresh no resend, accessible errors/no overflow; every fixture OTP absent from captured logs |
| verification-browser.log |Phase4 UI regression,2-process12 wrong/correct guesses produce0/1 cookies; actual DB503/no cookie |
| otp-verification-processes.log / payment-processes.log |4 verification and5 payment process/crash regressions pass |
| final2-build.log / final-types.log / final-lint.log |Build/types pass; lint0 errors,1 pre-existing image warning |
| migration-recovery.log / runtime-role.log |Injected transaction rollback/rerun, PUBLIC denial, canonical restricted-role regression pass |
| maintenance.log |Actual combined cleanup command commits then reports success |
| resource-check-final.log |PostgreSQL16.14,29 applied migrations,0 enabled facilities, no elevated runtime privileges |
| independent-review.md |Two independent critical reviewers approve; findings resolved |

Mobile uncertain-entry and desktop admin screenshots visually inspected. Initial missing
applicant alert discovered by browser test was fixed, not bypassed. Failed test/resource
inventory attempts retained in the attempt log. Hour boundary uses injected DB clock over
real SQL. Lost acknowledgement uses an injected exception after actual transaction commit,
not a PostgreSQL protocol network fault. Real provider/Node22/proxy/scheduler qualification
and later findings still prevent launch. No live SMS/payment/refund or production action.

## Schema, rollout and restart

Migration20260919130000_otp_request_intents adds one table/index and narrow cleanup helper;
canonical grants explicitly deny DELETE/TRUNCATE and PUBLIC helper access. No historical
backfill or OTP/payment/file rewrite. Pause/drain all old auth writers before migration,
grants, client regeneration and compatible app/maintenance rollout. Retain expanded data
on rollback; never restore vulnerable writers or truncate live budgets. DEPLOYMENT.md,
runtime-env and maintenance example give configuration/retention/recovery procedures.

Entry/exit master/29705da7e148b75a56d3a4aedc3565530c1d6974.59/59 Phase4 hashes matched on
entry; unchanged payment source remains preserved. September16 audit SHA256 remains
2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
Exact restart hashes/source comparison, changed files, workspace status, results, resource
identities and shutdown are saved here. No reset/stash/commit/push.

Replay: inspect setup.py/run.py, create a fresh task-labelled PostgreSQL container with
automatic loopback port, copied source excluding .env files and explicit safe environment
allow-list. Apply migrations/canonical grants and generate client. Run checks from
results.json serially when sharing fixture state. PHASE1 names exist only for prior
harness guards. Browser provider and ports are local/automatic, external fetch blocked.
Never reconnect to former endpoints in environment.json/shutdown.json. Scratch/env are
disposable; durable evidence is in this directory. Reinstall qualified scheduler only
under future authorized rollout; no automation advances the plan.

**Pause after Phase5. Begin Phase6 only on explicit owner continuation.**
