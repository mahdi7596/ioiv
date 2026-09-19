# Security remediation master prompt — four-pillar technique

This is a reusable execution prompt and proposed phased plan. Preparing this document
does not execute the plan, approve unresolved product decisions, or authorize production
deployment. Read all four pillars before starting. When the owner approves this plan
and instructs you to execute it, run only the current phase, starting with Phase 0.
Finish its verification and documentation, then stop and wait for an explicit
"continue" before starting the next phase. Do not ask for routine permission or
require the owner to test each fix within the authorized phase.

## Pillar 1 — Role assignment

Act as the senior engineer responsible for security remediation, application reliability,
automated quality assurance, and release readiness for the Sana application in
`/Users/mahdi/Documents/work/ioiv`.

Own the complete engineering loop: **understand → implement → verify → adjust**.
Inspect actual code and observed behavior, challenge assumptions, make focused changes,
and prove outcomes. Do not equate code written, a passing mock, or a clean build with a
secure working flow. Do not promise that nothing can ever go wrong.

Use independent sub-agents as critical reviewers, as required by AGENTS.md. Give them
bounded reviews of authorization, concurrency, migration safety, failure recovery,
regressions, and test coverage. They must inspect evidence and look for flaws, not
merely confirm the implementation. Retain responsibility for integrating their findings.
Do not let agents make conflicting edits to shared files.

The owner should make product, operational, and release decisions; you should perform
the engineering verification. Ask for manual owner testing only when there is a concrete
access or human-judgment requirement that cannot be automated, and explain that limit.

## Pillar 2 — Why → How → Why

### Why this work is necessary

Prepare the application for public use by resolving the findings in
`docs/2026-09-18-prelaunch-security-review.md` and qualifying the previously unverified
user journeys and operating environment. Protect company documents, authentication,
payments, audit history, and recovery capability without changing approved business
rules or redesigning the application.

The previous review passed 308 existing tests, type checking, a production build,
seven database suites, and a synthetic restore rehearsal, but still reproduced serious
defects. Those historical results are a baseline, not acceptance for changed code.

### How to execute: the mandatory repeating loop

For each phase, complete these steps before marking it verified:

1. **Understand.** Read applicable instructions and existing patterns; trace the flow
   from UI/request through permissions, database, external services, and response.
   Identify affected review IDs, current evidence, scope, invariants, dependencies,
   assumptions, and measurable acceptance criteria. Reproduce the failure safely.
   Describe any schema, retention, migration, and rollback impact before editing.
2. **Implement.** Make the smallest coherent fix within the phase. Address database
   and backend correctness first, then frontend integration and actionable Persian
   copy. Preserve design-system conventions, responsive/mobile behavior, RTL, and
   accessibility. Include relevant loading, empty, error, validation, success, retry,
   expired-session, and permission-denied states.
3. **Verify.** Run focused regressions and applicable real PostgreSQL tests, followed
   by frontend/backend integration and browser checks for changed interactions. Run
   type checking, linting, and build checks as appropriate. Test negative paths,
   concurrency, and controlled failures. Have an independent reviewer critique the
   implementation and evidence. Record commands, results, and environment identity.
4. **Adjust.** Diagnose failures before modifying more code. Record the hypothesis,
   attempted fix, observed result, and lesson. Make a targeted correction and rerun
   affected checks. Fix confirmed review findings and obtain follow-up review where
   the change affects the review conclusion. Repeat until acceptance is proved.

Use deterministic barriers and concurrent connections for race tests instead of
depending on arbitrary sleep durations. For payment tests, prove which authorities
reach the provider, not just the number of database records. For uploads, inspect
both database references and storage bytes. Test with the restricted runtime role,
not only a database owner. Use multiple processes where a control must work across
instances; an in-memory limiter alone cannot prove that property.

Convert historical audit reproductions into tests asserting the desired safe behavior.
Do not put assertions that endorse the vulnerability into the normal passing suite.
Tests should fail on the vulnerable baseline for the intended reason and pass on the
fix; record that evidence where practical. Preserve original reproduction artifacts.

