# Phase6 — R4 cross-site login protection

COMPLETE locally. R4 VERIFIED_FIXED locally. Launch NO-GO. Phase7 NOT_STARTED.

Both OTP POST routes validate canonical runtime APP_URL and exact browser Origin before
parsing or authentication effects. Missing/null/foreign/malformed origins403; non-JSON415;
malformed JSON400; invalid configuration503. JSON optionally accepts UTF-8 charset.
Host/request URL/forwarded headers do not define trust. HTTPS required except loopback.
Normal applicant/admin relative JSON fetch works through TLS termination to internal HTTP.
No schema/grants/retention/business/payment/logout change; D1/D2/D3 remain settled.

## Evidence

- baseline-browser.log: unchanged Phase5 routes, actual hostile top-level text/plain form
  creates applicant/admin cookie through local HTTPS. Historical attack reproduced safely.
- baseline-safe-tests.log:51 of58 new desired-safe route tests fail on unchanged routes;
  fixed full suite531/531 across76 files (24 request+26 verification+39 payment real DB cases).
- browser.log: hostile applicant/admin forms403/no cookie/unchanged OTP, limiter, intent and
  user state; sandbox null-Origin form403; missing/foreign/null/spoof/media/malformed matrix;
 12 hostile HTTP requests across two production Next processes; actual unavailable DB
  foreign403 and valid503/no send; invalid-config503. Normal user/admin390/1440 controls
  request/verify/dashboard/refresh with actual Secure/HttpOnly/Lax cookies over HTTPS.
- request-browser.log and verification-browser.log preserve earlier UI/failure/race checks:
  one SMS across eight requests/two processes, slow/failure/malformed/timeout recovery,
  qualified/unknown attribution, twelve guesses capped with0/1 cookies, DB503.
- request-processes.log:8 workers send1; SIGKILL reserve/claim/send denies fresh-worker resend.
  verification-processes.log:4 reservation/consume scenarios; payment-processes.log:5 prior
  coordination/crash regressions. All exit0; shared fixtures run sequentially.
- build.log/types.log/lint.log pass; one pre-existing public image warning. Final harness
  type refinement after build was checked with tsc/lint and executed in browser.
- resource-check.log: PostgreSQL16.14,29 migrations,0 enabled facilities; restricted runtime
  has no superuser/create-db/create-role/inherit. No new migration required.
- Both independent reviewers approve. Representative mobile user and desktop admin OTP
  screenshots visually inspected: controls readable, existing RTL layout fits, no horizontal
  overflow. No redesigned UI or comprehensive visual/accessibility audit claimed.

First baseline build failed on a new harness field typo; corrected to schema Admin.active,
then build passed. Failed attempt retained. No suppressed assertions or application bypass.
Local Node26 and self-signed TLS proxy/control SMS do not qualify Node22 release images,
actual production HTTPS ingress/DNS/certificates/proxy, live SMS/payment or scheduler.

## Replay and checkpoint

Use setup.py to create fresh labelled loopback PostgreSQL, explicit safe env allow-list,
source copy without .env and canonical grants. run.py executes checks in that copy.
Browser harness is prisma/tests/auth-origin/browser.ts; set PHASE1_PLAYWRIGHT to available
Playwright module and PHASE1_SCREENSHOTS to a new evidence directory. PHASE6_BASELINE=false
for fixed checks. The historical baseline was copied before implementation; do not rerun
baseline mode against fixed source. No external fetch allowed in Next fixture processes.
Prior phase database/role names only satisfy harness guards. Do not reconnect to former
ports in environment/shutdown records. No production, real SMS/charge/refund or activation.

master/29705da7e148b75a56d3a4aedc3565530c1d6974 unchanged, all73 entry hashes matched,
September16 audit unchanged. All work uncommitted; no stash/reset/commit/push. Final hashes,
source comparison, resource identity, results and shutdown recorded alongside this file.
DEPLOYMENT and runtime example document canonical origin, proxy qualification and rollback.
Rollback retains the guard and earlier quota/session safety; never restore vulnerable writers.

STOP after Phase6. Explicit owner continuation required for Phase7.
