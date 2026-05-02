# Registration and Review Platform Design

Date: 2026-04-28

## Goal

Build a focused registration, payment, and admin review platform for a client who already has a WordPress website. The new platform will run on a subdomain, authenticate users and admins by mobile OTP, collect company-focused application data, take a non-refundable payment through Zarinpal, and let admins review, export, and update submission statuses.

The implementation target is a production-minded first version that can be built quickly, with a more complete operational dashboard but without advanced file management or CMS-level admin polish.

## Chosen Architecture

Use a full-stack Next.js application with PostgreSQL.

- Frontend and backend: Next.js App Router
- Database: PostgreSQL
- ORM/query layer: Prisma or Drizzle
- Payment gateway: Zarinpal
- SMS: Ghasedak SMS provider through an internal adapter
- Upload storage: local VPS storage for version one
- Deployment: client VPS on `sana.ioiv.ir`
- Existing WordPress site remains on `clientdomain.com`

This avoids the extra coordination cost of a separate React frontend plus Nest.js/Node.js backend, which is too heavy for the current two-day implementation pressure.

## Product Scope

The platform has two sides:

1. User side for registration, login, application form, payment, status tracking, admin notes, and editing when requested.
2. Admin side for OTP login, reviewing applications, filtering/searching/exporting forms, changing statuses, and notifying users.

Users start from a landing/login page with one mobile field. The app checks whether that mobile already exists.

- Existing user: send OTP, verify OTP, log in.
- New user: show registration fields, send OTP, verify OTP, create user, log in.

After login, the user enters a dashboard where they can fill a multi-step application form. The form is mainly for company managers, so it includes both representative and company information.

For version one, each person/company combination may submit only once for the current form:

`mobile + national_code + company_national_id + application_round`

The `application_round` field should exist from the beginning, even if it has only one active value, so future rounds can allow repeat submissions without breaking old data.

## Payment Position

Payment should happen after the user completes the form and reviews a summary, but before final submission for admin review.

Reasons:

- Users understand what they are paying for before payment.
- Users are less likely to pay and then discover they cannot complete the form.
- It avoids refund complexity.
- The fee is non-refundable, so this must be clearly stated before payment.

The amount is fixed at `3,000,000 Toman`.

Before redirecting to Zarinpal, the user must confirm a required checkbox acknowledging the non-refundable payment.

## Application Statuses

Applications use these statuses:

- `draft`: user started but has not submitted.
- `pending_payment`: form completed but payment is not verified yet.
- `submitted`: payment verified and waiting for admin review.
- `under_review`: admin has started review.
- `needs_edit`: admin asks the user to edit and resubmit.
- `rejected`: final rejection.
- `accepted`: approved.

Users may edit applications in `draft` and `needs_edit`.

When an application is in `needs_edit`, the user can edit and resubmit without paying again.

When an application is `rejected`, the payment remains non-refundable and the submission is closed unless an admin later reopens it in a future enhancement.

## User Journey

1. User visits the subdomain.
2. User enters mobile number.
3. System checks whether the user exists.
4. Existing user receives OTP and logs in after verification.
5. New user fills registration fields, receives OTP, verifies, and is created.
6. User lands in the dashboard.
7. If no application exists for the active round, user starts an application.
8. User fills the multi-step form.
9. Each document group is its own step and the UI shows the current step, total steps, and step title.
10. User can move between steps and the app saves entered data, uploaded files, and the latest step as draft.
11. User reaches a summary/review step.
12. User confirms non-refundable payment terms.
13. User pays through Zarinpal.
14. Zarinpal redirects to the app callback URL.
15. Server verifies payment with Zarinpal.
16. Application status becomes `submitted`.
17. Admin receives an SMS about the new submitted application.
18. Admin reviews and changes status.
19. User receives SMS after each admin status change.
20. If status becomes `needs_edit`, user logs in, sees the admin note, edits, and resubmits without another payment.

