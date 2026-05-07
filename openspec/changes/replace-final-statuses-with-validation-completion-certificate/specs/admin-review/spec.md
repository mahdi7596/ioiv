## MODIFIED Requirements

### Requirement: Admin overview
The system SHALL provide an admin overview dashboard with counts for total, submitted, under review, needs edit, and validation completed applications.

#### Scenario: Admin opens overview
- **WHEN** an authenticated admin visits the admin dashboard
- **THEN** the system displays submission counts by status, including a single validation completed count instead of separate accepted and rejected counts

### Requirement: Status transitions
The system SHALL enforce allowed admin status transitions and record history for every status change.

#### Scenario: Admin starts review
- **WHEN** an admin changes a submitted application to under review
- **THEN** the system updates status, records history, and notifies the user

#### Scenario: Admin requests edits
- **WHEN** an admin changes an under-review application to needs edit with a note
- **THEN** the system stores the note, records history, and notifies the user to log in

#### Scenario: Admin completes validation
- **WHEN** an admin changes a submitted or under-review application to validation completed with a certificate PDF
- **THEN** the system updates status to `VALIDATION_COMPLETED`, stores the certificate, records history, and notifies the user

#### Scenario: Invalid transition
- **WHEN** an admin attempts a transition outside the allowed transition list
- **THEN** the system rejects the change

## ADDED Requirements

### Requirement: Validation completion transition options
The system SHALL offer `VALIDATION_COMPLETED` as the only final admin status option and SHALL NOT offer accepted or rejected status options.

#### Scenario: Admin reviews submitted application
- **WHEN** an admin opens the status change control for a submitted application
- **THEN** the available options include `UNDER_REVIEW`, `NEEDS_EDIT`, and `VALIDATION_COMPLETED`

#### Scenario: Admin reviews under-review application
- **WHEN** an admin opens the status change control for an under-review application
- **THEN** the available options include `NEEDS_EDIT` and `VALIDATION_COMPLETED`

#### Scenario: Admin views validation completed application
- **WHEN** an admin opens a validation completed application
- **THEN** the system explains that no further status transition is available

### Requirement: Validation certificate upload
The system SHALL require an admin-uploaded PDF certificate when changing an application to `VALIDATION_COMPLETED`.

#### Scenario: Missing certificate
- **WHEN** an admin submits a status change to `VALIDATION_COMPLETED` without a certificate PDF
- **THEN** the system rejects the status change

#### Scenario: Non-PDF certificate
- **WHEN** an admin submits a status change to `VALIDATION_COMPLETED` with a non-PDF file
- **THEN** the system rejects the status change

#### Scenario: Valid certificate
- **WHEN** an admin submits a status change to `VALIDATION_COMPLETED` with a valid PDF certificate
- **THEN** the system stores the certificate and completes the status change

### Requirement: Validation certificate replacement
The system SHALL allow active admins to replace the certificate PDF for a validation completed application.

#### Scenario: Admin replaces certificate
- **WHEN** an active admin uploads a replacement PDF for a validation completed application
- **THEN** the system stores the replacement and the user certificate download points to the replacement file

#### Scenario: Admin replacement uses invalid file type
- **WHEN** an active admin uploads a non-PDF replacement certificate
- **THEN** the system rejects the replacement
