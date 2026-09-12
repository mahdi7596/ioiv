# Database Overview

This project uses PostgreSQL with Prisma ORM.

- Prisma schema: `prisma/schema.prisma`
- Database provider: `postgresql`
- Connection env var: `DATABASE_URL`
- Local Docker database: `postgres:16-alpine`
- Docker exposed port: `55433` on the host, mapped to `5432` in the container
- Main local commands:
  - `npm run db:migrate`
  - `npm run db:seed`
  - `npm run db:studio`

## Tables

### User

End-user account created through mobile OTP login/registration.

Fields:

- `id`
- `mobile` unique
- `companyName`
- `companyNationalId`
- `companyContactFullName`
- `companyContactNationalCode`
- `nationalCode`
- `createdAt`
- `updatedAt`

Notes:

- `mobile` is required.
- Company registration details are collected when a new user registers.
- `nationalCode` exists in the schema but current registration UI mainly collects the company contact national code.
- One user can have many applications.

### Facilities Company Profile (M3)

`Company`, `CompanyShareholder`, and `CompanyOfficer` are facilities-only records
owned by one OTP user. They are not derived from legacy `User` or `Application`
fields. Drafts may be incomplete; `profileCompletedAt` is set only after exact
server-side completion validation. `profileVersion` prevents a stale browser save
from overwriting a newer profile.

Required private evidence uses M2 `FacilitiesFileBinding` company-profile slots.
Completion resolves the binding's current upload and requires a passed upload with a
passed scan; storage keys and file paths are never exposed.

### Admin

Admin user allowed to review submissions.

Fields:

- `id`
- `name`
- `mobile` unique
- `role`: `USER`, `ADMIN`, `SUPER_ADMIN`
- `active`
- `createdAt`
- `updatedAt`

### OtpCode

Stores one-time password login codes for users and admins.

Fields:

- `id`
- `mobile`
- `codeHash`
- `purpose`: `USER_LOGIN`, `ADMIN_LOGIN`
- `expiresAt`
- `consumedAt`
- `createdAt`

Notes:

- OTP codes are hashed with bcrypt.
- OTP validity is 2 minutes.
- OTP request limits are enforced in application code.

### Application

Main submitted company application/registration file.

Fields:

- `id`
- `userId`
- `mobile`
- `companyName`
- `companyNationalId`
- `companyContactFullName`
- `companyContactNationalCode`
- `nationalCode`
- `applicationRound`
- `status`: `DRAFT`, `PENDING_PAYMENT`, `SUBMITTED`, `UNDER_REVIEW`, `NEEDS_EDIT`, `VALIDATION_COMPLETED`
- `currentStep`
- `taxDeclarations` JSON
- `financials` JSON
- `humanResources` JSON
- `trialBalance` JSON
- `creditReports` JSON
- `adminNote`
- `submittedAt`
- `createdAt`
- `updatedAt`

Constraints and indexes:

- Unique: `mobile`, `companyNationalId`, `applicationRound`
- Index: `status`
- Index: `companyNationalId`

### ApplicationFile

Metadata for uploaded files. Actual files are stored on disk under `UPLOAD_DIR`, not inside Postgres.

Fields:

- `id`
- `applicationId`
- `fieldKey`
- `originalName`
- `mimeType`
- `size`
- `storagePath`
- `createdAt`

Notes:

- Index: `applicationId`, `fieldKey`
- Allowed upload extensions: `.pdf`, `.doc`, `.docx`, `.zip`, `.xls`, `.xlsx`, `.csv`
- Max upload size: 20 MB

### Payment

Payment attempts for an application.

Fields:

- `id`
- `applicationId`
- `amountToman`
- `gateway`
- `authority`
- `referenceId`
- `status`: `INITIATED`, `VERIFIED`, `FAILED`
- `rawData` JSON
- `createdAt`
- `updatedAt`

Notes:

- Current gateway default: `zarinpal`
- Current configured amount: `3,000,000` toman

### StatusHistory

Audit trail for application status changes.

Fields:

- `id`
- `applicationId`
- `previousStatus`
- `newStatus`
- `changedById`
- `note`
- `createdAt`

Notes:

