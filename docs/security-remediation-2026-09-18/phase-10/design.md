# Phase 10 design — approved D4 implementation

Owner instruction continues phases without routine pauses; D4 approval is recorded in
D4-decision-proposal.md. R10 is the current phase. Phase 9 evidence stays immutable.

## Model and invariants

Submission gates hold the existing application lock. Facilities additionally locks the
company before checking profile bindings (including corrections). Check exact owner,
scope, stable slot, current revision, non-retired status and durable scan evidence,
then read bounded regular private bytes and verify size, content type and SHA-256.
Legacy array positions never compact. No remote scanner runs inside submission locks.

Historical ApplicationFile identity stays immutable. An additive append-only
LegacyFileVerification table records verification attempts against a file and exact
hash/type/size. UNKNOWN is never inferred as PASSED. A read-only inventory precedes an
explicit backfill run; scan outside the transaction, then lock/recheck current identity
and bytes before append. Scanner outage permits retry; ambiguous/unbound references
require resolution/re-upload. No historical download changes or automatic containment.

Payment capture is persisted independently of document qualification. Existing payable
or uncertain attempts remain recoverable before new-payment eligibility checks. Failed
post-capture qualification returns PENDING_PAYMENT to editable DRAFT under lock, retains
VERIFIED/SETTLED money, and creates no submission notification. Repair and retry submits
once without gateway request/verification. Already submitted/reviewed cases stay closed
to this automatic transition. Corrections retain the existing no-repayment policy.

## User journey and errors

Use document-specific Persian errors and existing form alerts; paid but unsubmitted
applicants see payment retained and a repair/retry instruction. Re-upload uses Phase 9/8
replacement workflow. Session and ownership checks remain server-side. No redesign.

## Migration / retention / rollback

Add verification records and SELECT/INSERT grants only; deny updates/deletes, protect
file identity and evidence. Retain old rows/bytes and new evidence on rollback. Reverting
the gate reopens R10 and requires release review; additive schema can remain. Production
backfill/migration/deployment remains separately gated by verified matched backups.
Private storage must remain immutable to processes other than authorized upload/cleanup;
application locks fence cooperating writers, not out-of-band filesystem administrators.

## Acceptance and verification

Real restricted PostgreSQL plus private fixture bytes: fabricated/foreign/wrong-slot,
stale/unbound/UNKNOWN/deleted/missing/hash/type/size failures; valid paid/free/correction
flows; replacement/profile replacement/cleanup races; capture then missing file then
repair with zero second charge; uncertain-payment recovery; historical verification
retry and concurrent replacement; historical access unchanged. Unit tests exercise
bounded reads and safe paths. Run regression/types/lint/build, browser recovery checks,
migration/grant rehearsal, independent code and evidence review. Phase stays incomplete
until these checks pass and evidence/resources are sealed.

## Restricted-role integration discovery

The first genuine facilities submission reached a pre-existing permission denial:
refreshFacilitiesProfileSnapshot calls snapshot DELETE operations absent from runtime
grants. Added two SECURITY DEFINER functions with fixed search_path, application row
lock, DRAFT/NEEDS_EDIT restriction and retention of referenced officers. Direct table
DELETE remains denied. This narrow Phase11 dependency is included here so Phase10 can
be qualified through actual restricted-role submission rather than an owner-role bypass.
The additional migration is additive; preserve both functions/evidence on rollback.
