## ADDED Requirements

### Requirement: Singleton idempotent reconciliation
Facilities reconciliation MUST run as a maintenance-only singleton and MUST preserve safe idempotency across retries, missing objects, duplicate invocations, promotion failures, and deletion failures.

#### Scenario: Concurrent invocation
- **WHEN** another reconciler holds the facilities advisory lock
- **THEN** the second invocation exits without processing lifecycle rows or reporting success as a completed reconciliation

#### Scenario: Recoverable failure
- **WHEN** storage, scanning, promotion, or deletion fails transiently
- **THEN** database/file state remains consistent, the command exits non-zero when appropriate, and a later safe retry can recover

### Requirement: Approved quarantine retention
Terminal failed/corrupt/disallowed/interrupted bytes MUST purge on the next successful reconciliation, while scanner/storage-unavailable bytes MUST be retried for no more than 24 hours before becoming terminal and being purged.

#### Scenario: Unavailable within retention
- **WHEN** an unavailable upload is younger than 24 hours
- **THEN** reconciliation retries it and keeps it non-downloadable until it passes

#### Scenario: Unavailable retention expires
- **WHEN** an unavailable upload is at least 24 hours old
- **THEN** it becomes a terminal safe failure, its bytes are purged, safe metadata remains, and any application-scoped expiry is audited

### Requirement: Actionable safe recovery UX and operations
The system SHALL distinguish temporary retained outages, expired re-upload requirements, and permanent rejection in Persian while exposing only non-sensitive operational diagnostics.

#### Scenario: Temporary scanner outage
- **WHEN** scanning or storage is temporarily unavailable
- **THEN** the applicant is told the file is retained for retry and is not shown as ready

#### Scenario: M8 readiness check
- **WHEN** an operator follows the documented readiness procedure
- **THEN** database grants, audit immutability, scanner, private storage canary, backlog age, export limits, trusted URL, disk capacity, backup, rollback, and scheduler prerequisites can be verified without exposing secrets
