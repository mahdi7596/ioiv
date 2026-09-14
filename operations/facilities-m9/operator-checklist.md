# M9 controlled rollout operator checklist

Use this with the decision register, evidence ledger, and the full M9 plan. Store actual
evidence in approved protected storage and reference it as `protected://...`; never put
secrets, personal data, dumps, uploads, or real configuration values in Git.

## G0 — approved decisions and ownership

- [ ] Every decision in `decision-register.pending.example.json` has an accepted value, named approver, decision time, and protected evidence reference.
- [ ] Scanner, infrastructure, DB, payment, SMS, monitoring, and primary/backup incident operators are named with access tested.
- [ ] Maintenance window, RPO/RTO, consistency method, canary access/volume/window, observation interval, thresholds, and containment are approved.
- [ ] The correction-scope/profile-byte conflict, profile quota, units/archive rules, payment copy/versioning, and exact questionnaires are resolved.
- [ ] Production dependency audit has no unremediated critical/high runtime finding, or a named security/release authority has documented exposure analysis, compensating controls, expiry, and accepted residual risk.

## G1 — immutable candidate

- [ ] `npm ci`, Prisma validate/generate, Vitest, lint, type check, and production build pass on the exact clean SHA.
- [ ] `npm audit --omit=dev` is reviewed against actual runtime exposure; fixes are applied and requalified, and unresolved findings block release unless explicitly accepted under G0.
- [ ] The M9 candidate manifest is generated from the clean SHA; Linux Prisma export, candidate image, previous deployment, and remote backup-ref identities are filled and verified externally.
- [ ] Full ordered pending migration chain is compared with production history; rollback compatibility is reviewed.

## G2 — staging operations

- [ ] Runtime role is restricted; owner credentials exist only in the protected migration context; runtime/config files have least-privilege permissions.
- [ ] Private storage persists through container recreation and passes write/read/delete, backup coverage, staging/ready separation, path privacy, and unauthenticated/static denial.
- [ ] Pinned ClamAV and signature updater are isolated; freshness, update failure, harmless malware detection, every allowed clean format, 25 MiB stream, and archive limits pass.
- [ ] Exact 25 MiB upload and one byte above pass/fail as designed through the proxy without legacy regression.
- [ ] More than 100 reconciliation items drain across batches; concurrency, lock skip, restart, missed-run recovery, and safe state timestamps pass.
- [ ] Capacity/concurrency is measured with realistic scans/exports; byte/inode thresholds are approved; real alert destination confirms receipt/escalation.

## G3 — acceptance and chaos rehearsal

- [ ] M1/M2/M6/M7/M8 database suites and M1 recovery pass in isolated databases, followed by full tests/lint/types/build.
- [ ] Eligibility/profile, config/draft, full wizard, upload lifecycle, payment matrix, two correction cycles, authorization, export/audit, and legacy regression matrices pass.
- [ ] DB, migration, scanner, storage, deletion, upload, network, browser, concurrency, provider, SMS, and scheduler failures recover safely in local/staging only.
- [ ] Confirmed findings from critical requirements/security/operations/test-gap review are fixed and re-run.

## G4 — matched production backup and restore

- [ ] Read-only production inventory records actual deployment, PostgreSQL/migrations, roles/grants, storage/config/proxy/scanner/jobs, flags, and in-flight payments.
- [ ] New dated source backup ref is pushed and remote SHA verified; actual previous deploy artifact is preserved separately.
- [ ] User handoff A supplies current database dump exit/time window, protected location, size/checksum, DB identity, and consistency confirmation.
- [ ] Uploads plus private staging/ready/templates, configuration, proxy, scanner, scheduler, monitoring, role provisioning, and recovery material form a proven consistent protected set.
- [ ] Real isolated restore verifies counts, files/digests, permissions, migrations, synthetic facilities qualification, legacy behavior, rollback, measured RTO, and post-snapshot reconciliation.

## G5 — schema and user deployment handoffs

- [ ] User handoff B1 prestages the exact candidate and Linux Prisma export without activation; checksums/identity match while the old app remains running.
- [ ] Owner maintenance applies the canonical pending migration chain and grants; history has no unresolved migration; runtime role denial includes UPDATE/DELETE/TRUNCATE and owner inheritance.
- [ ] User handoff B2 activates the exact verified candidate without implicit migration and returns identity, time, effective config, service/startup result.
- [ ] Health, disabled-state M9 preflight, authorized readiness canary, private-file checks, and legacy smoke pass while facilities remains unavailable.

## G6 — configure and enable

- [ ] Approved intake/payment/amount, scan-passed questionnaire versions, and suppliers are saved/read back with SUPER_ADMIN denial/audit checks while programme remains off.
- [ ] Reconciler runs once safely, then the approved timer and monitoring are installed; two successful scheduled runs and alert routing are proven.
- [ ] Every prior gate is current; responders and user rollback availability are confirmed; cohort access matches the approved model.
- [ ] Authorized SUPER_ADMIN enables the programme as the final action; timestamp/config IDs/audit are recorded.
- [ ] Consented production canary proves profile through export/correction, exactly one legitimate verified payment when enabled, no repayment, scoped private files, audit, and no legacy regression.

## G7 — observe and accept

- [ ] Checks at enablement, 30 minutes, 2 hours, 24 hours, and approved closeout cover at least one 24-hour retention cycle plus later scheduled runs.
- [ ] Payment, duplicates, scanner/signatures, quarantine/deletion, job timing/skips, capacity/growth, export, SMS, app/DB, support, and legacy metrics remain within approved thresholds.
- [ ] Deployment, requirements/decision, delivery, database/operations, evidence, rollback, and OpenSpec records reflect actual state without erasing history.

## Immediate containment

For disclosure, corruption, duplicate payment/submission, audit mutability, unsafe file
serving, failed migration/grants, or legacy regression: preserve safe evidence; close new
facilities intake through audited control; preserve callbacks and existing recovery;
pause reconciliation only if it threatens recoverability; use the rehearsed compatible
application/config rollback. Matched data/file restore is last resort and requires
explicit destructive authorization plus payment/post-snapshot reconciliation.
