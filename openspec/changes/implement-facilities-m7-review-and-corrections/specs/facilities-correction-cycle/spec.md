## ADDED Requirements

### Requirement: Correction requests are repeated and auditable
The system SHALL allow a full reviewer to open one correction request from `UNDER_REVIEW`, require a non-empty bounded note, assign the next sequence, transition to `NEEDS_EDIT`, and retain all prior resolved cycles.

#### Scenario: First correction is requested
- **WHEN** a full reviewer submits a valid note for an under-review application
- **THEN** one open sequence-1 correction, one status transition, and corresponding append-only audit/history records commit atomically

#### Scenario: Later correction is requested
- **WHEN** a previously corrected application returns to review and another correction is requested
- **THEN** a new higher sequence is opened while the resolved earlier request remains unchanged

### Requirement: Correction SMS failure does not undo correction
The system SHALL attempt SMS only for correction requests, persist pending/sent/failed delivery state using safe metadata, and allow authorized retry without creating another correction request.

#### Scenario: Provider succeeds
- **WHEN** correction state commits and the SMS provider accepts the referenced message
- **THEN** the correction delivery becomes sent and a safe success audit event is appended

#### Scenario: Provider fails
- **WHEN** the provider times out, is unavailable, or returns a malformed failure
- **THEN** the application remains `NEEDS_EDIT`, delivery becomes failed, sensitive provider details are not stored, and a reviewer can retry

### Requirement: Correction unlocks application editing without repayment
The system SHALL allow the owner of a `NEEDS_EDIT` application to update facility type, requested amount within the snapshotted limit, employee/officer choices, and every application evidence slot; immutable intake, supplier, questionnaire version, and company snapshot SHALL not change.

#### Scenario: Applicant replaces correction evidence
- **WHEN** the owner uploads a valid replacement while the application is `NEEDS_EDIT`
- **THEN** the normal private scanning/replacement lifecycle makes only the passed current revision available

#### Scenario: Locked application is edited
- **WHEN** the owner attempts an application mutation in any other post-submission status
- **THEN** the server rejects the mutation even if the UI was bypassed

### Requirement: Corrected application returns to the queue
The system SHALL revalidate the complete application, require the original verified payment when payment was enabled, close the open correction, transition `NEEDS_EDIT` to `SUBMITTED`, preserve the original submission timestamp, and not create another payment.

#### Scenario: Valid correction is resubmitted
- **WHEN** the owner submits a complete corrected application
- **THEN** the open correction resolves and the application returns to `SUBMITTED` with history/audit records and no payment initiation

#### Scenario: Correction is incomplete
- **WHEN** required data or current scan-passed evidence is missing
- **THEN** the application remains `NEEDS_EDIT` and the open correction remains unresolved

### Requirement: Applicant sees actionable correction history
The system SHALL display the current facilities status, latest open correction note, complete status/correction timeline, and explicit Persian loading, validation, conflict, retry, and success states.

#### Scenario: Applicant opens an active correction
- **WHEN** the owner views a `NEEDS_EDIT` application
- **THEN** the requested note is prominent and the final action is labelled `ارسال اصلاحات`

### Requirement: Company profile is stable during active review
The system SHALL reject company-profile data and file mutations while the company has an application in `PENDING_PAYMENT`, `SUBMITTED`, `UNDER_REVIEW`, or `NEEDS_EDIT`, and SHALL allow them again in `DRAFT` or after `VALIDATION_COMPLETED`.

#### Scenario: Profile edit is attempted during correction
- **WHEN** the owner attempts to change profile data or profile evidence while an application is `NEEDS_EDIT`
- **THEN** the server rejects the change with an actionable Persian message
