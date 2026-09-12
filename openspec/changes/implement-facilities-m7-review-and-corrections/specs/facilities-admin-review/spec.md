## ADDED Requirements

### Requirement: Facilities review is role protected
The system SHALL allow active `ADMIN` and `SUPER_ADMIN` accounts to view, download, and mutate facilities reviews; active `ENTRY_VIEWER` accounts SHALL view facilities list/detail data but SHALL NOT download files or mutate review state.

#### Scenario: Reviewer has full access
- **WHEN** an active `ADMIN` or `SUPER_ADMIN` opens a submitted facilities application
- **THEN** the system displays its complete review data, protected evidence links, and context-valid review actions

#### Scenario: Entry viewer is read only
- **WHEN** an active `ENTRY_VIEWER` opens a facilities application
- **THEN** the system omits file download and mutation controls and rejects direct attempts to use them

### Requirement: Facilities review uses a separate queue
The system SHALL expose facilities applications in a queue and detail route separate from legacy validation submissions, with company/mobile/national-ID search, status filtering, and latest-workflow ordering.

#### Scenario: Reviewer filters the facilities queue
- **WHEN** a permitted admin searches or selects a valid status
- **THEN** only matching facilities applications are returned without changing legacy submission counts or results

### Requirement: Reviewer transitions are transactional and constrained
The system SHALL support `SUBMITTED` to `UNDER_REVIEW`, `UNDER_REVIEW` to `NEEDS_EDIT`, and `UNDER_REVIEW` to `VALIDATION_COMPLETED`; each transition SHALL atomically write status, append-only history, correction data when applicable, and safe audit metadata.

#### Scenario: Review starts
- **WHEN** a full reviewer starts a submitted application review
- **THEN** the application becomes `UNDER_REVIEW` with one history and audit record

#### Scenario: Validation completes
- **WHEN** a full reviewer completes an under-review application
- **THEN** the application becomes `VALIDATION_COMPLETED` without a certificate or rejection state

#### Scenario: Concurrent stale action
- **WHEN** two reviewers attempt incompatible transitions from the same prior state
- **THEN** at most one transition commits and the other receives a safe conflict

### Requirement: Facilities evidence remains private
The system SHALL serve only the current scan-passed revision to its owning applicant or an active full reviewer, SHALL verify stored length and digest before responding, and SHALL not require current programme availability for existing review access.

#### Scenario: Authorized reviewer downloads evidence
- **WHEN** an active full reviewer requests a current application or company-profile file
- **THEN** the system returns a private no-store response with a safe content disposition

#### Scenario: Unauthorized or stale evidence is requested
- **WHEN** an entry viewer, unrelated user, inactive admin, or caller requesting a replaced/failed revision requests the file
- **THEN** the system returns a non-disclosing not-found response without reading private bytes