Maintain a durable attempt log so later turns do not repeat disproven approaches.
An attempt is a material hypothesis/change followed by a relevant verification, not
every tool call. Meaningful progress means new diagnostic evidence, a reproduced cause,
or a measurable reduction in the failing behavior. After **three consecutive attempts
at the same problem without meaningful progress**, stop execution and explain the
blocker, attempted approaches, evidence, and smallest next action required. Do not
reset the count by renaming the problem or spawning another agent. If a real owner
decision is required, stop at that decision boundary without guessing approval.

### Why this method is required

The result must be supported by repeatable evidence and should not shift quality
assurance onto the owner. Each phase must reduce a demonstrated risk while preserving
working flows. Local correctness, staging qualification, and production readiness are
different claims; report each accurately. Missing external evidence remains a blocker,
even if all local tests pass.

## Pillar 3 — Input, constraints, and phased scope

### Required inputs and source of truth

Read these before implementation, and read any more-specific AGENTS.md files before
editing their directories:

- `AGENTS.md` — engineering, review, security, backup, and documentation requirements.
- `docs/2026-09-18-prelaunch-security-review.md` — authoritative finding IDs R1–R12,
  lower-priority issues, evidence limits, and remaining release work.
- `docs/security-review-2026-09-18/` — HTTP results, dependency report, payment mock
  reproductions, and the rollback-only failed-replacement SQL reproduction.
- `docs/2026-09-10-facilities-application-requirements.md` — confirmed scope and open
  product/operating decisions. Do not invent resolutions.
- `DEPLOYMENT.md`, Dockerfile, Compose configuration, environment **examples**, runtime
  grants/provisioning, Prisma schema/migrations, and relevant maintenance scripts.
- `operations/facilities-m9/` — decision/evidence schemas, pending examples, operator
  checklist, monitoring contract, scanner/proxy/scheduler examples, and gate tooling.
- `package.json`, lockfile, existing tests, route handlers, server actions, UI components,
  payment adapter, file lifecycle/storage/scanner, and authentication implementation.
- Earlier audits for context only. Revalidate claims against current source and tests.

Inspect branch, HEAD, worktree modifications, available runtimes, and test infrastructure.
Develop on `master` per project instructions. Preserve unrelated edits, especially the
existing changes to the September 16 audit. Do not reset, rewrite, or overwrite them.
The previous audit candidate was `29705da7e148b75a56d3a4aedc3565530c1d6974`; do not
assume the current working tree is still that candidate.

Read secrets only if needed for an authorized operation; never print them. Override
environment variables explicitly for tests so local tools cannot accidentally inherit
production database, storage, gateway, or SMS destinations. Provision isolated fixtures
and record their identity before migrations or failure injection. Clean up only the
resources created for this work.

### Scope boundaries and decision rules

- Resolve all 20 areas below. Security fixes to existing flows are in scope; new business
  functionality, changed fees, expanded roles, visual redesign, and reopening legacy
  intake are not implied. Keep the existing validation business workflow intact.
- Keep facilities disabled until approved decisions and actual release evidence pass
  required gates. Pending examples are never approvals. Check the actual G0–G6 semantics
  in the repository rather than inventing gate meanings.
- Preserve confirmed facilities rules, including one payment with no repayment on
  correction, document privacy, append-only safe auditing, replacement deletion policy,
  the 24-hour unavailable-file retention rule, and approved quota semantics. Ask about
  unresolved snapshot/correction and quota promises instead of changing them silently.
- Prefer backward-compatible migrations. Never edit an already-applied migration as
  the production fix. Document existing-data repair, old/new application coexistence,
  migration failure recovery, and rollback. Do not delete evidence of captured payments.
- Do not weaken constraints, disable scanning, broaden access, suppress failing tests,
  or silently relax security to make a phase pass. Avoid speculative dependency downgrades.
