## ADDED Requirements

### Requirement: XLSX export
The system SHALL allow authenticated admins to export filtered submissions as XLSX.

#### Scenario: Admin exports submissions
- **WHEN** an admin requests an XLSX export with optional filters
- **THEN** the system returns a spreadsheet containing matching submission rows and required operational columns

### Requirement: CSV fallback
The system SHALL allow authenticated admins to export the same submission data as CSV when requested.

#### Scenario: Admin requests CSV
- **WHEN** an admin requests export with `format=csv`
- **THEN** the system returns a CSV file with the same columns as the XLSX export

### Requirement: Export authorization
The system SHALL deny submission exports to unauthenticated users and normal users.

#### Scenario: Normal user requests export
- **WHEN** a non-admin requests the export endpoint
- **THEN** the system denies access
