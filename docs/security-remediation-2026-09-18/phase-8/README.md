# Phase8 R7 facilities replacement — local checkpoint

Status: COMPLETE locally. Independent code and checkpoint reviewers approved. Launch remains NO-GO.
No production access/deployment, real SMS/payment, or facilities enablement outside isolated
fixtures. D1/D2/D3 remain settled. D4 historical-file policy/M9 decisions remain open.

## Changed behavior

Immutable attempt identity is separate from committed lineage; failed attempts cannot reserve
a successful successor. Scope/binding locks and deferred successful attachment make current
swap, lineage, audit and predecessor tombstone atomic. Current+pending logical quota credits
one predecessor once; retained obsolete bytes remain a physical-capacity concern. Admission
and commit check editable state, original24h deadline and live base. Retry ownership is a
unique durable token; same-key replay does not allocate or rescan. Unknown commit outcome
never triggers destructive ready-file compensation.

Expired UNAVAILABLE and abandoned PENDING claims terminalize conditionally and retain evidence.
Stale/noneditable quarantine remains until its original expiry. Deletion checks current,
template and direct-document references. Reference acquisition and cleanup share stored-row
locks and durable tombstone rejection, including timeout cases. Orphan candidate names are
frozen before a lock/fresh metadata check; any PENDING writer defers orphan deletion globally.
Completed and intentionally retained records do not monopolize maintenance batches.

Both forms retain last-known successful document state across replacement errors. They show
Persian recovery/refresh copy and accessible alerts; required-document UI does not discard an
already accepted file because a replacement failed. Last-known wording covers response loss
after a possible successful commit. Screenshots were inspected and recovery paragraphs fixed
for narrow screens. This is a scoped change, not full-journey or accessibility certification.

## Evidence and limitations

- `entry-check.json`:82 prior restart hashes, preserved master/HEAD/audit checkpoint.
- `baseline-r7.log`: original failed/unavailable replacement poison reproduced before migration.
- `migration-rehearsal.log`: baseline29→candidate30, ambiguous current-pointer abort with
  atomic rollback, corrected rerun, deleted successful history and immutable failed/repair
  evidence. Prior rehearsal attempts retained. This is not a destructive schema downgrade.
- `regression-final2.log`: final full unit/restricted-DB run; earlier failures retained.
  R7 suite includes actual filesystem bytes, same/new-key FAILED/UNAVAILABLE/storage recovery,
  concurrent stale candidates, exclusive retry, expiry during scan, A→B→C delayed deletion,
  completed deletion replay, lost commit acknowledgement, five real SIGKILL boundaries,
  orphan deletion after crash, orphan discovery >5s, late references after cleanup timeout,
  preexisting references, template publication/deletion and foreign-owner denial.
- `sql-suite-results-final.json`: M1/M2/M6/M7/M8 fixture suites (owner fixture setup), restricted
  R7 full150MiB/one-credit/stale-base/obsolete-bytes checks, runtime repair readonly/DDL denial,
  M9 dry-run/apply-twice qualification in its own fresh database. Deferred constraints forced
  before fixture rollback. No production migration/job/image qualification is claimed.
- `browser-final.log`, `screenshots-final/`: production Next, actual upload/private-download
  routes and controlled loopback INSTREAM at390/1440. Reject/unavailable keeps prior bytes;
  new-key success/refresh resolves current; anonymous/foreign read404. Local scanner stub
  proves application behavior only; actual antivirus qualification remains Phase15.
- `build-sealed.log`, `types-sealed.log`, `lint-sealed.log`: build/types/lint; only preexisting
  public-page image warning. Tested on local Node26/PostgreSQL16, not pinned release images.
- `entry-and-attempt-history.md`: candidate revisions, fixture mistakes and fixes preserved.
  Payment fixture now attaches template success/current in one transaction; no payment policy
  or runtime auth/payment code changed. Production features remain disabled.

## Safe replay and restart

All work stays on master with prior uncommitted changes preserved. Source copies exclude
`.env*`; only static examples are fingerprinted separately. `setup.py` creates a labelled
loopback-only disposable PostgreSQL container, copies source/dependencies and generates the
matching Prisma client. `run.py sync` refreshes copied source; other arguments execute only
with its allow-listed synthetic env. Never reuse retained env/ports as a deployment target.
Final environment is `environment.json`; draft and pre-final records identify other owned
resources. Source copies and synthetic env are disposable, not release artifacts.

Replay migrations/grants in a fresh owned database, then execute npm test/build/lint/tsc and
`prisma/tests/facilities-replacement/browser.ts` with a local Playwright path, screenshot path
and private scratch storage root. `final-db-checks.py` creates a separate empty M9 fixture DB;
`migration-rehearsal.py` requires a fresh dedicated rehearsal DB name. Old failed attempts
are retained; do not rerun scripts blindly against an existing or nonlocal database.

Before any separately authorized production cutover, take and verify matched backups, pause
and drain uploads/retries/reconciliation, apply the migration/grants, and deploy uniform
compatible writers. **No mixed old/new writers.** Rollback retains expanded schema and all
attempt/repair evidence with a compatible guarded build. See DEPLOYMENT.md.

Remaining phases R8/R9/R10/R11, session/reset, dependencies/images, scanner/topology/backups,
full journeys/actual sandbox and release gates remain open. Phase8 does not close Phase11
job/grant qualification or Phase10 legacy/current-file verification policy.

Shutdown verified: all3 labelled containers removed,7 recorded fixture PIDs absent,7 ports closed,12 abandoned synthetic test roots removed. Copied sources retained as disposable evidence.95 restart hashes include94 matching tested-copy files and one separately fingerprinted static env example.
