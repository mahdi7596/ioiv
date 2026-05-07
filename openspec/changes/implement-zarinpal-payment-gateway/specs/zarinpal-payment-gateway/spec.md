## ADDED Requirements

### Requirement: Zarinpal payment initiation
The system SHALL initiate Zarinpal payment only after the user's final application data passes server-side validation and payment acknowledgement rules.

#### Scenario: Valid application starts payment
- **WHEN** a user with a complete final application starts payment
- **THEN** the system creates an `INITIATED` Zarinpal payment, stores the returned authority, sets the application to `PENDING_PAYMENT`, and returns the Zarinpal StartPay URL

#### Scenario: Invalid application is blocked before gateway request
- **WHEN** a user with missing required final application data starts payment
- **THEN** the system does not create a Zarinpal request and does not move the application to `PENDING_PAYMENT`

#### Scenario: Existing verified payment during correction
- **WHEN** a user edits an application in `NEEDS_EDIT` that already has a verified payment
- **THEN** the system allows correction submission without requiring another Zarinpal payment

### Requirement: Payment and application status consistency
The system SHALL preserve the existing relationship between payment statuses and application statuses without introducing new persisted statuses for the Zarinpal return flow.

#### Scenario: Pending payment state
- **WHEN** a user is redirected to Zarinpal for payment
- **THEN** the application status is `PENDING_PAYMENT` and the latest payment status is `INITIATED`

#### Scenario: Verified payment unlocks review
- **WHEN** Zarinpal verification succeeds for the stored authority
- **THEN** the payment status is `VERIFIED` and the application status is `SUBMITTED`

#### Scenario: Failed payment remains editable
- **WHEN** Zarinpal callback status is failed or verification fails for the active initiated payment
- **THEN** the payment status is `FAILED` and the application is editable as `DRAFT`

#### Scenario: Review statuses keep verified payment
- **WHEN** an application moves from `SUBMITTED` to `UNDER_REVIEW`, `NEEDS_EDIT`, or `VALIDATION_COMPLETED`
- **THEN** the verified payment remains the payment record proving the application has paid

### Requirement: Server-side callback verification
The system SHALL verify Zarinpal callbacks server-side before marking a payment as verified or an application as submitted.

#### Scenario: Valid callback succeeds
- **WHEN** Zarinpal returns `Status=OK` with an `Authority` matching an initiated payment
- **THEN** the system verifies the authority with Zarinpal, stores the reference ID, records status history, and routes the user to the success return page

#### Scenario: Missing or mismatched callback fails
- **WHEN** the callback is missing `paymentId`, missing `Authority`, has a non-OK status, or does not match the stored payment authority
- **THEN** the system does not mark the payment verified and routes the user to the failed return page

#### Scenario: Verification failure fails safely
- **WHEN** Zarinpal verification rejects the active initiated payment
- **THEN** the system marks that payment failed, returns the application to `DRAFT`, and routes the user to the failed return page

### Requirement: Callback idempotency
The system SHALL handle repeated callbacks without duplicating side effects or downgrading successful payments.

#### Scenario: Already verified callback repeats
- **WHEN** a callback arrives for a payment already marked `VERIFIED`
- **THEN** the system leaves the payment and application unchanged and routes the user to the success return page

#### Scenario: Duplicate success does not duplicate history
- **WHEN** a successful callback is repeated after the application is already submitted
- **THEN** the system does not create another submission status history entry

#### Scenario: Failed stale callback cannot downgrade review state
- **WHEN** a failed or stale callback arrives after the application has a verified payment and has moved beyond `PENDING_PAYMENT`
- **THEN** the system does not change the application back to `DRAFT`

### Requirement: Notification isolation
The system SHALL keep payment verification state independent from SMS notification delivery.

#### Scenario: User or admin notification fails after verification
- **WHEN** payment verification succeeds but a user or admin SMS notification fails
- **THEN** the payment remains `VERIFIED`, the application remains `SUBMITTED`, and the notification failure is logged

### Requirement: Payment return page
The system SHALL provide a dedicated user-facing payment return page after the Zarinpal callback.

#### Scenario: Successful return page
- **WHEN** the callback verifies payment successfully
- **THEN** the user sees a Persian success message and is redirected to the dashboard after a short delay

#### Scenario: Failed return page
- **WHEN** the callback cannot verify payment or the user cancels payment
- **THEN** the user sees a Persian failure message, can return to the dashboard, and can retry payment from the editable application

#### Scenario: Return page does not persist workflow state
- **WHEN** the payment return page renders success or failure feedback
- **THEN** it does not create or require any additional application or payment status values

### Requirement: Production configuration
The system SHALL use environment variables for Zarinpal production and sandbox configuration.

#### Scenario: Production merchant configuration
- **WHEN** the app runs in production
- **THEN** it uses `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX=false`, and `APP_URL` to construct Zarinpal requests and callback URLs

#### Scenario: Missing merchant configuration
- **WHEN** payment initiation runs without `ZARINPAL_MERCHANT_ID`
- **THEN** the system fails payment initiation with a logged configuration error and does not redirect the user to Zarinpal
