# Phase 0 design and decision record — 2026-09-18

Status: proposed design, preparation only. Owner authorized Phase 0 and the master
prompt's phase boundaries; this is not approval of newly proposed schema or unresolved
business/operating policy. No application, migration, grant or configuration changes.
Source of truth: ../../2026-09-18-security-remediation-master-prompt.md and
../../2026-09-10-facilities-application-requirements.md.

## Confirmed scope and invariants

Preserve existing validation intake and business transitions; no redesign, new roles,
fees, or automatic programme enablement. Facilities remains disabled. Preserve one
payment per obligation, no repayment for corrections, server-side verification,
private scanned files, append-only safe audits and indefinite facilities revision/audit
metadata retention. Preserve current facilities 25 MiB/150 MiB implementation (legacy retains its own
20 MiB per-file limit) while explicitly
leaving the MB/MiB applicant promise and profile quota unresolved. Replaced content is
deleted only after successful replacement commit; failed/unavailable replacement must
not destroy the previous good object. Unavailable quarantine has a 24-hour maximum;
terminal rejection bytes are purged next reconciliation. One user owns one company;
one facilities application per intake; all existing required documents remain required.

The approved phased scope/acceptance is the supplied master prompt. Engineering proposals
below require agreement before data-affecting implementation under AGENTS.md. No claim
that existing pending decision examples constitute agreement. Approval may be recorded
in the next explicit instruction; “continue” alone does not resolve product decisions.

## Current request and data paths

- Applicant/admin request-OTP and verify-OTP routes call lib/actions/auth.ts, then
  OtpCode/Admin/User and lib/auth/session.ts JWT cookie issuance. Request limits count
  OTP rows before insert; verification increments after bcrypt. No durable reservation.
- Legacy wizard saves JSON file references; lib/actions/payment.ts validates shape,
  creates Payment, then requests an authority. lib/payments/legacy-settlement.ts verifies
  outside an obligation claim; cancellation uses old application/payment snapshots.
- Facilities payment uses FacilitiesPaymentAttempt and DB guards, but an old failed
  attempt and current authority may both reach verification before uniqueness rejects
  persistence. Payment uniqueness cannot undo an external capture.
- Facilities uploads reserve a revision and replacesUploadId in
  lib/facilities-files/service.ts before scanner/storage outcome. A unique predecessor
  plus predecessor-revision+1 trigger consumes the lineage on failure. Bindings,
  StoredFile, deletion tombstones, quota and immutable templates share this boundary.
- Legacy lib/uploads/replace.ts chooses every same-slot row except its new row;
  two requests can delete each other's files. Draft JSON is not a current-binding CAS.
- lib/actions/admin.ts validates a fetched status before its transaction. Certificate,
  notes, history and SMS must follow the actual winning transition.

## Payment coordination model (Phases 1–3, 10, 12)

Propose additive PaymentObligation with exactly one programme-specific application FK
(CHECK XOR), unique legacyApplicationId / facilitiesApplicationId, immutable amount and
currency snapshot, state, selected attempt, generation, operation owner, lease expiry,
last safe outcome/reason and timestamps. Add separate per-programme attempt FK columns
with CHECK consistency or typed link tables; avoid an unenforced polymorphic string FK.
Retain existing Payment/FacilitiesPaymentAttempt and captured evidence. An Operation
record has a unique obligation+operation key, authority if known, bounded outcome state,
provider reference, and fencing generation. Add unique transition/notification intent
keys where required; do not add new SMS categories.

States: READY -> REQUESTING -> PAYABLE -> VERIFYING -> SETTLED. Any ambiguous start,
timeout, crash or malformed provider outcome enters UNCERTAIN; explicit final nonpayment
may permit READY only after documented provider finality. Browser cancellation alone
cannot prove nonpayment. SETTLED is absorbing for payable eligibility. Duplicate captured
outcomes are preserved in reconciliation evidence, never silently discarded to satisfy
one-settlement uniqueness.

1. Lock application then obligation in a short transaction; recheck user ownership,
   required current files, amount, workflow and existing settled/uncertain operations.
2. Persist selected attempt and operation intent before bounded provider I/O. No network
   call inside a held DB transaction. A unique key makes duplicate start requests replay.
3. Call only the selected authority. Persist authenticated provider outcomes in an
   independent idempotent result/reconciliation record tied to operation+authority+
   provider-reference/outcome, even if the worker has lost its generation. A stale
   worker may record capture evidence but cannot transition the obligation. Then use
   generation/owner CAS for the authorized coordinator to
   commit payment/application transition, history and one logical notification intent.
