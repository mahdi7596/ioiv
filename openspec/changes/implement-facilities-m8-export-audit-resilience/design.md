## Context

M1-M7 provide an independent facilities aggregate, private scanned files, applicant submission/payment, and reviewer correction cycles. Facilities audit rows already exist and are database-immutable, but request context is not consistently captured, no audit viewer exists, admin file URLs are not application-scoped, and the legacy single-sheet export cannot represent the facilities aggregate safely. The maintenance reconciler also has no singleton guard or approved expiry for unavailable scanner/storage objects.

## Goals / Non-Goals

**Goals:**

- Export every current facilities field in a bounded, Persian XLSX workbook while preventing spreadsheet injection and public-file leakage.
- Restrict audit viewing to `SUPER_ADMIN`, retain append-only guarantees, and audit successful sensitive reads before releasing data.
- Make admin downloads application-scoped and preserve the M7 review-visible boundary.
- Make reconciliation singleton, idempotent, and consistent with immediate terminal purge plus a 24-hour unavailable retry window.
- Provide failure-injection tests and an actionable M9 readiness/runbook boundary.

**Non-Goals:**

- Changing legacy application/export behavior, enabling facilities, deploying M8, adding CSV/async exports, or backfilling missing historical events.
- Snapshotting company-profile bytes, collecting new IP/user-agent data, or changing payment/review rules.

## Decisions

1. Add separate `exportFacilitiesApplications` and `viewFacilitiesAudit` permission keys. Active `ADMIN` and `SUPER_ADMIN` can export; only active `SUPER_ADMIN` can view audit; `ENTRY_VIEWER` remains read-only without export/download/audit access.
2. Use a facilities-only `GET /api/admin/facilities/export` endpoint. Filters are strict identifiers/status plus `YYYY-MM-DD` Tehran calendar dates applied to `createdAt` as half-open UTC bounds. Invalid filters return 400; more than 5,000 applications or 100,000 related rows returns 422.
3. Use related worksheets keyed by application ID instead of flattening repeated rows. Applications, shareholders, officers, annual documents, current files, payments, corrections, and status history preserve analyzable cardinality. Workbook cells neutralize formula prefixes; hyperlinks use `APP_URL`, not request headers.
4. Export file metadata for every status, but emit links only for review-visible cases and scan-passed current revisions. Admin hyperlinks target a new application-scoped route. The old unscoped route becomes user-only; this closes the cross-application company-profile authorization ambiguity.
5. Add a typed facilities audit helper with a database-enforced metadata allow-list. Mutation events remain in their business transaction. Sensitive read results are withheld until their success audit insert commits. UUID request IDs correlate safe structured logs and events; IP/user-agent collection remains disabled.
6. Audit queries use stable `(createdAt,id)` descending cursor pagination with 50 rows. The viewer exposes allow-listed metadata and masks any historical IP/user-agent values. Audit access itself is recorded before results render.
7. Reconciliation obtains a PostgreSQL advisory lock for the whole run. Terminal quarantines purge on reconciliation. `UNAVAILABLE` rows are retried only while younger than 24 hours; expired rows become terminal `FAILED` with their safe existing reason, receive an audit event when application-scoped, and then purge bytes. Safe database metadata remains.
8. M8 adds enum values and query indexes only. Schema rollback is non-destructive: redeploy M7 and retain additive values/indexes. M9 owns production backup, restore rehearsal, scheduler activation, and availability enablement.

## Risks / Trade-offs

- [Large repeated collections can exhaust memory despite the application cap] → Count all related rows before workbook generation and reject above 100,000.
- [Applicant/admin text can become an Excel formula] → Sanitize every untrusted string and use hyperlink metadata rather than formulas.
- [Host-header poisoning can create malicious links] → Require a configured trusted `APP_URL` and never derive workbook links from the request.
- [An audit insert can fail after data is prepared] → Fail closed and return no workbook/file/audit page data.
- [Audit viewing creates additional audit rows] → Record one compact event per successful filtered page view and exclude filter values from metadata.
- [Two reconcilers can race or a retry can outlive retention] → Use a singleton advisory lock, deterministic age checks, bounded batches, and idempotent lifecycle transitions.

## Migration Plan

1. Verify the accepted M7 baseline, create the M8 additive migration, regenerate Prisma, and apply runtime grants in an isolated database.
2. Deploy database changes before M8 code; keep facilities disabled.
3. Verify export limits, audit immutability/viewer denial, scoped downloads, scanner expiry, singleton reconciliation, and all regression suites in local/staging.
4. Roll back application code to M7 while leaving enum values/indexes in place. Do not perform destructive schema rollback without an approved restored backup.

## Open Questions

None. M9 retains production scanner ownership, capacity alert integration, backups, and controlled enablement.
