# Phase 4 — R3 entry and D3 decision, 2026-09-19

Status: preparation complete; implementation paused at unresolved D3. R3 remains OPEN;
launch remains NO-GO. Owner authorized Phase 4 only, including determining whether D3
requires a concrete decision. D1/D2 remain settled. Phase 5 has not begun.

## Entry evidence

Existing master checkout, HEAD 29705da7e148b75a56d3a4aedc3565530c1d6974.
All 42 Phase 3 source hashes match; September 16 audit SHA256 remains
2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
See entry-check.json, source-hashes.json and workspace-entry.txt. No reset, stash,
commit, push, application/schema/grant/config edits or resource creation occurred.

Source inspection confirms auth.ts still reads the attempt ceiling before bcrypt,
increments only afterward, and consumes with request-start time without live expiry.
Missing/unusable codes perform unmetered dummy comparisons. The existing session is
a JWT cookie, so one winning live consume must authorize one cookie issuance; there
is no session table. Existing OTP pruning has a 24-hour cutoff but its restricted-role
permissions remain the separate R9 finding. No new tests/build/browser run is claimed.

## Concrete D3 proposal for owner decision

Approve new, shared verification-abuse accounting with these privacy boundaries:

- Store dedicated-secret keyed HMAC identifiers for normalized mobile+purpose and
  canonical client address. These are pseudonymous identifiers, not anonymous data.
  Do not store raw mobile/IP, submitted OTP, code hash, JWT, or message content in
  the new limiter records or their diagnostics. Existing OtpCode data is unchanged.
- Store only the key/scope, reservation timestamp and minimal concurrency bookkeeping
  needed for enforcement. Use a shared unknown-address budget; missing address must
  not bypass enforcement. Header trust is not proved by syntactic IP validation.
- Enforce rolling verification windows using database time. Keep new identifier-linked
  accounting for at most 24 hours during healthy operation in the active database, deleting spent reservations
  and inactive identifier-bearing buckets through narrowly scoped cleanup. Avoid
  indefinite empty per-person buckets. No new analytics or long-term abuse history.
- Provide a dedicated protected configuration secret; do not reuse SESSION_SECRET.
  Missing configuration/database capacity fails closed. Rotation must not silently
  reset live budgets. Document maintenance, cleanup failure detection and recovery.

The retention statement is a policy to implement and test, not an existing guarantee.
Database downtime, maintenance delays, WAL and backups require explicit qualification;
do not claim physical erasure from every copy within 24 hours. Existing backup retention
is not silently changed by D3. Concrete cleanup cadence/headroom and bounded recovery
must be documented before verification. If required cleanup fails, block verification/new
records until overdue cleanup succeeds; resume only after recovery checks. This cannot
guarantee physical deletion during database downtime.

This decision concerns new privacy/retention behavior, not routine SQL or test choices.
The Phase 0 design explicitly says: “D3 new limiter-key protection/24-hour abuse-record
retention: proposed; confirm before Phase 4–5 schema implementation.” The master prompt
requires: “If a real owner decision is required, stop at that decision boundary without
guessing approval.” No recorded later instruction settles D3.

## Implementation and verification after D3 is settled

Use existing attemptCount for an atomic conditional reservation before real bcrypt,
counting all reserved guesses (including correct guesses) toward five. Recheck database
time/unconsumed state at final transaction; create/find user or recheck active admin
there. Only the winning commit may issue a cookie. Failed delivery never reopens the
code. No expensive verification/network I/O inside a held transaction. Shared abuse
accounting must also bound missing/exhausted/expired-code work across processes.

Add only required verification coordination schema/grants/maintenance. Preserve existing
request-OTP/SMS behavior for Phase 5. Additive migrations need failed-migration recovery
tests, restricted-role checks, writer cutover and compatible rollback documentation;
old vulnerable verification writers cannot overlap. No production migration authorized.

Prove original twelve-request reproduction reaches at most five real-code comparisons;
race correct attempts and expiry during comparison; test unavailable DB, conflicts,
ambiguous commits, worker crashes, spent reservations and safe recovery. Use fresh
labelled isolated PostgreSQL, multiple processes and automatic loopback ports, explicit
environment allow-list, blank external credentials and no inherited .env. Test applicant
and admin production browser flows/mobile RTL errors, regression/types/lint/build and
independent critical implementation/evidence review. Preserve R1/R2/R12 and facilities
disabled. Update DEPLOYMENT.md only when implementation changes its operational contract.

## Attempt log and restart

