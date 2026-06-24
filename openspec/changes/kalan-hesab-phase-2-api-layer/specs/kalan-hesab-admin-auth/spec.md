## ADDED Requirements

### Requirement: POST /api/kalan-hesab/admin/otp/request is gated to KALAN_HESAB_ADMIN role
The system SHALL look up the `Admin` row for the given mobile, confirm `active = true` and `role = KALAN_HESAB_ADMIN`, then send an OTP with purpose `ADMIN_LOGIN`. Non-matching mobiles receive a 403.

#### Scenario: Valid KALAN_HESAB_ADMIN mobile receives OTP
- **GIVEN** an `Admin` row with `mobile = X`, `role = KALAN_HESAB_ADMIN`, `active = true`
- **WHEN** POST `/api/kalan-hesab/admin/otp/request` is called with `{ mobile: X }`
- **THEN** an `OtpCode` with purpose `ADMIN_LOGIN` is created for `mobile = X`
- **AND** an SMS is sent
- **AND** the response is `200 { ok: true }`

#### Scenario: Mobile not registered as KALAN_HESAB_ADMIN returns 403
- **GIVEN** the mobile does not belong to a `KALAN_HESAB_ADMIN` admin (either not found, wrong role, or inactive)
- **WHEN** POST `/api/kalan-hesab/admin/otp/request` is called
- **THEN** the response is `403 { error: "دسترسی مدیریت برای این شماره فعال نیست" }`

#### Scenario: Rate limit applies
- **GIVEN** an OTP was sent to the admin mobile less than 90 seconds ago
- **WHEN** POST `/api/kalan-hesab/admin/otp/request` is called again
- **THEN** the response is `429 { error: "کد تایید قبلاً ارسال شده است. لطفاً ۹۰ ثانیه صبر کنید." }`

---

### Requirement: POST /api/kalan-hesab/admin/otp/verify creates a session for KALAN_HESAB_ADMIN
The system SHALL verify the OTP (purpose `ADMIN_LOGIN`), confirm `admin.role === KALAN_HESAB_ADMIN`, call `createSession()`, and return `{ redirectTo: "/kalan-hesab/admin" }`.

#### Scenario: Correct code creates session and returns redirect
- **GIVEN** a valid unconsumed `ADMIN_LOGIN` OTP for the mobile, and the admin has `KALAN_HESAB_ADMIN` role
- **WHEN** POST `/api/kalan-hesab/admin/otp/verify` is called with the correct code
- **THEN** `OtpCode.consumedAt` is set
- **AND** `createSession({ subjectId: admin.id, kind: "admin" })` is called
- **AND** the response is `200 { redirectTo: "/kalan-hesab/admin" }`

#### Scenario: Wrong or expired code returns 400
- **GIVEN** an incorrect or expired OTP
- **WHEN** POST `/api/kalan-hesab/admin/otp/verify` is called
- **THEN** the response is `400 { error: "کد تایید نامعتبر یا منقضی شده است" }`

#### Scenario: IOIV admin using this endpoint is rejected
- **GIVEN** the mobile belongs to an `Admin` with `role = ADMIN` (IOIV admin)
- **WHEN** POST `/api/kalan-hesab/admin/otp/verify` is called with a valid code
- **THEN** the response is `403 { error: "دسترسی مدیریت برای این شماره فعال نیست" }`
- **AND** no session is created

---

### Requirement: POST /api/kalan-hesab/admin/logout clears session
The system SHALL call `clearSession()` and respond with a 303 redirect to `/kalan-hesab/admin/login`.

#### Scenario: Logout clears session and redirects
- **WHEN** POST `/api/kalan-hesab/admin/logout` is called
- **THEN** the session cookie is cleared
- **AND** the response is `303` redirect to `/kalan-hesab/admin/login`
