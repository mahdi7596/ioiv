## ADDED Requirements

### Requirement: Candidate manifests are reproducible
The release tooling SHALL generate a manifest only from a clean tracked checkout and SHALL bind the full source SHA to checksums for the lockfile, Prisma schema, ordered migration files, runtime examples, deployment configuration, and M9 operational files without reading or recording secrets.

#### Scenario: Worktree is dirty
- **WHEN** candidate manifest generation detects tracked modifications or untracked release inputs
- **THEN** it fails and does not present the candidate as immutable

#### Scenario: External artifact is not yet built
- **WHEN** an image, Linux Prisma export, prior deployed artifact, or remote backup ref does not yet exist
- **THEN** the manifest marks the required identity pending rather than fabricating a checksum

### Requirement: M9 preflight is read-only and expectation driven
The M9 preflight SHALL require an explicit expected programme availability state and runtime-role name and SHALL use the migration-owner maintenance context to read database configuration, intake/supplier counts, payment activity, target runtime-role attributes/membership, protected-table ownership, migration state, and immutable-table grants without mutating application data or granting the runtime access to migration history.

#### Scenario: Disabled-state release preflight
- **WHEN** an operator runs preflight for G1–G5 with `disabled` expected and the programme is absent or disabled with a restricted non-owner runtime role
- **THEN** the availability and least-privilege checks pass while all other results are reported as safe structured metadata

#### Scenario: Availability differs from expectation
- **WHEN** actual programme availability differs from the explicit expected state
- **THEN** preflight exits nonzero and reports only the boolean mismatch

#### Scenario: Owner or privileged runtime is used
- **WHEN** the current database role is superuser, can create roles/databases, inherits an owner role, owns protected tables, or can update/delete/truncate immutable audit/history tables
- **THEN** preflight exits nonzero

### Requirement: Production supplier provisioning is narrow and idempotent
The maintenance provisioner SHALL contain exactly the four approved supplier names, SHALL default to a no-write dry run, and with explicit apply SHALL insert only missing suppliers in one transaction without changing existing rows or creating users, admins, intakes, templates, programme configuration, or availability.

#### Scenario: Approved catalogue already exists
- **WHEN** all four exact supplier rows exist and the provisioner is applied repeatedly
- **THEN** no rows change and the command reports zero insertions

#### Scenario: Broad seed data is configured
- **WHEN** demo or admin seed environment variables are present
- **THEN** the supplier-only provisioner ignores them and still performs only the fixed catalogue operation

### Requirement: Private scanner and storage operations are isolated
The M9 operations package SHALL provide a disabled-by-default internal scanner configuration with signature updates, no published scanner port, persistent facilities storage under the uploads mount, and explicit staging checks for clean files, harmless malware detection, maximum streams/archives, write/read/delete persistence, capacity, and static-serving denial.

#### Scenario: Scanner is unreachable or stale
- **WHEN** clamd is unavailable, its signatures exceed the approved maximum age, or malware-test detection fails
- **THEN** G2 and every enablement gate remain blocked

#### Scenario: Private file is reachable through static proxy
- **WHEN** a facilities private storage key can be fetched without an authorized application route
- **THEN** G2 fails and facilities remains unavailable

### Requirement: Scheduler outcomes are monitored accurately
The M9 scheduler SHALL invoke reconciliation every five minutes with the restricted runtime, SHALL treat exit 0 as a completed batch, exit 2 as a lock-held skip, and exit 1 as an incident, and SHALL monitor last successful completion, repeated skips, duration, backlog age/count, throughput, capacity, scanner signatures, backup age, payment uncertainty, and correction-SMS age.

#### Scenario: More than one batch is queued
- **WHEN** reconciliation exits 0 after processing its bounded batch while eligible backlog remains
- **THEN** monitoring SHALL NOT report the entire backlog drained and subsequent scheduled runs must prove progress

#### Scenario: No successful reconciliation for ten minutes
- **WHEN** the proposed threshold is approved and no run completes successfully for ten minutes
- **THEN** the configured alert destination receives an actionable page and G6 expansion is held

### Requirement: Backups are matched and restorable
G4 SHALL use a verified source backup ref, exact candidate and previous deployment identities, a consistent production database/upload/configuration snapshot, protected checksummed artifacts, and an isolated restore/rollback rehearsal measured against approved RPO/RTO.

#### Scenario: Database and upload snapshots are not consistent
- **WHEN** writers or reconciliation change files between independently taken database and upload backups without a proven snapshot method
- **THEN** the pair is rejected and G4 requires a new consistent backup set

#### Scenario: Restore succeeds but external writes are omitted
- **WHEN** the rehearsal does not account for payment callbacks or writes after the snapshot
- **THEN** rollback acceptance fails until reconciliation ownership and procedure are documented and tested

### Requirement: Failure injection is non-production only
Database, migration, scanner, storage, upload, network, browser, payment-provider, SMS, concurrency, and scheduler failures SHALL be injected only in disposable local or staging environments with automated regression coverage where practical.

#### Scenario: Production chaos test is proposed
- **WHEN** a rollout check would intentionally disrupt production services or data without separate written approval and rollback agreement
- **THEN** the check is rejected and replaced by staging evidence or a non-destructive production observation

### Requirement: Runtime dependency findings block release
The exact candidate SHALL receive a production dependency audit, SHALL apply and requalify available safe fixes, and SHALL keep G1 and production rollout blocked for any unremediated critical/high runtime finding unless a named security and release authority records exposure analysis, compensating controls, expiry, and accepted residual risk.

#### Scenario: High finding has no registry fix
- **WHEN** the production dependency audit reports a critical/high runtime advisory with no supported registry fix
- **THEN** the candidate remains a no-go until the dependency is replaced or the required time-bounded residual-risk acceptance is approved and evidenced
