## ADDED Requirements

### Requirement: Excel-readable XLSX export
The system SHALL provide an admin export that opens readably in Excel with Persian content preserved.

#### Scenario: Admin downloads XLSX export
- **WHEN** an authenticated active admin exports submissions from the submissions page
- **THEN** the downloaded file is an `.xlsx` workbook
- **AND** Persian text is readable when opened in Excel

#### Scenario: Export includes revised application fields
- **WHEN** an admin exports submissions after the wizard update
- **THEN** the export includes columns for employee count, insurance-list upload presence, revised tax declaration completion, audited financial statement completion, trial balance completion, credit report completion, payment, status, applicant, and company fields

### Requirement: Excel-friendly CSV fallback
The system SHALL preserve a CSV fallback whose text opens readably in common spreadsheet tools.

#### Scenario: Admin requests CSV explicitly
- **WHEN** an authenticated active admin requests export with `format=csv`
- **THEN** the system returns CSV with the same operational columns as XLSX
- **AND** Persian text is encoded so Excel can display it correctly

### Requirement: Export authorization remains enforced
The system SHALL deny readable export endpoints to unauthenticated users and normal users.

#### Scenario: Non-admin requests export
- **WHEN** a non-admin requests the admin export endpoint
- **THEN** the system denies access