4. Lease expiry grants same-operation recovery only. It never authorizes another charge
   or verification of a competing authority. Fencing protects DB writes but cannot fence
   a remote provider: do not issue overlapping remote recovery calls without proved
   provider idempotency/query semantics. Unknown request without authority blocks starts.
5. Late old-authority callbacks are recorded for reconciliation; do not automatically
   verify a second authority after settlement. Captured-but-unpersisted outcomes recover
   by the same authority only under documented provider behavior and durable intent.
6. All cancellation, retry, submission and review writers share application-first locking
   and live-state/CAS checks. Preserve later review states, notes and certificates.

Required tests: distinct authorities with deterministic barriers and provider call trace;
same-authority retries; crash before/after request and capture; lost DB commit; timeout;
lease takeover with stale worker; cancellation/review/resubmission races; exactly one
submission/history/notification intent. Real DB connections, restricted roles and multiple
processes are required in implementation. Mock success is not provider qualification.

Owner/provider boundary D1 (owner decisions below): manual handling begins when the client
reports a case, with no response-time commitment or new admin panel. Engineering must
establish supported query/idempotency,
cancellation/reversal/refund semantics. Approved uncertainty policy is block new payment and
preserve evidence; no automatic refund or assumption of automatic reversal. Official
provider contract verification is Phase 3; real sandbox qualification is Phase 19.

## OTP reservation and abuse accounting (Phases 4–7, 13)

Use current OtpCode.attemptCount: atomic conditional UPDATE ... RETURNING where count<5,
consumedAt IS NULL and expiresAt > database clock, before bcrypt. This includes successful
guesses in the five reservations. After comparison, consume using fresh DB time and live
unconsumed status; only the transaction winner may issue JWT cookie. An already-reserved
comparison may finish after other reservations; it cannot exceed its reservation or mint
an expired/consumed session. Transactionally get/create User (handle unique race) and
recheck active Admin before commit; if cookie delivery fails, require fresh OTP rather
than reopening a consumed code. No session table is assumed.

Add shared AuthRateBucket and short-lived AuthRequestReservation rows. Lock ordered bucket
keys for mobile+purpose and canonical client address; create missing buckets safely.
Retain exact rolling-hour reservation timestamps, not fixed-hour counters that allow a
boundary burst. Enforce 90-second cooldown and five/hour mobile policy; IP limit uses
existing configured value. Address accounting precedes admin lookup and records denied
unknown/inactive probes independently of OTP creation. Use atomic reservations before
hashing/dispatch. DB failure denies safely; no in-memory fallback. Unknown address uses
a bounded shared unknown-address budget rather than bypassing controls. Actual trusted
proxy configuration must be qualified before using forwarded headers as client identity.

Propose keyed hashes for mobile/address limiter keys with dedicated protected config;
reserve records for at most 24 hours (sufficient for current one-hour windows), with
maintenance deletion. This is proposed privacy/configuration behavior, not an approved
retention change. Rejected requests consume address budget; no account is created for
admin probes. Uniform response/status for active/inactive/unknown admin with measured
practical timing, while authorized admin login continues to work.

Persist a dispatch intent and claim it once; no raw OTP/message in audit or logs. SMS
uncertainty spends the reservation, never blindly retries a paid send. Delivery cannot
be made exactly-once without provider idempotency. If durable retry requires recoverable
OTP material, design encryption/short TTL separately; do not persist plaintext to solve
recovery. Current fire-and-forget delivery is a failure-observability gap to address.

Canonical same-origin + application/json checks before body parsing on both auth routes.
Propose rejecting foreign, null and missing Origin for browser mutations; normal browser
requests are same-origin. Any nonbrowser caller requirement must be established before
exception design. GET session-reset must leave valid cookies intact; intentional logout
uses protected mutation, malformed/expired cookies recover without redirect loops.

Tests: twelve guesses with comparison instrumentation <=5; concurrent correct consume;
expiry during bcrypt; missing code floods; eight simultaneous sends; two processes and
restart; exact rolling windows; unknown address/spoofed headers; DB outage; SMS timeout;
admin enumeration; hostile text/plain top-level form and normal applicant/admin browser
login; logout/back/refresh. Do not collect OTP, JWT or real recipient data as evidence.

## Facilities upload lineage (Phase 8)

Add attemptedBaseUploadId to retain the attempted predecessor. Keep attempt sequence
unique per binding; add nullable committedRevisionNumber and committedPredecessorId
(or a dedicated committed-revision relation) with unique successful successor semantics.
A failed attempt never reserves successful lineage. Keep existing revision identifiers
for audit identity; do not renumber historical attempts or delete failed evidence.

