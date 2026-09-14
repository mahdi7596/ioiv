# M9 controlled rollout implementation and release plan

Status: repository safeguards implemented on `master`; production rollout not approved or executed. Initially inspected September 12, 2026 against clean checkout `a606399`, which matched `master` and `origin/master` before M9 work. M9 adds no application schema or applicant-facing behavior and has not changed production settings, deployed, or enabled availability. This document does not authorize production execution.

## Alignment result and implementation boundary

The plan is aligned with the delivery-plan definition of M9: it deploys only after
M1–M8 and operational gates pass, uses existing availability controls, preserves the
legacy validation workflow, and applies the backup/restore/security/chaos requirements
in `AGENTS.md`. Review found it was not gap-free or immediately executable: G0 product
and operational decisions remain unresolved, production inventory/evidence is absent,
and the repository lacked the M9 OpenSpec contract, evidence validation, candidate
manifest, disabled/enabled preflight, narrow supplier repair path, and scanner/proxy/
scheduler/monitoring examples.

Those repository gaps are implemented by
`openspec/changes/implement-facilities-m9-controlled-rollout` and
`operations/facilities-m9`. Production G0–G7 remain deliberately pending. The user-owned
database-backup and application deployment handoffs, external operator work, approvals,
real evidence, enablement, canary, and observation cannot be completed or inferred from
repository work.

## 1. Baseline and ownership

Sources reviewed: `AGENTS.md`, confirmed facilities requirements and delivery plan dated September 10, `DEPLOYMENT.md`, all M7/M8 proposal/design/tasks/spec files, Compose, runtime environment example, migration inventory, runtime grant runbook, readiness/reconciliation scripts, configuration/payment UI and actions, scanner and upload verification code. M7/M8 tasks are checked complete, but their historical results are not evidence that production is ready. The deployment runbook explicitly labels these milestones not deployed; obtain actual production inventory rather than assume its schema or release matches this checkout.

Legacy validation remains unchanged: application records, availability, payments/callback, uploads/downloads, review/status actions, exports, certificates, and existing users. No legacy backfill, reset, reseeding of users/admins, or change to `ioiv.ir` is part of M9.

| Role | Responsibility |
| --- | --- |
| Codex | Own specification, decision reconciliation, implementation if subsequently approved, release packaging, commands, verification, evidence ledger, backup verification and restore work, non-DB backup preparation/execution with access, monitoring/scheduler configuration, preflight, enablement through authorized access, incident analysis and documentation. |
| User — exclusive handoff A | Take the current production database backup. Codex supplies/checks the procedure and verifies/restores the result; Codex does not take this backup. |
| User — exclusive handoff B | Upload/deploy application source or artifact to production, including initial deployment and any application redeployment for rollback. Codex prepares exact artifacts and checks the result; Codex does not upload, build/restart the production application, or perform this handoff. |
| Infrastructure/DB/scanner operator | Perform specifically identified external-access steps when Codex lacks VPN, SSH, database, scanner, proxy, scheduler, secrets-manager or monitoring access. Codex remains responsible for instructions and evidence review. This role must be assigned to a named operator; do not silently transfer it to the user. |
| Authorized active SUPER_ADMIN operator | Apply approved intake/supplier/template settings and availability through audited admin operations if Codex lacks an authorized session. |
| Product/release authority | Supply unresolved business decisions and release approval. These are decision inputs, not additional deployment chores assigned to the user. |

All commands below are future execution instructions. Use isolated test credentials for every test suite. Never paste credentials or private document contents into the evidence ledger. Internal production access requires the documented L2TP connection; public checks do not. Production paths must be inventoried, not assumed from old examples.

## 2. Phase 0 — decisions and M9 specification (gate G0)

