# Phase 1 implementation decisions

Authorized scope: R2 only; latest ledger handoff supersedes Phase 0 approval pause.
Audit SHA256 remains 2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.

Add one durable obligation per application, typed application/attempt foreign keys,
immutable amount/currency and selected attempt; operation owner/generation/deadline,
append-only external outcome evidence and one legacy submission notification intent.
Application lock precedes obligation lock. Provider calls occur after transaction commit.
No gateway network retry. Expired ownership never authorizes a competing authority or
remote retry. A completed explicit rejection permits checking the SAME authority again,
not a new authority. Unknown transport or crashed invocation needs reconciliation;
a saved capture result permits automatic local completion without another remote call.
No automatic refund, no promise of reversal or delivery SLA, no new admin feature.

Migration/backfill conservatively blocks every pre-existing unsettled obligation with
payment history, including FAILED, CANCELLED and rows without authority. A single historic
attempt can be selected for a first coordinated check; multiple historic attempts require
manual reconciliation. Existing verified evidence settles eligibility, without rewriting
payment/history rows. Missing-result crash windows preserve operation identity for owner
reconciliation, not invented provider idempotency. Unknown old writer outcomes stay blocked.

Maintenance write pause is mandatory for rollout: drain old payment writers before DDL/
backfill and replace all instances before reopening. Additive tables do not make old
writers safe. Retain schema/evidence on rollback; pause payments and deploy compatible
recovery code, never roll back to unsafe old payment writers. Production operations are
not authorized. Failure rehearsals use only disposable loopback PostgreSQL.

Phase 2 still owns cancellation/review stale-write races. Phase 3 still owns gateway
success-envelope validation. Their defects must remain reported; Phase 1 does not claim
provider qualification. Facilities stays disabled. Retain operational metadata with payment
evidence; no deletion job or new personal data collection.

Integration discovery: the existing M8 audit validator accepts only application statuses
under metadata.status, so normal facilities payment start (INITIATED) fails at the real
DB despite passing original mocks. The second additive migration scopes known payment
statuses to FacilitiesPaymentAttempt + existing payment actions. Application status and
all remaining metadata restrictions remain unchanged. This is required for R2 execution,
not an expansion to cancellation/workflow remediation.