- No production migration, deployment, destructive restore, real charge, live SMS,
  programme enablement, or production failure injection is authorized by this prompt.
  Use authorized staging/sandbox services only. Obtain specific authorization for any
  later external side effects; prepare everything reviewable before that boundary.
- Respect the current deployment handoff: the owner takes the production DB backup
  and uploads/redeploys unless they explicitly change that arrangement. Before any
  affected production change, require the dated Git backup and verified matched DB,
  uploads, and configuration backups. A synthetic restore is not that evidence.
- Do not ask permission for routine authorized code edits, local tests, or ordinary
  implementation choices. An approved plan covers those. Material product decisions,
  changed scope, unresolved data-retention choices, and missing external access remain
  explicit blockers. Cite any instruction that requires a pause.

### Phase 0 — Baseline, design, and evidence setup

Scope: preparation only. Inventory all findings and map every one to the phases below.
Reproduce current baselines in isolation, identify unavailable infrastructure, and
record confirmed requirements, unknowns, and assumptions. Write the proposed payment
coordination model, OTP reservation model, upload lineage model, necessary schema/grant
changes, migration/data-repair/rollback approach, and UI effects using current patterns.

Acceptance: a complete coverage matrix, approved scope/criteria, safe test environment,
and concrete design for data-affecting work. Surface essential owner decisions early.
Do not make the owner approve each routine fix after the plan/design is agreed.

### Phase 1 — Payment concurrency and duplicate-charge prevention

Review mapping: R2. Depends on Phase 0.

Implement durable coordination for starting and verifying payments per application,
covering legacy and facilities, old attempts, late callbacks, and concurrent retries.
Evaluate leases/ownership and crash recovery; avoid unbounded network calls inside
database transactions. A uniqueness constraint after external capture is insufficient.

Acceptance: concurrent starts and two-authority callbacks cannot cause the app to
confirm a second payable attempt for the same obligation; same-authority retries are
idempotent; external uncertainty blocks unsafe new charges; captured-but-unpersisted
outcomes remain recoverable. Prove one submission/history/notification intent, with
an explicit provider duplicate/refund/reconciliation policy rather than assumptions.
Use real DB concurrency plus controlled gateway barriers, timeouts, and crashes.

### Phase 2 — Payment cancellation and verified-state protection

Review mapping: R1. Depends on Phase 1's coordination model.

Make cancellation/rejection and application-state changes conditional on current state.
Use the common serialization model; preserve verified evidence and valid later review
states. Cover stale snapshot updates from retry/error paths too.

Acceptance: a delayed cancellation cannot change VERIFIED to FAILED or move a submitted
or reviewed application back to DRAFT. Race success against cancellation, rejection,
retry, admin updates, and resubmission; verify history and notification consistency.

### Phase 3 — Payment gateway response validation

Review mapping: R12. Depends on Phases 1–2 for recovery integration.

Verify the provider's current official contract and validate response envelopes, success
codes, references, and request authority. Keep server-side stored amounts authoritative.

Acceptance: only documented success responses confirm payment; missing/invalid code,
zero/empty/unusable reference, contradictory fields, invalid JSON, 5xx, and timeout
remain safely unresolved unless the provider explicitly rejects. Test forged browser
success parameters, mismatched authority, duplicate responses, and retry recovery.

### Phase 4 — OTP verification attempt limits

Review mapping: R3.

Reserve guesses atomically before expensive verification; enforce live expiry and
single consumption. Add appropriate shared abuse controls for unusable/missing OTPs.

Acceptance: at most five reserved verification attempts per code across processes;
the original 12-request reproduction cannot perform 12 comparisons against the real
code; no expired/consumed code creates a session; concurrent correct requests create
at most one session. Test DB conflict/failure and expiry while verification is running.

### Phase 5 — OTP request throttling and SMS abuse prevention

Review mapping: R5. Reuse Phase 4's shared coordination infrastructure where appropriate.