Reserve quota and attempt under application/scope then binding locks. At scan-success
commit, recheck live editability, current binding generation, size/type/scanner state
and quota including all outstanding reservations. Only the current predecessor gets
replacement credit. Atomically bind winner, assign successful sequence, record audit and
predecessor deletion tombstone. A stale candidate cannot replace a newer winner or reclaim
its credit; a successfully scanned stale candidate gets a deletion intent. UNAVAILABLE
quarantine retains its original creation-time 24-hour deadline; retry or reconciliation
never refreshes it. Do not apply stale-success cleanup to an unavailable attempt in a
way that silently changes its approved retry/retention semantics. Prior good bytes remain
until swap.

Same-key replay returns original attempt outcome without new allocation; terminal failure
uses an explicit new-key retry. UNAVAILABLE same-key recovery uses original quarantine
only within 24 hours; expiry purges bytes and a new upload is required. New-key retry must
not double-credit the predecessor while an old reservation remains. Templates referenced
by immutable questionnaire versions stay protected from replacement/deletion.

Migration must update all lifecycle/lineage/quota/tombstone/template guards together:
dropping the unique predecessor index alone leaves the adjacency trigger broken. Preflight
classifies passed chains, failed and unavailable attempts. Backfill attempted predecessor
from old replacesUploadId; derive committed lineage from actual successful replacements,
not max attempt number. Ambiguous chains block repair; preserve original safe metadata in
an append-only repair record. Do not rewrite historical audits. Rehearse unavailable and
failed retry, full quota, concurrent commit, physical-byte deletion and migration failure.

## Legacy files, grants and admin state (Phases 9–12)

Add nullable legacy verification metadata (detected type, SHA-256, scan verdict,
scanner identity/signature version and verified timestamp) on ApplicationFile or a
linked immutable verification record. Current ApplicationFile has no durable scan
verdict/hash/time; the storage verification result is discarded. Existing rows begin
UNKNOWN, never assumed PASSED. Inventory and re-scan existing bytes in isolation;
propose blocking new payment/submission on UNKNOWN evidence with actionable recovery.
Do not silently quarantine/delete existing good historical files or block established
download/review access without an agreed repair policy. Missing/malicious bytes require
explicit recovery handling. Agree this historical-data impact before Phase 10; qualification
must prove normal submissions after backfill as well as unknown/missing-file denial.

Add LegacyFileBinding(applicationId,slotKey,currentFileId,generation) with unique slot
and FK/ownership guard, plus immutable-safe deletion intents with retry state. Stage,
verify and scan bytes before commit; under application then slot lock commit binding,
actual predecessor, draft reference/version and deletion intent together. All draft saves
validate current file IDs/generation. Deletion rechecks current references and can retry
after crash/unlink failure. Do not return stale successful IDs that can overwrite a newer
binding. Do not enable DELETE before this design is implemented and verified.

Validate every required file against owned current slot, allowed type, passed scan and
availability before payment/submission, coordinating replacements under the same lock.
Storage absence is not a valid file; bind object identity/checksum, and prevent reconciler
from deleting current/pinned objects. Revalidate correction submissions without repayment.
Admin transitions recheck live role/status and commit notes/certificate/history/notification
intent atomically. Losing requests get an actionable Persian conflict response.

Grants: SELECT/INSERT/UPDATE only for new runtime coordinator/limiter/binding/intent tables;
no runtime mutation of audits/history. Prefer narrow maintenance functions/role for expired
OTP/reservation and superseded-file removal with fixed search_path and explicit ownership
checks, rather than broad DELETE. Provisioner must remove PUBLIC execution and owner
inheritance. Restricted-role tests must execute actual cleanup and denied current-file/
audit deletion; jobs return nonzero for partial failures. Exact grant SQL belongs to the
implementing phase, not Phase 0.

## Migration, existing data, coexistence and rollback

New migrations only. Before implementation enumerate constraints and all writers; before
release inventory duplicate/unknown authorities, multiple captures, stale/dangling draft
file IDs, failed replacement chains, cleanup backlog and in-flight OTP/payment operations.
Use synthetic duplicates in migration rehearsals now; actual production repair needs
matched backups and approved handoff. Never erase a captured payment to pass uniqueness.
Backfill coordinator from unambiguous settled records; ambiguous obligations become blocked
reconciliation items. File bindings derive from validated saved references, not newest
createdAt; ambiguous/missing references need explicit recovery.

