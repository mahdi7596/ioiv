# Phase8 R7 design and acceptance

D2 approved Phase0 model, D1/D3 remain settled. No changed facilities promises or approval.
Preserve original revisionNumber/idempotencyKey/replacesUploadId as immutable attempt identity
and attempted base. Add committed predecessor and sequence fields assigned only on PASSED;
keep historical attempted base instead of repurposing/renumbering it. Add retry ownership token
for exclusive resume. Safe append-only migration repair metadata records derived lineage.

Transactional additive migration preflights successful chains/current pointers and aborts on
ambiguity. Backfill committed predecessor/sequence only from PASSED history, including deleted
bytes. Failed attempts retain their identity and cease monopolizing a committed successor.
Replace upload/quota/current-binding/tombstone/template guards together. Current cannot roll
back to an obsolete revision. Existing schema remains on rollback; pause/drain old writers,
retain evidence and use compatible code. No production migration/backfill authorized.

Scope/application lock precedes binding lock. Reserve monotonically numbered attempts;
committed lineage is separate. Count current bytes + pending reservations, credit each live
predecessor once; obsolete physical bytes are capacity backlog, not current logical quota.
At commit lock/recheck base=current, live editability, DB-clock expiry, quota and scan metadata;
write binding/lineage/audit/tombstone atomically. Stale successful candidates terminally fail
with durable deletion recovery. Stale UNAVAILABLE retains original24h quarantine semantics.

Exclusive retry transitions UNAVAILABLE→PENDING with token under scope/binding lock. Same-key
API replay returns original outcome; internal same-attempt retry owns existing quarantine.
No lease takeover of active remote work. Original createdAt controls24h cutoff before retry
and commit. Expire abandoned PENDING retries too; conditional terminalization cannot overwrite
PASSED. Preserve bytes on ambiguous commit until durable state can be read, never compensate
by deleting possibly-current content. Tombstones recheck current/template protection before
physical deletion; publication cannot race scheduled deletion. Cleanup remains retryable.

UI retains prior good file/link on upload error and actionable Persian recovery; no redesign.
Acceptance: baseline failed/unavailable SQL reproduction, real restricted SQL+service/storage
bytes tests for same/new key, scanner/storage failure, full quota, concurrent candidates/retries,
expiry/crash/commit uncertainty, delayed A→B→C deletion, template protection and owner denial.
Rehearse migration failure/rollback/rerun/backfill and all applicable DB suites; production
browser with controlled scanner/storage, regression/types/lint/build and independent review.
Keep facilities disabled outside isolated fixtures. Actual scanner qualification is Phase15.

Orphan cleanup freezes candidate names before its exclusive advisory transaction, checks for
any PENDING writer, and reads fresh stored references. Upload admission takes the shared lock
in its trigger. If a cleanup transaction times out during local I/O, later writers only create
fresh UUID names absent from the frozen list. Any live/crashed PENDING upload defers orphan
cleanup globally until completion or its original24h expiry; this intentionally favors data
preservation. Completed tombstones and stale/noneditable unavailable candidates cannot occupy
maintenance batches. No production cleanup schedule or permissions are changed in this phase.
