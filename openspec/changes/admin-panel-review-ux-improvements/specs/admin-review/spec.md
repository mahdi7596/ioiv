## MODIFIED Requirements

### Requirement: Admin overview
The system SHALL provide an admin overview dashboard with counts for total, submitted, under review, needs edit, accepted, and rejected applications, and each count card SHALL provide a shortcut to the corresponding submissions list view.

#### Scenario: Admin opens overview
- **WHEN** an authenticated admin visits the admin dashboard
- **THEN** the system displays submission counts by status

#### Scenario: Admin opens all submissions from overview
- **WHEN** an authenticated admin selects the total applications count card
- **THEN** the system opens `/admin/submissions` without a status filter

#### Scenario: Admin opens a status-filtered list from overview
- **WHEN** an authenticated admin selects a status count card
- **THEN** the system opens `/admin/submissions` with the matching `status` query parameter
- **AND** the submissions table is filtered as though the admin had selected that status filter manually

### Requirement: Submission list and detail
The system SHALL let admins search, filter, sort, and inspect submissions with uploaded files, payment data, status history, and notes, using scannable status/payment presentation and accessible icon actions.

#### Scenario: Admin searches submissions
- **WHEN** an admin enters search text by mobile, company national ID, or national code
- **THEN** the system updates the submissions query and returns matching submissions without requiring a separate apply-button click

#### Scenario: Admin filters submissions by status
- **WHEN** an admin selects a submission status filter
- **THEN** the system updates the submissions query and returns submissions matching the selected status

#### Scenario: Admin sorts submissions
- **WHEN** an admin selects a sort order
- **THEN** the system updates the submissions query and returns submissions in the selected order

#### Scenario: Admin views application status
- **WHEN** the submissions table or detail page displays an application status
- **THEN** the status appears with a dedicated label and visual style for the status value

#### Scenario: Admin views payment status
- **WHEN** the submissions table or detail page displays a latest payment status
- **THEN** the payment status appears with a dedicated label and visual style for the payment value

#### Scenario: Admin opens submission detail from table
- **WHEN** an admin activates the submission detail icon action in a table row
- **THEN** the system opens that submission's detail page
- **AND** the icon action has an accessible name describing the action

#### Scenario: Admin opens submission detail
- **WHEN** an admin opens a submission detail page
- **THEN** the system displays application data, protected download links, payment status/reference, status history, and admin note

#### Scenario: Admin changes submission status
- **WHEN** an admin views the status change form on a submission detail page
- **THEN** the system shows only status options allowed from the submission's current status
- **AND** if no status transition is allowed, the system explains why status changes are unavailable instead of showing invalid actions

### Requirement: Admin submission file categorization
The system SHALL display uploaded submission files in categorized groups that identify each file's document purpose and selected year when the file belongs to a year-based field.

#### Scenario: Admin reviews tax declaration files
- **WHEN** a submission includes uploaded files whose field keys map to tax declaration rows
- **THEN** the detail page displays those files under a tax declaration group
- **AND** each file row shows the selected year from the matching tax declaration row when available

#### Scenario: Admin reviews audited financial statement files
- **WHEN** a submission includes uploaded files whose field keys map to audited financial statement rows
- **THEN** the detail page displays those files under an audited financial statements group
- **AND** each file row shows the selected year from the matching financial statement row when available

#### Scenario: Admin reviews trial balance files
- **WHEN** a submission includes uploaded files for trial balance fields
- **THEN** the detail page displays those files under a trial balance group with Persian field labels for general ledger and subsidiary ledger

#### Scenario: Admin reviews credit report files
- **WHEN** a submission includes uploaded files for credit report fields
- **THEN** the detail page displays those files under a credit reports group with Persian field labels for company, CEO, and board member reports

#### Scenario: Uploaded file cannot be categorized
- **WHEN** a submission includes an uploaded file with an unknown or legacy field key
- **THEN** the detail page still displays the file in an uncategorized group
- **AND** the row includes the raw field key as fallback context

#### Scenario: Selected year is missing
- **WHEN** an uploaded file belongs to a year-based field but the matching selected year is unavailable
- **THEN** the detail page displays the file with a visible missing-year indicator

#### Scenario: Submission has no files
- **WHEN** a submission detail page has no uploaded files
- **THEN** the system displays a clear empty state for the files section
