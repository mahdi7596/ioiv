# Phase 0 evidence — 2026-09-18

Preparation only; **NO-GO**, no remediation findings closed. Phase 0 BLOCKED pending
D1 payment reconciliation policy and D2 concrete design agreement. See [design](design.md)
and [progress/checkpoint](../../security-remediation-progress.md).

## Environment and identities

HEAD master/29705da7e148b75a56d3a4aedc3565530c1d6974; actual worktree had existing audit
edits and untracked audit evidence. `workspace-before.json` records these and the preserved
September16 audit checksum. `environment.json` records exact local Node26.7.0, PostgreSQL
image content ID, container and scratch directory. PostgreSQL reports 16.13/aarch64.
Node22 Linux runner/maintenance images were not built or scanned.

Fresh task-owned container `sana-remediation-phase0-20260918` used loopback-only ephemeral
port (initial 59677), synthetic trust authentication and databases `phase0` /
`phase0_restore`. Never reuse trust authentication for staging/production. No existing
sana-postgres container was used. Normal HTTP app used restricted `phase0_http_runtime`,
canonical grants; owner connection only provisioned migrations/fixtures and read counts.
No production credentials/environment were loaded. Payment/SMS credentials explicitly
blank; scanner at closed loopback port, passthrough disabled. Production-mode SMS dispatch
therefore failed before external I/O; observed request acceptance is not delivered SMS.

Source was copied from current tracked files, excluding real .env and initially all env
files; the two tracked .example files were restored before the successful unit retry.
Dependencies were locally available, then APFS-copied into the source after Next rejected
the external symlink. No fresh npm ci was run. Git metadata for the credential test was
supplied explicitly, not by committing the temporary copy. All 410 tracked files were
present on retry, including ten docs and two tracked env examples (`copy-inventory.json`).
Its hashes identify copied baseline inputs; `source-sha256.json` separately records 397
non-doc/non-env unchanged files. Neither is a clean release manifest or image attestation.

## Exact checks and outcomes

All commands ran in the isolated source with the env allow-list in `fixture-env.json`.
Initial failure logs are retained; they were harness defects, not changed application code.

| Command | Exit/outcome | Evidence |
| --- | --- | --- |
| npm test | initial 1: 306 passed, two Git context errors | unit.log |
| npm test | retry 0: 68 files/308 passed | unit-retry.log |
| npm run build | initial 1: outside-root node_modules symlink | build.log |
| npm run build | retry 0: production build | build-retry.log |
| npx tsc --noEmit | 0 | types.log (empty output) |
| npm run lint | 0; one existing public-page no-img-element warning | lint.log |
| npm run test:db:m1-integrity | 0; all 24 migrations/seed/SQL | db-foundation.log |
| npm run test:db:m1-role | 0; provision/restrict/denial checks | db-m1-role.log |
| npm run test:db:m2-files | 0 | db-m2-files.log |
| npm run test:db:m6-payment | 0 | db-m6-payment.log |
| npm run test:db:m7-review | 0 | db-m7-review.log |
| npm run test:db:m8-operations | 0 | db-m8-operations.log |
| npm run test:db:m9-suppliers | 0; destructive fixture truncation isolated | db-m9-suppliers.log |
| npm run test:db:m1-recovery | 0; expected division-by-zero transaction failure, rollback and rerun | db-m1-recovery.log |
| npx vitest run tests/security-review-payment-races.test.ts | 0: two vulnerabilities reproduced, not fixed | payment-reproduction.log |
| psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f phase0-reproduction.sql | 0: failed/unavailable replacement retry defects reproduced and fixture rollback | file-reproduction.log |
| npm run facilities:m9:validate | 0: structurally valid, 20 pending | m9-structure.log |
| npm run facilities:m9:validate -- --require-gate G3 | 1 expected: gate fails | m9-g3.log |
| node phase0-http-probe.mjs | 0; restricted-role local HTTP vulnerability probes | http-results.jsonl |