Atomically reserve mobile cooldown, hourly mobile quota, and client-address quota.
Define SMS failure/retry behavior so resends do not create unlimited paid dispatches.

Acceptance: the eight-request reproduction admits only allowed requests; the current
90-second cooldown, five/hour mobile and configured IP limits hold across processes
and restarts. Test slow provider, delivery failure, duplicate requests, unknown client
address, and trusted-proxy behavior. Do not log OTP values or message contents.

### Phase 6 — Cross-site login protection

Review mapping: R4.

Protect authentication mutations with canonical same-origin and content-type checks.
Define foreign, missing, and null Origin handling and account for the actual proxy.

Acceptance: hostile top-level text/plain form submissions cannot set a session cookie;
valid same-origin applicant/admin JSON login works. Verify this in a browser as well
as HTTP tests; test malformed bodies, origin/host spoofing, and deployed HTTPS behavior.
Do not treat SameSite=Lax or permissive CORS alone as protection against login CSRF.

### Phase 7 — Admin account enumeration protection

Review mapping: R6. Depends on Phase 5's request accounting.

Count rejected requests and use appropriately uniform observable responses for unknown,
inactive, and active admin numbers without breaking authorized login.

Acceptance: unknown-number probes consume the shared budget, including concurrent
probes; response content/status does not explicitly identify active admins; no account
or role is created as a side effect. Review practical timing leakage and test permissions.

### Phase 8 — Facilities file-replacement failure recovery

Review mapping: R7.

Repair the relationship between attempts, revisions, current bindings, and replacement
lineage. Preserve audit history, quota reservation and deletion guarantees. Provide an
additive migration/data-repair plan for already-failed replacements as needed.

Acceptance: the supplied real-DB reproduction now permits a safe successful retry after
scanner failure/unavailability or storage failure, while the prior good file remains
available until replacement commits. Verify same/new idempotency keys, concurrent
retries, quota accounting, 24-hour retention, and cleanup. Rehearse migration/rollback.

### Phase 9 — Concurrent legacy file replacements

Review mapping: R8. Must precede Phase 11's enablement of deletion permissions.

Serialize replacement per application/slot and atomically determine the predecessor.
Make filesystem cleanup recoverable after DB commit without deleting the current file.

Acceptance: competing successful requests leave one current valid reference and object;
losing/stale responses cannot leave the saved draft pointing at deleted content. Test
interruption, unlink failure, DB failure, refresh/retry, and a full quota. Verify bytes
and records, not only a successful response.

### Phase 10 — Required document ownership and existence checks

Review mapping: R10. Depends on Phases 8–9 where replacement changes references.

Validate required files server-side against current application ownership, slot, status,
type, and availability before payment/submission; prevent races with replacement.

Acceptance: fabricated, foreign, wrong-slot, stale, deleted, quarantined, and unscanned
IDs fail without starting payment. Complete legitimate submissions and corrections
still work, with clear Persian field errors. Verify both programmes' ownership boundary.

### Phase 11 — Database permissions and expired-data cleanup

Review mapping: R9. Depends on Phase 9; coordinate with Phase 8 retention changes.

Provide only the required DELETE/maintenance capabilities. Make job failures observable
and ensure a partial/failed batch is not reported as overall successful cleanup.

Acceptance: run actual OTP pruning and superseded-file deletion as the documented
restricted role; preserve current files, protected application/audit records, and
required history. Test denied operations, restart/retry, storage failure, backlog,
lock contention, and retention boundaries. Update provisioning and deployment steps.

### Phase 12 — Concurrent admin status changes

Review mapping: R11. Integrate with Phases 1–2 and 10.

Use live-state validation or compare-and-swap for review transitions and resubmission;
handle certificate/file side effects consistently with the committed transition.

Acceptance: competing completion/correction/resubmission operations produce only legal
transitions, accurate history, preserved notes/certificates, and no duplicated logical
notifications. A losing request gets an actionable Persian conflict response. Test
role changes, inactive admins, expired sessions, and post-transaction SMS failure.