| Attempt | Hypothesis/check | Result | Next action |
| --- | --- | --- | --- |
| A1 | Compare Phase 3 identity and inspect D3/current verification flow | 42/42 hashes and audit match; D3 explicitly unapproved; R3 source defect remains | Obtain D3 decision before implementation |

Independent read-only reviewer phase4_boundary_review confirmed the decision boundary.
Review clarified healthy-operation retention versus downtime/backup guarantees, live
window expiry independent of cleanup, HMAC consistency/rotation, trusted addresses and
separate verification thresholds. Existing raw clientIp verification logging must be
removed in the changed path; no claim is made that existing logs are already sanitized.
Reviewer completed; no active review process remains.

No repeated failed implementation attempt; no-progress count 0. No owned DB, server,
browser or provider to shut down. This is a decision checkpoint, not Phase 4 completion.
After owner response, recheck source identity, record the exact D3 decision and implement
Phase 4 only. Do not reopen D1/D2 or advance to Phase 5.


## Owner decision — D3 approved

After plain-language explanation of protected phone/address identifiers, temporary
login-attempt accounting and normal deletion within24 hours (without deleting account
or application data), owner explicitly replied “agreed”. This resolves D3 privacy/
retention; Phase4 implementation may proceed. No broader phase or production approval.
Restart42/42 Phase3 source hashes match before implementation.

Concrete implementation: verification-only rolling-hour limits30 per mobile+purpose,
120 per trusted canonical address,300 for shared unknown address,3000 global. These
allow normal five-guesses-per-code usage without borrowing Phase5 request quotas.
The global bound caps key cardinality. Every admitted verification, including unusable
codes, spends shared capacity before bcrypt; denied mobile attempts still spend address/
global capacity. Limits return existing-style Persian429; database/config faults503.
Default address is unknown unless deployment explicitly qualifies a stripping proxy;
verification trusts only X-Real-IP then, never forwarded-chain fallback.
Use bounded timestamp arrays in a new limiter table, serialized short DB transactions,
HMAC secret fingerprint consistency on the global row, two-hour inactive-key pruning
on admission and hourly maintenance (24-hour healthy-operation policy headroom).
Narrow security-definer cleanup only deletes expired limiter rows, no broad DELETE.
No request/SMS or existing OTP-pruning changes. Reuse existing OTP fields for reservation
and transactionally finish user/admin resolution plus live code consumption.


A2 implementation/review: atomic code reservation and final consume, shared HMAC limiter,
narrow pruning/admin-lock capabilities implemented. Independent design review caught
SELECT-only Admin lock permissions and expiry evaluated before a row-lock wait; both
addressed before DB verification. First focused run30/32 passed; two lock-expiry tests
failed because Prisma cannot decode pg_sleep's void result. Changed test to executeRaw;
security behavior unchanged. Re-run pending. No-progress count0.


A3:32/32 focused passes; four-process/twelve guesses cap real comparisons at5 and
one authorization; SIGKILL after reservation/consume preserves safe restart. One new
regression fails against untouched HEAD auth.ts with12 comparisons (baseline-r3.log);
fixed source restored immediately in isolated copy. Review fixed malformed JSON raw
exception logging and cleanup success-before-commit. Full initial432/432 across72
files and production build pass. Initial types also found literal widening in new
consume result (fixed) and missing Next-generated RouteContext before build (generated
by build). Added lock-timeout, consume-write failure and actual-commit/lost-ack tests.
Migration transaction failure/rollback/rerun and PUBLIC helper denial pass in separate
disposable DB, removed afterward. Final updated checks/browser are pending.


A4 review adjustment: final435/73 tests and build passed, but evidence reviewer found
active HMAC keys could remain beyond approved temporary retention. Implemented hourly
DB-clock HMAC epochs with current+previous bucket accounting (not a policy relaxation),
so active identities also age out within about3h; added boundary regression. Added
explicit trusted-address/global cap tests. Browser390 user succeeded; admin harness
matched /admin/login prematurely and aborted reload. Tightened successful/denied URL
assertions and cleanup finally; added loading-state checks. Rerun pending.


A5 review/verification: epoch crossing flaw corrected with a single DB admission instant
for epoch/event timestamps/cutoffs; deterministic clock-seam test passes. Boundary suite
initially25/26 because the expired fixture used host time minus1ms (host/container clock
assumption), not database time. Changed fixture to read database clock; final440/73
passes, including26 OTP DB and39 payment DB cases. No production behavior relaxed.
Browser all390/1440 applicant/admin flows, two Next12-request cookie races and unavailable
loopback DB503 pass. Visual review exposed intermediate auto-submits when editing a
complete rejected code; clear failed applicant/admin codes and assert exactly one
request per entry. Final UI rebuild/browser verification pending.
