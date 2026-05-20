## 1. Schema and Permission Foundation

- [x] 1.1 Review the generated Prisma SQL before applying it and confirm it only adds `ENTRY_VIEWER` to `UserRole`.
- [x] 1.2 Add `ENTRY_VIEWER` to the Prisma `UserRole` enum and create an additive migration.
- [x] 1.3 Regenerate Prisma Client after the schema change.
- [x] 1.4 Add a centralized admin permission helper module that maps `ADMIN`, `SUPER_ADMIN`, and `ENTRY_VIEWER` to view, download, export, status-change, and certificate-management capabilities.
- [x] 1.5 Add or update unit tests for the permission helper so existing admin roles keep full access and `ENTRY_VIEWER` receives only read access.

## 2. Server-Side Authorization

- [x] 2.1 Update admin read helpers so active `ENTRY_VIEWER` admins can open overview, submission list, search/filter/sort, and submission detail data.
- [x] 2.2 Update `changeSubmissionStatus` so `ENTRY_VIEWER` requests are rejected before any application, history, note, SMS, or certificate changes occur.
- [x] 2.3 Update `replaceValidationCertificate` so `ENTRY_VIEWER` requests are rejected before any file metadata is created.
- [x] 2.4 Update the admin export route so `ENTRY_VIEWER` requests return forbidden and no CSV/XLSX response body is produced.
- [x] 2.5 Update the protected file route so `ENTRY_VIEWER` admin sessions cannot download any submission upload or validation certificate.
- [x] 2.6 Keep inactive admin handling unchanged for every role.

## 3. Admin UI Behavior

- [x] 3.1 Pass the current admin role or permission flags to admin pages that render role-dependent actions.
- [x] 3.2 Hide CSV and Excel export controls from `ENTRY_VIEWER` admins on the submissions list.
- [x] 3.3 Hide uploaded-file download controls from `ENTRY_VIEWER` admins on submission detail pages while preserving file metadata visibility.
- [x] 3.4 Hide validation certificate download and replacement controls from `ENTRY_VIEWER` admins.
- [x] 3.5 Hide status-change and note-writing controls from `ENTRY_VIEWER` admins.
- [x] 3.6 Verify `ADMIN` and `SUPER_ADMIN` still see the same action controls as before.

## 4. Automated Verification

- [x] 4.1 Add tests proving `ENTRY_VIEWER` can authenticate as an active admin and access read-only admin pages/data.
- [x] 4.2 Add tests proving `ENTRY_VIEWER` cannot export submissions.
- [x] 4.3 Add tests proving `ENTRY_VIEWER` cannot download uploaded files or validation certificates.
- [x] 4.4 Add tests proving `ENTRY_VIEWER` cannot change status, write status notes, create status history, upload certificates, or replace certificates.
- [x] 4.5 Add non-regression tests proving existing `ADMIN` or `SUPER_ADMIN` users retain current download, export, status-change, and certificate-management access.
- [x] 4.6 Run the relevant targeted tests for admin auth, admin status routes/actions, protected file downloads, export, and UI rendering.
- [x] 4.7 Run the project build or typecheck command used before deployment.

## 5. Deployment Guidance and Git History

- [x] 5.1 Add or update deployment documentation with the production backup, deployment, migration, viewer-row insertion, verification, and rollback steps.
- [x] 5.2 Include the exact production data update for mobile `09362116801` with role `ENTRY_VIEWER`, marked as a post-migration step.
- [x] 5.3 Commit the schema and migration changes with a dedicated commit message.
- [x] 5.4 Commit the server-side permission enforcement with a dedicated commit message.
- [x] 5.5 Commit the admin UI action-hiding changes with a dedicated commit message.
- [x] 5.6 Commit the tests with a dedicated commit message.
- [x] 5.7 Commit the deployment guidance with a dedicated commit message.

## 6. Production Server Rollout Checklist

- [ ] 6.1 SSH into the server and confirm the active app directory, current git commit, process manager, and production database connection source.
- [ ] 6.2 Create a timestamped backup directory outside the app release directory.
- [ ] 6.3 Run a full production PostgreSQL custom-format backup before deploying or migrating.
- [ ] 6.4 Optionally create a plain SQL backup for easier inspection.
- [ ] 6.5 Verify backup files exist and are non-empty.
- [ ] 6.6 Copy the backup off-server when possible before changing production.
- [ ] 6.7 Deploy the tested code from GitHub to the server.
- [ ] 6.8 Install dependencies only if needed by the deployment process.
- [ ] 6.9 Run Prisma Client generation if the deployment process does not already do it.
- [ ] 6.10 Run the production migration command and confirm it succeeds.
- [ ] 6.11 Restart the app process.
- [ ] 6.12 Verify an existing active admin can still log in and perform normal actions.
- [ ] 6.13 Insert or update the `Admin` row for mobile `09362116801` with role `ENTRY_VIEWER` and `active = true`.
- [ ] 6.14 Verify mobile `09362116801` can log in and view admin overview, submissions list, and detail pages.
- [ ] 6.15 Verify mobile `09362116801` cannot download files, export submissions, change statuses, write notes, upload certificates, or replace certificates.
- [ ] 6.16 If an issue appears, deactivate the viewer row first and roll back app code if needed; do not attempt unsafe enum removal during incident response.
