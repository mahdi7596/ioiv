## VERIFIED Requirements

### Requirement: Full form submission flow
The public form at `/kalan-hesab` SHALL complete the full flow: fill all fields → request OTP → verify OTP → submit → display success state.

#### Scenario: Happy path end-to-end
- **WHEN** a user fills all form fields with valid data, requests an OTP, enters the correct code, and clicks دریافت ارزیابی تخصصی
- **THEN** the submission is saved to `KalanHesabSubmission` and the success message is displayed: "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت."

---

### Requirement: SMS delivery to user mobile
After a successful submission, `createKalanHesabUserSmsMessage(mobile)` SHALL be called and the user's mobile SHALL receive the thank-you SMS.

#### Scenario: User receives thank-you SMS
- **WHEN** the form is submitted successfully
- **THEN** the submitter's mobile receives the message via the GHASEDAK_KALAN_HESAB_USER_TEMPLATE

---

### Requirement: SMS delivery to admin 09224872163
After a successful submission, `createKalanHesabAdminSmsMessage("09224872163", fullName)` SHALL be called.

#### Scenario: First admin receives notification
- **WHEN** the form is submitted with fullName "X"
- **THEN** 09224872163 receives: "فرم جدید در کالان حساب ثبت شد - X"

---

### Requirement: SMS delivery to admin 09390649614
After a successful submission, `createKalanHesabAdminSmsMessage("09390649614", fullName)` SHALL be called.

#### Scenario: Second admin receives notification
- **WHEN** the form is submitted with fullName "X"
- **THEN** 09390649614 receives: "فرم جدید در کالان حساب ثبت شد - X"

---

### Requirement: OTP rate limiting
`POST /api/kalan-hesab/otp/request` SHALL reject a second OTP request for the same mobile made within 90 seconds of the first.

#### Scenario: Second request within 90s is rejected
- **WHEN** a user requests an OTP and immediately requests another for the same mobile
- **THEN** the second request returns an error (not 200) and no second SMS is sent

#### Scenario: Request after 90s succeeds
- **WHEN** 90 seconds have elapsed since the first OTP request
- **THEN** a new OTP request for the same mobile succeeds

---

### Requirement: "سایر" conditional fields appear and are saved
When the user selects "سایر" for **سمت سازمانی** or **بزرگترین دغدغه**, a free-text input SHALL slide in and its value SHALL be saved in `positionOther` / `concernOther` on the `KalanHesabSubmission` record.

#### Scenario: positionOther is saved
- **WHEN** the user selects "سایر" for سمت سازمانی, enters a custom value, and submits
- **THEN** the submission in the admin panel shows the custom value in the سمت column

#### Scenario: concernOther is saved
- **WHEN** the user selects "سایر" for بزرگترین دغدغه, enters a custom value, and submits
- **THEN** the submission in the admin panel shows the custom value in the دغدغه column

---

### Requirement: Submit button disabled until OTP verified
The **دریافت ارزیابی تخصصی** button SHALL be in a disabled state until `POST /api/kalan-hesab/otp/verify` has returned successfully.

#### Scenario: Button is disabled before OTP verification
- **WHEN** all form fields are filled but OTP has not been verified
- **THEN** the submit button is disabled and cannot be clicked

#### Scenario: Button is enabled after OTP verification
- **WHEN** the OTP is verified (✓ شماره تایید شد appears)
- **THEN** the submit button becomes enabled

---

### Requirement: Both admin numbers can log into /kalan-hesab/admin
The OTP login flow at `/kalan-hesab/admin/login` SHALL authenticate both seeded `KALAN_HESAB_ADMIN` accounts and redirect to `/kalan-hesab/admin`.

#### Scenario: 09224872163 authenticates successfully
- **WHEN** admin 09224872163 enters their mobile, receives OTP, and submits the code
- **THEN** a session is created and they are redirected to `/kalan-hesab/admin`

#### Scenario: 09390649614 authenticates successfully
- **WHEN** admin 09390649614 enters their mobile, receives OTP, and submits the code
- **THEN** a session is created and they are redirected to `/kalan-hesab/admin`

---

### Requirement: Search filters submissions correctly
The search input on `/kalan-hesab/admin` SHALL filter the submissions table by `fullName`, `companyName`, and `mobile`.

#### Scenario: Search by fullName
- **WHEN** the admin enters part of a submitter's name in the search field
- **THEN** only rows matching that name are shown

#### Scenario: Search by companyName
- **WHEN** the admin enters part of a company name
- **THEN** only matching rows are shown

#### Scenario: Search by mobile
- **WHEN** the admin enters part of a mobile number
- **THEN** only matching rows are shown

#### Scenario: Clear search shows all
- **WHEN** the search field is empty and the form is submitted
- **THEN** all submissions are shown

---

### Requirement: Excel export downloads with all columns populated
`GET /api/kalan-hesab/admin/export` SHALL return a valid `.xlsx` file containing all submissions with columns: نام و نام خانوادگی, نام شرکت, سمت, اندازه تیم, دغدغه, موبایل, تاریخ ثبت.

#### Scenario: Export file is valid and complete
- **WHEN** the admin clicks the دریافت Excel button
- **THEN** a `.xlsx` file downloads, opens without error, and all 7 columns are present with correct data

---

### Requirement: Mobile-responsive layout
The form at `/kalan-hesab` SHALL be fully usable on a mobile viewport (375px width) with no horizontal overflow or inaccessible elements.

#### Scenario: Form is usable on mobile
- **WHEN** the page is viewed at 375px width
- **THEN** all form fields, the OTP section, and the submit button are visible and interactive without horizontal scrolling

---

### Requirement: IOIV — public page loads
The existing `/` route SHALL load without errors after the Kalan Hesab changes.

#### Scenario: Public page is unaffected
- **WHEN** a visitor navigates to `/`
- **THEN** the page renders correctly with no gold theme applied

---

### Requirement: IOIV — dashboard loads for authenticated users
`/dashboard` SHALL continue to work for IOIV users with a valid session.

#### Scenario: Dashboard is unaffected
- **WHEN** an authenticated IOIV user navigates to `/dashboard`
- **THEN** the page renders correctly

---

### Requirement: IOIV — admin panel loads for IOIV admins
`/admin` SHALL continue to work for admins with the `ADMIN` or `SUPER_ADMIN` role.

#### Scenario: IOIV admin panel is unaffected
- **WHEN** an IOIV admin navigates to `/admin`
- **THEN** the admin panel renders correctly

---

### Requirement: Gold theme does NOT appear on IOIV routes
The `.kalan-hesab-theme` CSS class and the gold CSS variables (`--color-primary: #C89820` etc.) SHALL NOT be applied to any IOIV route.

#### Scenario: No gold bleed on IOIV routes
- **WHEN** `/`, `/dashboard`, or `/admin` are inspected in a browser
- **THEN** no gold colors appear — buttons, borders, and backgrounds use the standard IOIV palette

---

### Requirement: Existing OTP flows still work
The `USER_LOGIN` and `ADMIN_LOGIN` OTP flows SHALL function correctly after adding `KALAN_HESAB_VERIFICATION` to `OtpPurpose` and `KALAN_HESAB_ADMIN` to `UserRole`.

#### Scenario: USER_LOGIN OTP flow works
- **WHEN** an IOIV user requests and verifies a USER_LOGIN OTP
- **THEN** a user session is created and `/dashboard` is accessible

#### Scenario: ADMIN_LOGIN OTP flow works
- **WHEN** an IOIV admin requests and verifies an ADMIN_LOGIN OTP
- **THEN** an admin session is created and `/admin` is accessible
