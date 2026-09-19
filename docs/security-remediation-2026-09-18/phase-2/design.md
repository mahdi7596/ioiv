# Phase 2 scope and entry verification — 2026-09-19

Authorized: Phase 2 only, R1, following completed local Phase 1. Owner payment policy
and all later decision boundaries remain unchanged. No Phase 3 contract work.

Entry verification, before edits: master at 29705da7e148b75a56d3a4aedc3565530c1d6974;
all 33 entries in phase-1/source-hashes.json matched current bytes (Python hashlib
comparison returned an empty mismatch list). September16 audit SHA256 matched
2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
Existing uncommitted Phase1 and historical audit work retained. Only root AGENTS.md
exists. Phase1 resources were absent; unrelated running containers left untouched.

Trace: legacy callback's browser NOK branch used stale payment/application snapshots;
legacy settlement unconditionally submitted even later review states; request completion
unconditionally set PENDING_PAYMENT; correction start wrote an old NEEDS_EDIT snapshot.
Facilities callback already checks provider on NOK and locks current state for submission.

Implementation model: remove browser-only failure mutation; all valid matching returns
use durable original-authority verification. Rejected or unknown outcomes remain pending,
never authorization for another charge. Settlement records captured evidence/payment and
settles obligation, but only DRAFT/PENDING_PAYMENT can generate a submission transition,
history and a fresh notification intent. Resubmission rechecks ownership, payment and
status under the common application lock and records one correction history. Request
completion conditionally moves DRAFT to PENDING_PAYMENT. Admin status update uses a
status compare-and-swap to avoid stale history when racing the resubmission commit;
conflict is Persian 409 and transaction rollback. Full R11 certificate/admin qualification
remains Phase12; no additional administrative workflow or business transitions.

No schema, grants, migration, deletion, retention or fees change. Existing 27 migrations
and Phase1 compatible-writer rollout prerequisite remain. No data repair/backfill is
performed. Rollback must retain payment evidence and use compatible guarded writers;
do not restore vulnerable Phase1 cancellation code. Deployment still requires owner
handoff and matched backups; nothing here authorizes production activity.

Acceptance: reproduce desired-safe tests against exact Phase1 code, fix and rerun;
restricted-role real DB deterministic barriers for cancellation/capture/request/retry,
review/resubmission, rollback and facilities guards; unit/frontend return regressions;
production browser return/refresh/no-repayment checks; types/lint/build; independent
critical code and evidence reviews. All external provider behavior remains controlled
fixtures; real sandbox and complete journeys are later phases.
