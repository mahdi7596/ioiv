## ADDED Requirements

### Requirement: Entry viewer admin role
The system SHALL provide an `ENTRY_VIEWER` admin role that can authenticate through the admin login and view admin entry information without receiving action permissions.

#### Scenario: Entry viewer logs in to admin panel
- **WHEN** an active admin row exists for a mobile number with role `ENTRY_VIEWER`
- **AND** that mobile number completes the admin OTP flow
- **THEN** the system creates an admin session and routes the user into the admin panel

#### Scenario: Inactive entry viewer cannot log in
- **WHEN** an admin row exists for a mobile number with role `ENTRY_VIEWER` and `active = false`
- **AND** that mobile number requests or verifies an admin OTP
- **THEN** the system denies admin access

### Requirement: Entry viewer can inspect entries
The system SHALL allow an authenticated active `ENTRY_VIEWER` admin to view the admin overview, submission list, submission filters, submission search, submission sorting, and submission detail pages.

#### Scenario: Entry viewer opens overview
- **WHEN** an authenticated active `ENTRY_VIEWER` admin opens `/admin`
- **THEN** the system displays the admin overview counts

#### Scenario: Entry viewer lists submissions
- **WHEN** an authenticated active `ENTRY_VIEWER` admin opens `/admin/submissions`
- **THEN** the system displays the submissions table

#### Scenario: Entry viewer searches and filters submissions
- **WHEN** an authenticated active `ENTRY_VIEWER` admin applies search, status filter, or sort query parameters on the submissions list
- **THEN** the system returns matching submissions using the same read behavior available to existing admins

#### Scenario: Entry viewer opens submission detail
- **WHEN** an authenticated active `ENTRY_VIEWER` admin opens a valid submission detail page
- **THEN** the system displays entry details, payment status, status history, admin note text, and uploaded file metadata

### Requirement: Entry viewer cannot download files
The system MUST prevent an authenticated active `ENTRY_VIEWER` admin from downloading any uploaded submission file or validation certificate.

#### Scenario: Entry viewer file download denied
- **WHEN** an authenticated active `ENTRY_VIEWER` admin requests `/api/files/<id>` for an uploaded submission file
- **THEN** the system returns a forbidden response
- **AND** the file contents are not returned

#### Scenario: Entry viewer certificate download denied
- **WHEN** an authenticated active `ENTRY_VIEWER` admin requests `/api/files/<id>` for a validation certificate
- **THEN** the system returns a forbidden response
- **AND** the certificate contents are not returned

#### Scenario: Entry viewer sees no download actions
- **WHEN** an authenticated active `ENTRY_VIEWER` admin opens a submission detail page with uploaded files or a validation certificate
- **THEN** the page does not render file download or certificate download controls for that viewer

### Requirement: Entry viewer cannot export submissions
The system MUST prevent an authenticated active `ENTRY_VIEWER` admin from exporting submissions as CSV or Excel.

#### Scenario: Entry viewer export denied
- **WHEN** an authenticated active `ENTRY_VIEWER` admin requests the admin export endpoint
- **THEN** the system returns a forbidden response
- **AND** no CSV or Excel file is returned

#### Scenario: Entry viewer sees no export actions
- **WHEN** an authenticated active `ENTRY_VIEWER` admin opens the submissions list page
- **THEN** the page does not render CSV or Excel export controls for that viewer

### Requirement: Entry viewer cannot mutate submissions
The system MUST prevent an authenticated active `ENTRY_VIEWER` admin from changing submission state or writing operational review data.

#### Scenario: Entry viewer status change denied
- **WHEN** an authenticated active `ENTRY_VIEWER` admin submits a status-change request
- **THEN** the system returns a forbidden response
- **AND** the submission status, admin note, status history, and files remain unchanged

#### Scenario: Entry viewer cannot upload validation certificate during status change
- **WHEN** an authenticated active `ENTRY_VIEWER` admin submits a status-change request with a certificate file
- **THEN** the system returns a forbidden response
- **AND** no validation certificate file record is created

#### Scenario: Entry viewer certificate replacement denied
- **WHEN** an authenticated active `ENTRY_VIEWER` admin submits a validation certificate replacement request
- **THEN** the system returns a forbidden response
- **AND** no replacement certificate file record is created

#### Scenario: Entry viewer sees no mutation actions
- **WHEN** an authenticated active `ENTRY_VIEWER` admin opens a submission detail page
- **THEN** the page does not render status-change, note-writing, certificate-upload, or certificate-replacement controls for that viewer

### Requirement: Existing admin roles keep current access
The system SHALL preserve existing action access for active `ADMIN` and `SUPER_ADMIN` users.

#### Scenario: Existing admin can use current actions
- **WHEN** an authenticated active `ADMIN` or `SUPER_ADMIN` uses existing admin actions
- **THEN** the system allows the same downloads, exports, status changes, notes, and certificate management behavior that existed before this change

#### Scenario: Existing admins can still view entries
- **WHEN** an authenticated active `ADMIN` or `SUPER_ADMIN` opens admin overview, list, or detail pages
- **THEN** the system displays those pages using the same read behavior that existed before this change
