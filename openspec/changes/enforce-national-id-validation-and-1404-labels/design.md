## Context

The application is a Persian RTL Next.js App Router system with OTP-based user registration, Prisma/PostgreSQL persistence, and an application wizard for document upload and payment. Registration currently stores `User.companyNationalId`, but uniqueness is not guaranteed at the database level and duplicate values have already been observed. Validation currently normalizes Persian/Arabic digits to ASCII digits, but the company national ID rule is exactly 11 digits while the new business rule accepts 10 or 11 digits.

The `تراز کل و معین` document step currently labels the required uploads as `تراز کل` and `تراز معین`. The client wants this section to explicitly ask for year `1404`.

## Goals / Non-Goals

**Goals:**
- Accept only 10- or 11-digit `شناسه ملی شرکت` values after digit normalization.
- Show immediate inline frontend validation for national IDs shorter than 10 digits or longer than 11 digits.
- Reject registration when the normalized national ID already belongs to another user.
- Add a database-level uniqueness guard after existing duplicate records are reviewed or cleaned up.
- Update trial-balance user-facing labels/copy to mention `1404`.

**Non-Goals:**
- Change OTP request or verification semantics outside registration validation.
- Merge or delete existing duplicated users automatically.
- Change application-round behavior or payment/submission rules.
- Validate the official Iranian national ID checksum unless the business later requests it.

## Decisions

1. Normalize first, validate second.
   - Use the existing digit normalization helper before length validation, duplicate lookup, storage, and any future unique index comparison.
   - Alternative considered: preserve the raw user-entered string. That would allow Persian/Arabic digit variants or spacing to bypass duplicate checks.

2. Enforce validation in both frontend and backend.
   - Frontend validation gives applicants immediate inline feedback and blocks avoidable submissions.
   - Backend validation remains authoritative for API/server-action calls and race conditions.
   - Alternative considered: frontend-only validation. That would not protect direct calls, stale clients, or concurrent submissions.

3. Use a database uniqueness constraint on `User.companyNationalId` after data cleanup.
   - Application checks improve error messages, but the database must be the final guard against repeated national IDs.
   - Because duplicates already exist, implementation should first identify duplicate values and either document manual cleanup or include a migration plan that cannot fail unexpectedly in production.
   - Alternative considered: lookup-only uniqueness. That remains vulnerable to concurrent creates.

4. Keep copy updates localized to trial-balance labels and summaries.
   - Update `تراز کل`, `تراز معین`, and `تراز کل و معین` where applicants or admins need to understand the requested year.
   - Alternative considered: changing stored field keys. Stored keys should remain stable to avoid migration work for uploaded file metadata.

## Risks / Trade-offs

- Existing duplicate `companyNationalId` rows block a unique index migration -> run a duplicate report before migration and resolve duplicates deliberately.
- Concurrent registration attempts could still race before the unique index is deployed -> catch database unique violations and return the same Persian duplicate error.
- Allowing both 10 and 11 digits may accept values that are not official company IDs -> this follows the client request and avoids adding unrequested checksum rules.
- Clipping the frontend input at 11 digits hides the "too long" error -> allow typing/pasting longer values long enough to show the inline validation message, while still normalizing to digits.

## Migration Plan

1. Add/update validation tests for 10-, 11-, short-, long-, Persian-digit, and duplicate national ID cases.
2. Add a duplicate detection query for current `User.companyNationalId` values and review production duplicates before applying the unique index.
3. Update registration validation and duplicate checks.
4. Add the database uniqueness constraint or migration once duplicates are resolved.
5. Update the trial-balance labels and any related final-review/admin labels to include `1404`.
6. Roll back by removing the unique constraint and reverting validation/copy changes if a production issue appears.

## Open Questions

- Which existing duplicate `شناسه ملی` records should remain active if production data contains repeated values?
- Should the displayed copy use `سال 1404`, `سال ۱۴۰۴`, or exactly `1404` as requested by the client?
