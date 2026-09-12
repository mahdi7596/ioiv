## 1. Database Contracts

- [x] 1.1 Extend the Prisma correction/SMS/audit schema and add the additive M7 migration with note and delivery constraints.
- [x] 1.2 Update restricted runtime grants and database documentation for the M7 enum and correction delivery fields.
- [x] 1.3 Add PostgreSQL integration coverage for repeated corrections, concurrency constraints, transitions, and delivery state.

## 2. Permissions and Review Services

- [x] 2.1 Add facilities-specific permissions for full reviewers and read-only entry viewers.
- [x] 2.2 Implement authorized facilities queue and detail loaders with safe, minimal return data.
- [x] 2.3 Implement transactional start-review, request-correction, complete-validation, and SMS-retry actions.
- [x] 2.4 Add correction-only SMS copy, delivery persistence, safe logging, and provider failure recovery.
- [x] 2.5 Extend the facilities protected-file route for full reviewers while retaining current-revision integrity checks.

## 3. Applicant Correction Flow

- [x] 3.1 Refactor facilities loading and creation gates so existing applications survive disabled programme/intake configuration.
- [x] 3.2 Allow application detail, slot, and upload mutations in `DRAFT` or `NEEDS_EDIT` only.
- [x] 3.3 Implement correction resubmission with full validation, open-request resolution, original timestamp preservation, and no repayment.
- [x] 3.4 Enforce the active-application company-profile data/file lock and refresh current profile data before initial payment/submission.
- [x] 3.5 Update the applicant facilities UI with editable application fields, correction note, timeline, and accessible result states.

## 4. Admin Review UI

- [x] 4.1 Add the separate facilities applications queue with search, status filter, latest-activity ordering, and empty/error states.
- [x] 4.2 Add the facilities review detail view for captured data, profile/application evidence, payments, corrections, and status history.
- [x] 4.3 Add context-valid review/correction/completion/retry controls with role-aware accessible feedback.
- [x] 4.4 Add a facilities review summary and navigation entry without changing legacy dashboard metrics.

## 5. Verification and Operations

- [x] 5.1 Add unit, action, route, component, permission, concurrency, and SMS chaos regression tests for M7.
- [x] 5.2 Run database integration tests, the full Vitest suite, lint, production build, and a realistic local M7 smoke flow.
- [x] 5.3 Update deployment/environment documentation with migration, rollback, SMS template, retry, backup, and verification guidance.
