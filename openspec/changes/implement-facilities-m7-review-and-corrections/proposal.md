## Why

Facilities applications can now be submitted and paid, but administrators cannot review their data or protected evidence and applicants cannot complete the confirmed repeated-correction workflow. M7 completes that operational loop while keeping the legacy validation application unchanged.

## What Changes

- Add a facilities-only admin queue and review detail experience with explicit role-based permissions.
- Allow authorized reviewers to start review, request corrections repeatedly, finish validation, and download current protected evidence.
- Add durable correction-SMS outcome tracking and safe manual retry without rolling back the core correction request.
- Allow applicants in `NEEDS_EDIT` to update application fields and replace evidence, then resubmit without another payment.
- Show facilities correction requests and append-only status history to applicants and reviewers.
- Lock the mutable company profile while a paid/submitted facilities application is active so the reviewer sees the current documents that correspond to the captured application profile.

## Capabilities

### New Capabilities

- `facilities-admin-review`: Facilities queue, detail, reviewer permissions, protected file access, and final validation.
- `facilities-correction-cycle`: Repeated correction requests, applicant editing/resubmission, correction SMS delivery state, and status timelines.

### Modified Capabilities

No canonical specifications exist under `openspec/specs`; this change does not modify the legacy validation specifications.

## Impact

- Adds facilities review pages, Server Actions, permission keys, applicant correction states, and protected download authorization.
- Adds an additive Prisma migration for correction notification state and audit action values, plus restricted runtime-role grants.
- Extends the existing facilities SMS adapter, application submission logic, company-profile lock rules, tests, and deployment/database documentation.
- Does not change legacy `Application`, legacy admin submission routes, legacy uploads, legacy payment behavior, or certificate behavior.
