## Why

Applicants can currently register with repeated or incorrectly sized `شناسه ملی`, which creates duplicate company identities and review ambiguity. The document intake also needs to clearly request year 1404 for the `تراز کل و معین` section so applicants upload the expected files.

## What Changes

- Add registration-time validation that rejects duplicate `شناسه ملی` values before a new registration is created.
- Validate `شناسه ملی` length on the frontend and backend, allowing only 10 or 11 digits and showing an inline frontend error when the value is shorter or longer.
- Normalize national ID input to digits-only before validating uniqueness and length, so formatted values cannot bypass duplicate detection.
- Update the `تراز کل و معین` user-facing labels/copy to explicitly mention year `1404`.
- Preserve existing registration and application flows except for the new validation failures.

## Capabilities

### New Capabilities
- `national-id-registration-validation`: Covers registration-time uniqueness and 10/11 digit validation for `شناسه ملی`.
- `application-1404-document-labels`: Covers 1404 year labeling for `تراز کل و معین` document intake.

### Modified Capabilities

## Impact

- Registration frontend validation, inline error rendering, and submit blocking.
- Registration API/server action validation and duplicate lookup.
- Database constraints or indexes needed to guarantee national ID uniqueness at persistence time.
- Any existing duplicated national ID records that need review before enforcing a unique constraint.
- Application wizard labels, final review labels, and any validation/error copy that references `تراز کل و معین`.
