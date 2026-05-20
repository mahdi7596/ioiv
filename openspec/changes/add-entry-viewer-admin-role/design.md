## Context

The application is a live Next.js App Router and Prisma/PostgreSQL system used for SANA registration, uploads, payment, and admin review. Production already contains real user submissions, uploaded file metadata, payment rows, status history, and existing admins.

The Prisma schema already has an `Admin.role` field backed by the `UserRole` enum. Current admin authorization mostly checks whether a session is an active admin, so `ADMIN` and `SUPER_ADMIN` currently have the same operational access across overview, submissions, exports, downloads, status changes, notes, and certificate replacement.

The client now needs one person, mobile `09362116801`, to access the admin panel only as an entry viewer. This person must be able to see entries but must not be able to download files, export data, change statuses, add notes through status transitions, upload certificates, or replace certificates.

Because the app is live, the rollout must avoid destructive database operations. The production database must be fully backed up before deployment, and the new admin row must be inserted only after the deployed schema supports the new enum value.

## Goals / Non-Goals

**Goals:**
- Add `ENTRY_VIEWER` as a new admin role without changing the behavior of existing `ADMIN` and `SUPER_ADMIN` users.
- Centralize role permission decisions so future admin authorization is easier to audit.
- Enforce permissions on the server for every sensitive action, not only by hiding UI.
- Hide unavailable actions in the admin UI for `ENTRY_VIEWER`.
- Prevent `ENTRY_VIEWER` from downloading any uploaded file or validation certificate.
- Prevent `ENTRY_VIEWER` from exporting submissions.
- Prevent `ENTRY_VIEWER` from changing submission statuses, writing status notes, uploading validation certificates, or replacing validation certificates.
- Add focused tests covering allowed viewer reads, denied viewer actions, and unchanged existing-admin behavior.
- Document safe production backup, deployment, migration, admin-row insertion, verification, and rollback steps.
- Keep migrations additive and non-destructive.

**Non-Goals:**
- No public admin self-registration.
- No admin role management UI.
- No changes to applicant registration, OTP behavior for normal users, payments, uploads, or submission editing rules.
- No deletion, truncation, reset, or rewrite of existing production form entries or related records.
- No change to existing `ADMIN` and `SUPER_ADMIN` permissions.
- No attempt to restrict which entries the viewer can see; the viewer can inspect all entries visible in the admin list/detail, but cannot perform actions.

## Decisions

### Add a New `ENTRY_VIEWER` Enum Value

Add `ENTRY_VIEWER` to Prisma `UserRole` using an additive migration.

Rationale: Reusing `ADMIN` as read-only would be dangerous because production may already contain admins with that role who rely on existing operational access. Adding a new value preserves existing behavior and makes the new account explicit.

Alternative considered: Add a separate permissions table. This is more flexible but too large for the immediate need and would increase production migration complexity.

### Use Centralized Permission Helpers

Create a small permission layer, such as `lib/admin/permissions.ts`, to map roles to capabilities:
- `canViewAdminPanel`
- `canViewEntries`
- `canDownloadSubmissionFiles`
- `canExportSubmissions`
- `canChangeSubmissionStatus`
- `canManageValidationCertificates`

Rationale: Current checks are spread across server actions, route handlers, and page rendering. A single role-to-capability map reduces the chance that one action path is missed.

Alternative considered: Inline `admin.role !== "ENTRY_VIEWER"` checks at each call site. That is faster to write but harder to audit and easier to drift.

### Server-Side Enforcement Is Authoritative

UI hiding must improve the viewer experience, but security must come from server-side checks:
- `changeSubmissionStatus` must reject `ENTRY_VIEWER`.
- `replaceValidationCertificate` must reject `ENTRY_VIEWER`.
- `/api/admin/export` must reject `ENTRY_VIEWER`.
- `/api/files/[id]` must reject `ENTRY_VIEWER` for admin downloads.

Rationale: Hidden buttons do not protect direct route access, fetch calls, or copied URLs.

Alternative considered: Only hide buttons and forms. Rejected because it would leave direct endpoints open.

### Keep Viewer Reads Compatible With Current Admin Pages

Allow `ENTRY_VIEWER` through read-only admin data functions:
- overview counts
- submissions list with search/filter/sort
- submission detail data
- status history display
- payment status display
- uploaded file metadata display

