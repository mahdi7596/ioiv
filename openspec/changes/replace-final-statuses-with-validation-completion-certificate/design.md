## Context

Applications currently end in one of two terminal statuses: `ACCEPTED` or `REJECTED`. The admin UI shows both as separate review outcomes, and rejection has extra confirmation behavior. Users can edit only `DRAFT` and `NEEDS_EDIT` applications, while submitted/review/final statuses are read-only.

The client now wants the public and admin workflow to avoid approved/rejected language. Both final outcomes become one terminal status, `VALIDATION_COMPLETED`, labeled `پایان فرآیند اعتبارسنجی`. Selecting this final status also produces a user-facing PDF certificate that users can download from their dashboard.

The project already has protected application file storage through `ApplicationFile`, admin/user authorization checks for downloads, status history, status badges, admin status transitions, and user dashboard guidance. The design should reuse those patterns.

## Goals / Non-Goals

**Goals:**

- Replace accepted/rejected final statuses with one validation-completed final status throughout the application.
- Require a PDF certificate when an admin first completes validation.
- Let admins replace the certificate after validation is completed.
- Show the certificate to the owning user through an authorization-checked download link.
- Preserve current edit rules: only `DRAFT` and `NEEDS_EDIT` are editable.
- Migrate existing application and history records from `ACCEPTED`/`REJECTED` to `VALIDATION_COMPLETED`.

**Non-Goals:**

- Preserve an approved vs rejected distinction in the database, reports, or status history after migration.
- Add multi-certificate version history.
- Add in-browser PDF preview as a requirement; protected download is sufficient.
- Change payment behavior, fee rules, or the resubmission-without-repayment behavior for `NEEDS_EDIT`.
- Reopen completed validation applications for user edits.

## Decisions

### Use one new enum value: `VALIDATION_COMPLETED`

Replace `ACCEPTED` and `REJECTED` with `VALIDATION_COMPLETED` in `ApplicationStatus`.

Rationale: This matches the client wording and keeps the status model simple. Keeping accepted/rejected internally while only changing labels would preserve a distinction the client explicitly asked to merge.

Alternative considered: keep `ACCEPTED` and `REJECTED` in the database and map both labels to `پایان فرآیند اعتبارسنجی`. This was rejected because admin filters, exports, overview counts, and history would still expose two final states conceptually.

### Store the certificate as an application file with a reserved field key

Use the existing `ApplicationFile` storage and authorization path for the validation certificate, with a reserved field key such as `validationCertificate`.

Rationale: Existing storage already records file metadata, stores files under the upload directory, and protects downloads for the owning user and active admins. A reserved field key avoids adding a separate certificate model before there is a need for versioning or workflow metadata.

Alternative considered: add a dedicated `ValidationCertificate` model. This is more explicit but adds schema and authorization duplication for a single current certificate.

### Require PDF on first transition to validation completed

When an admin changes a `SUBMITTED` or `UNDER_REVIEW` application to `VALIDATION_COMPLETED`, the status change form must require a PDF file. The backend must enforce the same rule.

Rationale: A completed validation process without a downloadable certificate would create a broken user journey. Backend enforcement protects against bypassing the UI.

Alternative considered: allow completion without a PDF and let admins upload later. This was rejected because users could see the final state without the promised document.

### Permit admin replacement after completion

When an application is already `VALIDATION_COMPLETED`, the admin detail page should not offer another status transition, but it should allow replacing the validation certificate PDF.

Rationale: Mistaken or updated certificates are realistic operational errors. Replacement avoids needing to reopen the status workflow.

Alternative considered: make the certificate immutable. This is stricter but too brittle for normal admin operations.

### Remove rejection-specific confirmation

The current rejection confirmation asks the admin to type the company national ID before setting `REJECTED`. This should be removed because `REJECTED` no longer exists.

Rationale: The final status now means only "validation process ended." The remaining confirmation should focus on the irreversible final status and required certificate, not rejection semantics.

Alternative considered: require company national ID for `VALIDATION_COMPLETED`. This adds friction without matching the new meaning.

## Risks / Trade-offs

- Existing reporting loses approved/rejected distinction -> Confirm this is intentional in the proposal and migrate both values to `VALIDATION_COMPLETED`.
- PostgreSQL enum changes can be awkward to roll back -> Use an explicit migration sequence and test against local database before deployment.
- Status history entries that previously showed accepted/rejected will collapse to one final state -> Include this in migration expectations and client-facing notes.
- Admin could upload the wrong certificate -> Allow replacement after completion and keep protected downloads tied to the latest reserved field key.
- Non-PDF uploads could sneak in through direct requests -> Add server-side PDF-only validation for the certificate path.

## Migration Plan

1. Add `VALIDATION_COMPLETED` to the database enum.
2. Update existing `Application.status` rows from `ACCEPTED` and `REJECTED` to `VALIDATION_COMPLETED`.
3. Update existing `StatusHistory.previousStatus` and `StatusHistory.newStatus` rows from `ACCEPTED` and `REJECTED` to `VALIDATION_COMPLETED`.
4. Remove or replace application code references to `ACCEPTED` and `REJECTED`.
5. Adjust the Prisma enum to remove `ACCEPTED` and `REJECTED` after data has moved.
6. Deploy UI, action, tests, and export changes together with the migration.

Rollback is limited after data migration because accepted/rejected distinction is intentionally discarded. A rollback would require restoring from a pre-migration backup if that distinction must be recovered.

## Open Questions

- Should the certificate link text say `دانلود گواهی` or `دانلود فایل پایان فرآیند اعتبارسنجی`? Default recommendation: `دانلود گواهی`.
- Should old accepted/rejected history rows display as separate legacy labels anywhere? Default recommendation: no, keep the merged final status everywhere.