## Registration and Application Fields

Initial fields were extracted from `saana.docx`. These may change, but they should be treated as required for the first implementation unless the client revises them.

Registration:

- Company name / `نام شرکت`.
- Company national ID / `شناسه ملی شرکت`.
- Company contact full name / `نام و نام خانوادگی رابط شرکت`.
- Company contact national code / `کد ملی رابط شرکت`.

Registration database fields:

- `User.companyName`: company name entered during first-time registration.
- `User.companyNationalId`: company national ID entered during first-time registration.
- `User.companyContactFullName`: full name for the company contact.
- `User.companyContactNationalCode`: national code for the company contact.
- `Application.companyName`: copied from `User.companyName` when the active-round draft application is created.
- `Application.companyContactFullName`: copied from `User.companyContactFullName` when the active-round draft application is created.
- `Application.companyContactNationalCode`: copied from `User.companyContactNationalCode` when the active-round draft application is created.

The `User` fields are the registration source of truth. The matching `Application` fields preserve the registration snapshot that belongs to a submitted application and are available in admin review/search/export.

Application form fields:

- Step 1: Tax declaration / `اظهارنامه مالیاتی`. This step is required. Show three default year/file rows because users must provide at least the last three years. Include a plus button so users can add more year/file rows.
- Step 2: Audited financial statements / `صورت‌های مالی حسابرسی شده`. This step is optional. Show one default year/file row and include a plus button so users can add more year/file rows.
- Step 3: Trial balance / `تراز کل و معین`. This step is required and includes upload fields for `تراز کل` and `تراز معین`.
- Step 4: Credit report / `گزارش اعتبارسنجی`. This step is required. Show this instruction text to users: `با مراجعه به سایت https://www.mycredit.ir/ نسبت به تهیه گزارش اعتبارسنجی به تاریخ روز برای شرکت ، مدیرعامل و یکی از اعضای هیات مدیره ترجیحا رئیس یا نایب رئیس هیات مدیره اقدام نمائید.` Required uploads:
  - company / `گزارش اعتبار سنجی شرکت`
  - CEO / `گزارش اعتبار سنجی مدیرعامل`
  - one board member, preferably chair or vice chair / `گزارش اعتبار سنجی یکی از اعضای هیات مدیره`
- Step 5: Final confirmation and payment. Show a summary, non-refundable payment terms checkbox, and payment action.

File management is not part of version one. Uploaded files only need to be stored, associated with the application, and downloadable by admins.

## Validation

Validation must exist in both frontend and backend.

Frontend validation:

- Required fields show a `*`.
- User can move between steps, but invalid required fields must be clearly shown and the final submission/payment flow is blocked until all required steps are valid.
- User cannot submit final form if required data is missing.
- Inline errors appear under fields.
- Error messages should be clear and mobile-friendly, preferably Persian where appropriate.
- National code must be exactly 10 digits.
- Iranian mobile number must match the expected mobile format.
- Company national ID is required during registration.
- Tax declaration requires at least three valid year/file rows.
- Audited financial statements are optional, but if the user adds a row, that row must have both year and file.
- Trial balance requires both `تراز کل` and `تراز معین` uploads.
- Credit report requires all three credit report uploads.
- Upload fields validate accepted file types and max file size.
- Payment confirmation checkbox is required before redirecting to Zarinpal.

Backend validation:

- Re-check all required fields and formats.
- Enforce the one-submission uniqueness rule.
- Reject invalid file types and sizes.
- Prevent unauthorized edits.
- Prevent users from manually manipulating payment/submission states.
- Verify Zarinpal payment server-side before marking an application as submitted.
- Save draft progress, including the latest step, so users can leave and return later.

## Notifications

SMS notifications are required for:

- User OTP login/register.
- Admin OTP login.
- New paid user submission sent to admins.
- Any admin status change sent to the user.
- `needs_edit` and `rejected` status changes, including a prompt to log in and read the admin note if a note exists.

