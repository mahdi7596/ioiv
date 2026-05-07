## 1. Data Model and Migration

- [x] 1.1 Add `VALIDATION_COMPLETED` to `ApplicationStatus` and remove application code references to `ACCEPTED` and `REJECTED`.
- [x] 1.2 Create a Prisma/PostgreSQL migration that maps existing `Application.status` values from `ACCEPTED` and `REJECTED` to `VALIDATION_COMPLETED`.
- [x] 1.3 Update existing `StatusHistory.previousStatus` and `StatusHistory.newStatus` values from `ACCEPTED` and `REJECTED` to `VALIDATION_COMPLETED`.
- [x] 1.4 Regenerate Prisma client and verify generated enum types compile.
- [x] 1.5 Update seed/demo data to use `VALIDATION_COMPLETED` and include a realistic completed-validation scenario.

## 2. Status Labels, Transitions, and Access Rules

- [x] 2.1 Update application status labels and badge variants so `VALIDATION_COMPLETED` displays as `پایان فرآیند اعتبارسنجی`.
- [x] 2.2 Update allowed admin transitions so `SUBMITTED` can move to `UNDER_REVIEW`, `NEEDS_EDIT`, or `VALIDATION_COMPLETED`, and `UNDER_REVIEW` can move to `NEEDS_EDIT` or `VALIDATION_COMPLETED`.
- [x] 2.3 Keep `DRAFT` and `NEEDS_EDIT` as the only user-editable statuses and verify `VALIDATION_COMPLETED` is read-only.
- [x] 2.4 Remove rejection-specific confirmation validation and UI copy.
- [x] 2.5 Update status history display and SMS/status-change copy to avoid accepted/rejected wording.

## 3. Admin Certificate Workflow

- [x] 3.1 Add admin-side PDF-only validation for validation certificate uploads.
- [x] 3.2 Update the admin status change form to reveal a required PDF upload when `VALIDATION_COMPLETED` is selected.
- [x] 3.3 Update the status change server action to atomically store the certificate, set `VALIDATION_COMPLETED`, create status history, and notify the user.
- [x] 3.4 Show validation certificate metadata and download action on the admin submission detail page.
- [x] 3.5 Add a replacement certificate control for applications already in `VALIDATION_COMPLETED`.
- [x] 3.6 Ensure replacement uploads update the active certificate shown to users without offering another status transition.

## 4. User Dashboard and Protected Download

- [x] 4.1 Include the current validation certificate in the user dashboard application query.
- [x] 4.2 Update user dashboard status guidance for `VALIDATION_COMPLETED`.
- [x] 4.3 Display a certificate download action when the validation certificate exists.
- [x] 4.4 Ensure no broken certificate action appears when the certificate is missing.
- [x] 4.5 Verify certificate downloads use existing authorization checks for owning users and active admins.

## 5. Admin Lists, Filters, Export, and Copy

- [x] 5.1 Update admin overview cards to show a single validation completed count instead of accepted and rejected counts.
- [x] 5.2 Update admin submission filters and table badges to use `VALIDATION_COMPLETED`.
- [x] 5.3 Update export status output to use the new final status label/value consistently.
- [x] 5.4 Update any Persian UI copy that still references `تایید شده` or `رد شده`.

## 6. Tests and Verification

- [x] 6.1 Update status label, transition, access/editability, and status-change validation tests.
- [x] 6.2 Add tests for required PDF upload when completing validation and rejection of missing/non-PDF certificates.
- [x] 6.3 Add tests for admin certificate replacement behavior.
- [x] 6.4 Add tests for protected certificate download authorization.
- [x] 6.5 Add user dashboard rendering tests for completed validation with and without a certificate.
- [x] 6.6 Run the full test suite and relevant build/type checks.
- [x] 6.7 Manually verify admin finalization, certificate replacement, user dashboard download, filters, export, and migration behavior.
