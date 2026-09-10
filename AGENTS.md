# Engineering Delivery Rules

## Current Development Baseline

- Develop the client-requested functionality on `master`, as agreed with the project owner.
- The pre-change code rollback point is `backup-master-2026-09-10` at commit
  `ab16e9122881617d6c7dcf9fb84878c00684ee03`.
- Before production deployments that affect data, schema, or uploaded files, create a
  new dated Git backup branch and take verified production database, upload-storage,
  and relevant configuration backups.

## Before Implementation

When the client requirements conversation is provided, analyze it completely before
editing application code. Produce and obtain agreement on:

1. Confirmed requirements, unknowns, and explicit assumptions.
2. The database model, migrations, data-retention implications, and rollback approach.
3. The end-to-end user journey, including the multi-step form, validation, accessible
   mobile-first UI states, and clear Persian user-facing copy.
4. Payment and file-upload implications, including security, reliability, capacity,
   privacy, and operational requirements.
5. A phased delivery plan with acceptance criteria and test coverage for every phase.

Follow the existing design system and visual language. Every interface must be
mobile-first, responsive, accessible, and consistent with established components and
interaction patterns.

## Implementation and Verification Loop

Implement work in small, independently verifiable phases. For each phase, complete
this loop before proceeding:

1. Implement and test the database/migration and backend behavior.
2. Implement and test the frontend behavior, including loading, empty, error,
   validation, success, retry, and permission-denied states where applicable.
3. Test the complete frontend-to-backend integration with realistic data.
4. Run regression tests, type checks, linting, and a production build as appropriate.
5. Ask independent sub-agents to act as critical reviewers. They must look for flaws,
   missing requirements, unsafe assumptions, edge cases, regressions, and test gaps;
   they are reviewers, not merely implementation assistants.
6. Fix confirmed findings and re-run the relevant tests.

Do not mark a phase complete solely because its happy path works.

## Security and Reliability Requirements

Treat payments, personal data, administrative actions, and uploads as high-risk areas.

### Payments

- Verify payment callbacks server-side with the gateway; never trust a browser return
  value as proof of payment.
- Make callback processing idempotent: retries and duplicate callbacks must not create
  duplicate records, payments, state transitions, or notifications.
- Model and test successful, failed, cancelled, pending, timeout, retry, malformed,
  forged, and duplicated callback scenarios.
- Use authenticated, authorized state transitions and preserve an auditable history.
- Do not expose credentials, gateway secrets, tokens, or unnecessary payment details
  in source control, client code, logs, or user-facing errors.

### File Uploads

- Enforce authorization, ownership, size limits, count limits, and an allow-list of
  accepted file types on the server.
- Validate actual file content/type rather than trusting only filenames or client MIME
  types; generate safe storage names and prevent path traversal.
- Keep private uploads private by default, serve them only through authorized access,
  and avoid leaking filesystem paths.
- Define retention, deletion, error-recovery, and capacity behavior before shipping.

### General

- Validate all untrusted input on the server and use least-privilege access.
- Avoid logging sensitive personal, payment, authentication, or file content data.
- Keep migrations backwards-compatible when a rolling deployment could expose old and
  new application versions concurrently.

## Chaos Engineering

Use controlled, safe failure-injection tests to prove that important flows fail safely
and recover correctly. Run chaos tests in local, test, or staging environments only;
never intentionally disrupt production services or production data without explicit
written approval and an agreed rollback plan.

For each relevant feature, simulate and test at least the applicable failures:

- Database unavailable, slow, transaction conflict, or migration failure.
- Payment provider timeout, unreachable provider, malformed response, callback delay,
  callback duplication, and verification failure.
- Upload interruption, oversized/disallowed/corrupt file, storage unavailable, and
  repeated submission.
- Network loss, browser refresh, duplicate click/request, expired session, and
  concurrent updates.
- External notification/SMS failure after a successful core transaction.

Expected behavior must be explicit: preserve data consistency, avoid duplicate charges
or records, provide actionable Persian messages, retry only when safe, log useful
non-sensitive diagnostics, and allow a user or operator recovery path. Turn discovered
failure modes into automated regression tests whenever practical.

## Documentation

Update `DEPLOYMENT.md` and relevant technical documentation whenever deployment,
backup, schema, payment, upload, or operational behavior changes. Record decisions,
trade-offs, migration/rollback procedures, and how to verify the release.
