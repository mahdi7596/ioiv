## Why

The client needs a focused subdomain application for registration, paid document submission, and admin review while their existing WordPress website remains unchanged. Building this now creates a production-minded first version that can be delivered quickly without the overhead of a separate frontend/backend split.

## What Changes

- Add a full-stack Persian/RTL Next.js App Router web application for `sana.ioiv.ir`.
- Add mobile OTP authentication for users and manually created admins.
- Add a user registration flow that captures company national ID for new users.
- Add a multi-step application wizard with draft autosave, required document uploads, final review, and non-refundable payment confirmation.
- Add protected local file upload storage and file download authorization.
- Add Zarinpal payment initiation and callback verification for a fixed `3,000,000 Toman` fee.
- Add Ghasedak-backed SMS notifications through an internal SMS adapter, with console logging in development.
- Add an operational admin dashboard for submission review, status transitions, notes, protected file access, and exports.
- Add PostgreSQL persistence through Prisma, including users, admins, OTP codes, applications, files, payments, and status history.
- Add validation and smoke-test coverage for the highest-risk form and auth rules.

## Capabilities

### New Capabilities

- `otp-auth`: User and admin mobile OTP login, registration, session handling, and OTP expiry rules.
- `application-submission`: Multi-step company application drafts, validation, document upload references, status lifecycle, and final submission rules.
- `payment-processing`: Zarinpal payment request, callback verification, non-refundable acknowledgement, and payment state persistence.
- `admin-review`: Admin dashboard, submission search/filter/detail views, status changes, admin notes, status history, and SMS notifications.
- `submission-export`: Admin XLSX export with CSV fallback for filtered submissions.
- `protected-files`: Local upload storage, file validation, and authorization for file downloads.

### Modified Capabilities

- None.

## Impact

- Creates a new Next.js/TypeScript application in the repository root.
- Adds PostgreSQL/Prisma schema, migrations, seed script, and database access helpers.
- Adds dependencies including Prisma, Zod, React Hook Form, Zarinpal/Ghasedak integration code, session signing, XLSX export, and test tooling.
- Adds public, dashboard, admin, API, upload, payment callback, and export routes.
- Requires production environment variables for database, app URL, session secret, upload directory, Zarinpal, Ghasedak, and admin alert mobile.
