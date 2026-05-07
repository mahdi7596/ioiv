## MODIFIED Requirements

### Requirement: Editable statuses
The system SHALL allow users to edit applications only while the status is `DRAFT` or `NEEDS_EDIT`.

#### Scenario: Needs edit application
- **WHEN** an admin marks an application as needing edits
- **THEN** the user can edit and resubmit without paying again

#### Scenario: Submitted or review application
- **WHEN** an application is submitted, under review, or validation completed
- **THEN** the system prevents user edits

## ADDED Requirements

### Requirement: Validation completed status
The system SHALL represent the final validation outcome with a single `VALIDATION_COMPLETED` status labeled `پایان فرآیند اعتبارسنجی`.

#### Scenario: User views completed validation status
- **WHEN** a user's application has status `VALIDATION_COMPLETED`
- **THEN** the user dashboard displays the `پایان فرآیند اعتبارسنجی` status and explains that the validation process has ended

#### Scenario: Final status is read-only
- **WHEN** a user's application has status `VALIDATION_COMPLETED`
- **THEN** the user can view the submitted application but cannot edit or resubmit it

### Requirement: User certificate access
The system SHALL show the validation certificate download to the owning user when a certificate PDF is available.

#### Scenario: Certificate available
- **WHEN** a user's application has a validation certificate PDF
- **THEN** the user dashboard displays a certificate download action

#### Scenario: Certificate missing
- **WHEN** a user's application has no validation certificate PDF
- **THEN** the user dashboard does not display a broken certificate download action