Owner: Codex, with product and named operational decision makers. Dependency: baseline inspection. The M9 OpenSpec proposal, design, tasks, and scenario specifications at `openspec/changes/implement-facilities-m9-controlled-rollout` cover rollout gates, handoffs, containment, restore, monitoring, and acceptance. They do not satisfy G0 approvals. Record agreement on requirements, data changes/rollback, end-to-end Persian UI, payment/upload implications and phased acceptance as required by AGENTS.md. This implementation explicitly requires solo analysis; no subagents were used.

Resolve and record each item with approver, date and accepted value:

| Decision | Required resolution / consequence |
| --- | --- |
| Production intake | Exact name, opening/closing times and timezone, manual scheduling responsibility, enabled supplier subset, whether multiple intakes are allowed operationally, and canary cohort/window. Current admin input has enable switches, not a time scheduler; do not promise automatic dates. |
| Supplier questionnaires | Obtain the four requested supplier Word templates, exact supplier names from requirements, labels/versions, approval and selected version per enabled supplier. Only approved scan-passed published, non-retired versions qualify. Preserve historical template bindings. No invented template/intake. |
| Amount/payment | Confirm maximum `500000000000` rial and payment `3000000` toman, enabled as currently required. Payment-disabled launch requires explicit client direction, not a workaround for an unready gateway. |
| Payment acknowledgement | Approve exact Persian copy including final-review/edit intent and post-payment lock. Current UI says «اطلاعات و مدارک را بررسی کرده‌ام و برای ادامه به پرداخت می‌روم.» and «پس از تأیید موفق پرداخت، درخواست به‌صورت خودکار ارسال می‌شود.». Determine whether approving this fixed release copy suffices or versioned terms/acceptance recording is required. `saveFacilityIntake` currently writes terms text/version as null; configuration cannot deliver versioned terms today. Any required change is a tested prerequisite, never direct SQL presented as an existing UI capability. |
| Correction scope conflict | Requirements say all information/files editable when corrections are requested; M7 locks company profile and keeps intake/supplier/template/company snapshot immutable. Obtain explicit resolution accepting documented restrictions or implement the approved wider scope before release. Include profile evidence changing after final completion: M7 does not preserve historical profile bytes. |
| Profile quota | Decide whether company profile/officer files count toward the 150 MiB application allowance, how shared documents and repeat intakes count, and company-level/file-count capacity limits. Existing application quota must not be represented as a bound on all profile storage. |
| File policy | Confirm MiB interpretation of the requirements' MB labels, allowed formats and applicant retry wording. Review current archive limits (2,048 entries, 150 MiB expanded bytes, 100:1 ratio), nested/encrypted/unsafe archives and CSV handling against approved scanner policy. Any mismatch becomes scoped implementation and regression work. |
| Scanner operations | Named primary/backup, deployment/network owner, signature update cadence and maximum acceptable age, update-failure alerts, stream/archive limits, restart/runbook and support coverage. Compose currently has no clamd service. |
| Capacity/retention | Approve forecast, disk/inode headroom, warning/critical thresholds, expansion lead time and who can close new intake. Include profile files, template versions, replacement overlap, quarantine, backups, and indefinite audit growth. M8 terminal purge next run and 24-hour unavailable retention are confirmed; do not reopen or silently extend them. Decide protected backup retention/deletion/access, including how replaced bytes expire from backups. |
| Alerting and support | Named destination and primary/backup responders for scanner/storage, job failures, DB, payments, SMS and application health; severity, acknowledgement/escalation times and release-window coverage. `ADMIN_ALERT_MOBILE` alone is not proof of integrated operational alerts. |
| Release safety | Agree maintenance window, RPO/RTO, backup consistency method, canary duration/volume, observation period and containment for existing applications. No per-user canary allow-list or universal facilities kill switch is established by this review. |
| Dependency security | Audit the exact production dependency tree, apply and requalify supported fixes, and replace or obtain named, time-bounded security/release risk acceptance for any remaining critical/high runtime advisory. Repository tooling upgrades Next.js/Vitest when supported, but current npm `xlsx` has no registry fix and remains a G0/G1 release blocker pending exposure review/replacement or explicit acceptance. |

