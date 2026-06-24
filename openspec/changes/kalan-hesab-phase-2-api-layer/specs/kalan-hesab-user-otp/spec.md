## ADDED Requirements

### Requirement: POST /api/kalan-hesab/otp/request sends a 4-digit OTP
The system SHALL accept a `{ mobile }` body, validate the mobile with the existing `mobileSchema`, create an `OtpCode` row with purpose `KALAN_HESAB_VERIFICATION`, and send the code via SMS using `createOtpSmsMessage`.

#### Scenario: Valid mobile triggers OTP send
- **GIVEN** a valid Iranian mobile number (matches `/^09\d{9}$/`)
- **WHEN** POST `/api/kalan-hesab/otp/request` is called
- **THEN** an `OtpCode` row is created with `purpose = KALAN_HESAB_VERIFICATION`, `consumedAt = null`, `expiresAt = now + 10 min`
- **AND** an SMS is sent via `sendSms(createOtpSmsMessage(mobile, code))`
- **AND** the response is `200 { ok: true }`

#### Scenario: Invalid mobile returns 400
- **GIVEN** a body with `mobile = "1234"`
- **WHEN** POST `/api/kalan-hesab/otp/request` is called
- **THEN** the response is `400 { error: "شماره موبایل معتبر نیست" }`

#### Scenario: Rate limit — second request within 90 seconds is rejected
- **GIVEN** an OTP was requested for a mobile less than 90 seconds ago (unconsumed)
- **WHEN** POST `/api/kalan-hesab/otp/request` is called again for the same mobile
- **THEN** the response is `429 { error: "کد تایید قبلاً ارسال شده است. لطفاً ۹۰ ثانیه صبر کنید." }`

---

### Requirement: POST /api/kalan-hesab/otp/verify consumes the OTP and returns verified flag
The system SHALL accept `{ mobile, code }`, find a matching unconsumed unexpired `OtpCode` with purpose `KALAN_HESAB_VERIFICATION`, mark it consumed, and return `{ verified: true }`. No session is created.

#### Scenario: Correct code returns verified
- **GIVEN** an unconsumed, unexpired OTP with purpose `KALAN_HESAB_VERIFICATION` exists for the mobile
- **WHEN** POST `/api/kalan-hesab/otp/verify` is called with the correct code
- **THEN** `OtpCode.consumedAt` is set to now
- **AND** the response is `200 { verified: true }`
- **AND** no session cookie is set

#### Scenario: Wrong code returns 400
- **GIVEN** an OTP exists for the mobile
- **WHEN** POST `/api/kalan-hesab/otp/verify` is called with the wrong code
- **THEN** the response is `400 { error: "کد تایید نامعتبر یا منقضی شده است" }`

#### Scenario: Expired code returns 400
- **GIVEN** an OTP whose `expiresAt` is in the past
- **WHEN** POST `/api/kalan-hesab/otp/verify` is called with the correct code
- **THEN** the response is `400 { error: "کد تایید نامعتبر یا منقضی شده است" }`