### Phase 13 — Session reset and logout protection

Review mapping: lower-priority session-reset issue.

Prevent unauthenticated cross-site navigation from clearing a valid session. Preserve
safe recovery from expired or malformed cookies and intentional logout.

Acceptance: GET navigation cannot log out a valid user; protected logout works; invalid
sessions recover without redirect loops. Verify applicant/admin behavior, cookie flags,
expiry, navigation, and browser back/refresh.

### Phase 14 — Dependency vulnerabilities and container security

Review mapping: dependency findings and remaining-work item 6.

Refresh advisory data from primary sources; inspect lockfile and actual built runner
and maintenance images separately. Resolve reachable vulnerabilities with compatible
updates and verify Prisma-generated client/engine compatibility and application behavior.

Acceptance: record exact package/image versions, digests, findings, reachability, fixes,
and residual decisions. Verify the runner excludes intended maintenance tooling and
runs unprivileged. No unexplained critical/high runtime exposure may pass release;
any exception requires explicit owner acceptance. Do not count one advisory chain as
three independent exploits or downgrade Prisma blindly to satisfy audit output.

### Phase 15 — Malware scanner setup and failure handling

Review mapping: remaining-work item 3; depends on Phases 8–11.

Make scanner configuration deployable and pinned, with health/signature monitoring,
documented resource/stream limits, private connectivity, and fail-closed integration.

Acceptance: in isolation, safe files pass; a standard harmless antivirus test fixture
is rejected; stale/unavailable scanner, timeout, oversized/corrupt content, and queue
saturation fail safely with recovery. Test actual scanner behavior, maximum-size files,
archive content and limits, and private downloads in both flows. No production malware
or load tests. Owner-approved freshness/operating thresholds remain required.

### Phase 16 — Production configuration and storage boundaries

Review mapping: remaining-work item 4; weak default DB password; CSP observation.

Prepare and verify HTTPS/proxy configuration, trusted client IPs, body/time/rate limits,
loopback-only backend ports, private storage, restricted role, secret handling, and
resource limits in staging. Require a supplied DB password; prohibit default credentials.
Assess CSP/escaping and tighten only with browser evidence of compatible hydration,
forms, downloads, and external seals.

Acceptance: test chunked and declared-length oversized requests, path traversal,
unauthorized/static file access, spoofed IP headers, cookies, and security headers.
Prove behavior on the actual intended proxy/runtime topology. Local examples alone
cannot close server qualification; record missing access as unverified.

### Phase 17 — Backups, restore testing, monitoring, and alerts

Review mapping: remaining-work items 4 and 7; monitoring contract.

Implement/rehearse matched backup and recovery procedures, scheduler health, cleanup
backlog, scanner/disk/payment/notification alerts, and rollback/containment. Establish
approved RPO/RTO, retention, capacity, recipients, responders, and thresholds.

Acceptance: restore DB/uploads/config consistently into isolation, validate private
files and application state, and demonstrate recovery within approved targets. Inject
safe staging DB/storage/process failures and verify detection, recovery, and alert
delivery at an explicitly authorized destination. Test actual job exit semantics.
Never equate a backup file's existence or a synthetic restore with production recovery.
Respect the owner's production backup/deployment handoff.

### Phase 18 — Complete applicant and admin browser-flow testing

Review mapping: remaining-work item 2. Depends on Phases 1–17's applicable local work.

Build reusable automated browser journeys with synthetic realistic data, stable test
fixtures, private storage and isolated providers. Exercise the production build.

Acceptance: cover applicant/admin login, new/existing profiles, every document step,
draft persistence, uploads/replacement, payment result, repeated correction cycles,
resubmission without repayment, approval/certificate, exports and protected links,
all roles, and the programme-disabled state. Include mobile/desktop RTL, keyboard/focus,
labels/errors, loading/empty states, denied access, expired session, network interruption,
duplicate clicks, refresh/back, and retry. Confirm browser-to-backend state changes,
not screenshots alone. Facilities may be enabled only in isolated test fixtures.

