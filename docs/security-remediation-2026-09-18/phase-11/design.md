# Phase 11 — R9 maintenance permissions and complete job outcomes

D4 is settled. Preserve Phase10 evidence/checkpoint and all prior work. No production.

## Scope / migration

Add fixed database-clock 24h bounded OTP pruning as SECURITY DEFINER with fixed search
path, PUBLIC execution revoked, runtime EXECUTE only. Keep direct OTP and retained file
metadata DELETE/TRUNCATE denied. Use a distinct advisory key (existing OTP key collides
with facilities orphan exclusion). Each OTP batch runs on the lock transaction client.

Legacy maintenance processes durable predecessor deletion intents and aged upload
candidates with existing Phase9 fences. Retain all identity, verification and audit rows.
ABANDONED candidates need repeat sweeping even if deletedAt exists (late writer case).
No new retention rule or automatic historical deletion/containment.

Facilities cleanup must report nonzero on dependency failures, orphan protection skips,
and remaining due backlog; no completed event before coordination acknowledges success.
Work is bounded, progresses past failed oldest rows and supports safe scheduled retry.
File operations use existing current-reference and durable lifecycle guards.

## Coordination design

File jobs need a singleton lock whose lifetime includes their actual work. A parent
holds the database advisory transaction while a dedicated IPC child performs bounded
work. The child stops on parent disconnect; parent kills and awaits child on lock/DB
failure or timeout. Completion is reported only by parent after transaction commit.
Existing per-object DB fences remain the final defence during process death/lock loss;
no claim of filesystem/DB atomicity. Child entry requires authenticated process-local IPC
(not a public flag that can accidentally bypass the coordinator). Validate actual worker
shutdown and retry with controlled process failures.

## Verification

Fresh isolated labelled PostgreSQL, copied environment-filtered source and synthetic
private files. Actual CLI exit codes with restricted role; 24h/active OTP boundaries,
multiple batches/backlog/lock contention, deny direct deletion, process death and DB
failure. Legacy current/shared/retained files survive; expired uncommitted and exact
superseded bytes are removed; storage failure is nonzero and retryable. Facilities
protection skips and partial work are observable. Reapply grants idempotently, review
migration rollback, independent critical code/evidence review, regression/type/lint/build.
Update deployment and scheduler examples. No user-facing redesign or new business rules.

## Reviewed adjustments

Durable MaintenanceCursor rows (SELECT/INSERT/UPDATE only) rotate priority between
queues before any I/O, and advance row cursors before invoking cleanup. Cooperative
per-category budgets preserve time for later queues; process watchdog handles hung
operations and durable rotation gives later queues first priority on subsequent runs.
Keyset pagination is not an unbounded-drain guarantee under arrivals faster than cleanup.
Legacy resweepNotVisited explicitly counts coverage outside this run, including already
swept ABANDONED candidates. Large sets can repeatedly exit2 while progressing; this is
partial coverage, not a claim that late writers cannot recreate bytes. No new deletion
permission on identity/evidence tables. Connection-loss detection is bounded polling;
per-object fences remain authoritative in the detection interval.
