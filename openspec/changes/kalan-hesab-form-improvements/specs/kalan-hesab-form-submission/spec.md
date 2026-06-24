## MODIFIED Requirements

### Requirement: Mobile field requires no OTP verification
The mobile number field SHALL be a plain text input. The system SHALL NOT send an OTP or require the user to verify their mobile before submitting the form. The submit button SHALL be enabled as long as all required fields are filled and valid.

#### Scenario: User submits without OTP
- **WHEN** the user fills all fields including a valid mobile number and clicks "دریافت ارزیابی تخصصی"
- **THEN** the form submits immediately without any code-verification step

#### Scenario: Submit API accepts mobile without verified flag
- **WHEN** `POST /api/kalan-hesab/submit` is called with valid form data (no `verified` field)
- **THEN** the API returns `{ ok: true }` and saves the submission

## REMOVED Requirements

### Requirement: OTP mobile verification on form
**Reason**: Client decided verification adds unnecessary friction for users.
**Migration**: Remove OTP request/verify UI from `app/kalan-hesab/page.tsx`. Remove `verified: z.literal(true)` from submit route schema. OTP API routes (`/api/kalan-hesab/otp/request`, `/api/kalan-hesab/otp/verify`) are deprecated and no longer called by the form.