Additive DDL does not make old writers safe. Proposed rollout uses a maintenance write
pause/version gate for payment/auth/upload mutation, while preserving safe callback intake
and recovery, until every writer uses new semantics. Alternatively prove dual-version
compatibility explicitly. Expand, preflight/backfill, verify, deploy compatible writers,
reconcile grants, run restricted-role/integration checks, then reopen authorized writes.
Do not overlap old replacement/payment writers with the new model.

Rehearse failed migration transaction and rerun, bounded backfill and interrupted resume,
constraint validation and grants on a restored isolated copy. Retain expanded schema on
rollback; disable affected mutations and use compatible recovery code. Old vulnerable
writers are not a safe fallback after new lineage. Do not reverse-drop evidence tables or
reinstate incompatible old predecessor constraints. Destructive matched restore is a last
resort requiring separate approval and post-backup payment/data reconciliation.
Production DB backup and upload/redeploy remain owner handoffs. No production actions
are authorized here; dated Git plus verified matched DB/uploads/config backup required.

## UI journey and Persian states

Keep existing components, mobile RTL layout, document steps and focus/label conventions.
Login -> profile (new/incomplete) -> supplier/type/amount -> old and facilities document
steps -> edit confirmation -> payment -> submitted/review -> corrections -> resubmit
without repayment -> final result (facilities has no completion certificate).

- Pending/unknown payment: «نتیجه پرداخت در حال بررسی است. لطفاً دوباره پرداخت نکنید.»
  Show safe status refresh/recovery; do not turn timeout into a new pay button.
- Upload pending: retain previous file link until replacement commits; validation or
  scanner outage provides explicit retry, preserving entered values and private access.
  «بررسی فایل در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.»
- Stale save/review: «اطلاعات پرونده تغییر کرده است. صفحه را تازه‌سازی و دوباره بررسی کنید.»
- Missing/stale required file: field-linked «فایل معتبر این بخش را دوباره بارگذاری کنید.»
- OTP limit: existing Persian retry message and truthful cooldown; expired code has
  generic invalid/expired response. Uniform admin request response reveals no existence.
- Empty documents, loading, validation, success, retry, denied role and expired session
  states remain explicit; preserve keyboard focus and announce actionable errors.

These are engineering error-copy proposals. Facilities payment acknowledgement/versioning
remains a separate owner-copy decision; do not treat these messages as approval.

## Decisions and unavailable infrastructure

D1 owner update after baseline: uncertainty policy approved; project owner handles
manual reconciliation via gateway dashboard/support initially. No new admin-panel feature
will be developed for this. Preserve durable evidence and safe payment coordination.
No automatic refund authorized. Owner will act when the client reports a case; no
scheduled manual review or response-time commitment. Applicant support-contact guidance
is approved for unresolved payments only. Unreported uncertain cases remain blocked;
normal confirmed success/failure paths are unchanged. Provider semantics remain to be
verified; no assumption of reversal, refund or cancellation finality is approved.
D2 agreement on this data model, migration/rollback and UI plan: pending owner review.
D3 new limiter-key protection/24-hour abuse-record retention: proposed; confirm before
Phase 4–5 schema implementation. Current OTP retention is already 24 hours.
D4 historical legacy verification backfill and UNKNOWN-file recovery/access policy:
proposed above, pending agreement before Phase 10.
D5 existing M9 choices remain pending: intake/canary; exact questionnaires; payment copy;
all-fields correction versus immutable snapshots/templates; profile quota/count; MB/MiB,
archives/retry; scanner freshness; capacity/backup retention; responders/SLAs; maintenance,
RPO/RTO/consistency/containment; dependency exceptions. No invented approvers or dates.

Available: local Node/npm/dependencies, Docker/PostgreSQL16, psql, synthetic fixtures.
Not qualified/provided: actual staging proxy topology, authorized payment sandbox/SMS
recipient access, pinned scanner with signatures, actual runner/maintenance image scans,
production read-only inventory and matched backups, real alert destination/receipt.
Browser tooling exists but complete browser journeys and HTTPS behavior are Phase 18/16;
Phase 0 HTTP probes do not substitute for browser acceptance. No sandbox or live SMS.

Actual gate semantics from lib/facilities-m9/release.ts and operator-checklist.md:
G0 decisions/owners; G1 immutable candidate; G2 staging operations; G3 acceptance/chaos;
G4 matched production backup/restore; G5 schema/deployment handoffs; G6 configure/enable;
G7 observation/acceptance. Each depends on all prior gates. G7 exists despite master
prompt shorthand G0–G6. Pending example structure validity is not a gate pass.
