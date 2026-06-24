## ADDED Requirements

### Requirement: Page renders header copy and logo
The page at `/kalan-hesab` SHALL render the Kalan Hesab logo (`public/kalan-hesab-logo.jpeg` via `next/image`), the headline, subtitle, and three value-prop items in RTL direction above the form card.

#### Scenario: Page loads with correct header text
- **WHEN** a user navigates to `/kalan-hesab`
- **THEN** the page displays headline `مدیران موفق، قبل از وقوع بحران تصمیم می‌گیرند.`, subtitle `درباره مالیات، ساختار مالی، گزارش‌های مدیریتی یا وضعیت مالی کسب‌وکار خود، با ما در ارتباط باشید.`, and three value props prefixed with ✓

### Requirement: Form contains all required fields in order
The form card SHALL contain seven fields in this order: نام و نام خانوادگی (text), نام شرکت یا برند (text), سمت سازمانی (select), اندازه تیم (select), بزرگترین دغدغه (select), شماره موبایل (tel), submit button.

#### Scenario: All fields present on load
- **WHEN** the page first renders
- **THEN** all seven fields are visible and in the specified order

### Requirement: سمت سازمانی select has correct options
The سمت سازمانی select SHALL offer exactly: مدیرعامل, عضو هیئت مدیره, مدیرمالی, صاحب کسب‌وکار, سایر.

#### Scenario: سایر reveals free-text field
- **WHEN** the user selects `سایر` in سمت سازمانی
- **THEN** a free-text input for `positionOther` slides in beneath the select using the `step-in` animation

#### Scenario: Non-سایر hides free-text field
- **WHEN** the user selects any option other than `سایر`
- **THEN** the `positionOther` input is not rendered

### Requirement: اندازه تیم select has correct options
The اندازه تیم select SHALL offer exactly: کمتر از ۱۰, ۱۰ تا ۵۰, ۵۰ تا ۲۰۰, بیش از ۲۰۰.

#### Scenario: Options are correct
- **WHEN** the user opens the اندازه تیم select
- **THEN** exactly four options are present matching the specified values

### Requirement: بزرگترین دغدغه select has correct options
The بزرگترین دغدغه select SHALL offer exactly: مدیریت مالی, مالیات, تامین اجتماعی, گزارشات مدیریتی, حسابرسی, تامین مالی, سایر.

#### Scenario: سایر reveals free-text field
- **WHEN** the user selects `سایر` in بزرگترین دغدغه
- **THEN** a free-text input for `concernOther` slides in beneath the select using the `step-in` animation

### Requirement: Mobile OTP verification flow
The mobile field SHALL follow a three-state flow: (A) mobile entry + send button, (B) OTP entry + verify button slides in, (C) verified confirmation replaces OTP row.

#### Scenario: Sending OTP transitions to state B
- **WHEN** the user enters a valid mobile number and clicks `ارسال کد`
- **THEN** `POST /api/kalan-hesab/otp/request` is called and the OTP input row slides in

#### Scenario: Successful OTP verify transitions to state C
- **WHEN** the user enters the correct OTP code and clicks `تایید شماره`
- **THEN** `POST /api/kalan-hesab/otp/verify` returns success and the OTP row is replaced with `✓ شماره تایید شد`

#### Scenario: Failed OTP verify shows error
- **WHEN** the user enters an incorrect OTP code and clicks `تایید شماره`
- **THEN** an error message is shown near the OTP field and the user can retry

### Requirement: Submit button disabled until mobile verified
The submit button (`دریافت ارزیابی تخصصی`) SHALL be disabled (`disabled` attribute set) as long as `mobileVerified` is false.

#### Scenario: Button disabled before verification
- **WHEN** the mobile has not been OTP-verified
- **THEN** the submit button is disabled and cannot be clicked

#### Scenario: Button enabled after verification
- **WHEN** `mobileVerified` is true
- **THEN** the submit button is enabled

### Requirement: Form submission calls API with verified flag
On submit, the page SHALL validate all fields with the Zod schema and call `POST /api/kalan-hesab/submit` with the form data plus `verified: true`.

#### Scenario: Successful submission
- **WHEN** all fields are valid, mobile is verified, and the API returns `{ ok: true }`
- **THEN** the form is replaced with the post-submit success screen

#### Scenario: Submission with invalid data
- **WHEN** any required field fails Zod validation
- **THEN** the API is not called and relevant field errors are shown

### Requirement: Post-submit success screen
After a successful submission, the page SHALL replace the form card with a centered success screen showing an animated checkmark scaling up followed by the thank-you message.

#### Scenario: Success screen content
- **WHEN** `submitted` state is true
- **THEN** an animated checkmark is displayed followed by: `ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت.`

### Requirement: Page-load staggered animation
All form fields SHALL fade and slide in on page load using the `step-in` keyframe with 80ms delay increments per field.

#### Scenario: Fields animate in on load
- **WHEN** the page renders for the first time
- **THEN** each field animates in sequentially with 80ms stagger, respecting `prefers-reduced-motion`

### Requirement: Input focus gold highlight
Every text input and select on the form SHALL display a gold border and `box-shadow: 0 0 0 3px rgb(200 152 32 / 0.2)` when focused.

#### Scenario: Focus highlight applied
- **WHEN** the user focuses any input or select
- **THEN** a gold border and glow are visible on that field

### Requirement: Submit button pending spinner
While the submit API call is in flight, the submit button SHALL display a spinner and be non-interactive.

#### Scenario: Spinner shown during submission
- **WHEN** the form is submitted and the API response is pending
- **THEN** a spinner renders inside the submit button and the button cannot be clicked again