SMS provider is Ghasedak. The app should still expose an internal SMS service adapter so OTP, admin alerts, and status-change messages all use one interface. In development, SMS can be logged to the console. In production, the Ghasedak implementation can be enabled with credentials from environment variables.

OTP codes are 4 digits and valid for 2 minutes.

## Admin Model

Admins are created manually. There is no public admin registration.

Admin fields:

- name
- mobile
- active/inactive
- role, such as `admin` or `super_admin`

Admin login flow:

1. Admin enters mobile number.
2. App checks that the mobile belongs to an active admin.
3. App sends OTP.
4. Admin verifies OTP.
5. App creates an admin session.

## Admin Dashboard

The admin dashboard should be useful and operational rather than CMS-polished.

Core pages:

- Admin login by mobile OTP.
- Overview dashboard with counts:
  - total submissions
  - submitted/waiting count
  - needs edit count
  - accepted count
  - rejected count
- Submissions table:
  - search by mobile, representative name, national code, company name, and company national ID
  - filter by status
  - sort by newest/oldest
  - export CSV/XLSX
- Submission detail page:
  - representative information
  - company information
  - form answers
  - uploaded file download links
  - payment status and tracking/reference ID
  - status history
  - status change control
  - optional admin note

Exporting submissions is required. XLSX is preferred for office workflows, with CSV acceptable as a fallback if needed.

## Data Model

Expected tables:

- `users`
- `admins`
- `otp_codes`
- `applications`
- `application_files`
- `payments`
- `status_history`

Important application fields:

- user ID
- mobile
- national code
- company national ID
- application round
- status
- representative fields
- company fields
- form data fields
- current admin note
- timestamps

Important payment fields:

- application ID
- amount
- gateway name
- authority/token
- reference ID
- status
- raw callback/verification metadata
- timestamps

Important status history fields:

- application ID
- previous status
- new status
- changed by admin ID
- optional note
- timestamp

## Security and Access Rules

- Users can access only their own dashboard and application.
- Users can edit only when application status is `draft` or `needs_edit`.
- Users cannot change payment status manually.
- Users cannot submit for review until payment is verified.
- Admin routes require active admin session.
- Admin status changes must be recorded in status history.
- Uploaded files must not be publicly guessable by URL.
- Environment variables store secrets such as database URL, Zarinpal merchant ID, SMS credentials, and session secrets.

## Deployment

Use a subdomain on the client VPS.

Recommended URL:

- `sana.ioiv.ir`

Existing WordPress stays on:

- `clientdomain.com`

Server shape:

- Nginx routes `clientdomain.com` to WordPress.
- Nginx routes `sana.ioiv.ir` to the Next.js app.
- Next.js runs as a Node process, managed by PM2 or Docker.
- PostgreSQL runs on the VPS or a managed database.
- Uploaded files live in a protected uploads directory.
- Zarinpal callback URL points to the subdomain.
- Ghasedak SMS credentials are configured through environment variables.

Access needed from the client:

- VPS IP
- SSH/SFTP username
- password or SSH key
- sudo access if possible
- domain/DNS access, or someone who can create the subdomain DNS record
- current web server type, such as Nginx or Apache
- Zarinpal merchant ID
- SMS panel credentials when selected

Mac supports SSH/SFTP. If the client asks about SSTP, that is a VPN protocol and is separate from normal deployment access.

## Out of Scope for Version One

- Advanced file management UI.
- Public admin registration.
- CMS-quality admin customization.
- Multiple application types or multiple active application rounds.
- Refund flow.
- Complex admin roles and permissions.
- User-created multiple submissions in the same active round.

## Open Inputs Needed

- Confirm whether the extracted `saana.docx` fields are final.
- Required upload fields, accepted file types, and file size limits.
- Ghasedak API credentials and sender/template details.
- VPS operating system and web server details.
- Zarinpal merchant credentials.