Rationale: The client asked for the role to see the admin panel and entries. Seeing uploaded file names and metadata is part of reviewing an entry, but downloading bytes is an action and must be denied.

Alternative considered: Hide file metadata entirely. Rejected unless the client later requests stricter visibility; current requirement is no downloads, not no file awareness.

### Deploy Before Inserting the Viewer Admin Row

Production must receive the code and migration before inserting mobile `09362116801` with role `ENTRY_VIEWER`.

Rationale: PostgreSQL enum values must exist before a row can use them. Inserting the row first would fail because the production enum would not recognize `ENTRY_VIEWER`.

Alternative considered: Insert the person as `ADMIN` and later downgrade to `ENTRY_VIEWER`. Rejected because it could accidentally grant full admin access during the deployment window.

### Commit in Dedicated Steps

Use focused commits after local verification:
- schema/migration
- permission enforcement
- UI action hiding
- tests
- deployment guidance

Rationale: If production reveals an issue, dedicated commits make it much easier to identify and revert the relevant area.

Alternative considered: One combined commit. Rejected because this touches schema, security logic, UI, tests, and operations.

## Risks / Trade-offs

- [Risk] PostgreSQL enum migration cannot be rolled back by simply deleting the enum value while rows may reference it. → Mitigation: make the migration additive, do not insert the viewer row until after deploy, and rollback by deactivating or changing the admin row if needed rather than trying to remove the enum immediately.
- [Risk] A missed endpoint could still allow an `ENTRY_VIEWER` action. → Mitigation: add central permission helpers and tests for export, download, status change, and certificate replacement.
- [Risk] UI hiding without server enforcement would create a false sense of safety. → Mitigation: require route/action-level denial before UI polish is considered complete.
- [Risk] Production data could be harmed by a mistaken deployment command. → Mitigation: take full production backups before deployment, avoid destructive commands, review generated SQL migration, and run only additive migration/data-insert commands.
- [Risk] The viewer may need file contents later. → Mitigation: the role can be extended later, but the initial contract denies all downloads exactly as requested.
- [Risk] Existing admins might lose access if role checks are too strict. → Mitigation: tests must prove `ADMIN` and `SUPER_ADMIN` keep current capabilities.

## Migration Plan

### Local Development

1. Create an additive Prisma migration that adds `ENTRY_VIEWER` to `UserRole`.
2. Implement centralized permission helpers.
3. Update server actions and route handlers to enforce denied viewer actions.
4. Update admin pages/components to hide denied actions for `ENTRY_VIEWER`.
5. Add tests for read access, denied actions, and existing admin non-regression.
6. Run the relevant test suite and build checks locally.
7. Commit changes in dedicated commits with clear messages.

### Production Backup Before Upload/Deploy

1. SSH into the production server.
2. Confirm the production database connection details and app path.
3. Create a timestamped backup directory outside the app release directory.
4. Run a full PostgreSQL custom-format backup using `pg_dump --format=custom`.
5. Optionally also create a plain SQL backup for easier inspection.
6. Verify backup files exist and are non-empty.
7. Prefer copying the backup off-server before making changes.

### Production Deployment

1. Deploy the tested code to the server.
2. Install dependencies if needed.
3. Generate Prisma Client if the deployment process does not already do it.
4. Run the Prisma production migration command.
5. Restart the app process.
6. Confirm existing admin login and existing admin actions still work.
7. Insert or update the `Admin` row for mobile `09362116801` with role `ENTRY_VIEWER` and `active = true`.
8. Test OTP login for `09362116801`.
9. Verify the viewer can see overview, list, filters, and detail pages.
10. Verify the viewer cannot download files, export, change status, or replace certificates.

### Rollback Strategy

If the deployed code has an issue before the viewer row is inserted:
- roll back the application code to the previous release
- leave the additive enum value in place; it does not affect existing rows by itself

If the issue appears after the viewer row is inserted:
- set the viewer account inactive or change its role back only if operationally necessary
- roll back app code if needed
- do not attempt to remove the enum value during incident response
- restore from the backup only if data corruption occurs, which this change should not cause

## Open Questions

- What display name should be stored for mobile `09362116801`? Use `مشاهده‌گر پرونده‌ها` unless the client provides a real name.
- Should the deployment guide live in a new dedicated doc file, or be added to the existing deployment documentation during implementation?