**G0 go:** signed decision register, reconciled requirements/specs, named operators and access route, accepted phased plan; no unresolved item affecting security, payment, data correctness or applicant promises. **No-go:** retain unavailable facilities and finish prerequisite work. Implementation changes, if needed, receive schema/backend, frontend, integration, regression and critical review checkpoints; do not treat M9 as deployment-only if G0 exposes functionality gaps. Follow the applicable review instructions at execution time; this request's analysis stays solo.

## 3. Phase 1 — reproducible release and local qualification (G1)

Owner: Codex. Dependency: G0. Verify current `master`, full candidate SHA, clean diff and production's actual prior SHA/image. Build an immutable candidate manifest listing source SHA, lockfile/schema/migration checksums, Linux Prisma export checksum, image digest when packaged, configuration template revision and rollback image/source. A new dated backup ref from current master satisfies the release backup requirement, but is not proof of the deployed rollback artifact: preserve that separately. Keep historical `backup-master-2026-09-10` at `ab16e9122881617d6c7dcf9fb84878c00684ee03`; do not blindly choose it as the operational rollback version.

Run locally with disposable database configuration:

```bash
npm ci
npx prisma validate
npx prisma generate
npm test
npm run lint
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

Build the Linux AMD64 Prisma export with `Dockerfile.prisma-export` and the extraction commands in DEPLOYMENT.md (use a fresh output directory/container rather than deleting unrelated work). Verify musl query/schema engines, schema freshness, archive readability/checksum and full candidate image boot. Prepare both migrate and app images from the same candidate. Compose uses the explicit `maintenance` target for migrations; the app runner excludes the Prisma CLI and retains the readiness/reconciliation scripts plus runtime Prisma client. Boot and dependency-scan both exact images. No production upload occurs in this phase.

Inventory all pending migrations using production migration history supplied by the operator. Apply the entire ordered pending chain in staging, not just M8. Repository includes two distinct `20260910210000_*` directories: preserve Prisma's exact names/order. In particular retain all four M7 migrations ending `160000`, `161000`, `162000`, `163000`, followed by `20260912120000_add_facilities_m8_export_audit_resilience`. Do not rename already applied migrations or reset production. Review additive compatibility with the actual rollback binary and enum consumers; add no migration solely because the milestone is M9.

**G1 evidence:** candidate manifest, successful logs/exits for each command, reviewed diff and migration list, boot result. **No-go:** fix candidate, regenerate artifacts and rerun affected checks; any code/schema change invalidates dependent evidence.

## 4. Phase 2 — staging infrastructure and operational preparation (G2)

Owner: Codex; infrastructure operator supplies external provisioning/access. Dependency: G1. Use isolated PostgreSQL, storage, domain and sandbox integrations. Prevent restored production sessions/secrets from sending SMS, charging, or connecting to production; limit access to restored personal data and define disposal.

Prepare `.env.runtime`, `.env.migration`, Compose interpolation `.env`, proxy and scanner configuration from versioned examples. Keep owner credentials only in migration context; runtime `sana_runtime` must be non-owner, non-superuser and unable to inherit owner privileges. Protect files and secret transport. Preserve session and legacy service settings unless an approved change requires otherwise. Production `APP_URL` must be exactly the trusted HTTPS application origin. Confirm live merchant/callback route and correction SMS template with service operators without recording secrets.

Persist `FACILITIES_UPLOAD_DIR=/app/uploads/facilities-private` inside the confirmed uploads mount. Verify UID/GID permissions, write/read/delete across container recreation, backup coverage, no Nginx/static serving, and staging/ready separation. Configure an internal-only clamd endpoint and signature updater; validate signatures and harmless malware-test detection in staging, clean files of every format, largest permitted stream and archive behavior. The clean readiness canary alone proves neither signature freshness nor malware detection.

Use runtime-example values as starting points, then validate: port 3310, timeout 15000 ms, chunk size 65536, orphan TTL 86400000 ms, correction SMS timeout 10000 ms. Unavailable retention is hard-coded to 24 hours; its documented environment value is not a tunable extension. Tune capacity/concurrency with realistic 25 MiB files and 150 MiB application limits, large XLSX exports and simultaneous scans. Measure memory, DB connections and task duration.

Prepare a facilities-specific multipart proxy allowance above 25 MiB plus overhead, preserving legacy limits/routes. Test the exact maximum and one byte above server cap; do not copy the old generic “20 MB” text or `25M` proxy example as facilities acceptance. If a route-specific proxy rule or timeout is needed, prepare and validate it in staging before installation.

Prepare scheduler and monitoring configuration as reviewable files/instructions (not installed now). At release, reconcile every five minutes using the restricted runtime in the app container:

```bash
cd /data/apps/sana
docker compose exec -T app npm run facilities:reconcile-files
docker compose exec -T app npm run facilities:check-readiness
```

The noninteractive `-T` is appropriate for a scheduler. Capture exit and safe structured output: `0` completed; `2` lock-held skip is not completion; `1` incident. Monitor last successful completion, repeated skips, duration approaching the 300-second lock timeout, pending deletions, oldest unavailable and terminal backlog, and processing throughput. Batches are 100; an exit 0 does not prove all backlog drained. Readiness rejects expired unavailable rows and aged/due deletion backlog. Validate progress under more than one batch, concurrent execution, scheduler restart and missed-run recovery in staging.

Proposed operational gates for approval at G0: page on exit 1 or failed readiness; page if no successful reconciliation for 10 minutes; investigate repeated lock skips; no unavailable objects aged 24 hours or due/aged deletion backlog at enablement. Set warning capacity from forecast/expansion lead time; critical must occur before the 2 GiB readiness floor is crossed. Track inodes, volume free space and growth, scan/signature health, backup age, DB/app errors, payment verification failures/uncertain attempts and correction-SMS PENDING/FAILED age. Send a test alert to the real destination via the approved monitoring integration and obtain receipt; do not send unsolicited messages.

**G2 evidence:** redacted config manifest, persistent private mount and network checks, scanner/version/signature/detection report, capacity measurements and approved thresholds, scheduler test outputs, alert receipt/escalation test, no legacy proxy regression. **No-go:** keep availability off; resolve infrastructure or implementation gaps.

## 5. Phase 3 — full staging acceptance and failure rehearsal (G3)

Owner: Codex; operators provide gateway/scanner test access. Dependencies: G1–G2. Use realistic Persian fixtures and active/inactive roles. All failure injection and destructive test suites stay in disposable local/staging databases and storage.

Run the repository suites with the appropriate isolated migration-owner URL, then runtime behavior with the restricted role:

```bash
npm run test:db:m1-integrity
npm run test:db:m1-role
npm run test:db:m2-files
npm run test:db:m6-payment
npm run test:db:m7-review
npm run test:db:m8-operations
```

For the existing recovery harness, set `DATABASE_URL` to a disposable source that has the facilities foundation and `M1_RESTORE_DATABASE_URL` to a separate blank disposable target, then run `npm run test:db:m1-recovery`. This harness itself takes a disposable test dump; it does not take the user's current production DB backup and does not replace the matched production restore rehearsal in Phase 4.

| Matrix | Required pass evidence |
| --- | --- |
| Eligibility/profile | New and legacy OTP users complete expanded profile without legacy changes; national ID, required documents, decimal shareholders totaling 100%, exactly one CEO, officer ZIPs; save/refresh/concurrency and profile locks match resolved G0 scope. |
| Configuration/draft | SUPER_ADMIN-only mutation; missing/disabled programme, intake, supplier or unsafe/retired template denies new draft server-side; exact supplier/template pinning; one company/intake under duplicate click; amount bounds and payment snapshots. |
| Wizard | Every old/new required document including 1405 trial balances, mandatory 1404 VAT, optional 1403/1402, licences/contracts ZIP, Word questionnaire and optional attachments; incomplete/invalid fields rejected server-side; mobile RTL keyboard/focus, labels, progress, loading/empty/error/retry/success and session-expired states. |
| Upload lifecycle | Every allowed format, forged MIME/extension, unsafe archive, corrupt/disallowed/oversized/interrupted upload; quota including reservations and replacement credit; duplicate/concurrent requests, scanner timeout/malformed response, storage promotion/deletion outage; no unscanned bytes accessible; replaced files physically purged and stale links denied. |
| Payment | Approved confirmation/edit path; success, cancellation, failure, pending/timeout, unreachable/malformed provider, forged/delayed/duplicate callbacks, verify-success then DB failure, browser loss/reload and retries. Exactly one verified charge/submission, pinned units/amount, auditable recovery; payment-disabled branch only in staging unless approved for production. |
| Review/corrections | SUBMITTED → UNDER_REVIEW → NEEDS_EDIT → SUBMITTED twice → UNDER_REVIEW → VALIDATION_COMPLETED; no repayment/certificate; concurrent reviewers and stale actions safe; SMS failure leaves NEEDS_EDIT and explicit retry works without another correction. Existing applications recover while intake/programme is disabled. |
| Authorization | Applicant cross-owner denial; active ADMIN/SUPER_ADMIN full review/export; ENTRY_VIEWER metadata-only with direct download/mutation/export/audit denial; audit/config SUPER_ADMIN-only; inactive/session-expired denial. |
| Export/audit | All fields and repeats in related Persian sheets, all statuses, Tehran inclusive created-date bounds, formula-safe text; cap boundaries at/over 5,000 applications and 100,000 rows; authenticated current application-scoped links, no DRAFT/PENDING_PAYMENT links; safe 50-row audit pagination and immutable rows. Audit failure releases no protected output. |
| Resilience | DB unavailable/slow/conflict, transactional migration failure/rerun, scan/storage outages, delayed deletion, >100-row backlog and lock contention. Verify recovery/invariants rather than only error messages; safe fixed diagnostics, no credentials/PII/content in logs. |
| Legacy regression | Login/profile, existing/new route availability unchanged, submission, payment/retry/callback, old uploads and admin downloads, review/certificate/export and role grants; compare baseline behavior and counts. |

Run full unit/lint/type/build checks after confirmed fixes. Perform a documented critical requirements/security/operational/test-gap review under the applicable execution review policy. **G3 go:** all matrix rows have passing evidence or an approved inapplicable reason; no unresolved security, consistency, privacy or legacy regression findings. **No-go:** fix and rerun affected end-to-end paths and dependent artifact qualification.

## 6. Phase 4 — production inventory, matched backups and restore (G4)

Owner: Codex and access-bound operators; user exclusively takes current DB backup. Dependency: G3, approved maintenance/backup window. Read-only inventory first: actual running SHA/image digest, PostgreSQL/client versions and migration history, roles/grants, volumes (including any private root outside default volume), Nginx/Compose/env locations, scanner, active jobs, current facilities flags and in-flight payment counts. Do not assume facilities is disabled in production merely because documents say so.

Codex creates and pushes a uniquely dated code backup branch from verified current master and verifies its remote SHA, while preserving the actual deployed rollback artifact separately. Codex/operator backs up all uploads (legacy plus private staging/ready/templates), runtime/migration/Compose configuration, proxy, scanner/updater, scheduler and monitoring definitions, required role provisioning information and recovery secrets in protected storage. Verify full archive readability/checksums and restore ownership. Do not put backup contents in Git.

Coordinate a consistent database/storage/config snapshot. Quiesce relevant writers and reconciliation during the backup interval, accounting for legacy writes and payment callbacks, or use an independently proven consistent snapshot method. Codex/operator prepares and verifies this process. Record start/end times and treatment of in-flight callbacks. Never claim a live DB dump and a later changing upload tar are a matched pair without proof.

**User-owned handoff A — take current production DB backup:** Codex supplies the DEPLOYMENT.md `docker compose exec -T postgres pg_dump -U postgres -d sana` procedure adjusted to verified DB identity and server-compatible client, secure output path and agreed consistency window. User returns completion/exit status, timestamp/window, protected artifact location, byte size, checksum, DB/server identity and confirmation of agreed quiescence/snapshot conditions. No credentials or dump content in chat. Missing evidence stops G4; Codex does not take the backup on the user's behalf.

Codex/operator verifies the supplied dump, restores it to an isolated target using a format-appropriate tool (`psql -v ON_ERROR_STOP=1` for plain SQL; `pg_restore --exit-on-error` for custom format), restores matched files/config safely, provisions restricted roles, and checks counts, migrations, representative authorized documents and digest/length integrity. Then rehearse pending migration chain, runtime grants, new image and rollback image against this restored state. If production predates facilities, verify its legacy state before upgrade, then create synthetic facilities fixtures in the isolated copy for M1/M2/M6/M7/M8 checks. Never run test fixtures on production.

Measure restore/rollback time against approved RTO, prove audit immutability and scoped links, verify legacy behavior, and document backup RPO and any post-snapshot reconciliation needs. Test recovery to a compatible prior image while retaining additive schema. Catalog backup encryption/access/retention and cleanup of isolated copies.

**G4 evidence:** remote backup ref + both candidate/previous artifact identities, complete matched backup manifest, user DB handoff, successful real restore report and measured rollback/RTO. **No-go:** do not migrate or deploy. If intervening changes invalidate the consistent release backup, repeat non-DB backups and request a new user DB backup.

## 7. Phase 5 — production schema preparation and user deployment (G5)

Dependencies: G0–G4, staffed release window and explicit execution authorization. Keep facilities unavailable. Codex/operator installs approved runtime/scanner/storage/proxy configuration and preserves legacy behavior. Separate artifact transfer from app activation so migration precedes candidate startup.

**User-owned handoff B1 — upload/prestage:** user transfers the exact candidate source/artifact and Linux Prisma export prepared by Codex, without starting candidate app or automatic migration. Return production path, manifest/checksums, candidate SHA/image identity and confirmation that the old app still runs. If upload and activation cannot be separated, redesign/rehearse the handoff before proceeding; do not migrate with stale source.

Codex/operator verifies staged identity and maintains the migration window. Build only the maintenance image if needed and run repository maintenance procedure:

```bash
cd /data/apps/sana
docker compose build migrate
docker compose --profile migration run --rm migrate
```

Using the owner connection in a protected maintenance shell, apply the canonical idempotent grants (password prompt; not a command-line secret):

```bash
psql "$DATABASE_URL" -v runtime_role=sana_runtime \
  -f prisma/facilities-runtime-role-provision.sql
