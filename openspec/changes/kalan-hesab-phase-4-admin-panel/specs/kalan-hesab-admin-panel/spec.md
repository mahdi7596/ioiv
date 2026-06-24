## ADDED Requirements

### Requirement: Login page renders with gold theme
The page at `/kalan-hesab/admin/login` SHALL render inside `<main className="auth-page">` with two sections: `.auth-info` (left) and `.auth-panel` (right). The Kalan Hesab logo SHALL be displayed via `next/image` using `src="/kalan-hesab-logo.jpeg"`. The gold palette SHALL be applied automatically via the parent `.kalan-hesab-theme` wrapper.

#### Scenario: Login page loads correctly
- **WHEN** a visitor navigates to `/kalan-hesab/admin/login`
- **THEN** the page renders with the Kalan Hesab logo, gold-accented inputs, and the step-1 mobile entry form

### Requirement: Login — mobile entry step
In step 1, the login page SHALL show a mobile number input (type="tel", dir="ltr", inputMode="numeric", maxLength=11) and a submit button labeled `دریافت کد تایید`. Submitting calls `POST /api/kalan-hesab/admin/otp/request` with `{ mobile }`.

#### Scenario: Non-admin mobile returns error
- **WHEN** the user enters a mobile not registered as `KALAN_HESAB_ADMIN` and submits
- **THEN** the API returns 403 and the page shows the error message near the mobile field

#### Scenario: Valid mobile transitions to step 2
- **WHEN** the API returns `{ ok: true }`
- **THEN** `otpSent` is set to true, the mobile input becomes disabled, and the OTP code field appears

### Requirement: Login — OTP entry step
In step 2, the login page SHALL show the mobile input (disabled), an OTP code input (type="tel", dir="ltr", inputMode="numeric", maxLength=4, centered), and a submit button labeled `ورود به پنل مدیریت`. A `تغییر شماره` ghost button SHALL allow returning to step 1. Submitting calls `POST /api/kalan-hesab/admin/otp/verify` with `{ mobile, code }`.

#### Scenario: Wrong OTP shows error
- **WHEN** the user enters an incorrect code and submits
- **THEN** the API returns 400 and the page shows the error message near the OTP field

#### Scenario: Correct OTP redirects to admin panel
- **WHEN** the API returns `{ redirectTo: "/kalan-hesab/admin" }`
- **THEN** `window.location.assign(data.redirectTo)` navigates the browser to `/kalan-hesab/admin`

### Requirement: Admin submissions page is route-protected
The page at `/kalan-hesab/admin` SHALL call `getSession()` server-side. If the session is absent, `kind !== "admin"`, or the resolved admin is not active or lacks `KALAN_HESAB_ADMIN` role, the page SHALL `redirect("/kalan-hesab/admin/login")` before rendering any content.

#### Scenario: Unauthenticated access redirects
- **WHEN** a user visits `/kalan-hesab/admin` with no session cookie
- **THEN** they are redirected to `/kalan-hesab/admin/login`

### Requirement: Admin submissions page header
The page header SHALL display the Kalan Hesab logo (120×60), the authenticated admin's mobile number (dir="ltr"), and a خروج button inside `<form method="POST" action="/api/kalan-hesab/admin/logout">`.

#### Scenario: خروج clears session and redirects
- **WHEN** the admin clicks خروج
- **THEN** `POST /api/kalan-hesab/admin/logout` is called, the session is cleared, and the browser follows the 303 redirect to `/kalan-hesab/admin/login`

### Requirement: Search filters submissions
The toolbar SHALL include a `<form method="GET" action="/kalan-hesab/admin">` with a search input (name="search") and a submit button. Submitting updates the URL to `?search=<query>`. The server component reads `searchParams.search` and passes it as an OR filter on `fullName`, `companyName`, and `mobile` in the Prisma query.

#### Scenario: Search by name
- **WHEN** the admin enters a name and submits the search form
- **THEN** the page reloads with `?search=<name>` and only matching rows appear in the table

#### Scenario: Empty search returns all rows
- **WHEN** the search param is absent or empty
- **THEN** all submissions are returned ordered by `createdAt DESC`

### Requirement: Excel export
The toolbar SHALL include an `<a href="/api/kalan-hesab/admin/export">` link styled as a button. Clicking it triggers the `GET /api/kalan-hesab/admin/export` route which streams a `kalan-hesab-submissions.xlsx` file download.

#### Scenario: Export downloads all submissions
- **WHEN** the admin clicks دریافت Excel
- **THEN** the browser downloads `kalan-hesab-submissions.xlsx` containing all submissions with columns: نام و نام خانوادگی, نام شرکت, سمت, اندازه تیم, دغدغه, موبایل, تاریخ ثبت

### Requirement: Submissions table has 7 columns
The table (`<table className="data-table" dir="rtl">`) SHALL render 7 columns in order: نام و نام خانوادگی, نام شرکت, سمت, اندازه تیم, دغدغه, موبایل, تاریخ ثبت. For `position` and `mainConcern`, if the value is `"سایر"` and a free-text override exists (`positionOther` / `concernOther`), the free-text value SHALL be shown instead. Dates SHALL be rendered using `toLocaleDateString("fa-IR")`. Mobile numbers SHALL have `dir="ltr"`.

#### Scenario: سایر with free-text shows override
- **WHEN** a submission has `position = "سایر"` and `positionOther = "مدیر ارشد"`
- **THEN** the سمت cell displays `مدیر ارشد`

#### Scenario: Empty state when no submissions
- **WHEN** no submissions exist (or search returns no results)
- **THEN** the table body shows a single full-width row with appropriate Persian text
