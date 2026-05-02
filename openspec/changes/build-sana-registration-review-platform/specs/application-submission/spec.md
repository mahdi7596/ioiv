## ADDED Requirements

### Requirement: Single active-round application
The system SHALL allow only one application per `mobile + companyNationalId + applicationRound` combination.

#### Scenario: User starts first application
- **WHEN** a user has no application for the active round
- **THEN** the system creates a draft application for that round and copies the user's registration snapshot fields into the application: `companyName`, `companyNationalId`, `companyContactFullName`, and `companyContactNationalCode`

#### Scenario: Duplicate active-round application
- **WHEN** a user already has an application for the same mobile, company national ID, and round
- **THEN** the system returns the existing application instead of creating a duplicate

### Requirement: Draft autosave
The system SHALL save application draft data, uploaded file references, and the latest step before final submission.

#### Scenario: User leaves mid-wizard
- **WHEN** a user saves or changes steps in the application wizard
- **THEN** the system persists current step and draft fields so the user can resume later

### Requirement: Five-step application wizard
The system SHALL present the application as five steps: tax declaration, audited financial statements, trial balance, credit report, and final confirmation/payment.

#### Scenario: Wizard displays progress
- **WHEN** a user opens the application form
- **THEN** the system shows the current step, total step count, and current step title

### Requirement: Final submission validation
The system SHALL block final payment/submission until all required application data and the non-refundable payment acknowledgement are valid.

#### Scenario: Missing required tax declarations
- **WHEN** fewer than three tax declaration year/file rows are complete
- **THEN** the system blocks final payment/submission

#### Scenario: Optional financial statements empty
- **WHEN** audited financial statements contain no rows
- **THEN** the system allows final validation to continue

#### Scenario: Optional financial row incomplete
- **WHEN** an audited financial statement row has either year or file but not both
- **THEN** the system blocks final payment/submission

#### Scenario: Required uploads complete
- **WHEN** tax declarations, trial balance files, credit report files, and payment acknowledgement are complete
- **THEN** the system allows the user to start payment

### Requirement: Editable statuses
The system SHALL allow users to edit applications only while the status is `DRAFT` or `NEEDS_EDIT`.

#### Scenario: Needs edit application
- **WHEN** an admin marks an application as needing edits
- **THEN** the user can edit and resubmit without paying again

#### Scenario: Submitted application
- **WHEN** an application is submitted, under review, accepted, or rejected
- **THEN** the system prevents user edits
