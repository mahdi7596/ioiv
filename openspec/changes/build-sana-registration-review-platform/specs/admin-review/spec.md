## ADDED Requirements

### Requirement: Admin overview
The system SHALL provide an admin overview dashboard with counts for total, submitted, under review, needs edit, accepted, and rejected applications.

#### Scenario: Admin opens overview
- **WHEN** an authenticated admin visits the admin dashboard
- **THEN** the system displays submission counts by status

### Requirement: Submission list and detail
The system SHALL let admins search, filter, sort, and inspect submissions with uploaded files, payment data, status history, and notes.

#### Scenario: Admin searches submissions
- **WHEN** an admin searches by mobile or company national ID
- **THEN** the system returns matching submissions

#### Scenario: Admin opens submission detail
- **WHEN** an admin opens a submission detail page
- **THEN** the system displays application data, protected download links, payment status/reference, status history, and admin note

### Requirement: Status transitions
The system SHALL enforce allowed admin status transitions and record history for every status change.

#### Scenario: Admin starts review
- **WHEN** an admin changes a submitted application to under review
- **THEN** the system updates status, records history, and notifies the user

#### Scenario: Admin requests edits
- **WHEN** an admin changes an under-review application to needs edit with a note
- **THEN** the system stores the note, records history, and notifies the user to log in

#### Scenario: Invalid transition
- **WHEN** an admin attempts a transition outside the allowed transition list
- **THEN** the system rejects the change
