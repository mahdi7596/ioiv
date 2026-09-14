## 1. Contracts and release records

- [x] 1.1 Bring the reviewed M9 plan into the repository and reconcile its alignment findings with the confirmed requirements and delivery milestone.
- [x] 1.2 Add fail-closed decision-register and gate-evidence schemas, safe pending examples, and validator coverage.

## 2. Reproducible candidate and preflight

- [x] 2.1 Add a clean-worktree candidate manifest generator with deterministic release-input and migration checksums plus pending external-artifact identities.
- [x] 2.2 Add a read-only, explicit availability-state M9 database preflight covering programme/intake/supplier/payment state, migrations, runtime role attributes, ownership, and immutable grants.
- [x] 2.3 Add unit coverage for manifest and preflight result evaluation, including dirty input, availability mismatch, privileged runtime, and stale/failed gate conditions.

## 3. Narrow production foundation repair

- [x] 3.1 Add a dry-run-by-default, explicit-apply supplier-only provisioner for exactly the four approved suppliers.
- [x] 3.2 Add isolated database coverage proving idempotency and absence of programme, intake, template, user, admin, and availability side effects.

## 4. Operational preparation

- [x] 4.1 Add disabled-by-default internal ClamAV/signature-update, facilities proxy-limit, five-minute scheduler, and safe monitoring examples.
- [x] 4.2 Add a release operator checklist covering scanner/signature/malware, storage persistence/privacy/capacity, multi-batch reconciliation, alerts, matched backups/restore, user handoffs, canary, observation, containment, and rollback.

## 5. Integration and documentation

- [x] 5.1 Add package commands and environment-example controls for M9 validation, candidate generation, preflight, and supplier provisioning.
- [x] 5.2 Update `DEPLOYMENT.md`, database documentation, requirements decision register, and delivery plan with the implemented M9 boundary, exact commands, evidence handling, and remaining production blockers.

## 6. Verification and review

- [x] 6.1 Run OpenSpec validation, M9 unit/database tests, M1/M2/M6/M7/M8 database suites where isolated dependencies are available, full Vitest, lint, type checks, and production build.
- [x] 6.2 Perform the user-requested solo adversarial requirements/security/resilience/test-gap review, fix confirmed findings, rerun affected checks, and leave G0–G7 production tasks pending until real evidence exists.
