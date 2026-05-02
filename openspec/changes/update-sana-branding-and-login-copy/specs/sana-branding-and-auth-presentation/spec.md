## ADDED Requirements

### Requirement: Updated SANA service name
The system SHALL display the public-facing service name as `سامانه اعتبار سنجی سانا` on public/auth-facing branding surfaces.

#### Scenario: Public auth page shows updated service name
- **WHEN** an unauthenticated applicant opens the public login page
- **THEN** the page displays `سامانه اعتبار سنجی سانا`
- **AND** the page does not display `سامانه اعتبار سنجی نفت ایران (سانا)`

#### Scenario: Admin auth page shows updated service name
- **WHEN** an admin opens the admin login page
- **THEN** the page displays `سامانه اعتبار سنجی سانا`
- **AND** the page does not display `سامانه اعتبار سنجی نفت ایران (سانا)`

### Requirement: Public login page explains the supplier credit evaluation process
The public login page SHALL replace the previous document-tracking headline, description, and three-step guidance with the supplied supplier long-list financial and credit evaluation explanation.

#### Scenario: Applicant sees the new evaluation copy
- **WHEN** an unauthenticated applicant opens the public login page
- **THEN** the page explains that applicants for Ministry of Oil long-list supplier membership will be financially and credit evaluated
- **AND** the page explains that the credit report result will be sent online to the Ministry of Oil without applicant follow-up
- **AND** the page explains that companies can contact support for ambiguity or possible issues

#### Scenario: Old public guidance is removed
- **WHEN** an unauthenticated applicant opens the public login page
- **THEN** the page does not show the old heading `ثبت مدارک شرکت و پیگیری وضعیت پرونده`
- **AND** the page does not show the old three-step labels `ورود با موبایل`, `تکمیل مدارک`, and `بررسی و نتیجه` as the primary public guidance block

### Requirement: Support phone number is callable
The public login page SHALL render the support phone number `02186122370` as a telephone link while preserving the visible internal extension instruction `داخلی 3`.

#### Scenario: Applicant activates support phone link
- **WHEN** an unauthenticated applicant views the support sentence on the public login page
- **THEN** the phone number `02186122370` is presented as a clickable link
- **AND** the link target uses the `tel:` scheme for `02186122370`
- **AND** the visible text includes `داخلی 3`

### Requirement: IOIV logo is used for app branding
The system SHALL use the provided IOIV logo as a visible brand asset on login cards, shared sidebars, and browser icon surfaces.

#### Scenario: User login card shows IOIV logo
- **WHEN** an unauthenticated applicant opens the public login page
- **THEN** the IOIV logo appears above the login form card content
- **AND** the logo has meaningful accessible alternative text

#### Scenario: Admin login card shows IOIV logo
- **WHEN** an admin opens the admin login page
- **THEN** the IOIV logo appears above the admin login form card content
- **AND** the logo has meaningful accessible alternative text

#### Scenario: Authenticated sidebars show IOIV logo
- **WHEN** an applicant or admin views an authenticated panel using the shared app shell
- **THEN** the sidebar brand displays the IOIV logo
- **AND** the existing panel label still identifies whether the viewer is in the applicant panel or admin panel

#### Scenario: Browser icon uses IOIV logo
- **WHEN** the application is loaded in a browser
- **THEN** the browser icon/fav icon uses the IOIV logo asset

### Requirement: Removed login-card instructional copy
The applicant login card SHALL remove the requested mobile-entry heading and explanatory paragraph while preserving the working authentication form.

#### Scenario: Applicant login card omits removed copy
- **WHEN** an unauthenticated applicant opens the public login page
- **THEN** the login card does not display `شماره موبایل خود را وارد کنید`
- **AND** the login card does not display `اگر قبلا ثبت‌نام کرده باشید وارد داشبورد می‌شوید؛ در غیر این صورت شناسه ملی شرکت را بعد از تایید کد وارد می‌کنید.`

#### Scenario: Applicant can still request OTP
- **WHEN** an unauthenticated applicant enters a valid mobile number after the copy update
- **THEN** the existing OTP request flow remains available without changing authentication behavior
