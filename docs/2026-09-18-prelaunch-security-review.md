# Pre-launch security and reliability review

Date: 2026-09-18. Candidate: `master`, `29705da7e148b75a56d3a4aedc3565530c1d6974`.

**Verdict: do not open this candidate to users yet.** Passing existing tests did not
establish safe concurrent authentication, payment, or file replacement behavior.
This review adds evidence, not application fixes or deployment authorization.

The pre-existing uncommitted edits to the September 16 audit were preserved.
Three independent reviewers inspected authentication/admin boundaries,
payments/uploads, and deployment/operations. Findings below distinguish live local
reproductions, mocked payment reproductions, and source-level conclusions.

## Verification completed

| Check | Result |
| --- | --- |
| Existing Vitest suite | 68 files, 308 tests passed |
| ESLint | No errors; one existing `no-img-element` warning on public page |
| TypeScript | `npx tsc --noEmit` passed |
| Production Next.js build | Passed with isolated database and dummy configuration |
| Fresh PostgreSQL 16 database | All 24 migrations applied |
| Database integration suites | Foundation, runtime role, private files, payment, review, operations, supplier provisioning all passed |
| Backup/restore and migration failure rehearsal | Disposable DB dump restored; intentional transaction failure rolled back; migrations reran successfully |
| Anonymous HTTP checks on production-mode localhost server | Dashboard/admin redirect to login; export/private file access denied; security headers present |
| Authentication abuse checks | Three vulnerabilities reproduced, below |
| Payment concurrency checks | Two vulnerabilities reproduced with deterministic gateway/DB mocks |
| Runtime-role cleanup permissions | Both required DELETE permissions absent, confirmed in real PostgreSQL using canonical grant file |
| Facilities release records | Example structure valid, 20 pending records; requiring G3 fails |
| Dependency advisory query | Five affected package nodes: three high, one moderate, one low; image reachability not yet qualified |

All database writes and HTTP probes used a newly created loopback-only disposable
database/server. SMS and payment credentials were explicitly blank; no real SMS,
gateway charge, production access, migration, upload, or deployment was performed.
The restore rehearsal used synthetic data, not a backup of production.

## Findings and required fixes

### R1 — P1: stale cancellation overwrites a verified legacy payment

Evidence: `lib/payments/legacy-settlement.ts:124` checks the caller's old payment
snapshot and updates by ID without a live-state condition. The subsequent application
update also uses the old snapshot. A cancellation read before a successful callback
can commit afterward, changing VERIFIED to FAILED and SUBMITTED to DRAFT.

Confirmed by the deterministic reproduction in
`security-review-2026-09-18/payment-races.test.ts.txt`. This can invite a second charge
and leave payment/accounting state inconsistent.

Acceptance: conditional state changes under a shared application lock; a verified
payment never regresses; simultaneous cancellation, success, retry, and administrative
transitions leave one consistent outcome and accurate history.

### R2 — P1: concurrent payment attempts can both be captured

Evidence: `lib/actions/payment.ts:150` creates a legacy attempt without reserving the
application atomically. `lib/payments/legacy-settlement.ts:48` checks other verified
attempts before the gateway operation, then updates only its own payment row.
The mock reproduction forces two different authorities past this check: both verify,
both become VERIFIED, and both create history. This does not prove two real charges
were made; it proves the application lacks the required serialization.

Facilities has the corresponding source-level late-capture race at
`lib/actions/facilities-payment.ts:419`: an old failed attempt and a current attempt
can both pass the initial check before verification. Its unique verified-payment
index prevents two records, but cannot undo external capture already confirmed.

Acceptance: serialize start and verification decisions per application, including
late attempts; preserve recoverable state across process/DB/provider failures;
test two authorities, duplicate callbacks, stale reads, and failure after capture.
Do not hold a long database transaction around a network call without evaluating
timeouts and recovery; use a durable reservation/lease or another explicit design.

### R3 — P1: concurrent guesses bypass the OTP attempt ceiling

Evidence: `lib/actions/auth.ts:213` reads `attemptCount < 5` before bcrypt. Increment
and consumption at lines 235 and 253 are not conditional on an atomically reserved
attempt. Twelve simultaneous wrong guesses against the running local app all reached
verification, and the stored attempt count became **12**.

Acceptance: atomically reserve at most five attempts before comparison; check live
expiry and consumption when issuing a session; concurrent guesses cannot exceed the
limit and only one correct request can consume a code. Add distributed abuse limits
for requests without a usable OTP as well.

### R4 — P2: cross-site request can establish an attacker-owned login

Evidence: `app/api/auth/verify-otp/route.ts:5` accepts `request.json()` without
checking media type or Origin. A local HTTP request with hostile Origin and a
browser-form-compatible `text/plain` JSON body returned **200** and issued
`sana_session`. The extra form padding field is discarded by Zod.

