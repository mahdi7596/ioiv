## ADDED Requirements

### Requirement: Typed privacy-safe facilities audit
The system MUST record facilities audit events from a defined action vocabulary with outcome, entity context, optional UUID request correlation, and allow-listed non-content metadata.

#### Scenario: State mutation
- **WHEN** a facilities mutation commits
- **THEN** its audit event commits in the same database transaction and the runtime cannot update, delete, or truncate it

#### Scenario: Sensitive read
- **WHEN** an export, protected download, questionnaire download, or audit view succeeds
- **THEN** a typed audit event is committed before the protected result is released

### Requirement: Super-admin-only audit viewer
Only an active `SUPER_ADMIN` SHALL access the facilities audit viewer; active `ADMIN`, `ENTRY_VIEWER`, inactive admins, normal users, and unauthenticated actors MUST be denied.

#### Scenario: Privileged access
- **WHEN** an active `SUPER_ADMIN` opens a valid audit page
- **THEN** the system records the audit view and renders safe results

#### Scenario: Non-privileged access
- **WHEN** any other actor requests the audit viewer
- **THEN** no audit records or protected metadata are returned

### Requirement: Filtered cursor pagination and redaction
The viewer SHALL filter by date, action, outcome, actor type, application ID, entity ID, and request ID and SHALL paginate 50 rows using a stable `(createdAt,id)` cursor.

#### Scenario: Paginated filtering
- **WHEN** a super admin applies valid filters or follows a cursor
- **THEN** at most 50 deterministically ordered events and a valid next cursor are returned

#### Scenario: Protected metadata
- **WHEN** an event contains historical IP or user-agent fields
- **THEN** the viewer masks the IP, abbreviates the user agent, and displays only allow-listed audit metadata
