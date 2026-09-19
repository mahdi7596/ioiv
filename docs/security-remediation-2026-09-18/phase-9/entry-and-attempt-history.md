# Phase9 attempts

A1: Phase8 95restart/94tested-copy/104evidence hashes matched; master/HEAD/audit preserved. Phase8 resources verified removed. Existing authorization permits sequential Phase9; D4 remains beforePhase10. Writer inventory/design underway. No-progress count0.


## A2 — implementation draft and initial restricted-DB checks

- Reproduced the old two-cleanup race using disposable SQL-owner authority; runtime
  DELETE remains denied. Both rows and bytes disappeared under the old algorithm.
- Added bindings/version coordination, allocation journal and exact deletion intents;
  integrated applicant, certificate, draft and payment writers plus queued browser saves.
- Initial 14-case DB suite found a deferred-trigger record-field dispatch error (fixed).
  Next runs improved to 12/14 then 13/14. Found macOS canonical /var versus /private/var
  path handling (fixed) and ambiguous unused PL/pgSQL record alias in cleanup (fixed,
  awaiting fresh migration replay). These are draft failures, not acceptance evidence.
- An initial regression run overlapped a short focused run and one source sync. Neither
  will be used as final sealed evidence. Final runs must be sequential on a frozen copy.
- Independent first-draft review identified immutable identity, path containment,
  historical adoption, DB status/version, and staged-candidate recovery gaps. Fixes are
  in progress; no phase completion or production claim. No-progress counter remains 0.

## A3 — independent findings, complete qualification and shutdown

- Fixed alias bypasses in predecessor and candidate cleanup using canonical new paths,
  shared-basename locking/guards and conservative retention of unjournaled history.
- Added explicit safe precommit outcomes; known rejected uploads retain retry.
- Coverage review led to actual precommit privilege rollback, certificate action competition
  and revocation, payment/correction interleavings and provider-in-flight fencing.29 R8 cases.
- Fresh final copy/DB:607/80 pass including155 restrictedDB; build/types/lint pass, one
  preexisting warning. Actual production browser390/1440 with14 controlled scans passes.
  Five preserved payment process cases; M1/M2/M6/M7/M8, restricted quota/roles and M9 pass.
- Migration rehearsal on separate DB proves injected rollback,31 migrations, one validated
  binding/nine repair records/five UNKNOWN historical files with original JSON/bytes preserved.
- Code reviewer approved exact final migration.119 source/118 executed-copy fingerprints
  match;18 prior security runtime files unchanged and intentional payment integration retested.
- Checkpoint query initially used enabled instead of isEnabled; corrected read-only query
  confirms disabled facilities. No source/test change or production access from that mistake.
- Both labelled containers removed;17 recorded PIDs absent,6 ports closed, no phase worker.
  Evidence reviewer final receipt pending. No-progress count0; no unfinished implementation.

## Final closure

Independent evidence reviewer approved607/80,155DB,119/118 source fingerprints,88 evidence
hashes, migration/historical-byte integrity and owned shutdown. Phase9 COMPLETE locally.
Closure-only documentation updates follow the receipt; final manifest refreshed. Phase10
not implemented: required D4 policy question is pending with concrete proposal. Launch NO-GO.
