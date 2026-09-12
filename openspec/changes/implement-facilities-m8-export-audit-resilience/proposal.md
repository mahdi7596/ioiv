## Why

Facilities applications can be reviewed after M7, but operators still lack the approved complete XLSX export, a privileged audit viewer, and the recovery controls needed before controlled rollout. M8 closes those operational and accountability gaps without changing or enabling the legacy validation workflow.

## What Changes

- Add bounded facilities XLSX export for all application statuses with intake, supplier, status, and Tehran-created-date filters.
- Export current application data in related Persian worksheets, with formula-safe cells and authenticated links only for review-visible evidence.
- Add application-scoped facilities admin file downloads and audit sensitive export, download, template-download, audit-view, and reconciliation operations.
- Add a `SUPER_ADMIN`-only, cursor-paginated facilities audit viewer with safe filters and redacted protected metadata.
- Add facilities-specific export and audit permissions while preserving `ENTRY_VIEWER` restrictions.
- Enforce singleton reconciliation, immediate terminal-quarantine purge, and a 24-hour retry window for scanner/storage-unavailable uploads.
- Add operational readiness, failure-recovery, migration, rollback, monitoring, and backup guidance for the later M9 rollout.

## Capabilities

### New Capabilities

- `facilities-data-export`: Complete, filtered, bounded XLSX exports with protected application-scoped file links.
- `facilities-audit-viewer`: Typed facilities audit events and a least-privilege, paginated administrative viewer.
- `facilities-operational-resilience`: Quarantine retention, singleton reconciliation, safe recovery, diagnostics, and operational verification.

### Modified Capabilities

No canonical specifications exist under `openspec/specs`; the legacy submission export and validation workflow remain unchanged.

## Impact

- Adds facilities admin routes, export/audit services and UI, typed permissions, audit actions, filter indexes, and database migration coverage.
- Hardens facilities file authorization by moving administrators to an application-scoped download route while retaining applicant-owned downloads.
- Updates reconciliation behavior, upload recovery messaging, environment examples, database documentation, and `DEPLOYMENT.md`.
- Does not add CSV or asynchronous export jobs, backfill audit history, enable facilities, or deploy to production.