An attacker needs a fresh OTP for their own account and must induce a victim to
submit the form. The resulting risk is the victim entering private documents into
the attacker's account. This was reproduced at the HTTP endpoint; a full browser
navigation/cookie attack was not executed.

Acceptance: enforce same-origin authentication requests and JSON media type; reject
foreign/null origins according to an explicit policy; test hostile form submissions
as well as the normal applicant/admin login in a browser.

### R5 — P2: concurrent OTP requests bypass request/SMS limits

Evidence: `lib/actions/auth.ts:131` checks cooldown and counts before hashing and
creating the code. Eight simultaneous local requests for one new number all returned
**200** and created **eight** records despite the 90-second cooldown and five/hour
limit. External SMS dispatch was disabled by blank credentials for this check.

Acceptance: atomically reserve per-mobile and per-IP capacity, including across app
instances; concurrent requests produce no more than the allowed number of codes/SMS;
provider failure has an explicit safe retry policy.

### R6 — P2: rejected admin-number probes do not consume the IP budget

Evidence: `lib/actions/auth.ts:98` counts OTP records, but inactive/nonexistent admin
requests return 403 at line 140 without creating one. Repeated rejected probes remain
unmetered, and differing responses identify active admin numbers. Source-confirmed.

Acceptance: count rejected requests in an independent limiter; test many unknown
numbers, spoofed proxy headers, and concurrent requests. Prefer uniform responses.

### R7 — P1 for facilities rollout: failed replacement can block future uploads

Evidence: `lib/facilities-files/service.ts:178` allocates `max(revision)+1` and points
to the current successful predecessor before scanning. Failed replacement rows remain.
A later retry advances the revision again while retaining the same predecessor.
The M8 trigger in
`prisma/migrations/20260912120000_add_facilities_m8_export_audit_resilience/migration.sql:53`
requires predecessor revision + 1. The lifecycle migration also uniquely indexes
`replacesUploadId`. Thus a failed replacement can make a new-key retry impossible.

Confirmed against the isolated migrated PostgreSQL database for both FAILED/SCAN_FAILED
and UNAVAILABLE/SCANNER_UNAVAILABLE outcomes: the next revision was rejected with
`facilities file replacement requires the preceding passed revision`.
The rollback-only SQL reproduction is
`security-review-2026-09-18/facilities-failed-replacement.sql`; all fixtures were removed
by transaction rollback and their absence was verified.

Acceptance: separate attempts from committed replacement lineage, or otherwise allow
safe retries without weakening quotas/auditing. Test scanner unavailable, malware
rejection, storage failure, and successful retry of an existing document against real
PostgreSQL. A schema fix needs migration/rollback review.

### R8 — P2: simultaneous legacy replacements can delete both new files

Evidence: `lib/uploads/replace.ts:13` independently selects every same-slot row except
its own and deletes the selected rows. Two uploads inserted before either cleanup can
select each other, delete both, and still return successful file IDs. Source-confirmed;
this race is masked when the restricted role cannot DELETE, as described in R9.

Acceptance: serialize same-slot replacement and atomically identify the predecessor;
one current file survives every concurrent replacement; database/filesystem failure
does not leave the applicant referencing missing content.

### R9 — P2: documented runtime role cannot perform cleanup

Evidence: `prisma/facilities-runtime-role-grants.sql:42` grants no DELETE on OtpCode,
and line 44 grants no DELETE on ApplicationFile. Yet `scripts/prune-otp-codes.ts:18`
and `lib/uploads/replace.ts:19` require them. Applying the canonical grants to a
disposable PostgreSQL role confirmed both privileges are false. Replacement swallows
cleanup failure; maintenance can log pruning failure without failing its entire run.

Acceptance: narrowly grant required cleanup capabilities or use a dedicated maintenance
boundary; test actual pruning and file replacement as the restricted role, and ensure
cleanup failures reach the operator. Fix R8 alongside enabling its DELETE operation.

### R10 — P2: required legacy files can be nonexistent placeholders

Evidence: `lib/validations/application.ts:3` accepts a nonempty file ID, while
`lib/actions/payment.ts:50` validates the submitted document structure without loading
and checking referenced file rows, ownership, application, and slots. A manipulated
request can satisfy readiness without uploaded documents. This is submission integrity,
not a demonstrated cross-user file-download bypass.

Acceptance: validate every required reference against current owned, available files
before payment/submission, including stale, deleted, wrong-slot, and foreign IDs.

### R11 — P2: legacy admin status updates can overwrite each other

