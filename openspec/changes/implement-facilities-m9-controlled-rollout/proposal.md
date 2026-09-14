## Why

M1–M8 provide the facilities product and its application controls, but production rollout remains unsafe without a reproducible candidate, explicit go/no-go evidence, operational scanner/scheduler/monitoring configuration, matched restore proof, and controlled enablement. M9 turns those prerequisites into fail-closed, reviewable repository contracts while keeping facilities unavailable until authorized production gates pass.

## What Changes

- Add a gated M9 release contract covering decisions, candidate qualification, staging infrastructure, failure rehearsal, matched backup/restore, production migration/deployment handoffs, controlled enablement, observation, containment, and rollback.
- Add machine-checkable decision and evidence ledgers so unresolved or stale gate inputs cannot be mistaken for approval.
- Add reproducible candidate-manifest and production preflight tooling that records immutable artifact identities and verifies facilities remains in the expected availability state.
- Add reviewable ClamAV, scheduler, monitoring, proxy, and release-environment examples without installing or enabling them in production.
- Add an idempotent supplier-catalogue provisioning command that inserts only the four approved suppliers and does not seed users, admins, intakes, templates, or availability.
- Add M9 unit and database coverage plus release/rollback documentation.
- Keep the existing validation route unchanged and do not enable facilities, deploy, take the user-owned production database backup, or perform the user-owned application upload/redeployment handoffs.

## Capabilities

### New Capabilities

- `facilities-controlled-rollout`: Defines fail-closed rollout gates, approvals, immutable candidate identity, evidence freshness, user/operator handoffs, enablement, observation, containment, and rollback.
- `facilities-release-operations`: Defines production-safe scanner, storage, proxy, scheduler, monitoring, supplier provisioning, preflight, backup/restore, and artifact qualification behavior.

### Modified Capabilities

No canonical specifications exist under `openspec/specs`; M9 does not change applicant, reviewer, payment, upload, export, audit, or legacy-validation product requirements.

## Impact

- Adds M9 scripts, schemas/templates, operational examples, tests, package commands, OpenSpec artifacts, and deployment/database documentation.
- Reads facilities configuration and database privileges during preflight but performs no applicant-data mutation; the existing readiness canary remains an explicitly authorized operational write/read/delete check.
- Adds no database migration and makes no production or applicant-facing configuration change.
- Production execution remains blocked on approved G0 decisions, named operators/access, staging evidence, the user-owned database backup, the user-owned deployment handoffs, and explicit release authorization.
