# Phase 12 local verification

R11: concurrent administrative decisions, live authorization, certificate refresh and
truthful correction SMS uncertainty. Local synthetic data only; facilities remain disabled.

- Full regression: 693 tests / 85 files (`regression-sealed.log`). 21 real restricted
  database review cases plus 39 payment coordination cases pass (`review-db-final.log`).
- Competing decisions preserve one winning status/note/history and at most one notification;
  stale or absent review tokens fail409. Revoked roles, inactive admins and expired sessions
  are rechecked under coordination locks. Runtime has no broad Admin UPDATE grant.
- Certificate conflicts preserve existing bytes and retain journalled candidates for safe
  cleanup. Successful replacement refreshes the actual current download identity.
- SMS transport uncertainty, successful send with lost postcommit acknowledgment, and
  successful send followed by precommit persistence rollback cannot authorize duplicate
  delivery. PENDING uncertainty reasons persist under actual database constraints.
- Both additive migrations pass injected precommit rollback, historical-data preservation,
  successful apply and reviewVersion backfill checks (`migration-rehearsal.json`).
- Build/types pass; lint has zero errors and only the pre-existing public image warning.
- Production browser at390/1440 exercises expand/cancel, competing actual HTTP decision,
  persistent Persian409, completion PDF, replacement refresh, expired401, facilities
  competing decision and serialized Persian409/401 with sign-in recovery. Screenshots
  capture final states. Controlled scanner accepts four PDFs; external fetch is blocked.

Independent code and evidence reviewers found no remaining local blocker. Earlier fixture
and harness failures are preserved in logs and design.md; final qualification is explicit.
No real SMS/gateway/scanner qualification, production throughput, deployment or release
claim. Ambiguous notification delivery requires operational investigation, not automatic
retry. Historical malicious-file containment remains a separate owner decision. Launch NO-GO.