Evidence: `lib/actions/admin.ts:99` validates a status read outside the transaction,
then line 118 updates by ID alone. Competing allowed transitions can overwrite a newly
completed case, with stale previousStatus history and misleading notifications.

Acceptance: lock/revalidate or compare-and-swap the status, return an actionable Persian
conflict response, and test simultaneous completion/correction and applicant resubmission.

### R12 — P2: payment verification accepts incomplete success payloads

Evidence: `lib/payments/zarinpal.ts:187` documents success codes 100/101 but does not
check the returned code; a string/number `ref_id`, including zero, passes. This is a
malformed-provider-response resilience gap, not evidence a browser can forge payment.

Acceptance: explicitly validate the gateway success code and usable reference according
to its current documented contract; all incomplete/contradictory responses remain
unknown and retryable. Cover these cases with gateway-adapter tests.

### Lower priority

- `app/api/auth/session-reset/route.ts` clears valid sessions on GET, allowing forced
  logout through navigation. Restrict it to genuinely invalid sessions or protect mutation.
- Compose defaults POSTGRES_PASSWORD to `postgres`. Require a supplied credential.
- CSP permits inline scripts; it is not a complete XSS defense. No direct injected-HTML
  path was found in the inspected source. Keep the existing React escaping boundary.

## Dependency findings

Raw results are preserved in `security-review-2026-09-18/npm-audit.json`.
The three high package entries are one dependency chain: deepmerge-ts → @prisma/config
→ prisma, not three independent exploitable app vulnerabilities. The Docker runner
explicitly removes Prisma CLI/config; actual built runner and maintenance images still
need scanning. Do not apply the audit's suggested Prisma downgrade blindly.