Additional psql queries recorded version, finished migration count=24, absent rollback
fixture count=0, enabled facilities configuration count=0 (`db-state.log`). Canonical
grants applied to `phase0_http_runtime`; `has_table_privilege` returns false for DELETE
on OtpCode and ApplicationFile (`runtime-role-reproduction.log`). This is privilege
inspection, not successful/failed execution of actual pruning/replacement jobs.

Unit and DB passing results do not test the proposed fixes. Payment evidence uses mocks;
HTTP is not a browser CSRF navigation/cookie proof. Actual scanner, file bytes, provider
sandbox, distributed races and full browser journeys remain for their implementation
phases. R8/R10/R11/R12 remain source findings. Restore contains primarily schema/catalogue
fixtures, not application/upload coverage; no claim of matched recovery or RPO/RTO.
No current advisory query was run; original audit JSON remains historical input.

## Recreate safely after shutdown

Do not paste package DB commands into the normal checkout with default .env. Both the
supplier suite and recovery script mutate data. Read each script before rerunning.

1. Verify actual branch/HEAD/worktree and preserved audit hash against the checkpoint.
   Create a new unique temp root with `source`, `home`, `tmp`, `uploads`. Copy the current
   `git ls-files` files, excluding actual .env files; include only tracked `.example`
   files. Copy dependencies physically (macOS `cp -cR`; otherwise `cp -R`) or perform a
   separately qualified install. Preserve original audit-only .txt/SQL inputs.
2. Create a new task-owned `postgres:16-alpine` container from the recorded image ID if
   available, with `-p 127.0.0.1::5432`, `POSTGRES_DB=phase0`, synthetic test-only auth,
   unique task name/label. Check `docker port`, container ID/image/label and
   `SELECT current_database(), version()` before writes. Create blank `phase0_restore`.
   Do not connect to the historical port without verifying it belongs to the new fixture.
3. Copy `run-isolated.py` to `<new-root>/run.py` and `fixture-env.json` to
   `<new-root>/env.json`. The script expects sibling `source` and `env.json`; it is NOT
   directly runnable from this evidence directory. Replace all old temp paths/DB ports,
   HOME/TMPDIR/storage paths and GIT_DIR/GIT_WORK_TREE with the verified new identities.
   Maintain the complete allow-list; never merge inherited process environment. Keep
   gateway/SMS credentials blank and scanner passthrough false. This file contains only
   synthetic fixture config, not production secrets.
4. Execute `python3 <new-root>/run.py npm run test:db:m1-integrity`, then the other DB
   suites in table order, then recovery against the explicitly blank restore target.
   Run unit/lint/build/types; no need to rerun unchanged checks solely to consume time.
5. Copy historical `payment-races.test.ts.txt` into isolated tests as
   `security-review-payment-races.test.ts`; run the focused command; remove that temporary
   copy before normal test runs. Copy historical failed-replacement SQL as
   `phase0-reproduction.sql` and run with isolated owner URL. Verify rollback absence.
6. For HTTP, create a dedicated LOGIN NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT role;
   apply canonical grants with `-v runtime_role=<fixture-role>` using owner connection.
   Start built Next with **restricted-role** URL, NODE_ENV=production, 127.0.0.1 binding,
   port3198 (verify availability), inherited safe allow-list only. Store its PID.
   Copy `http-probe.mjs.txt` as `source/phase0-http-probe.mjs`, run via run.py with owner
   fixture connection for synthetic seeding/count checks. It never prints codes/cookies.
   Use fresh DB fixtures on rerun; fixed fixture IDs intentionally reject repeat inserts.
7. Save sanitized results. Stop only owned app PID and verify it exited, then stop/remove
   only the container matching recorded ID/task label. Never stop unrelated containers.
   Record final identity/status. Scratch source can be removed later only after matching
   its recorded identity; no live fixture is required to resume.

`fixture-env.json` names the exact environment used, including the synthetic JWT secret;
this secret has no use outside the now-stopped local fixture. Provider credentials are
blank. Raw server logs were kept outside Git and removed at shutdown; no code, cookie,
message body, database dump or real recipient data is stored in these evidence files.
