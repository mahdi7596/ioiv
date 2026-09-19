# Phase 10 attempt log

1. Implemented bounded byte gates, append-only historical evidence, capture-first legacy
   settlement, facilities profile/application qualification and editable paid repair.
   Restricted legacy tests: 14/15 passed. Remaining test incorrectly expected timeout
   replay; retained the coordinator rule and used completed same-authority rejection for
   safe recovery coverage. Follow-up 25/25 (15 DB + 10 reader).
2. Independent review found legacy allowlist bypass, root alias rejection, NULL CHECK
   loophole and unreliable timestamp ordering. Fixed allowlist/root resolution, explicit
   non-null fields, serialized sequence ordering and non-conclusive outage observations.
3. Real facilities action failed before qualification: missing snapshot-delete permission.
   Diagnostic exposed exact restricted-role denial. Added scoped editable snapshot
   maintenance functions, retaining direct DELETE denial. Follow-up all seven passed.
4. Review found incomplete payload/UI recovery gate and paid-pending crash boundary.
   Moved parsing into new-payment/paid-editable branches and added browser recovery before
   editable validation. Added both programmes' seeded capture/crash regressions.
5. Broad regression: 628 passed, 11 failed. Older mock delegates lacked new post-capture
   reads; updated mock state and narrowed qualification stubs to payment-only suites.
   Updated persistence assertions to prove VERIFIED/SETTLED survives submission failure.
   Actual R10 suites retain real DB, file and gate behavior.
6. Follow-up found repeat-run certificate fixture reused globally forbidden basename,
   plus an overly broad test text replacement changed the wrong failure expectation.
   Fixed unique fixture names and restored evidence-persistence failure assertion.
   Focused follow-up: 73/73 passed.
7. Review found wizard snapshot/app lock inversion introduced by scoped helpers. Lock
   application first at both refresh entry points, company second; contention regression
   added and passed.
8. Browser fixture: first run raced full-page navigation; explicitly await it. Second
   run completed submission but expected dashboard without a completed company fixture,
   causing the established profile redirect. Added the missing fixture completion state.
   These were distinct diagnosed harness failures, not suppressed product assertions.

No production access, live provider/SMS, programme enablement, commit/push/reset. Current
no-progress count: zero. Phase remains in progress until final review/evidence sealing.
9. Evidence review requested real facilities corrections, negative metadata states,
   profile cleanup contention and officer retention. Added nine real-DB tests; corrected
   fixture transitions to use SUBMITTED→UNDER_REVIEW→NEEDS_EDIT and represented quarantine
   without contradictory committed lineage. All 19 facilities cases pass. Added stronger
   lock-order test with a blocked backend: snapshot update remains available to app owner.
10. Both additive migrations now have injected precommit rollback and historical-row
    preservation evidence. Scanner identity/version remains explicitly unqualified until
    Phase15 actual scanner qualification; no provenance version is invented.
11. Visual inspection caught a contradictory local 'ready' notice after server document
    rejection. Suppressed that notice on server error and made paid-repair text generic.
    Added browser assertion for no success notice during document error. Localized
    facilities missing-document labels; adjusted old tests that expected English slot keys.