The reviewed [deepmerge-ts advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
requires recursive object graphs; ordinary JSON alone does not create that condition.
The other reported packages are
[baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) and
[esbuild](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr); the latter's described
case concerns its development server on Windows. Remote exploitability in this Linux
application was not established. Resolve or document image-specific reachability.

## Work still required before launch

1. Fix R1–R12 as applicable to the enabled programme, then add desired-behavior
   concurrency/failure regressions and obtain independent review of the fixes.
2. Rehearse complete applicant and admin journeys in an isolated browser/staging setup:
   OTP, profile, all document steps, uploads/replacements, payment return, corrections,
   resubmission, approval/certificate, exports, role denial, expiry, refresh/retry,
   mobile/RTL layouts, and accessibility/error states. This review's HTTP smoke checks
   and mocked UI tests are not a complete browser acceptance run.
3. Verify a pinned, running scanner, fresh signatures, clean/malicious test-file handling,
   outage behavior, and maximum-size uploads. Base Compose has no scanner service while
   uploads require one; the supplied override is only an example, not installed evidence.
4. Verify actual proxy body/rate/time limits, trusted client IP handling, HTTPS/cookies,
   private storage, restricted runtime role, resource limits, scheduler and alerts. Test
   load, chunked uploads, storage/DB outage and recovery only in staging.
5. Run sandbox gateway and SMS integration tests without real applicant data. Validate
   reconciliation, missed callbacks, duplicate authorities, and notification failures.
6. Scan exact runner/maintenance image digests and record residual dependency exposure.
7. Before production changes, create the dated Git backup and verified matching database,
   uploads, and configuration backups required by AGENTS.md; prove restore and rollback
   using actual release artifacts. The synthetic restore here is insufficient for that.
8. Keep facilities disabled until actual approved decision/evidence records satisfy all
   required gates. The examples' 20 pending records are not approvals, and external
   approvals were not provided or inspected during this review.

No claim of zero risk or complete security certification is made. Production/server
configuration, browser acceptance, scanner behavior, capacity, and real external
integrations remain unverified. There was no deployment during this review.

## Reproducing the payment evidence

The audit-only tests assert observed vulnerable behavior and are stored as `.txt` so
the normal regression suite does not endorse it. From the repository root, copy
`docs/security-review-2026-09-18/payment-races.test.ts.txt` temporarily to
`tests/security-review-payment-races.test.ts`, run
`npx vitest run tests/security-review-payment-races.test.ts`, then remove that temporary
copy. Both tests currently pass because both defects reproduce. Convert them to
desired-safe-behavior assertions when implementing the fixes.

## Remediation planning — 2026-09-18

The proposed execution instructions are in
[Security remediation master prompt — four pillars](2026-09-18-security-remediation-master-prompt.md).
They define Phase 0 for baseline/design and 20 focused remediation and qualification
phases, using understand → implement → verify → adjust with independent review and
an evidence-backed closure record for each phase.

Execution is explicitly phase-by-phase: after each phase (including Phase 0), save
the results and a durable restart checkpoint, stop, and wait for the owner's
"continue" before beginning the next phase. See the master prompt's mandatory
end-of-phase checkpoint and pause instructions.

This is planning only. R1–R12 remain open; no application fixes, release approvals,
or production actions are implied. The current launch verdict remains **NO-GO**.
During execution, append finding closure evidence here and maintain the detailed
attempt/phase ledger at `docs/security-remediation-progress.md`.

| Review finding or remaining area | Planned phase |
| --- | --- |
| R2 — payment concurrency | 1 |
| R1 — verified payment regression | 2 |
| R12 — gateway response validation | 3 |
| R3 — OTP verification limits | 4 |
| R5 — OTP request throttling | 5 |
| R4 — login CSRF | 6 |
| R6 — admin enumeration | 7 |
| R7 — failed facilities replacement | 8 |
| R8 — legacy replacement races | 9 |
| R10 — document reference integrity | 10 |
| R9 — cleanup permissions | 11 |
| R11 — admin transition races | 12 |
| Session reset/logout | 13 |
| Dependencies and actual images | 14 |
| Scanner deployment and verification | 15 |
| Server/proxy/storage, default password, CSP assessment | 16 |
| Backups, restore, monitoring and alerts | 17 |
| Complete browser journeys | 18 |
| External sandbox payment/SMS evidence | 19 |
| Actual facilities decisions, release gates, final verdict | 20 |


## Remediation execution checkpoint — 2026-09-18, Phase 0

**Current verdict: NO-GO. Phase 0 engineering preparation locally verified; phase status
BLOCKED pending owner agreement on the concrete design (D2) and payment reconciliation/
duplicate/refund policy and ownership (D1). Phases 1–20 have not started.** The original
review and its evidence above remain historical records; no finding has been fixed.

The owner authorized Phase 0 only. Its complete coverage register, attempts, decisions
and restart state are in [security-remediation-progress.md](security-remediation-progress.md).
Concrete payment/OTP/upload models, schema/grants, existing-data repair, writer
compatibility, retention, UI and rollback proposals are in
[the Phase 0 design](security-remediation-2026-09-18/phase-0/design.md). These proposals
are not newly approved business rules or deployed changes.

Current baseline: master `29705da7e148b75a56d3a4aedc3565530c1d6974`, with the recorded
pre-existing uncommitted audit work preserved. Fresh loopback PostgreSQL 16.13 container,
24 existing migrations, copied source, explicit safe environment and blank external
credentials. Production-mode localhost HTTP used canonical restricted runtime grants.
[Evidence and replay guide](security-remediation-2026-09-18/phase-0/README.md) records
commands, exact environment, results and limitations.

| Phase 0 check | Current result / qualification |
| --- | --- |
| Unit suite | 308/308 across 68 files; initial copied-source Git context failure corrected, not suppressed |
| Type/lint/build | Types/build pass; zero lint errors and one existing image warning; initial build dependency-symlink failure corrected |
| Seven real DB suites | Pass; new disposable DB, no production access |
| Synthetic restore | Schema/catalogue restoration and intentionally failed transaction rollback/rerun pass; not DB/uploads/config recovery |
| R1/R2 | Two deterministic legacy payment mocks reproduce defects; facilities race remains source evidence; no external capture proof |
| R3/R4/R5/R6 | HTTP reproduces count 12 guesses, foreign text/plain cookie, eight accepted code requests, 35 unaccounted rejected admin probes |
| R7 | Real-DB FAILED/UNAVAILABLE replacement retries rejected; rollback fixture absence verified |
| R9 | Both required DELETE privileges absent; actual maintenance behavior still needs Phase 11 tests |
| M9 | Structure valid with 20 pending; required G3 fails. Actual repository has G0–G7; no gate approval |
| Review | Independent design findings corrected and follow-up passed; independent evidence review confirmed limits |

All R1–R12 remain **OPEN**, including source-level R8/R10/R11/R12, as do session reset,
default password/CSP, dependencies/images and operational qualification. No accepted risk
or blanket safety claim. No complete browser, actual scanner, sandbox payment/SMS, staging
proxy/alert/load, production inventory or matched production backup evidence was obtained.
Local Node 26 differs from intended Node 22 images; no current image qualification.

No migration/grant/config/application change, live SMS, charge, programme enablement,
production deployment or production backup operation occurred. `DEPLOYMENT.md` now
separates historical deployment assertions from current NO-GO qualification.

Pause basis: AGENTS.md requires agreement on the concrete data-affecting design; the
master prompt requires stopping at owner decisions without inventing approval. D1/D2
are outstanding, so this is an incomplete Phase 0 checkpoint, not permission to begin
Phase 1. The next owner response must resolve those items; “continue” alone does not
approve unresolved product decisions. Task-owned server/database are shut down as
recorded in the durable checkpoint; no background work advances the plan.


### Owner decision update after Phase 0 checkpoint

The owner approved blocking another payment while the original outcome is uncertain,
checking the original payment, and preserving the application/evidence. The project
owner will initially reconcile unresolved cases manually through gateway dashboard/support;
no new admin-panel reconciliation feature is in scope. Automatic refunds are not
authorized. Response deadline and D2 design agreement remain pending; provider finality
must still be verified. Phase 0 remains paused/incomplete; Phase 1 has not started.


### Follow-up owner decisions — payment handling settled

D1 is decided for implementation: owner investigates upon client report, with no
scheduled manual review or response-time commitment and no new admin-panel feature.
For unresolved results only, show the approved Persian guidance to avoid paying again
and contact support if the status does not change. Preserve automatic verification,
application data and payment evidence; an unreported uncertain case may remain blocked.
No automatic refund authorized. Provider behavior must still be verified during the
relevant engineering phases. D2 technical-design agreement is the remaining Phase 0
acceptance item. No implementation or production action has begun.


### Phase 1 handoff authorization

Following the Phase 0 design/payment discussion, the owner explicitly requested “continue
phase 1 only but in a new chat”. This supersedes the earlier D2 approval pause: Phase 0
is complete and Phase 1 may proceed with the documented design and settled payment
policy. No production operations or later phases are authorized. Launch remains NO-GO;
no finding has yet been fixed. See the latest handoff in the progress ledger.


### Phase 1 final checkpoint — local R2 remediation, 2026-09-18

This supersedes the preceding historical “no finding has yet been fixed” statement for
R2 only. Phase 1 is COMPLETE locally: durable obligation selection, pre-I/O operation
claims, append-only authority/capture evidence, conservative crash/timeout handling,
original-authority replay, competing-callback retention and once-claimed notification
intent now coordinate legacy and facilities payments. Unknown remote outcomes continue
to block a new charge and retain the approved support-contact guidance.

Evidence: 326/326 tests (69 files), final delta 64/64 (7 files), 16 restricted-role real
PostgreSQL cases, five separate-process crash scenarios, historical migration failure/
recovery, existing DB regressions, focused production browser QA, build/types/lint and
two independent critical reviews. See [Phase 1 evidence](security-remediation-2026-09-18/phase-1/README.md)
for exact scope and qualifications. Local controlled providers do not prove current
Zarinpal finality/idempotency or real sandbox behavior. Facilities tests isolate readiness;
full journeys and deployment image qualification remain outstanding.

Release remains **NO-GO**. R1 cancellation/stale writes (Phase 2), R12 provider response
validation (Phase 3), provider qualification/release gates and other open findings remain
open. No production change, live payment/SMS, refund or facilities activation occurred.
Owned local test resources were shut down. Phase 2 is NOT_STARTED; stop here until the
owner explicitly directs continuation.

### Phase 2 closure — R1 locally VERIFIED_FIXED, 2026-09-19

**Overall verdict remains NO-GO. Phases0–2 COMPLETE locally; Phase3 NOT_STARTED.** This
entry supersedes earlier R1-open statements only within the local verified scope. Owner
explicitly requested Phase2 only; no production operation or later phase was executed.

Legacy NOK returns now use durable server verification; cancellation cannot overwrite a
verified payment or reset a later review state. Live conditional settlement/request writes,
locked paid corrections, one actual-transition history/notification intent, and narrow
admin status/version CAS preserve payment/application/history consistency. A known conflict
removes only its newly staged certificate; existing certificate bytes/reference survive.
The return screen reflects current dashboard state. No schema/grant/retention changes.

[Phase2 evidence and replay](security-remediation-2026-09-18/phase-2/README.md): eight
new desired-safe cases failed against the verified Phase1 baseline, then341/341 tests pass
(69 files), final66/66 focused delta,30 restricted-role DB cases, five process-crash
regressions, build/types/lint and production browser checks at390/1440px. Both independent
critical reviewers approved after real admin race, rollback/certificate and facilities
cancellation coverage. Failed harness/mock/type expectations and corrections are retained.
Owned server/container stopped; durable restart identity is in the
[progress ledger](security-remediation-progress.md).

Evidence uses controlled providers, synthetic sessions/documents and isolated PostgreSQL.
Facilities readiness is stubbed only in coordination tests; complete browser journeys,
scanner, real sandbox/SMS, release images/infrastructure and matched production recovery
remain unqualified. R11's broader admin/certificate qualification remains Phase12 despite
its narrowly shared writer guard here; R12 remains Phase3. No accepted risk is reclassified
fixed. Facilities stays disabled. No real charge/SMS, refund, production migration,
backup, deployment or activation occurred. Pause before Phase3 until explicit continuation.

### Phase 3 closure — R12 locally VERIFIED_FIXED, 2026-09-19

**Overall verdict remains NO-GO. Phases0–3 COMPLETE locally; Phase4 NOT_STARTED.** This
supersedes historical R12-open statements for newly received provider responses only.
Current official Zarinpal documentation was checked; endpoint success codes, complete
noncontradictory envelopes, positive safe integer refs and mode-specific authorities are
validated. Stored payment amount drives legacy request creation. Provider prose is omitted
from errors. Malformed responses preserve uncertainty/evidence and cannot invite repayment.
R1/R2 coordination and verified-state protection remain. No new schema/grants/retention/UI.

[Phase3 evidence](security-remediation-2026-09-18/phase-3/README.md):42 new desired-safe
adapter assertions failed on Phase2; final413/413 across70 files includes39 restricted-role
PostgreSQL cases. Five process-crash cases, production browser at390/1440px with actual
adapter/local HTTP provider, build/types/lint pass; one existing image warning. Independent
contract/code and evidence reviewers approved after corrections. Fixtures and harness issues
are retained in the attempt log; resources shut down with exact identities/hashes saved.

Controlled provider evidence is not actual sandbox qualification. Official IRT/verify wording,
remote timeout/finality behavior, historical CAPTURED certification and full journeys remain
unqualified. Old captured records are preserved, not rewritten. Remaining findings, scanner,
SMS, staging/release images/infrastructure, matched recovery and facilities gates remain
open. No risk accepted as a substitute for evidence. No charge/SMS/refund, production
migration/deployment/backup or facilities activation occurred. D1/D2 remain settled; later
unresolved decisions stay open. Pause before Phase4 until explicit owner continuation.


### Phase 4 entry — paused at D3, 2026-09-19

Phase4 is authorized but not implemented or verified. All42 Phase3 source hashes,
master/HEAD and preserved audit match. R3 remains OPEN and launch remains NO-GO.
The recorded D3 privacy/retention decision explicitly requires confirmation before
new limiter schema work; independent review confirms it remains unsettled. See the
[concrete proposal and restart checkpoint](security-remediation-2026-09-18/phase-4/README.md).
No application/schema/grant/config change, fresh runtime verification or external
operation occurred. No owned resources remain. D1/D2 remain settled; Phase5 not started.


### Phase4 closure — R3 locally VERIFIED_FIXED, 2026-09-19

**Overall launch NO-GO. Phases0–4 COMPLETE locally; Phase5 NOT_STARTED.** Owner approved
D3 temporary protected-identifier accounting. Earlier Phase4-paused status is superseded.
Atomic precomparison reservations cap each OTP at5 guesses; fresh locked expiry and
transactional single consumption authorize at most one cookie. Shared rolling limits
bound unusable-code work across processes. Hourly HMAC identities preserve short retention
without resetting quotas. Failed code input clears before retry to avoid incidental guesses.

[Phase4 evidence/checkpoint](security-remediation-2026-09-18/phase-4/README.md):440/73 tests,
65 real restricted PostgreSQL cases, four OTP process/crash and five payment crash scenarios,
transactional migration recovery/runtime-role checks, production applicant/admin browser
at390/1440, two Next processes with12 guesses and0/1 cookies, unavailable DB503, build/
types/lint, independent reviews, verified source hashes and owned-resource shutdown. One
existing image lint warning. Original12-comparison regression fails on vulnerable source.

No real provider/SMS, production or programme activation. New schema/grants/config and
hourly maintenance require the documented authorized rollout; proxy, actual scheduler/
alerts, images/capacity and release prerequisites remain unqualified. Later auth findings
R4/R5/R6 and R9 maintenance remain their own phases. R1/R2/R12 protections preserved.
Pause here until explicit owner continuation; no Phase5 work or background advancement.


### Phase5 closure — R5 locally VERIFIED_FIXED, 2026-09-19

**Overall launch NO-GO. Phases0–5 COMPLETE locally; Phase6 NOT_STARTED.** Owner authorized
Phase5 only; D3 temporary protected-identifier policy remains approved. Prior R5-open
statements are superseded for the verified local scope, not production qualification.

PostgreSQL atomically reserves90-second mobile+purpose cooldown, five/hour rolling quota,
configured shared address/unknown quota before hashing or dispatch. One-use intent/OTP
replacement commits before one bounded SMS call; failed/uncertain/crashed work retains
quota and cannot auto-retry paid delivery. Unknown address no longer bypasses limits;
only qualified X-Real-IP is used. Verification limits remain separate. Uncertain SMS keeps
accessible Persian OTP entry available, and new logs exclude OTP/message/provider prose.

[Phase5 evidence and replay](security-remediation-2026-09-18/phase-5/README.md):473 tests/75
files with89 restricted PostgreSQL cases; vulnerable eight-admission baseline fails desired
one-admission assertion; eight independent workers/three crash stages, two production Next
processes/eight HTTP requests send once; slow/failure/malformed/timeout and DB outage;
applicant/admin390/1440 actual login after uncertainty,429/refresh, trusted/unknown headers,
all fixture OTPs absent from logs. Phase4 verification/browser and payment crash regressions,
transactional migration recovery, canonical grants, maintenance, build/types/lint pass.
One pre-existing image warning. Two independent critical reviewers approve after fixes.

Additive intent table/helper/grants and combined hourly maintenance remain undeployed;
DEPLOYMENT documents backups, auth pause/drain, migration/grants/client/config/cutover and
compatible rollback. Protected identifiers stay within approved24h healthy-operation
retention, no changed backup/WAL promise. Resources stopped/removed and73 restart hashes
saved. All work uncommitted and prior audit preserved. No production/live SMS/charge/refund
or facilities activation. Actual provider/proxy/scheduler/Node22/release gates and later
findings remain unqualified. Pause here; Phase6 requires explicit owner continuation.

### Phase6 closure — R4 locally VERIFIED_FIXED, 2026-09-19

**Launch NO-GO. Phases0–6 COMPLETE locally; Phase7 NOT_STARTED.** Both OTP POST routes
now enforce configured canonical Origin and JSON media type before parsing or auth effects.
Foreign/null/missing Origin is denied; Host/forwarded values cannot bypass the guard.
Malformed JSON and invalid runtime configuration fail safely with Persian responses.

[Phase6 evidence](security-remediation-2026-09-18/phase-6/README.md): historical browser
text/plain attack produced real applicant/admin cookies on unchanged Phase5; fixed HTTPS
browser denies it and null-origin forms, while normal applicant/admin390/1440 login works.
531 tests/76 files,89 real restricted DB cases, origin/media/spoof/config/outage checks,
multiple-process/browser/crash regressions, build/types/lint and two independent approvals.
No schema/retention change. Existing image lint warning. All work remains uncommitted.

Local self-signed TLS proxy is not actual deployed HTTPS/proxy/Node22/provider qualification.
Later findings and release gates remain open. No production/live SMS/charge/refund or
facilities activation. Owned resources shut down, restart evidence saved. Stop before Phase7.

### Phase7 closure — R6 locally VERIFIED_FIXED, 2026-09-19

Launch NO-GO. Phases0–7 COMPLETE locally. Owner now authorizes sequential Phases7–20;
prior routine phase-pause wording is superseded. Genuine decisions/evidence boundaries remain.

[Phase7 evidence](security-remediation-2026-09-18/phase-7/README.md): shared accounting
already counted rejected probes; this phase removes explicit admin403 and active-only
response distinctions. All admitted categories/outcomes return identical conditional code
entry with a measured response floor; unknown/inactive numbers create no OTP/account/role
or SMS. Real active login and once-only delivery/verification remain intact.

549/78 tests including97 restricted PostgreSQL cases, production R6 browser mobile/desktop,
five SMS outcomes/max30s timeout, concurrent unknown probes across two app processes,
prior HTTPS Origin/request browser and13 crash/process regressions pass. Build/types/lint
pass with existing image warning. Both critical reviewers approved after pending-input and
accessible-message fixes. Failed harness attempts retained.82 restart hashes/source comparison
and owned shutdown archived. No schema/retention change; all work uncommitted, audit preserved.

Timing is qualified only for measured local healthy conditions, not constant-time overload
proof. Node22 images, actual ingress/proxy/SMS and remaining findings/release gates still
block launch. No production operation or facilities enablement. Continue Phase8 next.


## Phase8 R7 closure — 2026-09-19

R7 is **VERIFIED_FIXED locally**. Failed/unavailable/storage-failed replacements no longer
poison successful lineage. Same/new-key recovery, full logical quota, exclusive retry,
original24h retention, atomic current/audit/deletion and preserved old bytes pass restricted
DB/filesystem/concurrency/crash checks. Durable deletion and synchronized references prevent
current/published/actively quarantined bytes from being removed; orphan discovery remains
safe across transaction timeout. Forms retain last-known successful content and show
accessible Persian uncertainty/recovery copy.

Evidence: `security-remediation-2026-09-18/phase-8/`:578/79 tests,29 R7+97 prior DB cases,
five file/five payment process scenarios,30-migration checksum-matched fresh fixture and
rollback/backfill rehearsal, restricted quota/role and existing SQL suites, production
390/1440 browser, build/types/lint. Two independent critical reviews approved after findings
were fixed; all3 labelled containers and recorded processes/ports shut down. Audit/HEAD and
protected auth/payment/SMS runtime sources preserved. No production changes or programme
activation. Migration requires drained/uniform writers and compatible-schema rollback.

Launch remains **NO-GO**. R8/R9/R10/R11 and later session, images, real scanner, topology,
backups/monitoring, full journeys, actual sandbox and final release gates remain open.
D4 historical-file policy and M9 decisions remain unresolved. Continue Phase9 under the
existing sequential authorization; Phase8 local evidence does not qualify production.


## Phase9 R8 closure — 2026-09-19

R8 is **VERIFIED_FIXED locally**. Atomic slot pointers, draft versions, saved references,
exact predecessor intents and journaled allocation replace the unsafe concurrent cleanup.
Stale saves/responses cannot restore retired files. Payment/correction and certificate
writers use the same application-first coordination; active payment I/O fences applicant
changes. Current admin/export/download readers and queued UI preserve authoritative content.

The old algorithm race was reproduced with explicitly isolated owner DELETE authority;
the production-like restricted role's missing DELETE had masked it. No broad DELETE was
introduced. Physical cleanup requires durable irreversible authorization, protects aliases
and shared/current objects and retries after crashes/unlink failures. Unjournaled historical
bytes stay retained; UNKNOWN verification/access policy remains D4, not silently changed.

Evidence:security-remediation-2026-09-18/phase-9/.607 tests/80 files,155 restrictedDB cases
including29 R8,4 new file process-death cases, prior R7/payment process protections,
production390/1440 browser,31-migration historical/rollback rehearsal, restricted role/quota
and M1/M2/M6/M7/M8/M9 qualification, build/types/lint pass. Two independent critical reviews
approved.119/118 root/copied fingerprints match; both owned containers removed,17 recorded
PIDs absent and6 ports closed. Source remains uncommitted; original audit/HEAD preserved.

Launch remains **NO-GO**. R9/R10/R11 and phases13–20 remain. Phase10 is awaiting the expressly
reserved D4 historical-file policy decision; proposal is recorded in phase-10/D4-decision-proposal.md.
M9 and actual scanner/provider/topology/backup/operational qualifications remain unresolved.
No production change, deployment, external provider invocation or facilities enablement.

## Phase10 local closure — 2026-09-19

R10 VERIFIED_FIXED locally under owner-approved D4. New payment/submission gates validate
current owned slot/revision, durable verification and actual bounded bytes. Historical
UNKNOWN remains unqualified for new actions while established download/review access is
preserved. Payment capture persists before eligibility; paid repair/crash recovery never
creates a second charge. Facilities profiles and corrections are covered under company
locks. Additive verification evidence and scoped snapshot maintenance retain metadata.

655tests/83files pass,193 restrictedDB cases including38 actual R10 gates; actual browser
390/1440; both migration precommit rollbacks/history preservation; production build/types/
lint;133source/132copied/105evidence hashes independently verified. Code/evidence reviewers
approved; task-owned resources shut down. See phase-10/results.md and sealed manifests.
NO-GO remains: R9/R11 and Phases13–20, actual scanner and production evidence still open.
Phase11 proceeds under existing sequential authorization.


## Phase 11 local R9 closure — 2026-09-19

R9 VERIFIED_FIXED locally: restricted fixed-retention OTP pruning, durable legacy and
facilities jobs, truthful nonzero partial/skip/failure outcomes and safe recovery.
672/84 tests,17 actual maintenance CLI cases plus real facilities failure/recovery,
34-migration rollback/grant rehearsal, build/types/lint, frozen hashes and shutdown
independently approved. See phase-11/results.md. Production scheduler/alerting and all
remaining qualifications remain unperformed; overall NO-GO. Phase12 proceeds.

## Phase 12 local closure — 2026-09-19

R11 locally VERIFIED_FIXED: guarded live administrative decisions, version conflicts,
consistent certificate refresh and non-retryable uncertain correction SMS.693 tests/85files,
21 new real DB cases and390/1440 browser pass; two additive migrations rehearsed. Independent
code and frozen evidence review approved. See phase-12/results.md and evidence-hashes.json.
Phase13 begins. Overall launch remains NO-GO; no production or real provider qualification.

## Phase 13 local closure — 2026-09-19

Session-reset issue locally VERIFIED_FIXED: valid GETpreserved, canonical protected
POSTlogout, invalid-cookie recovery and outagecookiepreservation.720/86tests plusactual
productionbrowser390/1440; independent code/frozen evidence approved. Phase14 starts.
Launch NO-GO; production HTTPS/proxy and external qualification remain outstanding.
