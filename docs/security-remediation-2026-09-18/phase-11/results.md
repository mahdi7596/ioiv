# Phase 11 local verification

Scope R9: restricted maintenance permissions and truthful bounded cleanup outcomes.
No production access, real provider, scheduler installation or facilities enablement.

- Full regression: 672 tests / 84 files (`regression-final.log`). 17 new restricted
  maintenance tests run actual CLIs and IPC processes (`maintenance-final.log`).
- OTP: fixed database-clock 24h retention + expiresAt predicate; recent/live rows survive;
  5,001-row backlog processes 5,000 then exits2; restart completes the last row. Runtime
  cannot directly DELETE/TRUNCATE OTP, ApplicationFile, verification or cursor tables.
  PUBLIC cannot execute helper; fixed search_path/definer inspected; distinct lock proves
  no collision with orphan coordination. Database unavailability never reports success.
- Legacy actual CLI: predecessor and aged uncommitted bytes removed, current exact bytes
  and both file identity rows retained; directory-at-candidate-path injects unlink failure,
  reports incomplete2, then retry succeeds. Existing R8 suites retain shared/historical
  reference and concurrency coverage. Large resweep coverage stays explicitly partial.
- Facilities actual CLI: standalone clean isolated DB, real passed predecessor/current
  files, real unlink failure gives2 and no completion audit; due retry gives0, one
  completion audit, removed predecessor and unchanged current bytes + upload history.
  See `facilities-cli.log`, replay `facilities-cli.py` after `migration-rehearsal.py`.
- Parent SIGKILL and advisory-connection termination stop IPC worker without completion.
  Durable next priority survives death; synthetic restarted worker executes healthy queue
  before blocking queue. Independent child death/watchdog expiry are not separately
  injected; no claim those paths were directly proven. Production-category throughput
  and sustained arrivals require operational qualification.
- 33 prior + one additive migration rehearsed; injected precommit failure rolls back
  helper/table, preserves historical OTP; real apply also preserves OTP, grants twice
  idempotent (`migration-rehearsal.json`). No broad file/evidence delete grant.
- Production build and TypeScript pass; lint zero errors, only existing public image
  warning. No UI/route behavior changed, so this phase adds no browser qualification.

Review corrections: per-category budgets, durable priority rotation, pre-I/O row cursor,
truthful resweep coverage and remainingScan indicator, actual facilities CLI recovery.
Initial contention-test harness used queryRaw for a void PostgreSQL lock return; changed
only harness to executeRaw, then passed. Initial tsc lacked generated Next route types;
next typegen resolved it. One initial standalone facilities fixture failed without a
specific diagnostic; harness now records assertion messages and uses structured URL
replacement; clean reruns pass. No three consecutive no-progress attempts.

Remaining limits: bounded partial runs may exit2 normally; monitor progress/failures,
not a false complete sweep. Keyset rotation does not guarantee fairness under unbounded
arrivals faster than cleanup. Per-object fences protect the connection-loss polling
window; no filesystem/database atomicity claim. Production backup, scheduler, alerting,
scanner, provider and release evidence remain unqualified. Overall launch NO-GO.