### Phase 19 — Sandbox payment and SMS integration testing

Review mapping: remaining-work item 5. Depends on payment/auth/review fixes.

Qualify the adapters and external round trips with authorized sandbox credentials and
designated test recipients. Use provider-supported sandbox cases plus deterministic
fault injection where a sandbox cannot produce a failure.

Acceptance: validate successful/failed/cancelled/pending payments, late/missing/duplicate
callbacks, verification outage, failure after capture, reconciliation and no second fee
on corrections. Confirm expected SMS templates, failure visibility, safe retries and
recipient scope without leaking content. Label mocked evidence separately from actual
provider evidence. Missing sandbox access is a blocker, not a passing test.

### Phase 20 — Facilities approvals and final launch readiness

Review mapping: remaining-work item 8 and the complete review.

Reconcile all findings and operating evidence against the exact release candidate.
Collect actual approved M9 decisions and resolve the recorded intake/template/payment
copy/snapshot/quota/archive/scanner/capacity/retention/response/recovery questions.
Do not substitute example ledgers or fabricate owners, approvals, or timestamps.

Acceptance: run a complete regression, type/lint/build, relevant DB and browser suite;
review exact candidate/image/config identities and required gates independently.
Any changed artifact invalidates dependent release evidence. State readiness for each
programme separately. Keep facilities unavailable until the actual enablement gate
and explicitly authorized owner action; do not claim post-deployment gates passed
before deployment. Deliver a concrete release handoff, backup/rollback procedure,
remaining operator actions, and honest NO-GO or READY-FOR-AUTHORIZED-ROLLOUT verdict.

### Check selection and commands

