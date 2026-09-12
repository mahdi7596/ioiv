## ADDED Requirements

### Requirement: Authorized bounded facilities XLSX export
The system SHALL allow active `ADMIN` and `SUPER_ADMIN` users to export facilities applications as XLSX and MUST deny users, inactive admins, and `ENTRY_VIEWER` admins.

#### Scenario: Authorized export
- **WHEN** an active full admin requests a valid facilities export containing no more than 5,000 applications and 100,000 related rows
- **THEN** the system returns a private XLSX response only after recording a successful export audit event

#### Scenario: Export denied or oversized
- **WHEN** an unauthorized actor requests an export or the filtered result exceeds either bound
- **THEN** the system returns the appropriate 401, 403, or Persian 422 response and returns no workbook

### Requirement: Approved facilities filters
The export MUST support intake, supplier, status, and inclusive Tehran-created-date filters across all application statuses.

#### Scenario: Date range
- **WHEN** an admin supplies valid `from` and `to` dates
- **THEN** applications are filtered using Tehran day boundaries as a half-open UTC interval

#### Scenario: Invalid filter
- **WHEN** an identifier, status, date, or date ordering is invalid
- **THEN** the endpoint returns a Persian 400 response without querying or generating an export beyond validation needs

### Requirement: Complete safe related workbook
The workbook SHALL contain related Persian sheets for applications, shareholders, officers, annual documents, current files, payments, corrections, and status history, keyed by application ID, while excluding secrets, raw gateway payloads, storage keys, hashes, and deleted file content.

#### Scenario: Repeatable application data
- **WHEN** an application contains repeatable shareholders, officers, yearly documents, attachments, payments, corrections, or history
- **THEN** each value appears in the corresponding related worksheet with an unambiguous application ID

#### Scenario: Spreadsheet safety
- **WHEN** user-controlled or administrator-controlled text begins with an Excel formula prefix
- **THEN** the cell is neutralized and cannot execute as a formula

### Requirement: Authorized file hyperlinks
The workbook MUST use trusted `APP_URL` application-scoped links only for current scan-passed files belonging to review-visible applications.

#### Scenario: Review-visible file
- **WHEN** an exported current file belongs to a review-visible application
- **THEN** its file row contains an authenticated application-scoped hyperlink with no credential or public token

#### Scenario: Pre-submission file
- **WHEN** an exported file belongs to a `DRAFT` or `PENDING_PAYMENT` application
- **THEN** its safe metadata is present but its hyperlink cell is empty
