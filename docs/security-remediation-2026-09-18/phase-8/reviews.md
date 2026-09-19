# Independent Phase8 reviews

Code reviewer `/root/phase8_design_review`: APPROVED after final correction, 2026-09-19.
Final migration SHA256 `8ea72e679cfa0820479d79eb25a075690289be2a33f038060a3c476a51d5c6e3`.
Reviewed source independently, not a claim of independently executing all runtime tests.

Findings fixed and regression-tested:
- Failed-attempt predecessor uniqueness/adjacency, A→B→C cleanup, logical quota/one predecessor
  credit, exclusive retry/original deadline/crashed PENDING expiry, destructive compensation.
- Stale orphan snapshot and transaction-timeout race: frozen names before lock, fresh refs,
  defer during PENDING writer; delayed discovery and actual crash-orphan tests.
- Completed tombstone and stale/noneditable retry batch starvation; lifecycle-based filtering.
- Detached PASSED quota/workflow bypass: deferred atomic attachment and binding-time guards.
- Active quarantine deletion authorization: database and service denial.
- Ambiguous transport UI assertion: last-known/refresh wording.
- Late legacy direct reference racing unlink: durable tombstone rejection plus stored-row
  synchronization, tested after5s transaction timeout; existing refs preserve bytes.
- PL/pgSQL FOUND overwritten by row lock: existence checked first; completed deletion replay.

Reviewer required drain of old writers before migration and compatible-schema rollback;
DEPLOYMENT.md records this explicitly. Arbitrary reverse-order direct SQL may deadlock and
must roll back; supported service writers use scope-first locking. No remaining code blocker.

Evidence reviewer `/root/phase7_evidence_review`: core evidence reviewed; two requested
improvements (same-key FAILED/storage replay and actual orphan deletion after unattached
process death) independently reviewed as resolved. Final checkpoint/hashes/shutdown APPROVED. Independently verified578/79 tests,29 R7 plus97 prior DB cases, matching migration checksum,95 source/94 tested-copy/104 evidence hashes, and absent owned resources. Reviewer correctly distinguished controlled INSTREAM from real antivirus qualification,
owner fixtures from restricted runtime actions, migration rollback from schema downgrade, and
local behavior from production readiness. No changes/resources created by either reviewer.
