## ADDED Requirements

### Requirement: Form renders as a 2-step wizard
The public form at `/kalan-hesab` SHALL display fields across two sequential steps. The user advances from step 1 to step 2 only after step-1 fields pass validation. A step indicator SHALL show the current step ("مرحله ۱ از ۲" / "مرحله ۲ از ۲").

#### Scenario: User lands on the form
- **WHEN** a user navigates to `/kalan-hesab`
- **THEN** step 1 is displayed with fields: نام و نام خانوادگی, نام شرکت یا برند, سمت سازمانی, اندازه تیم
- **THEN** step 2 fields (دغدغه, موبایل, submit) are NOT visible

#### Scenario: Advancing to step 2 with valid step-1 data
- **WHEN** the user fills all required step-1 fields and clicks "مرحله بعد"
- **THEN** the form transitions to step 2 showing: بزرگترین دغدغه, شماره موبایل, submit button

#### Scenario: Advancing to step 2 with missing step-1 data
- **WHEN** the user clicks "مرحله بعد" with one or more step-1 fields empty or invalid
- **THEN** inline validation errors appear for each invalid field
- **THEN** the user remains on step 1

#### Scenario: Going back to step 1 from step 2
- **WHEN** the user is on step 2 and clicks "مرحله قبل"
- **THEN** step 1 is displayed with all previously entered values preserved

### Requirement: Step 1 fields
Step 1 SHALL contain exactly: نام و نام خانوادگی (text), نام شرکت یا برند (text), سمت سازمانی (select with conditional free-text when "سایر" selected), اندازه تیم (select).

#### Scenario: سایر selected for position
- **WHEN** user selects "سایر" for سمت سازمانی
- **THEN** a free-text input appears for the user to describe their position

### Requirement: Step 2 fields
Step 2 SHALL contain exactly: بزرگترین دغدغه (select with conditional free-text when "سایر" selected), شماره موبایل (plain text, no OTP), submit button labelled "دریافت ارزیابی تخصصی".

#### Scenario: سایر selected for concern
- **WHEN** user selects "سایر" for بزرگترین دغدغه
- **THEN** a free-text input appears for the user to describe their concern

#### Scenario: Submit with invalid mobile
- **WHEN** user enters a mobile number not matching `/^09\d{9}$/` and clicks submit
- **THEN** an inline error appears under the mobile field
- **THEN** no API call is made
