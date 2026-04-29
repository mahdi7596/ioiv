## ADDED Requirements

### Requirement: Non-refundable payment acknowledgement
The system SHALL require users to acknowledge that the fixed `3,000,000 Toman` payment is non-refundable before redirecting to payment.

#### Scenario: Terms unchecked
- **WHEN** a user attempts to pay without accepting the non-refundable payment terms
- **THEN** the system blocks payment initiation

### Requirement: Zarinpal payment initiation
The system SHALL create an initiated payment record and request a Zarinpal payment URL only after final application validation succeeds.

#### Scenario: Valid final application starts payment
- **WHEN** a user with a valid final application starts payment
- **THEN** the system sets the application to pending payment, creates a payment record, stores the Zarinpal authority, and returns a redirect URL

#### Scenario: Invalid final application starts payment
- **WHEN** required application data is missing
- **THEN** the system does not create a payment request

### Requirement: Server-side payment verification
The system SHALL verify Zarinpal callbacks server-side before marking an application as submitted.

#### Scenario: Payment verified
- **WHEN** Zarinpal callback verification succeeds
- **THEN** the system marks the payment verified, marks the application submitted, records submission time and status history, and notifies admins

#### Scenario: Payment failed
- **WHEN** Zarinpal callback status is failed or verification fails
- **THEN** the system keeps the application editable and does not mark it submitted
