# Facilities Application Delivery Plan

**Status:** M0 decisions are recorded. M1 establishes database contracts only; the
facilities feature remains unavailable until the later milestones are accepted.

**Product source of truth:**
[`2026-09-10-facilities-application-requirements.md`](./2026-09-10-facilities-application-requirements.md).

## Fixed product boundary

- The legacy validation route, including its `Application` records, JSON payloads,
  file records, status flow, selectors, and uniqueness constraints, remains unchanged.
- Facilities uses an independent `FacilitiesApplication` root. It does not extend,
  migrate, link, or reinterpret legacy `Application` data.
- One OTP-authenticated user owns one company. There is no legacy company backfill
  and no multi-user company membership in this release.
- The seed creates only the four confirmed suppliers. No intake, schedule, template,
  or supplier availability is invented.
- M1 creates the program-configuration schema but does not seed programme availability.
  The existing validation route remains unchanged and facilities remains unavailable
  until M2–M5 are complete. Per-intake supplier availability is configured later and
  is not seeded.
- The final facilities outcome is the existing `VALIDATION_COMPLETED` state; no
  facilities completion certificate is produced.

## Confirmed M0 decisions

| Decision | Confirmed value |
| --- | --- |
| Payment | Enabled at 3,000,000 تومان. The acknowledgement copy remains a release-copy draft. |
| Uploads | 25 MB/file, 150 MB/application; PDF, DOC/DOCX, XLS/XLSX/CSV, ZIP; server content verification and scan before availability. |
| Repeat applications | One facilities application per company per intake. |
| Capital | Store registered capital in ریال. |
| Replaced files | Delete physical content; retain safe revision/audit metadata only. |
| Export | Include all entered data; initial filters are intake, supplier, status, date range; file links require authorized admin access. |
| Configuration | `SUPER_ADMIN` alone may manage facilities configuration. |

## Ordered milestones

### M1 — Independent database foundation

Add facilities-only `Company`, `CompanyShareholder`, `CompanyOfficer`, `StoredFile`,
`CompanyProfileDocument`, `FacilitiesProgramConfiguration`, `FacilitySupplier`,
`FacilityIntake`, `FacilityIntakeSupplier`, and `QuestionnaireTemplateVersion`
relations. Add the independent `FacilitiesApplication` root with its company/person
snapshots, structured documents/year entries, human-resources, trial-balance,
credit-report, payment-attempt, correction-request, status-history, and append-only
audit relations.

The database model encodes the confirmed facility types, amount unit/limit, VAT-year
rules, supplier visibility, Word questionnaire rule, one-CEO rule, one verified
payment, and one open correction request. Exact shareholder-total and profile-
completeness validation belongs to M3 completion/submission, so draft profile edits
remain possible.

M1 also seeds these exact supplier names idempotently:

1. شرکت ملی نفت ایران
2. شرکت ملی گاز ایران
3. شرکت ملی صنایع پتروشیمی ایران
4. شرکت ملی پالایش و پخش فرآورده‌های نفتی ایران

It does not seed programme availability, a facilities intake, schedule,
questionnaire, or supplier availability. Facilities remains unavailable until M2–M5
are complete.

M1 does not build the physical file lifecycle, payment callback, admin configuration
UI, export, or applicant UI.

### M2 — Private files

Build the private upload/download service, verified-content and scan boundary,
server-side limits, authorized access, and replacement/deletion workflow.

### M3 — Company profile

Build the company profile, shareholders, officers, required profile documents, and
completion rules. Existing users create this facilities profile without changing their
legacy records.

### M4 — Facilities configuration

Build `SUPER_ADMIN` facilities intake, supplier availability, amount/payment setting,
and questionnaire-version management.

### M5 — Applicant facilities wizard

Build the facilities application form, profile snapshots, required documents,
questionnaire handling, and confirmation step.

### M6 — Payment and submission

Build server-verified, idempotent payment and confirmed submission using the approved
amount; release-copy acknowledgement text is approved before exposure.

### M7 — Review and corrections

Build review, repeated correction cycles, correction SMS, protected files, and status
timeline.

### M8 — Export, audit, and resilience

Build XLSX export with the approved filters, authorized file links, privileged audit
viewer, and operational/recovery coverage.

### M9 — Controlled rollout

Deploy facilities behind its availability controls only after the preceding milestones
and operational checks pass.

## Engineering safeguards (not product requirements)

- Migrations run only with the migration-owner database credential during a scheduled
  maintenance operation. The normal application startup must not run migrations.
- The application uses a restricted runtime database credential. Facilities audit and
  status-history records are append-only: the runtime may insert/select but cannot
  update/delete them.
- Production rollout requires a dated Git backup branch plus verified database,
  upload-storage, and configuration backups with an isolated restore rehearsal.
- Rollback redeploys the preceding application/runtime configuration while additive
  schema remains. A destructive schema rollback requires a tested restore and explicit
  approval.
- M1 must prove clean and repeated migrations/seeds, legacy regression preservation,
  facilities constraints, audit/history immutability, role denial, migration-failure
  recovery, and production build/type/lint/test checks before it is complete.