- `changedById` stores the admin id when changed by an admin.
- Index: `applicationId`

## User Information Collected

Registration/user identity:

- Mobile number
- Company name
- Company national ID, 11 digits
- Company contact full name
- Company contact national code, 10 digits
- `nationalCode` field exists in DB for the user/application, but the current main registration UI stores company contact national code separately.

Application documents and data:

- Tax declarations: list of `{ year, file }`
- Audited financial statements: list of `{ year, file }`
- Human resources:
  - Employee count
  - Insurance list file
- Trial balance:
  - General ledger trial balance file
  - Subsidiary ledger trial balance file
- Credit reports:
  - Company credit report file
  - CEO credit report file
  - Board member credit report file

Payment/user submission metadata:

- Payment amount
- Gateway authority
- Gateway reference id
- Payment status
- Raw gateway response data
- Application status
- Admin review notes
- Status change history
- Submission timestamp

## JSON Shapes Stored In Application

`taxDeclarations`:

```json
[
  {
    "year": "1402",
    "file": {
      "fileId": "application-file-id",
      "name": "tax-declaration.pdf"
    }
  }
]
```

`financials`:

```json
[
  {
    "year": "1402",
    "file": {
      "fileId": "application-file-id",
      "name": "audited-financials.pdf"
    }
  }
]
```

`humanResources`:

```json
{
  "employeeCount": 24,
  "insuranceList": {
    "fileId": "application-file-id",
    "name": "insurance-list.xlsx"
  }
}
```

`trialBalance`:

```json
{
  "generalLedger": {
    "fileId": "application-file-id",
    "name": "general-ledger.pdf"
  },
  "subsidiaryLedger": {
    "fileId": "application-file-id",
    "name": "subsidiary-ledger.pdf"
  }
}
```

`creditReports`:

```json
{
  "company": {
    "fileId": "application-file-id",
    "name": "company-credit-report.pdf"
  },
  "ceo": {
    "fileId": "application-file-id",
    "name": "ceo-credit-report.pdf"
  },
  "boardMember": {
    "fileId": "application-file-id",
    "name": "board-member-credit-report.pdf"
  }
}
```

## Relationships

- `User` has many `Application`
- `Application` belongs to `User`
- `Application` has many `ApplicationFile`
- `Application` has many `Payment`
- `Application` has many `StatusHistory`
- `OtpCode` is keyed by mobile and purpose, with no direct foreign key to `User` or `Admin`
- `StatusHistory.changedById` stores an admin id, but it is not declared as a Prisma foreign key

## M1 facilities database contract

M1 adds an independent facilities model. It does not alter the legacy tables,
constraints, JSON values, physical upload paths, or legacy application selectors
described above. In particular, `FacilitiesApplication` is not an extension of the
legacy `Application` table and no legacy user/application is backfilled or linked.

### Facilities identity and profile

- `Company` is the facilities company profile owned by one OTP `User`; one user owns
  one company in this release.
- `CompanyShareholder` stores current shareholder names and decimal ownership values.
  The exact 100% total is checked when the profile/application is completed, not
  while a draft is being edited.
- `CompanyOfficer` stores current board/CEO data. It intentionally has no officer
  national-code field, and the database permits at most one CEO per company.
- `StoredFile` stores private file metadata only: an opaque storage key, display
  name, verified content type, extension, size, digest, scan state, and timestamps.
  It does not expose a public URL or filesystem path.
- `CompanyProfileDocument` associates the required company-profile documents and
  officer document packages with private stored-file metadata.

### Facilities configuration

- `FacilitiesProgramConfiguration` holds validation and facilities program
  visibility/configuration. M1 creates no configuration row and leaves facilities
  unavailable until M2–M5 are complete; the existing validation route is unchanged.
- `FacilitySupplier` contains the canonical supplier records. M1 seeds only the four
  confirmed names and does not seed an intake, schedule, questionnaire, or
  per-intake supplier availability.
- `FacilityIntake` represents an administratively configured intake; applications are
  unique per company and intake.
- `FacilityIntakeSupplier` controls a supplier’s enabled availability within an
  intake.
