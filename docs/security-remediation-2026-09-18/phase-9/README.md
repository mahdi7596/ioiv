# Phase9 — R8 legacy upload replacement

Phase9 COMPLETE locally. Final verification and independent code/evidence reviews approved.
Checkpoint closure is recorded in reviews.md and the progress ledger. No production deployment or enablement.

## Result

Application-first transactions atomically advance canonical slot bindings, saved draft
references/versions and exact predecessor intents. Stale generations/saves cannot overwrite
current content. Payment starts/corrections preserve array indexes and validate references
under the existing payment lock; active/uncertain payment operations fence applicant edits.
Certificate writes recheck live permission/status. Browser saves/uploads queue and merge
into live state, preserve edits, permit known-failure retry and require refresh for uncertainty.
Admin/download/export readers respect authoritative pointers and retired object state.

The allocation journal precedes private exclusive writes. Cleanup fences abandoned candidates
and exact predecessors durably before unlink. Basename locks and immutable object identities
protect alias/shared references. Historical unjournaled bytes are retained, never inferred
verified. Repeated abandoned sweeps include deletedAt rows to remove late resumed writes.
No broad runtime ApplicationFile UPDATE/DELETE grant. Maintenance scheduling remains Phase11.

## Evidence

- baseline-race.py/json: deterministic old algorithm interleaving, with isolated owner DELETE
  authority explicitly distinguished from the restricted role which denies DELETE.
- regression-final.log: **607 tests /80 files**, including **155 restricted-DB cases**:
  29 R8,29 R7,39 payment,26 verification,24 request and8 enumeration.
- R8: real files, same/different-slot races, stale saves/SQL, original row positions, ownership,
  failed/unavailable scans,20MiB boundary, ENOSPC/EDQUOT, unlink retry, irreversible fences,
  lost acknowledgement, precommit permission rollback, historical aliases, late-write retry,
  actual certificate competition/revocation, initial/correction payment race and provider-I/O
  fence, authoritative admin/export. Four actual SIGKILL boundaries: allocation/bytes/commit/
  deletion authorization. Prior R7 five SIGKILL cases remain in the complete regression.
- build-final.log, types-final.log, lint-final.log: pass. One unchanged public-page image warning.
- browser-final.log and screenshots-final/: real production Next at390/1440,14 controlled local
  INSTREAM scans; retry, queued sibling upload and year edit, refresh, stale tab409, current
  bytes and anonymous/foreign download denial. Screens inspected for narrow layout/overflow.
- payment-process-final.log: five preserved cross-process/capture crash scenarios pass.
- migration-rehearsal.py/log/json: original30 migrations and five historical files; injected
  precommit failure rolls back schema/data; final31st migration binds exactly one unambiguous
  saved reference, records nine repairs, preserves original JSON/bytes and UNKNOWN metadata.
- final-db-checks.py/sql-suite-results-final.json: M1/M2/M6/M7/M8 rollback SQL fixtures with
  deferred constraints forced; restricted R7 quota/lifecycle regression; new role denials;
  separate M9 DB dry-run/apply-twice with no enablement.
- database-final.json:31 migrations, exact checksum, no enabled facilities, restricted role,
  no legacy file DELETE. source-hashes/tested-source-hashes:119/118 identical copied entries;
  static .env.runtime.example fingerprinted but excluded from executed source/environment.
- prior-source-preservation.json:18 auth/payment/SMS runtime files byte-identical to Phase8;
  payment action intentionally integrates R8 validation and is requalified by all payment tests.
- shutdown.json: both labelled containers removed;17 recorded fixture PIDs absent,6 ports
  closed, no phase workers. Disposable source/synthetic bytes retained only under run paths.

Final migration SHA256:38ac352e457cb9f97d9bc3e83c46ef7115c65e48da1c9f2dff72572a5a28ebdc.
Master/HEAD and preserved original audit digest are in workspace-final.json.
Initial failed draft logs remain for traceability; only *-final logs qualify final source.

## Replay and limits

Use setup-final.py as the template for a NEW labelled loopback PostgreSQL16 instance and
copied source excluding all .env files. Use a new evidence directory; do not overwrite this
sealed checkpoint. Generate Prisma/apply all31 migrations with the fixture owner; provision
phase1_runtime with canonical grants. Run tests from the copy with the allow-listed synthetic
runtime env via run.py, not an inherited project .env. Build before browser/type checks.
Run DB suites/process/browser sequentially; migration/M9 rehearsals use separate empty DBs.
Verify labels and shut down only owned processes/containers. No external SMS/gateway access.

Controlled scanner/provider tests are not actual-provider certification. Historical policy
D4 remains open before Phase10; proposed impact/recovery is in ../phase-10/D4-decision-proposal.md.
Launch remains NO-GO; phases10–20 and M9 decisions/real operational qualifications remain.
