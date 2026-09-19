# Phase 10 qualification results

Final candidate: master / 29705da7e148b75a56d3a4aedc3565530c1d6974 plus preserved
worktree. D4 owner approved. No commit/reset/push/production access or enablement.

- `regression-sealed.log`: **655 tests / 83 files pass**; includes 193 restricted-DB
  cases, of which 38 exercise the actual new R10 gates (19 legacy, 19 facilities).
  Ten new bounded-reader tests reject links/escape/size errors and accept root aliases.
- `build-ui-final.log`, `types-sealed.log`: production build and TypeScript pass.
  `lint-final.log`: pass with only pre-existing public-page img warning.
- `browser-ui-final.log`: actual production Next at 390/1440; paid-pending crash
  recovery, actionable Persian rejection, no contradictory success notice, verified
  repair, exactly one submission and preserved single payment; 18 controlled local
  INSTREAM scans, external network blocked. Screenshots visually inspected.
- Negative paths cover fabricated/foreign/wrong-slot/stale/generation/unbound-by-binding
  lookup, missing/changed/size/UNKNOWN; facilities explicit wrong scope/slot/stale,
  unscanned/quarantine fixtures; paid/free submissions and corrections; scanner outage,
  scan/replacement and scan/content races; metadata immutability and no extra fee.
- Profile cleanup is deferred under the qualification company lock; after release only
  predecessor bytes are removed and current qualification passes. Restricted officer
  prune retains evidence-linked rows and rejects non-editable snapshot operations.
  Backend-lock test proves wizard refresh does not lock snapshots before application.
- `migration-rehearsal.json`: 31 prior migrations + 2 additive; exact historical file
  row remains UNKNOWN; both new migrations roll back on injected precommit failure;
  restricted grants deny direct metadata/verification/snapshot deletion. Actual isolated
  DB has 33 checksum-matched migrations and programme enablement count zero.
- `source-hashes.json` / `tested-source-hashes.json`: 133 root source / 132 copied source
  hashes match; only static .env.runtime.example excluded from execution. Original audit
  hash and master HEAD preserved. `shutdown.json` records owned resource shutdown.

Limitations: actual scanner engine/signature identity and freshness are Phase15 evidence;
current protocol supplies verdict only. Production inventory/backfill, matched production
backups and rollout were not performed. Out-of-band filesystem administrator changes
remain outside cooperative DB-lock guarantees. Launch remains NO-GO for later phases.
