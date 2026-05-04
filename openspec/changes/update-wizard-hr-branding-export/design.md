## Context

The current application is a Next.js App Router and Prisma/PostgreSQL app with a Persian RTL multi-step document wizard. Draft fields are stored as JSON on `Application`, final payment is guarded by shared Zod validation, uploaded files are stored on disk with metadata in `ApplicationFile`, and admin exports are generated through the `xlsx` package with a CSV fallback.

The existing wizard has five steps and document rules from the first platform build: three required tax declarations, optional audited financial statements, required trial balance, required credit reports, and final payment. The requested update changes the business rules and adds a new required human-resources step. The same request also touches production branding, favicon assets, logout routing, upload file types, and admin export readability.

## Goals / Non-Goals

**Goals:**

- Add the human-resources wizard step between audited financial statements and trial balance.
- Persist and validate employee count and insurance-list upload data.
- Allow Excel files to be uploaded where users provide the insurance list.
- Require only one complete tax declaration while preserving the three-row visual UI.
- Make audited financial statements required and provide the requested support guidance.
- Keep server-side validation authoritative for draft save, final payment, and correction submission.
- Make admin detail and export surfaces aware of the new HR data.
- Replace the long Sana service name, visible logo, favicon, and logout destination.
- Make the admin export readable in Excel for Persian text.

**Non-Goals:**

- Redesign the wizard visual system beyond the required new step and messaging.
- Change payment amount, payment provider, SMS provider, or status lifecycle.
- Add spreadsheet parsing or validation of insurance-list contents.
- Add per-field file type policies unless implementation determines global Excel support is too broad.
- Change authorization rules for uploads, downloads, admin pages, or exports.

## Decisions

### Store human resources as first-class draft JSON on `Application`

Add a `humanResources` JSON field with a default `{}` value to `Application`. Shape it as:

```ts
{
  employeeCount?: number;
  insuranceList?: FileRef;
}
```

This matches the existing draft-field model for `trialBalance` and `creditReports`, keeps validation straightforward, and keeps the admin/export code from needing to infer employee count from file metadata.

Alternative considered: store HR data inside an existing JSON field. This would avoid a migration, but it would mix unrelated concepts and make the final validation/export code more fragile.

### Treat Excel upload support as part of protected upload validation

Extend upload validation to allow common Excel extensions and MIME types: `.xls`, `.xlsx`, and likely `.csv` if product considers CSV a spreadsheet upload. The HR requirement explicitly says Excel may be uploaded; implementation can either add Excel support globally or add field-aware validation. Global support is simpler and consistent with the current upload API, but field-aware validation keeps unrelated document steps tighter.

Recommended first implementation: allow Excel globally if this matches the business process for uploaded supporting documents; otherwise add a field-key-sensitive branch for `humanResources.insuranceList`.

### Keep draft UI permissive, final validation strict

Draft saving should accept partial rows and incomplete HR data so users can save progress. Final validation and payment start should enforce:

- at least one complete tax declaration row
- at least one complete audited financial statement row
- no partially filled non-empty year/file rows
- positive integer employee count greater than 0
- insurance-list file present
- existing trial balance and credit report requirements
- payment acknowledgement unless payment was already verified

This preserves the current draft/resume behavior while keeping payment/submission as the authoritative gate.

### Shift wizard step indexes carefully

The new step changes total steps from 5 to 6. The implementation should centralize step definitions in one array and render by stable step IDs rather than relying only on numeric comparisons where practical. Existing persisted `currentStep` values can remain valid; a user saved on old step 3 will now land on the new HR step unless a migration remaps step numbers.

Recommended migration behavior: do not remap existing draft step numbers unless there are meaningful production drafts that must preserve exact semantic position. The new required HR step should be completed before final submission anyway, so landing users earlier in the flow is acceptable and safer.

### Expose XLSX as the primary admin export

The backend already supports XLSX generation, but the admin UI currently exposes CSV. Make XLSX the primary visible export action because Excel handles `.xlsx` Unicode content more reliably than CSV. Keep CSV as an explicit fallback and prefix CSV content with a UTF-8 BOM so Persian text opens correctly in Excel.

The export should add HR-aware columns and use Persian-friendly labels or consistently documented English labels. Since the admin interface is Persian, Persian column labels are preferable for operator readability.

### Replace assets by adding stable public filenames

Copy `IOIV.png` and `logo ghatre.png` into `public/` with predictable names such as `ioiv-logo.png` and `ioiv-favicon.png`. Update `next/image` references and metadata icons to those stable paths.

Avoid referencing `/Users/mahdi/Downloads/...` from application code; production builds need assets inside the repository.

### Use a fixed production logout URL

The logout route should clear the session and redirect to `http://sana.ioiv.ir/` with a 303 response. This is a product requirement rather than an environment-derived app URL in this change. If future staging deployments need different behavior, a later change can introduce `LOGOUT_REDIRECT_URL`.

## Risks / Trade-offs

- Existing draft records may have `currentStep` values that no longer point to the same semantic step → Keep values bounded and rely on final validation to guide users through the new required step.
- Global Excel upload support may allow spreadsheet files in other document steps → Prefer field-aware validation if document-type control is important; otherwise document the broadened allow-list.
- CSV readability depends on Excel locale and import behavior → Make XLSX primary and add UTF-8 BOM to CSV fallback.
- Required financial statements may block users who do not have audited financials → The step must show the requested support guidance clearly before final review.
- New Prisma field requires migration and deployment ordering → Run migration before deploying code that reads/writes `humanResources`.
- Replacing favicon can be affected by browser caching → Use a new public filename and metadata path to reduce stale icon caching.

## Migration Plan

1. Add `humanResources` JSON field to the Prisma schema with default `{}` and create a migration.
2. Update validation, types, draft load/save, wizard rendering, final review, payment validation, admin detail grouping, and export code.
3. Copy the provided logo and favicon assets into `public/` and update references.
4. Update logout redirect behavior.
5. Update validation and export tests; add focused tests for HR, one-year tax minimum, required financial statements, Excel upload allow-list, and CSV/XLSX export behavior.
6. Run Prisma generation/migration locally, test suite, build, and a manual wizard smoke flow.

Rollback is to deploy the previous application build. The added JSON column is backward-compatible with older code if left in place, so rollback does not require immediate data rollback.

## Open Questions

- Should Excel upload support be global for all upload fields or restricted to `اپلود لیست بیمه` only?
- Should CSV be kept visible in the admin UI, or should only XLSX be shown while CSV remains available by URL?
- Should existing draft `currentStep` values be remapped so old step 3 becomes new step 4, or is it acceptable for users to resume at the newly inserted HR step?