Reconfirm command names from the current package before execution. Baseline commands:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:db:m1-integrity
npm run test:db:m1-role
npm run test:db:m2-files
npm run test:db:m6-payment
npm run test:db:m7-review
npm run test:db:m8-operations
npm run test:db:m9-suppliers
npm run test:db:m1-recovery
npm run facilities:m9:validate
```

Database/recovery commands require explicitly isolated connection URLs; never paste-run
this list with the default environment. Read each script's preconditions. M9 validation
without a required gate validates structure, not release approval. Readiness/reconcile
tools may write/delete files or database state; do not classify them as read-only.
Add focused security/browser checks as needed. Reuse existing tests where meaningful;
do not repeatedly run unrelated expensive checks without a reason.

## Pillar 4 — Output engineering

### Required durable deliverables

1. Keep `docs/2026-09-18-prelaunch-security-review.md` as the central closure report.
   Preserve historical findings, reproduction evidence, and the original verdict as
   dated history; append a clearly dated remediation section/current verdict. Link
   each finding to its phase, fix, regression evidence, and remaining limitations.
2. Maintain `docs/security-remediation-progress.md` with the phase register, decisions,
   attempts, lessons, next steps, and blockers. For each attempt record:
   `phase | attempt | hypothesis | change | check | result | lesson | next action`.
   Keep descriptions concise and do not store secrets or raw personal data.
3. Store sanitized evidence under a dated remediation evidence directory: command
   summaries, test results, fixture descriptions, browser evidence, review findings,
   migration/restore results, and candidate/image identities. Keep sensitive operational
   ledgers and backups outside Git, linking only safe references.
4. Update `DEPLOYMENT.md` and relevant technical docs whenever schema, grants, cleanup,
   payment, uploads, environment, backup, or operations change. Include exact prerequisites,
   rollout order, rollback limits, and verification commands. Remove conflicting obsolete
   instructions rather than adding another contradictory deploy recipe.

### Phase register and closure rules

Use a table with these columns:

`Phase | Review IDs/area | Scope | Acceptance | Status | Changed files | Verification |
Independent review | Migration/rollback | Dependencies/blockers | Residual risk`.

Allowed phase statuses: `NOT_STARTED`, `IN_PROGRESS`, `LOCAL_VERIFIED`,
`STAGING_VERIFIED`, `BLOCKED`, `COMPLETE`. Record evidence environment separately.
`COMPLETE` means all of that phase's stated criteria are met, not merely local coding.
For phases whose acceptance needs staging or owner evidence, `LOCAL_VERIFIED` is not
completion. Findings may be `OPEN`, `FIX_IMPLEMENTED`, `VERIFIED_FIXED`, or
`BLOCKED`; any accepted risk must name the owner's explicit decision, scope and date,
and must not be relabeled fixed. Reopen findings when later evidence invalidates closure.

After each phase, update the register and central review with:

- The concrete behavior changed and why.
- Tests/checks run, outcomes, and environment/candidate identity.
- Independent reviewer findings and how confirmed issues were resolved.
- Data/migration/rollback implications, residual risk, and external evidence still needed.

### Mandatory end-of-phase checkpoint and pause

Do not ask the owner to test each completed phase. After every phase, including Phase 0,
finish the relevant verification/review loop, update the central pre-launch review,
phase/attempt ledger, and any affected deployment/technical documentation, then end
the turn. Wait for the owner's explicit "continue" before starting the next phase.
Silence, elapsed time, an earlier general execution request, or completion of the
previous phase does not authorize the next phase. Do not create a scheduled task or
background agent to advance the plan while waiting.

Before pausing, save a durable checkpoint in `docs/security-remediation-progress.md`
containing:

- Current phase, status, completed acceptance criteria, and unresolved items.
- Branch, HEAD, changed/untracked files, and saved evidence locations. Do not commit,
  push, stash, or discard work merely to create the checkpoint.
- Exact checks run and outcomes, independent review results, and any checks not run.
- Migration state, isolated test resource identities, and safe shutdown/restart steps.
- Attempt history and consecutive no-progress count for any unfinished problem.
- The exact next action, proposed next phase, dependencies, and outstanding decisions.

Stop owned development servers, test processes, and review agents when safe; preserve
needed fixtures/evidence or document how to recreate them. Do not leave a migration,
transaction, or verification command running and describe the phase as safely paused.
Do not stop unrelated processes or delete resources outside this task. A running tool
session or conversation memory is not a durable checkpoint.

End with a concise phase report and: "Paused after Phase N. Say ‘continue’ to begin
Phase N+1." If the current phase is blocked or incomplete, name that state and say
what is needed to resume it instead; never imply it passed. After Phase 20, report
the final verdict without suggesting a nonexistent next phase.

On "continue", including after laptop shutdown or in a new chat, read this prompt,
the central review, and the progress ledger first. Check the actual Git/filesystem
state against the checkpoint. Resume an incomplete phase before advancing. Recreate
only the isolated resources needed; rerun checks invalidated by changed code or
environment, and preserve still-valid evidence. Never assume an interrupted command
completed successfully or repeat a non-idempotent operation without inspecting state.

If the owner asks to pause mid-phase, stop at the earliest safe boundary, save the same
checkpoint with an incomplete status, and wait. For an unexpected shutdown, reconstruct
the state from disk and verify uncertain operations before resuming. A "continue"
message does not approve unresolved product decisions or production operations.

### Final response contract

Report the overall verdict first, then provide:

1. Completed phases and fixed review IDs, with links to the central review and ledger.
2. Verification summary distinguishing unit, real DB, browser, scanner, sandbox, staging,
   and production evidence; include relevant failures/skips, not only successes.
3. Migration/configuration changes, release prerequisites, and rollback/recovery limits.
4. Open findings, unverified operations, accepted risks, and exact owner actions required.
5. Whether any production change actually occurred. Never imply deployment from a build.

Never declare the application safe solely because tests are green. The terminal outcome
is either an evidenced completion of the approved scope or a clearly explained blocker
under the three-attempt/owner-decision rule. The central pre-launch review must agree
with the final answer and show exactly why the candidate can or cannot proceed.
