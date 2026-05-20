## ADDED Requirements

### Requirement: Production backup before deployment
The deployment process MUST create and verify a full backup of the current production database before deploying the entry viewer role change or running its production migration.

#### Scenario: Backup is created before migration
- **WHEN** the entry viewer role change is prepared for production deployment
- **THEN** a full production PostgreSQL backup is created before any migration command is run

#### Scenario: Backup file is verified
- **WHEN** the production backup command finishes
- **THEN** the backup file exists
- **AND** the backup file is non-empty

#### Scenario: Backup is preserved outside the release
- **WHEN** the backup is created
- **THEN** it is stored outside any directory that may be replaced by application deployment

### Requirement: Production migration preserves existing data
The production migration MUST be additive and MUST NOT delete, truncate, reset, or rewrite existing production data.

#### Scenario: Migration adds role support
- **WHEN** the production migration runs
- **THEN** the `UserRole` enum supports `ENTRY_VIEWER`
- **AND** existing `Admin`, `User`, `Application`, `ApplicationFile`, `Payment`, `StatusHistory`, and `OtpCode` rows remain present

#### Scenario: Destructive commands are not used
- **WHEN** deploying the entry viewer role change to production
- **THEN** deployment does not use destructive database reset, table drop, table truncate, or forced migration reset commands

### Requirement: Viewer admin row is inserted after migration
The production data update MUST add or update the admin row for mobile `09362116801` only after production supports the `ENTRY_VIEWER` role.

#### Scenario: Viewer row inserted after enum exists
- **WHEN** the production migration has completed successfully
- **THEN** the deployment process inserts or updates the `Admin` row for mobile `09362116801` with role `ENTRY_VIEWER` and `active = true`

#### Scenario: Viewer row is not temporarily full admin
- **WHEN** configuring mobile `09362116801`
- **THEN** the deployment process does not temporarily assign `ADMIN` or `SUPER_ADMIN` access to that mobile number

### Requirement: Production verification after deployment
The deployment process MUST verify both current-admin behavior and new-viewer restrictions after production deployment.

#### Scenario: Existing admin still works
- **WHEN** the production deployment completes
- **THEN** an existing active `ADMIN` or `SUPER_ADMIN` can still log in and use current admin actions

#### Scenario: Entry viewer can view entries
- **WHEN** mobile `09362116801` logs in after deployment
- **THEN** the user can open the admin overview, submissions list, and submission detail pages

#### Scenario: Entry viewer restrictions are verified
- **WHEN** mobile `09362116801` is logged in after deployment
- **THEN** attempts to download files, export submissions, change status, or replace validation certificates are denied

### Requirement: Rollback avoids unsafe enum removal
The rollback process MUST avoid attempting to remove the production enum value during incident response.

#### Scenario: Rollback before viewer row
- **WHEN** a production issue is found before the viewer admin row is inserted
- **THEN** the application code can be rolled back while leaving the additive enum value in place

#### Scenario: Rollback after viewer row
- **WHEN** a production issue is found after the viewer admin row is inserted
- **THEN** the viewer account is deactivated or otherwise made non-operational before any destructive database rollback is considered
