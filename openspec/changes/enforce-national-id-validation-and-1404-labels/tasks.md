## 1. Data Audit

- [x] 1.1 Add or run a production-safe duplicate report for normalized `User.companyNationalId` values, excluding null/empty values.
- [x] 1.2 Review reported duplicate `شناسه ملی` records with the client or owner before adding a unique database constraint.

## 2. National ID Validation

- [x] 2.1 Update `companyNationalIdSchema` to normalize digits and accept exactly 10 or 11 digits with a Persian validation message.
- [x] 2.2 Update registration form state handling so users can enter/paste more than 11 digits and see the too-long inline error instead of silently clipping input.
- [x] 2.3 Show an inline frontend error next to `شناسه ملی شرکت` when the normalized value has fewer than 10 or more than 11 digits.
- [x] 2.4 Block registration submission on the frontend while the national ID length is invalid.
- [x] 2.5 Add or update validation tests for 10-digit, 11-digit, short, long, and Persian/Arabic-digit national ID inputs.

## 3. National ID Uniqueness

- [x] 3.1 Add a normalized duplicate lookup before creating a new user during OTP verification registration.
- [x] 3.2 Return a Persian duplicate-national-ID error when another user already has the submitted `شناسه ملی شرکت`.
- [x] 3.3 Add a Prisma/database migration that enforces uniqueness for non-null `User.companyNationalId` after duplicate production data is resolved.
- [x] 3.4 Catch database unique-constraint failures during registration and convert them to the same Persian duplicate-national-ID error.
- [x] 3.5 Add auth action tests covering duplicate lookup and concurrent/constraint-level duplicate rejection.

## 4. Year 1404 Labels

- [x] 4.1 Update the application wizard trial-balance step title to mention `1404`.
- [x] 4.2 Update `تراز کل` and `تراز معین` upload labels to mention year `1404`.
- [x] 4.3 Update final review/missing-file copy for trial balance to mention year `1404`.
- [x] 4.4 Update admin file labels for trial balance uploads to mention year `1404` while preserving the existing trial-balance grouping.
- [x] 4.5 Update export or seed labels only if they surface trial-balance labels to users/admins.

## 5. Verification

- [x] 5.1 Run unit tests for validation and auth actions.
- [x] 5.2 Run lint/typecheck for the touched files.
- [x] 5.3 Manually verify the registration form shows inline errors for short/long national IDs and rejects duplicate national IDs.
- [x] 5.4 Manually verify applicant final review and admin submission details show `1404` for trial-balance labels.
