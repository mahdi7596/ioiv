## ADDED Requirements

### Requirement: Rollout gates fail closed
The M9 rollout SHALL use ordered gates G0 through G7, SHALL retain facilities unavailable through G5, and SHALL prohibit a later gate from passing unless every dependency has current successful evidence for the same candidate and configuration identity.

#### Scenario: Unresolved decision blocks qualification
- **WHEN** any G0 decision affecting security, payment, data correctness, privacy, applicant promises, ownership, access, RPO/RTO, canary scope, or support remains unresolved or unapproved
- **THEN** G0 and all dependent gates remain pending and facilities remains unavailable

#### Scenario: Candidate identity changes
- **WHEN** source, dependencies, migrations, generated Prisma artifact, image, or effective release configuration changes after a gate passed
- **THEN** that gate and every dependent gate are invalidated until requalified

### Requirement: Rollout evidence is explicit and redacted
The release process SHALL record each gate check with owner, UTC timestamp, candidate/configuration identity, expected and actual outcome, result, protected evidence reference, approver, and incident linkage, and SHALL NOT store credentials, tokens, private document contents, database dumps, upload archives, or personal data in the repository ledger.

#### Scenario: Evidence record is incomplete
- **WHEN** a required evidence entry lacks an owner, timestamp, identity, outcome, protected reference, or approval required by its gate
- **THEN** the evidence validator rejects the gate as incomplete

#### Scenario: Secret-shaped field is supplied
- **WHEN** a decision or evidence document contains a prohibited secret-bearing field
- **THEN** validation fails without printing the supplied value

### Requirement: Production handoffs remain explicit
The rollout SHALL treat the current production database backup and application upload/redeployment as exclusive user handoffs, and SHALL treat inaccessible infrastructure, database, scanner, proxy, scheduler, secrets-manager, or monitoring work as named operator actions.

#### Scenario: Database handoff evidence is absent
- **WHEN** the user has not returned the verified database dump status, window, protected location, size, checksum, database identity, and consistency confirmation
- **THEN** G4 SHALL NOT pass and migration or deployment SHALL NOT begin

#### Scenario: Application activation is requested before schema gate
- **WHEN** the exact candidate cannot be prestaged independently or migrations and runtime grants have not passed
- **THEN** application activation SHALL stop until the handoff is redesigned and rehearsed

### Requirement: Controlled enablement uses audited application controls
Facilities SHALL be enabled only as the final G6 configuration action by an authorized active `SUPER_ADMIN`, after approved intake, supplier, template, payment, scanner, storage, scheduler, monitoring, backup, restore, rollback, responder, and canary evidence has been revalidated.

#### Scenario: Infrastructure is ready but programme is disabled
- **WHEN** G5 preflight and readiness pass while the programme is disabled
- **THEN** the release remains safe to configure but applicants cannot create new facilities drafts

#### Scenario: Canary cohort needs per-user restriction
- **WHEN** the approved canary requires a private user allow-list
- **THEN** G6 remains blocked until facilities-only cohort access control is implemented and rehearsed

### Requirement: Existing work and legacy validation survive containment
Disabling new facilities intake SHALL NOT silently destroy or strand existing facilities drafts, uploads, payment callbacks, corrections, or review work, and M9 SHALL NOT change the existing validation route.

#### Scenario: Critical rollout incident occurs
- **WHEN** unauthorized disclosure, corruption, duplicate charge/submission, audit mutability, unsafe file serving, failed migration/grant, or legacy regression is detected
- **THEN** operators preserve safe evidence, close new facilities intake, preserve required callbacks and recovery paths, and use the rehearsed containment or compatible rollback procedure

#### Scenario: Database restore is considered
- **WHEN** forward repair or compatible application rollback cannot recover safely
- **THEN** matched database/file restore requires explicit destructive authorization, accepted RPO impact, preserved incident evidence, and reconciliation of external payments and post-snapshot writes

### Requirement: Observation precedes completion
M9 SHALL remain incomplete until the approved observation interval covers at least one full 24-hour unavailable-file retention cycle and subsequent scheduled reconciliation, with no unresolved blocking incident and complete documentation.

#### Scenario: Canary succeeds but observation is incomplete
- **WHEN** the production canary passes before the approved observation interval ends
- **THEN** G6 may be recorded but G7 and M9 remain incomplete