```

Check migration status/history for every expected finished migration and no failed/unresolved entry, and check runtime identity/grants directly, including denial of UPDATE/DELETE/TRUNCATE on audit/history, lack of owner/superuser membership, and legacy necessary privileges. Never use `prisma migrate dev`, reset, broad seed, or owner credentials for app startup. If suppliers are absent, prepare/review an idempotent supplier-only provisioning operation; general `db:seed` also handles other data and is not a safe assumed production shortcut.

Migration failure stops app activation. Preserve diagnostics, inspect transaction/Prisma state, repair using the rehearsed procedure only; no blind `migrate resolve` or destructive rollback. Leave old compatible app running only if verified safe, otherwise use agreed maintenance handling with operator ownership.

**User-owned handoff B2 — deploy/activate:** only after schema/grant gate, user builds/restarts the exact app (documented `docker compose build app`, `docker compose up -d app`) or activates the prepared image. Return candidate SHA/digest, deployment timestamp, effective configuration revision, `docker compose ps`, startup result and confirmation no implicit migration occurred. Codex/operator independently verifies container identity, local/public health and masked logs:

```bash
docker compose ps
docker compose logs --tail=100 app
curl -I http://127.0.0.1:3000
curl -I https://sana.ioiv.ir
docker compose exec -T app npm run facilities:check-readiness
```

Readiness is an intentional private write/read/delete and scan canary, not read-only. Run it only during the authorized release, as the real restricted runtime. It must exit 0 with all readiness booleans true and both aged backlogs zero. Supplement it: it does not test TRUNCATE grants, full role inheritance, ready-file serving/privacy, malware rejection, signature freshness, scheduler or backup validity, and its printed export limits are constants rather than a live load test.

**G5 go:** matching deployed artifact/config, all migrations/grants correct, health/readiness and legacy smoke pass, facilities still unavailable. **No-go:** stop; containment/rollback per Section 9. User performs any needed application redeployment.

## 8. Phase 6 — configuration, scheduler and controlled enablement (G6)

Owner: Codex/authorized SUPER_ADMIN; external operator when access is required. Dependency: G5. While programme remains off, save approved intake/payment/max-amount, publish scanned questionnaire versions and select approved suppliers. Verify server-side role denial and read back exact config/version identities with audit evidence; enabling a supplier/intake alone must not open the programme. Retain configuration snapshot for incident recovery; don't edit snapshot-pinned terms/amounts expecting existing drafts to change.

Run one approved reconciliation, verify actual backlog progress and readiness, then install/activate the five-minute schedule and monitoring prepared in Phase 2. Prove at least two scheduled successful runs with job identity/timestamps and alert routing. The reconciler deletes bytes: enable only after G4 backup/restore and scanner/storage approval, not as an exploratory production check.

Before enabling, verify all G0–G5 evidence against unchanged candidate/config, fresh readiness, signature/capacity/alert health, reachable responders, rollback artifact and user deployment availability. Approve the exact cohort and how access is limited. A single enabled supplier is not a user allow-list; a short globally open window is still globally open. If a private cohort is required, implement/rehearse suitable facilities-only access control first. Never block legacy access or gateway callbacks with an improvised global proxy rule.

Authorized SUPER_ADMIN enables the programme as the final configuration action; record timestamp, config IDs and audit event. Codex then verifies a consented canary applicant through profile, correct intake/supplier/template, upload/scan/download, approved confirmation, payment and submission, reviewer correction/resubmission and scoped export. Use a legitimate authorized production payment only if its amount and accounting treatment were approved; record safe IDs/outcomes, never charge or fabricate provider success as a test shortcut. Do not inject provider/DB/scanner/storage failures in production. Verify unauthorized sessions cannot access private canary evidence. Preserve canary history; do not delete audit rows or reset records to hide it.

**G6 go:** canary invariants hold, exactly one verified payment when enabled (no payment when explicitly disabled) and one submission, authorized protected files only, correction without repayment, audit/export correct, no legacy regression, two healthy scheduled runs and no new critical alert. Expand only to the explicitly approved intake/supplier population after the approved observation interval. **No-go:** close new intake and follow incident handling below.

## 9. Failure containment and rollback (applies at every gate)

Codex is incident coordinator; named infrastructure/DB/payment operators execute inaccessible actions; user exclusively redeploys prior application when needed. Roll back/contain immediately for unauthorized disclosure, corrupted data, duplicate charge/submission, audit mutability, failed migrations/grants, unsafe file serving or legacy regression. Hold expansion and close new intake for failed readiness, scanner/signature health, critical capacity, unrecoverable payment uncertainty, missed reconciler SLA or unmet canary criteria. SMS failure alone preserves NEEDS_EDIT and follows explicit retry; escalate/hold expansion according to approved support SLA.

1. Save safe incident evidence and record time, candidate/config, affected IDs/counts and pending gateway operations. Disable facilities programme/new intake via authorized audited admin operation. Verify fresh draft creation is denied.
2. Existing drafts, uploads, payments, corrections and reviews remain accessible under current design. For an active security/integrity incident, use the **previously rehearsed facilities-specific containment plan** for affected entry points/services. Preserve gateway callbacks or define provider reconciliation/queuing recovery before blocking them. A programme flag is not a universal kill switch. No destructive incident testing on production.
3. Pause reconciliation only if it threatens recoverability or storage consistency; record retention/backlog implications and explicit restart owner. Otherwise continue safe cleanup/monitoring for existing applications. Do not retain unknown quarantines indefinitely without incident escalation.
4. Codex selects the previously tested compatible rollback artifact/config and supplies its manifest. User performs application rollback deployment; operator restores non-application configuration. Verify image/health, grants, legacy smoke and pending facility payments using the reconciled runbook. Keep additive schema, file metadata, payment, correction and immutable audit/history. “M7 rollback” is conceptual at this repository boundary: M7/M8 share `a606399`; do not invent a separately deployable M7 commit.
5. Default to forward repair when old code cannot safely process newly created state. Database/upload restore is last resort, requires explicit destructive-restore authorization, approved RPO impact, matched pair, preserved incident evidence and reconciliation of post-backup payments/writes. Restoring a DB never reverses an external charge. Codex/operator performs approved restore work; taking a fresh current DB backup remains the user's handoff.
6. Re-enable only after root cause fix, staging regression/rehearsal, fresh required backup/evidence, and a repeated production preflight/canary. Record accepted residual impact and communication/support owner.

## 10. Phase 7 — observation, documentation and final acceptance (G7)

Owner: Codex with named on-call operators. Dependency: G6. Proposed observation window is 48 hours, requiring G0 acceptance; cover at least one full 24-hour retention cycle plus subsequent scheduled runs. Review immediately after enablement, at 30 minutes, 2 hours, 24 hours and closeout, with continuous operational alerts. Track success/failure rates, payment uncertainty, duplicate invariants, scanner/signature health, oldest quarantine/deletion age, job successes/skips/duration, disk/inodes/growth, export latency/caps, SMS delivery/retry and legacy errors. Quantitative latency/error and support thresholds must be fixed at G0 using baseline/load evidence, not invented during an incident.

Codex updates DEPLOYMENT.md, requirements/decision register, delivery plan, database/operations docs and M9 OpenSpec tasks with actual release state, exact tested commands, role ownership, backup/restore references, enablement time, monitoring destinations (no secrets), rollback procedure and observations. Reconcile obsolete historical “not deployed”/limit statements without erasing history. Archive OpenSpec only after its actual acceptance workflow is satisfied; do not mark unchecked work complete because rollout appeared healthy.

Maintain a release evidence ledger: gate ID, owner, UTC timestamp plus Tehran time where useful, candidate/config identity, command/check, expected and actual outcome, redacted evidence location, reviewer/approver and incident linkage. Changes invalidate affected later gates. Access to personal-data artifacts and production backups is restricted; audit metadata is retained indefinitely under the confirmed policy.

**Definition of done:** G0–G7 all passed; required product ambiguities resolved; prior milestones requalified on the final candidate; both exclusive user handoffs verified; matched backups demonstrably restorable within accepted RPO/RTO; schema/runtime grants and scanner/private storage proven; scheduler/alerts operational with named support; controlled production canary and approved expansion passed; observation covers retention and has no unresolved blocking incident; rollback remains usable with current data; documentation/evidence complete; legacy validation unchanged. No item is satisfied solely by a checked historical M7/M8 task or readiness exit 0.
