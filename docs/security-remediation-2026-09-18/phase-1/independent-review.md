# Independent Phase 1 review

Reviewer `review_design` independently inspected design then actual code/migrations.
Confirmed and corrected: hidden adapter retries; historical failed/no-authority eligibility;
AUTHORITY evidence local replay; crash after REJECTED evidence; distinct competing callback
deduplication and post-settlement retention; operation/owner/authority-filtered recovery;
original PAYABLE URL replay; return-page SETTLED precedence over an old failed attempt.
Follow-up: earlier coordinator defects corrected, no additional R2 blocker identified;
provider finality/idempotency not established. R1/R12 remain separate open phases.

Reviewer `test_review` independently challenged evidence. Added after review: facilities
restricted-role start/verify barriers and capture/authority recovery, separate process and
SIGKILL cases, populated-history transactional migration failure/rerun, notification failure,
result-persistence denial, expired lease/late owner, mobile/desktop real browser checks.
Facilities payment readiness is explicitly stubbed in the R2 DB suite; full readiness/file/
scanner/browser programme qualification remains later work. No mock proves provider behavior.

Real facilities execution found two pre-existing SQL/schema mismatches that original mocks
missed: payment statuses rejected by audit metadata guard, and absent payment audit enum
values. Both repaired additively, scoped to payment action vocabulary, with real-flow replay.
Final follow-up evidence review is recorded below when returned.

Final `test_review` follow-up: no new Phase1 R2 blocker. Explicit limits: multi-process
start worker reconstructs shared reservation sequence rather than invoking a complete
Next server action; actual start actions are exercised by DB tests and browser integration.
Facilities readiness/materialization remain stubbed. Suggested extra facilities-specific
verify-timeout/post-capture submission cases are coverage strengthening, not a newly
identified R2 blocker. Provider response/finality and sandbox remain Phases3/19; cancellation
and stale application updates remain Phase2. No blanket security/release signoff.
