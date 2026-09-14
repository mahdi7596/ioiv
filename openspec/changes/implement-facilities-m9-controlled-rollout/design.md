## Context

The `master` candidate at M8 contains the complete facilities workflow, additive migrations, restricted-runtime grants, a private-file reconciler, and an M8 readiness canary. M9 is an operational release milestone, not a new applicant feature. The baseline delivery plan requires deployment behind existing availability controls, while `AGENTS.md` requires dated source and matched production data/file/configuration backups, an isolated restore rehearsal, chaos coverage outside production, and a phased verification loop.

The reviewed rollout plan is directionally aligned but not yet executable: G0 contains unresolved business and operational decisions; production inventory and access are unavailable in the repository; the user exclusively owns the live database dump and application transfer/redeployment; and no structured M9 artifacts currently prevent incomplete evidence from being treated as a passed gate.

## Goals / Non-Goals

**Goals:**

- Make G0–G7 and their dependencies explicit, fail-closed, and machine-checkable.
- Produce a reproducible release manifest tied to a clean Git SHA and checksums of dependency, schema, migration, runtime-example, and operational files.
- Provide read-only M9 preflight for database role/configuration state, including an explicit expected availability mode.
- Provide reviewable, disabled-by-default examples for internal ClamAV, five-minute reconciliation, readiness monitoring, facilities upload proxy limits, and redacted evidence collection.
- Provide a production-safe supplier-only provisioner and coverage without invoking the broad development seed.
- Preserve all legacy and facilities product behavior and leave production execution gated.

**Non-Goals:**

- Resolving product-owner decisions, inventing questionnaire files/intakes/canary cohorts, or declaring any production gate passed without evidence.
- Taking the current production database backup, uploading/redeploying the production application, installing infrastructure, enabling facilities, processing a real payment, or intentionally injecting production failures.
- Adding a database migration or changing application, payment, correction, upload, export, audit, or legacy-validation behavior.

## Decisions

1. Store the controlled-rollout contract in OpenSpec plus a checked-in M9 runbook. The OpenSpec requirements are the testable contract; the runbook carries commands, handoffs, incident actions, and evidence expectations. This avoids encoding production secrets or mutable operational evidence in source.
2. Use JSON documents validated against checked-in JSON Schemas for the decision register and evidence ledger. Markdown-only checklists are easy to mark incorrectly; JSON supports deterministic validation, while separate examples remain readable and contain no real personal, secret, or production values.
3. Gate evidence forms a strict chain: a gate cannot pass unless its required decision records are approved, required checks have successful outcomes, referenced evidence is redacted and located outside Git, and the candidate/config identity has not changed. Production gates remain pending in repository examples.
4. Generate the candidate manifest locally from an explicitly clean tracked worktree. The generator hashes fixed release inputs and every migration without copying secrets or building artifacts. Image, Linux Prisma export, previous deployment, and remote backup-ref identities remain required external fields for later gates because fabricating them would defeat the control.
5. Keep the M9 preflight read-only and distinct from the M8 readiness canary. In the migration-owner maintenance context it checks migration history and program state while inspecting an explicitly named runtime role's ownership, attributes, memberships, and immutable-table privileges. This avoids granting the runtime access to Prisma's migration ledger. Operators run the existing canary separately as the restricted runtime only during an authorized window because it writes/scans/deletes a private object.
6. Require an explicit `--expect-programme disabled|enabled` argument. G1–G5 require `disabled`; G6 uses `enabled` only after the audited SUPER_ADMIN action. Omitting the expectation fails rather than assuming the safe state.
7. Add an idempotent supplier-only command with a fixed compiled allow-list and a transaction. It never updates existing names, creates programme configuration, seeds admins/users/demo data, or enables anything. A dry-run is the default; `--apply` is explicit. This is safer than the broad `db:seed` path for production foundation repair.
8. Provide operations as examples/templates, not active deployment configuration. The ClamAV override binds no host port; scheduler examples use noninteractive Compose execution and distinguish exit 2 from success; monitoring examples define signals and thresholds but require a named local integration and responders before G2 can pass.
9. Add no schema migration. Rollback redeploys the previously rehearsed compatible application/configuration and retains additive M1–M8 schema, payments, files, audit, and history. Database/file restore remains a last resort requiring explicit destructive authorization and post-snapshot payment/write reconciliation.
10. The user-requested no-subagent constraint overrides the normal independent-agent review step for this implementation. A documented solo adversarial review and full automated verification are required; production approval still requires the named human authorities in G0.

## Risks / Trade-offs

- [A validator can prove document completeness but not the truth of external evidence] → Require named approvers, timestamps, immutable candidate/config identities, protected external evidence locations, and human gate review.
- [Operational templates can be copied without environment validation] → Mark them examples, keep services disabled by default, and require staging evidence for network isolation, signatures, limits, restart, alerts, and legacy proxy behavior.
- [A preflight query could be run with owner credentials] → Report role attributes/ownership and fail when the current role is superuser, can create roles/databases, owns protected tables, or can mutate immutable tables.
- [Supplier provisioning bypasses application audit] → Restrict it to missing immutable catalogue rows before enablement, emit only safe counts, require owner maintenance context, and record the command as release evidence; all configurable availability remains audited admin behavior.
- [Candidate files can change after manifest creation] → Require a clean worktree, bind checksums to the Git SHA, and invalidate downstream gates whenever candidate/config identities change.
- [A globally enabled programme cannot implement a private per-user canary] → Require a product decision: use an approved globally open cohort/window or implement and rehearse facilities-only cohort access before G6.

## Migration Plan

1. Land the M9 specification, validators, manifest/preflight/provisioner, examples, tests, and documentation on `master` with facilities disabled.
2. Resolve and approve G0 outside secrets-bearing source files, then qualify the immutable candidate through G1–G3 in isolated local/staging environments.
3. During the approved production window, inventory first, create/push a new dated source backup branch, obtain the user-owned consistent database dump, back up matched files/configuration, and prove an isolated restore and rollback for G4.
4. Prestage the exact candidate through the user-owned handoff, apply migrations/grants with the owner maintenance context, activate through the user-owned deployment handoff, and pass disabled-state preflight/readiness/legacy smoke for G5.
5. Configure through audited admin actions, activate and prove scheduler/alerts, explicitly enable only after all dependencies pass, run the consented canary, observe for the approved interval, and record G6–G7 evidence.
6. On a stop condition, disable new facilities intake, preserve callbacks and existing recovery paths, retain additive schema/data/history, and redeploy only the rehearsed compatible artifact. Restore matched data/files only with explicit destructive authorization and reconciliation.

## Open Questions

- G0 must resolve intake dates/timezone/manual scheduling, supplier subset/templates, payment copy/versioning, correction-scope conflict, profile quota, file-unit/archive policy, scanner ownership/signature SLA, capacity/backup retention, monitoring responders/SLA, RPO/RTO, canary access, observation thresholds, and any unremediated critical/high production dependency finding.
- Production inventory must establish the actual deployed SHA/image, PostgreSQL and migration state, runtime role/grants, paths/volumes, proxy/scanner/scheduler/monitoring state, facilities flags, and in-flight payments before G4.
