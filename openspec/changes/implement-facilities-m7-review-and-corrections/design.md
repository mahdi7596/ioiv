## Context

M1–M6 created an independent facilities aggregate, private scanned-file lifecycle, company profile, configurable intakes, applicant wizard, and verified payment/submission. The facilities schema already contains correction and append-only history models and a database-enforced status loop, but there are no facilities review screens or reviewer actions. The legacy validation application and its admin workflow must remain unchanged.

## Goals / Non-Goals

**Goals:**

- Provide least-privilege facilities review and protected evidence access.
- Make every status/correction mutation transactional, auditable, concurrency-safe, and repeatable.
- Allow a `NEEDS_EDIT` applicant to replace all application evidence and resubmit without repayment.
- Deliver correction-only SMS without coupling provider availability to the core state transition.
- Keep current company-profile documents stable while an application is actively being paid/reviewed/corrected.

**Non-Goals:**

- Changing the legacy `Application` flow, adding rejection, or creating a facilities certificate.
- Exporting facilities data or exposing the privileged facilities audit viewer (M8).
- Snapshotting profile file bytes or deciding whether profile files count toward the application quota.
- Deploying to production (M9).

## Decisions

1. Add explicit facilities permission keys to the existing role map. `ADMIN` and `SUPER_ADMIN` receive view/download/mutate permissions; `ENTRY_VIEWER` receives facilities list/detail view only. Server Functions and the file Route Handler re-check the active admin and required permission on every invocation.
2. Add `/admin/facilities/applications` and `/admin/facilities/applications/[id]` rather than combining facilities and legacy rows. This prevents accidental coupling to legacy JSON fields, files, certificates, filters, and transitions.
3. Keep the existing `ApplicationStatus` values and database transition trigger. Reviewer mutations lock the facilities application row, write the application, `FacilitiesStatusHistory`, correction record, and `FacilitiesAuditLog` in one transaction. Duplicate actions either return the already-achieved state or a safe conflict.
4. Extend `FacilitiesCorrectionRequest` with a `FacilitiesCorrectionSmsStatus` and safe delivery fields. The correction request commits first with `PENDING`; SMS is attempted afterward with `clientReferenceId=correctionRequest.id`, then delivery state and a success/failure audit event are persisted. Provider failure never reverts `NEEDS_EDIT`; authorized reviewers can retry `PENDING` or `FAILED` delivery.
5. A correction unlocks only application type, requested amount, employee/officer selections, and application file bindings. Intake, supplier, questionnaire version, and company snapshot remain immutable. Resubmission closes the one open correction request and reuses the existing verified payment.
6. Existing facilities applications load independently of current programme/intake/supplier availability. Those controls gate new draft creation only; otherwise closing an intake could strand a correction.
7. Reviewers see current scan-passed company-profile documents. Company profile mutations and profile uploads are denied while any company application is `PENDING_PAYMENT`, `SUBMITTED`, `UNDER_REVIEW`, or `NEEDS_EDIT`. Final submission refreshes the captured text snapshot from the completed current profile before payment/submission.
8. File responses remain uncached, current-revision-only, digest/length checked, and private. Reviewer access ignores programme availability but requires an active role with the facilities-download permission and a binding belonging to a facilities company/application.

## Risks / Trade-offs

- [SMS provider success followed by database failure can leave uncertain delivery] → Use the correction ID as the provider checking/reference ID, keep retry explicit, and log only safe masked diagnostics.
- [Current profile documents are not historical snapshots] → Lock profile mutation during active review and document that profile evidence may change after final completion.
- [Concurrent reviewer actions] → Lock the application row and retain unique open-request/sequence constraints; translate constraint races into idempotent success or conflict.
- [Disabled programme strands existing users] → Separate existing-application access from new-draft eligibility in loaders and upload authorization.
- [Sensitive file enumeration] → Return not-found for inaccessible objects and never expose storage keys or historical replaced revisions.

## Migration Plan

1. Add the SMS status enum/fields, correction-note checks, audit enum values, indexes, and runtime enum grant with an additive migration.
2. Deploy code after applying the migration with the migration-owner credential; normal application startup remains migration-free.
3. Verify restricted runtime writes, protected downloads, SMS failure/retry, and two correction cycles in staging/local.
4. Roll back by redeploying M6 code while leaving additive columns and enum values in place. Destructive rollback requires an approved database restore.

## Open Questions

None for M7. Production backup and rollout remain governed by M9 and `DEPLOYMENT.md`.