- `QuestionnaireTemplateVersion` records a supplier questionnaire template version.
  The template and completed questionnaire are Word documents; applications pin the
  chosen template version.
  M4 creates it only from a passed M2 private upload bound to an active
  `SUPER_ADMIN`; versions are immutable and each uses a fresh binding so prior
  template content is never replaced or deleted.

### Facilities application evidence

- `FacilitiesApplication` is the facilities root. It stores the selected
  intake/supplier, facility type (`سرمایه ثابت` or `سرمایه در گردش`), requested amount
  in ریال, and material configuration snapshots. Requested amount has no minimum and
  is limited by the configurable intake maximum (initially ۵۰۰ میلیارد ریال).
- `FacilitiesApplicationCompanySnapshot`, `FacilitiesApplicationShareholder`, and
  `FacilitiesApplicationOfficer` preserve the profile used by that application.
- `FacilitiesApplicationDocument`, `FacilitiesYearDocument`,
  `FacilitiesHumanResources`, `FacilitiesTrialBalance`, and
  `FacilitiesCreditReport` record the facilities document requirements. VAT year ۱۴۰۴
  is required at submission; ۱۴۰۳ and ۱۴۰۲ are optional.
- `FacilitiesPaymentAttempt` records facilities payment attempts. At most one verified
  payment exists for an application. Payment is 3,000,000 تومان for this release.
- `FacilitiesCorrectionRequest` records repeatable correction cycles; at most one is
  open for an application.
- `FacilitiesStatusHistory` records append-only facilities state transitions. The
  final facilities state uses the existing `VALIDATION_COMPLETED` value.
- `FacilitiesAuditLog` records append-only safe action metadata. It must not contain
  OTP values, credentials, gateway secrets, document contents, storage paths, or
  public file URLs.

### Facilities integrity and retention

- New facilities relations use foreign keys and restrictive deletion for referenced
  evidence. The runtime role can insert/select facilities audit and status history but
  cannot update/delete those records; owner-level append-only triggers enforce this
  even if permissions are misconfigured.
- Database constraints enforce one facilities application per company/intake, one
  enabled intake/supplier configuration, supplier/template compatibility, ownership,
  one CEO, one verified payment, and one open correction request. Application
  completion validates profile completeness and shareholder totals.
- A replaced physical upload is deleted by the later private-file workflow; only safe
  non-content revision/audit metadata remains. M1 stores the metadata contract but
  does not perform file deletion or scanning.

### M2 private-file lifecycle

M2 leaves the legacy `ApplicationFile` table and its upload/download paths unchanged.
It adds facilities-only private-file operational records:

- `FacilitiesFileBinding` is a server-created, immutable company-profile or
  application document slot. It binds the owning user, company, optional facilities
  application, and current approved revision.
- `FacilitiesFileUploadAttempt` records a safe idempotent request outcome, including
  rejected content that never becomes a revision.
- `FacilitiesFileUpload` represents a quota-bearing revision. Its lifecycle separates
  `PENDING`, `PASSED`, `FAILED`, `UNAVAILABLE`, `CORRUPT`, `INTERRUPTED`, `DUPLICATE`,
  `OVERSIZED`, and `DISALLOWED` outcomes from safe failure codes.
- `FacilitiesFileDeletionTombstone` is the durable retry record for deletion after a
  replacement is current. It stores scheduling/status codes only—never a path, URL,
  document content, scanner output, or secret.

Database triggers enforce the owner/company/application tuple, 25 MiB revision cap,
serialized 150 MiB application reservation, same-slot current-revision replacement,
passed-scan requirement, and deletion ordering. `UNAVAILABLE` may return to `PENDING`
for an internal re-scan; other terminal outcomes remain immutable. A deleted predecessor
retains only safe lifecycle/revision/audit metadata after its private bytes and
unreferenced `StoredFile` metadata are purged.

### M5 application evidence and templates

M5 stores applicant evidence in `FacilitiesApplicationEvidence`. Each row references
an immutable M2 application binding—not a replaceable `StoredFile` revision—so safe
replacement and deletion cannot break the application record. The current passed
revision is resolved through the binding. Questionnaire templates remain immutable
private `StoredFile` records while referenced by an intake or application; they are
not public URLs and are not deleted as part of applicant replacement cleanup.

