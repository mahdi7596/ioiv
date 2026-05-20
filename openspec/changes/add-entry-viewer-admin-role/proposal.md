## Why

The live SANA admin panel needs a restricted role for a client-side viewer who can inspect submitted form entries without being able to perform operational actions. Because the application is already live and contains real user submissions, the change must preserve all existing production data and current admin behavior while adding only the minimum new access boundary.

## What Changes

- Add a new admin role named `ENTRY_VIEWER` for read-only entry inspection.
- Allow `ENTRY_VIEWER` admins to authenticate through the existing admin OTP login and access the admin panel.
- Allow `ENTRY_VIEWER` admins to view the admin overview, submissions list, submission filters/search/sort, and submission detail pages.
- Deny `ENTRY_VIEWER` admins all action access:
  - no uploaded file downloads
  - no validation certificate downloads
  - no CSV or Excel exports
  - no status changes
  - no admin note changes through status transitions
  - no validation certificate upload or replacement
- Keep existing `ADMIN` and `SUPER_ADMIN` behavior unchanged.
- Add production-safe rollout guidance:
  - take a full production database backup before deploying
  - deploy code and run the migration before inserting the new role row
  - insert or update the admin row for mobile `09362116801` only after the production enum supports `ENTRY_VIEWER`
- Add focused automated tests for existing admins and the new viewer role.
- Use dedicated git commits so schema, permission logic, UI hiding, tests, and deployment guidance can be inspected or reverted independently if needed.
- No destructive migration is allowed. Existing form entries, users, payments, uploads, status history, OTP records, and existing admin rows must not be deleted or rewritten.

## Capabilities

### New Capabilities
- `admin-entry-viewer-access`: Defines the restricted admin role that can view entries but cannot perform downloads, exports, status changes, notes, uploads, or certificate replacement.
- `production-entry-viewer-rollout`: Defines the safe production rollout, backup, migration, data insertion, verification, and rollback expectations for enabling the viewer account on the live server.

### Modified Capabilities
- None. There are no archived baseline specs under `openspec/specs/` yet; this change introduces new capability specs for the role and rollout behavior.

## Impact

- Prisma schema and migration for adding the `ENTRY_VIEWER` enum value.
- Admin authorization helpers and server-side permission checks.
- Admin pages/components that currently render export, download, status-change, and certificate-replacement actions.
- Admin API routes for export, status changes, and protected file downloads.
- Admin tests covering role permissions and non-regression for current admins.
- Deployment documentation or operational checklist for production backup, migration, inserting mobile `09362116801`, and post-deploy verification.
