# Independent critical reviews — Phase 2, 2026-09-19

Two read-only reviewers examined source, requirements, tests and final evidence. Neither
implemented code or operated fixtures. Both completed; no ongoing/background review work.

## Code reviewer (phase2_review)

Initial findings confirmed stale legacy cancellation, unconditional success/request status
writes and stale paid-correction submission. Recommended routing NOK through coordinated
server verification, preserving review states/submittedAt, and creating history/new intent
only on an actual submission transition. Facilities existing locks were already sound for
these paths. Requested real review/resubmission race coverage or honest R11 deferral.

Resolved: cancellation helper removed, all matching callbacks use coordinator; guarded
settlement/request and locked resubmit; status/updatedAt CAS blocks stale admin history/SMS
with Persian409. Both real action race orders tested. Full R11 qualification remains Phase12.

Follow-up found newly staged certificate could be orphaned on new CAS conflict. Resolved by
deleting only that candidate on confirmed P2025 rollback; real DB/filesystem test retains
old bytes/reference and asserts no candidate/history/SMS. Generic uncertain commit handling
and full file lifecycle remain separately scoped. Reviewer also noted requireAppUrl needn't
block already-paid/correction paths; it now runs only when reserving a new request.

Selected original-authority redirect after an artificial unpaid-to-reviewed DB transition
is not an R1 regression or a second authority; normal admin transitions cannot produce it.
Historical/manual inconsistent cases remain operator reconciliation, not a new workflow.

Final judgment after final browser evidence: **Phase2 local acceptance approved; no remaining
R1 blocker**. Required shutdown, hashes and checkpoint to close. No provider certification.

## Evidence reviewer (phase2_evidence_review)

Initial gaps: direct DB status updates do not prove the actual admin action's CAS/409 and
notification semantics; add actual admin/resubmission both orders and facilities NOK race.
Record entry Phase1 hash comparison durably. Distinguish missing correction history from
proof of duplicate submissions in baseline, and retain stubbed-readiness qualifications.

Resolved: real actions both orders, one 409 with no stale history/SMS, winning transition
with correct history/one SMS; history-write rollback/retry; cancellation/retry during provider
barrier; facilities delayed NOK preserves verified state/review with one audit/history;
design.md records entry verification. Full suite preserves unit permission checks.

Final reviewer checked logs: **341/69 full, 66/5 delta including30 real DB cases, five process
crash passes, build/types/lint, two browser widths and signed-out denial**. Browser asserts
real DB payment/application/history/intent after correction button, not navigation alone.
No remaining Phase2 acceptance blocker; shutdown/source/checkpoint artifacts required
before claiming completion. README accurately retains provider/scanner/full-journey limits.
