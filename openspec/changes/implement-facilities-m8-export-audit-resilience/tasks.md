## 1. Contracts and Decisions

- [x] 1.1 Record approved M8 export, audit-access, link, retention, and scale decisions in facilities requirements and delivery docs.
- [x] 1.2 Extend facilities permissions, audit actions, safe metadata contract, indexes, additive migration, runtime grants, and database integration coverage.
- [x] 1.3 Add shared typed audit/request-correlation helpers and preserve transactional audit behavior across existing facilities mutations.

## 2. Facilities XLSX Export

- [x] 2.1 Implement strict export filters with Tehran created-date bounds, deterministic bounded loading, and 5,000 application/100,000 related-row limits.
- [x] 2.2 Implement formula-safe related Persian workbook sheets with typed cells, current-file metadata, and trusted conditional hyperlinks.
- [x] 2.3 Add the authorized facilities export route, fail-closed audit/log behavior, Persian errors, cache headers, and admin filter/export UI.
- [x] 2.4 Add export unit, workbook parsing, filter, limit, route permission, failure, and regression tests.

## 3. Scoped Downloads and Audit Viewer

- [x] 3.1 Add an audited application-scoped admin file route and make the unscoped facilities route applicant-only.
- [x] 3.2 Update facilities review links and cover ownership, status, role, current revision, storage, digest, session, and audit failures.
- [x] 3.3 Implement the `SUPER_ADMIN`-only filtered 50-row cursor audit loader, safe metadata redaction, and fail-closed view auditing.
- [x] 3.4 Build the accessible mobile-first audit page with navigation, loading, empty, invalid-filter, denied, and retryable-error states.
- [x] 3.5 Add permission, pagination, filter, redaction, audit-event, route, and UI tests.

## 4. Reconciliation and Recovery

- [x] 4.1 Add singleton advisory locking, bounded reconciliation, 24-hour unavailable expiry, immediate terminal purge, and safe structured outcomes.
- [x] 4.2 Add distinct Persian temporary/expired/permanent upload recovery states without exposing quarantined files as ready.
- [x] 4.3 Add unit/integration and controlled chaos coverage for retention boundaries, duplicate reconcilers, scanner/storage/database/promotion/deletion failures, and recovery.

## 5. Verification and Operations

- [x] 5.1 Add M8 readiness checks and update environment, database, deployment, backup, scheduler, monitoring, rollback, and M9 handoff documentation.
- [x] 5.2 Run M1/M2/M6/M7/M8 database suites, full Vitest, lint, type checks, production build, and realistic Persian RTL smoke verification.
- [x] 5.3 Perform a solo adversarial requirements/security/resilience/test-gap review, fix confirmed findings, and rerun affected checks.
