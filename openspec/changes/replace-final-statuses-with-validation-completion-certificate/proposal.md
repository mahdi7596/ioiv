## Why

The client no longer wants separate accepted and rejected terminal outcomes. Both final review outcomes should be represented as a single final validation-completed state, with an admin-provided PDF certificate made available to the user.

## What Changes

- **BREAKING** Replace the `ACCEPTED` and `REJECTED` application statuses with one terminal status: `VALIDATION_COMPLETED`.
- Show the final status with the Persian label `پایان فرآیند اعتبارسنجی`.
- Update admin status transitions so admins can complete validation from submitted or under-review applications.
- Require admins to upload a PDF certificate when setting the application to `VALIDATION_COMPLETED`.
- Allow admins to replace the validation certificate after the final status is saved.
- Display the validation certificate in the user dashboard when available, with a protected download link.
- Preserve existing edit behavior: users can edit only in `DRAFT` and `NEEDS_EDIT`; the new final status is read-only.
- Migrate existing `ACCEPTED` and `REJECTED` records and status history entries to `VALIDATION_COMPLETED`.
- Remove rejection-specific confirmation behavior because the system no longer records a rejected terminal status.

## Capabilities

### New Capabilities

### Modified Capabilities

- `application-submission`: Final status semantics and editability rules change from accepted/rejected to a single validation-completed terminal state.
- `admin-review`: Admin overview counts, filters, status transitions, final status UX, and status history behavior change to support one final validation-completed status and certificate upload.
- `protected-files`: Admin-uploaded validation certificate PDFs must be stored and served through protected file download rules.

## Impact

- Prisma schema and migrations for `ApplicationStatus`, existing application rows, and status history rows.
- Admin status labels, badges, overview cards, filters, submission list/detail pages, status transition validation, confirmation modal, and status change action.
- Admin certificate upload endpoint or action, storage metadata, validation, replacement behavior, and tests.
- User dashboard status guidance and certificate download display.
- Export data that includes application status.
- SMS/status-change messaging copy if it references final outcomes.
- Automated tests for status labels, transitions, access/editability, file authorization, admin finalization, dashboard display, and migration expectations.
