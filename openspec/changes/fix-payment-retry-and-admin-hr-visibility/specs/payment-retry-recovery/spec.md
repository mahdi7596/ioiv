## ADDED Requirements

### Requirement: Retry abandoned payment handoff
The system SHALL allow a user to retry payment when their application is waiting for a gateway result but no payment has been verified.

#### Scenario: User retries pending payment
- **WHEN** a user with an application in `PENDING_PAYMENT` and an `INITIATED` latest payment starts payment again
- **THEN** the system marks the prior initiated payment failed, creates a new initiated payment request, and returns a fresh gateway redirect URL

#### Scenario: Retry remains server-side validated
- **WHEN** a user retries payment after required final application data is missing or invalid
- **THEN** the system does not create a new gateway request and shows the user that required documents must be completed before payment

#### Scenario: Verified payment is not retried
- **WHEN** an application already has a verified payment
- **THEN** the system does not create a second payment request for the same final submission

### Requirement: Pending payment remains recoverable in the user interface
The system SHALL provide a visible recovery path from a pending payment state when the gateway handoff was not completed.

#### Scenario: Dashboard explains retry
- **WHEN** a user views an application waiting for a gateway result without a verified payment
- **THEN** the dashboard explains that the user can return to the payment step and try payment again if payment was not completed

#### Scenario: Payment step allows retry without document editing
- **WHEN** a user opens a pending-payment application without a verified payment
- **THEN** the final payment step allows starting another payment attempt while non-payment document fields remain non-editable

### Requirement: Stale payment callbacks are safe
The system SHALL prevent callbacks from older payment attempts from downgrading a newer successful or reviewed application state.

#### Scenario: Old failed callback after retry
- **WHEN** a failed callback arrives for an older payment attempt after the user has started a newer payment attempt
- **THEN** the system marks only the older initiated payment failed and does not change the application to draft unless that payment is still the active pending attempt

#### Scenario: Old failed callback after successful payment
- **WHEN** a failed callback arrives for an older payment attempt after another payment has been verified
- **THEN** the system does not change the verified payment, submitted application, or later review status

#### Scenario: Duplicate verified callback remains idempotent
- **WHEN** a callback arrives for a payment already marked `VERIFIED`
- **THEN** the system leaves payment and application state unchanged and routes the user to the success return page
