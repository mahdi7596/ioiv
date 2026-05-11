## ADDED Requirements

### Requirement: Atomic final payment start
The system SHALL start final payment from the latest final application draft submitted with the payment action, and SHALL persist that draft before creating a gateway payment request.

#### Scenario: First payment click uses latest final draft
- **WHEN** a user clicks the final payment button with a locally complete final draft whose latest changes have not yet been persisted by background autosave
- **THEN** the system saves and validates that draft on the server before requesting a payment authority

#### Scenario: Invalid final draft does not create payment
- **WHEN** the submitted final draft is missing required final submission fields
- **THEN** the system does not create a payment row or gateway request and returns a user-facing validation message

### Requirement: Payment start reports expected failures gracefully
The system SHALL return expected payment-start failures as structured user-facing results instead of rendering a production Server Components error.

#### Scenario: Final validation failure is displayed inline
- **WHEN** final payment start fails because required application data is invalid or incomplete
- **THEN** the final payment step shows a Persian error message without replacing the page with a Server Components digest error

#### Scenario: Gateway request failure is displayed inline
- **WHEN** the payment provider request fails before a redirect URL is created
- **THEN** the final payment step shows a Persian payment-start failure message and leaves the user on the application page

### Requirement: Payment start waits for in-flight form work
The system SHALL prevent users from starting payment while relevant uploads or draft saves are still in progress.

#### Scenario: Upload in progress blocks payment
- **WHEN** a required application file upload is still in progress
- **THEN** the final payment button is disabled or otherwise prevented from starting payment

#### Scenario: Draft save in progress blocks payment
- **WHEN** a draft save is still in progress
- **THEN** the final payment button is disabled or otherwise prevented from starting payment until the save completes

### Requirement: Pending payment retry remains supported
The system SHALL preserve retry behavior for applications waiting for a gateway result when no payment has been verified.

#### Scenario: Retry creates fresh payment authority
- **WHEN** a user starts payment for an application in pending payment state with an initiated but unverified payment
- **THEN** the system marks prior initiated attempts failed, persists the latest valid final draft, and returns a fresh gateway redirect URL
