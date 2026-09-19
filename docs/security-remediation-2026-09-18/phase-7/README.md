# Phase7 — R6 admin enumeration protection

COMPLETE locally. R6 VERIFIED_FIXED locally. Launch NO-GO.

Owner authorized sequential Phases7–20 without routine phase pauses. D1/D2/D3 remain
settled; actual unresolved product/operational decisions remain boundaries. No production,
real provider, programme enablement, reset/stash/commit/push or worktree operation.

Phase5 already counted unknown/inactive admin requests before lookup. Phase7 removes the
explicit403 and status/body distinction: every admitted admin outcome returns identical
200 conditional Persian code-entry information, even if lookup/claim/SMS is uncertain.
Unknown/inactive requests create no account/role/OTP and dispatch no SMS. Shared cooldown,
rolling quotas, protected rotating keys, cleanup and once-only claim are unchanged.
Verification still checks the active admin while consuming transactionally.

The bounded lookup and shared SMS timeout feed a minimum response floor after admission:
provider timeout +12s, default22s/max42s. Browser waits60s and locks the mobile during
pending requests. Conditional information is a linked status, not an invalid-code error;
real errors remain linked alerts. This mitigates normal timing differences with deliberate
latency. It is not constant-time or overload certification. Production ingress/timeouts,
capacity, Node22 images and actual SMS remain unqualified.

## Evidence

- Entry: master/29705da7e148b75a56d3a4aedc3565530c1d6974;76/76 Phase6 restart hashes,
 75/75 actual tested-copy hashes and47/47 evidence hashes match; audit unchanged.
 Prior owned containers/recorded PIDs absent; unrelated resources untouched.
- baseline-tests.log:7 desired-safe cases fail/13 pass against exact copied Phase6 auth.
- tests-final.log:549/549 across78 files including97 real restricted PostgreSQL cases
 (24 request,26 verification,39 payment,8 R6). First run collided between DB fixture
 resets; fixed by serializing files only in explicit isolated-DB mode. Internal concurrent
 tests remain. Failures retained in tests.log; no assertions suppressed.
- build-final.log, types-final.log, lint-final.log: pass; one existing public-image warning.
- request-processes.log:8 workers send once; crash after reservation/claim/send prevents
 fresh-worker resend. Verification process4/payment process5 crash regressions also pass.
- browser.log: initial HTTP/maximum-timeout passes, UI strict selector collides with Next
 route announcer. Corrected to exact linked error IDs; browser-final.log passes all provider modes,
 concurrent probes, max30s provider/42s floor, and six390/1440 unknown/inactive/active
 journeys with actual cookies, invalid denial, cooldown and refresh. Representative
 mobile/desktop screenshots visually inspected. Healthy timing samples are not a
 constant-time statistical or overload claim.
- resource-check-final.log:PostgreSQL16.14,29 applied migrations,0 enabled facilities,
 restricted runtime without superuser/create-db/create-role/inherit. Initial read-only
 resource query had a table-name typo; corrected without mutation.

No schema/grant/migration/retention/historical repair change. Existing Phase4–6 rollback,
secret/cleanup and cutover prerequisites remain. DEPLOYMENT adds admin uniformity and
latency qualification. Never restore account-specific errors or vulnerable auth writers.

## Replay

Read setup.py/run.py before use. Create fresh labelled PostgreSQL on an automatic loopback
port, copied sources excluding .env*, allow-listed environment, synthetic credentials,
canonical restricted grants. Prior phase database/role names satisfy harness guards only.
No former port or resource is reusable authority. Test commands/results and resource
identities are recorded locally. Controlled SMS server stays loopback; Next fixture fetch
blocks external access. PHASE1_PLAYWRIGHT selects the installed module; screenshots use
PHASE1_SCREENSHOTS. Timing helpers are mocked only in unit/DB suites; production browser
uses actual unmocked wait, real SQL and controlled provider.

Scratch source/env disposable. Preserve historical logs and exact source hashes; restart
from the durable central ledger. Phase8 follows under existing explicit authorization; no routine owner permission required.

Final prior-control evidence: origin-browser.log passes genuine HTTPS applicant/admin,
Secure/HttpOnly/Lax cookies, hostile/null forms, spoof/media/DB outage and two processes.
request-browser.log passes eight concurrent sends-one, failure/timeout/malformed, attribution,
real cookie after uncertainty, cooldown/refresh, actual unavailable DB. All exit0.
shutdown.json proves task-labelled container removal,15 recorded PIDs absent and18 ports
closed; workers/harnesses stopped. No prior/other task resources touched.82 restart hashes
include81 matching copied files plus statically reviewed runtime-env example.
