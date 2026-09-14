# Facilities Application Delivery Plan

**Status:** M0 decisions are recorded. M1 establishes database contracts only; the
facilities feature remains unavailable until the later milestones are accepted.

**Product source of truth:**
[`2026-09-10-facilities-application-requirements.md`](./2026-09-10-facilities-application-requirements.md).

## Fixed product boundary

- The legacy validation route, including its `Application` records, JSON payloads,
  file records, status flow, selectors, and uniqueness constraints, remains unchanged.
- Facilities uses an independent `FacilitiesApplication` root. It does not extend,
  migrate, link, or reinterpret legacy `Application` data. The one exception is the
  shared onboarding entry point described under "Post-M0 decision: shared onboarding
  entry point" below, which only supplies field values to a *new* legacy `Application`
  at creation time — it never reads, migrates, or reinterprets existing legacy records.
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

## Post-M0 decision (2026-09-12): shared onboarding entry point

After OTP login, every user — new or existing — now completes the M3 facilities
company profile (`/dashboard/facilities-profile`) as the single mandatory onboarding
step before reaching the dashboard. This replaces the separate, legacy-only "company
info" collection step that previously ran inline during OTP verification and briefly
existed as its own post-login gate; that legacy-only gate and its 4-field form are
retired and no longer shown to anyone.

Once the facilities profile is completed, its four overlapping fields (company name,
national ID, contact full name, contact national code) are mirrored one-way onto the
legacy `User` record, so the untouched legacy `Application`-creation code keeps
working unmodified for applicants who choose the legacy route. This mirror only
populates fields for a `User`'s *own* future legacy `Application`; it does not touch,
migrate, or backfill any existing legacy `Application` records, and it does not modify
legacy `Application`/admin/export code paths at all.

After completing the profile, the dashboard (`/dashboard`) presents both service
options for the user to choose from:

1. اعتبارسنجی شرکت‌های متقاضی ورود به لیست بلند تأمین‌کنندگان وزارت نفت (the legacy
   validation route, unchanged)
2. تسهیلات از محل منابع ماده ۲۸ آیین‌نامه تولید، دانش‌بنیان و اشتغالزایی در صنعت نفت
   (facilities, per this plan)

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

M2 implementation is facilities-only and does not expose facilities UI, seed an intake,
or enable the programme. It adds an owned document-slot binding, idempotent attempt and
revision records, a serialized application quota reservation, private staging/ready
storage, content verification, a fail-closed ClamAV adapter, owner-only private
downloads, and a durable deletion tombstone/reconciliation path. Scanner-unavailable
objects are quarantined and non-downloadable. The exact production scanner operation,
facilities reviewer permission matrix, retention intervals, and whether M3 profile
documents count toward an application total remain decisions for later approval.

### M3 — Company profile

Build the company profile, shareholders, officers, required profile documents, and
completion rules. Existing users create this facilities profile without changing their
legacy records.

M3 permits an OTP-authenticated user to prepare this private profile while the
facilities programme and application remain unavailable. Profile document slots use
the M2 private-file binding lifecycle; only a current scan-passed revision satisfies
completion. The profile does not enter an intake, create an application, or expose
supplier/payment/review/export behaviour.

As of the shared onboarding entry point decision above, this profile is also the
mandatory post-login step for every user regardless of which service (legacy or
facilities) they end up choosing, and its completion mirrors four fields onto the
legacy `User` record (see that section for the exact mechanism and boundary).

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

M8 exports all statuses by intake, supplier, status, and Tehran creation-date range in
related Persian worksheets. Active `ADMIN` and `SUPER_ADMIN` roles may export, while
only `SUPER_ADMIN` may view facilities audit events. File metadata is exported for all
statuses; authenticated application-scoped links are emitted only for review-visible
current files. Synchronous work is capped at 5,000 applications and 100,000 related
rows. Reconciliation is singleton, purges terminal quarantine on its next run, and
retains scanner/storage-unavailable bytes for no more than 24 hours.

### M9 — Controlled rollout

Deploy facilities behind its availability controls only after the preceding milestones
and operational checks pass.

Repository-side M9 safeguards are defined in
`docs/2026-09-12-facilities-m9-controlled-rollout-plan.md` and
`openspec/changes/implement-facilities-m9-controlled-rollout`. They include fail-closed
decision/evidence records, immutable candidate manifests, explicit availability-state
preflight, narrow supplier provisioning, and reviewable scanner/proxy/scheduler/
monitoring examples. This does not mean M9 is deployed or complete. G0 product and
operations decisions, staging qualification, matched production backup/restore, the
exclusive user database/deployment handoffs, controlled enablement/canary, and the
approved observation window all remain required. Facilities must stay unavailable
until those real gates pass.

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