### M6 payment and confirmed submission

Facilities payments use the facilities-only `FacilitiesPaymentStatus` lifecycle;
the legacy `PaymentStatus` enum and legacy payment routes are unchanged. A facilities
payment keeps only safe identifiers and state metadata. Database constraints allow
one active or timed-out payment per application and one verified payment per
application. A timed-out payment remains eligible for a later server verification,
but cannot be used to start a second payment.

When payment is enabled, the amount is copied from the intake snapshot and is never
accepted from the browser. The applicant must confirm the final information before
checkout. A successful server-side gateway verification atomically records the
verified payment, submits the facilities application as `SUBMITTED`, records status
history, and appends the corresponding audit events. When payment is disabled, the
same server-side evidence checks submit the application directly after the final
applicant action.

Facilities status transitions are database-guarded. Audit and status-history rows
remain append-only. Failed or cancelled payments return an unsubmitted application
to draft; unknown gateway outcomes remain pending and do not trigger another charge.
No raw gateway response, credential, OTP, file content, storage path, or public file
URL is stored in the facilities payment or audit records.

### M7 review and correction cycles

Facilities review remains separate from the legacy validation admin workflow.
`ADMIN` and `SUPER_ADMIN` roles can review and download current protected facilities
evidence; `ENTRY_VIEWER` can inspect queue/detail metadata but cannot download files or
change state. Reviewer transitions use the existing database-guarded loop:
`SUBMITTED` → `UNDER_REVIEW` → `NEEDS_EDIT` → `SUBMITTED`, with
`UNDER_REVIEW` → `VALIDATION_COMPLETED` as the final path.

`FacilitiesCorrectionRequest` keeps every numbered correction cycle and permits only
one unresolved row per application. Its SMS fields record only `PENDING`, `SENT`, or
`FAILED`, attempt timestamps/counts, and a safe failure code. The correction and
`NEEDS_EDIT` transition commit before the external SMS call; provider failure does not
undo application state and can be retried by a full reviewer. Status history and audit
events remain append-only. New correction notes must contain Persian text and contain
between 1 and 2,000 trimmed characters; legacy rows remain readable after migration.

Applicants may change the requested facility type/amount, application evidence, human
resources count, and selected board-member report while `NEEDS_EDIT`. Resubmission
resolves the open correction, preserves the original `submittedAt`, reuses the verified
payment, and returns the application to `SUBMITTED`. Intake, supplier, pinned template,
and captured company snapshot remain immutable during corrections.

Reviewers resolve current company-profile documents through their private bindings.
Profile data and file mutations are therefore locked while a company has an application
in `PENDING_PAYMENT`, `SUBMITTED`, `UNDER_REVIEW`, or `NEEDS_EDIT`; they unlock after a
failed payment returns to `DRAFT` or after `VALIDATION_COMPLETED`. M7 does not snapshot
profile bytes or include them in the 150 MiB application quota.

### M8 export, audit viewer, and retention

M8 adds only facilities audit enum values and query indexes; it does not migrate or
reinterpret legacy applications. Active `ADMIN` and `SUPER_ADMIN` roles may create a
bounded facilities XLSX export, and active `SUPER_ADMIN` alone may query the facilities
audit viewer. `FacilitiesAuditLog` remains append-only for the runtime role and through
its owner-level trigger. Export, audit-view, protected admin-file, questionnaire, and
reconciliation reads write typed safe audit events before releasing protected results.

Export filters use `FacilitiesApplication.createdAt`, with indexes for created date,
status, intake, and intake-supplier paths. Audit pagination is ordered by the stable
`(createdAt, id)` pair. M8 metadata validation permits only bounded safe filter-key and
count metadata; it continues to reject content, storage keys, hashes, secrets, URLs,
and raw gateway values.

Physical terminal quarantine is purged on reconciliation. An `UNAVAILABLE` upload is
retryable for 24 hours from creation, then becomes terminal and loses its physical
bytes while its safe attempt/revision/audit metadata remains. Current scan-passed
evidence and replaced-file deletion tombstones retain their existing lifecycle.
