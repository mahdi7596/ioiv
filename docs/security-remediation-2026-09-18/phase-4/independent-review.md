# Phase4 independent critical reviews

All reviewers worked read-only and completed. No active review work remains.

## phase4_boundary_review

Confirmed D3 was explicitly unresolved and distinguished new privacy/retention from
routine technical choices. Owner subsequently approved the plain-language temporary
protected-identifier proposal. D1/D2 were not reopened.

## phase4_design_review — code/concurrency/security

Found SELECT-only Admin cannot take FOR SHARE directly and live expiry predicates may
be evaluated before row-lock waits. Fixed with narrow admin-lock helper and explicit
OTP locks before fresh-time updates, verified under restricted role and held-lock expiry.
Found raw malformed-JSON exception logging and cleanup success logging before commit;
fixed with bounded diagnostics and postcommit completion, with regressions.
Follow-up reviewed hourly current+previous HMAC buckets, one admission timestamp and
applicant/admin retry clearing. Final verdict: approved inspected code; no remaining
implementation blocker. Parent completed final browser rerun and cleanup afterward.

## phase4_evidence_review — acceptance/failure evidence

Found permissive admin browser URL assertions and browser-close failure skipping server
cleanup; tightened exact URLs and nested finally. Added explicit address/global limit
exhaustion cases. Found indefinite active-key retention; changed implementation to hourly
HMAC epochs instead of weakening approved policy. Then found clock/epoch boundary gap;
fixed using one DB admission instant and deterministic real-DB clock-seam regression.
Clarified scheduled retention bound4h and evidence limitations. Reviewed440/73 tests,
process crashes, real HTTP cookie races, unavailable DB, and retry clearing. Final verdict:
no remaining blocking implementation issue; final UI rerun/docs were pending at review.
Parent subsequently recorded passing browser-ui-final.log, final build/types/lint, visually
inspected screenshots and verified shutdown/source hashes. No unaddressed finding.

Local conclusions only. No actual SMS/provider/proxy/release-image/production qualification
or blanket launch approval is implied. Launch NO-GO and Phase5 remains unstarted.
