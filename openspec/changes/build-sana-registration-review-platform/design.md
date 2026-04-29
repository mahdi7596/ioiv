## Context

The repository currently contains planning documents for a new Sana registration and review platform, but no application code. The client already has a WordPress site, so this platform will run separately on `sana.ioiv.ir` and focus on OTP login, company application intake, non-refundable Zarinpal payment, and admin review.

The target is a production-minded first version that can be built quickly. The app must support Persian/RTL users, local VPS deployment, PostgreSQL persistence, protected uploads, Ghasedak SMS, and admin exports.

## Goals / Non-Goals

**Goals:**

- Build a full-stack Next.js App Router application with TypeScript.
- Persist users, admins, OTPs, applications, uploaded file metadata, payments, and status history in PostgreSQL through Prisma.
- Provide user and admin OTP login using a shared SMS adapter.
- Let users create and resume a five-step application draft, upload required documents, confirm non-refundable payment terms, pay through Zarinpal, and track status.
- Let admins search, filter, export, inspect, and update submissions with notes and notifications.
- Protect uploaded files so only the owning user or an active admin can download them.

**Non-Goals:**

- Replace or modify the existing WordPress site.
- Build a CMS-polished admin experience.
- Add public admin registration.
- Add advanced file management, file preview, virus scanning, resumable uploads, or cloud object storage in version one.
- Support repeat submissions for the same `mobile + companyNationalId + applicationRound` combination in the active round.

## Decisions

### Use Next.js App Router as the full-stack boundary

The app will use Next.js pages, server components, route handlers, and server-side helpers rather than a separate React frontend and Nest/Node backend. This reduces coordination cost and keeps the two-day first implementation realistic.

Alternative considered: split frontend/backend architecture. It offers cleaner service boundaries for a larger team, but it adds deployment and integration overhead that is not needed for this first version.

### Use PostgreSQL with Prisma

PostgreSQL will store the authoritative state and Prisma will provide typed access, migrations, and a simple seed path for the first admin. The schema will include `applicationRound` from the start so future application rounds can allow repeat submissions without changing historical uniqueness rules.

Alternative considered: Drizzle. Drizzle is a good fit, but Prisma's migration and seed workflow is simpler for this project shape.

### Use signed HTTP-only cookie sessions

After OTP verification, the app will issue signed HTTP-only cookies containing `{ subjectId, kind }` and a seven-day expiry. User and admin sessions are separate by `kind`, and protected routes/actions must check the expected kind.

Alternative considered: database-backed sessions. They are useful for revocation and audit, but signed cookies are enough for the first version and reduce schema and cleanup work.

### Centralize validation with Zod

Auth and application validation will live in shared Zod modules and be reused by UI and server-side mutations. Server-side validation remains authoritative, especially for final submission, payment start, upload rules, and status changes.

### Store uploads on the VPS filesystem

Version one will store files under `{UPLOAD_DIR}/{applicationId}/{fieldKey}/{generatedFileName}` and keep metadata in `ApplicationFile`. Downloads go through a protected route instead of exposing direct static paths.

Alternative considered: S3-compatible object storage. It is better for scale and durability, but local VPS storage is faster to deliver and matches the approved scope.

### Use adapters for external services

SMS and payment integrations will sit behind internal modules. In development, SMS logs to console and payment can use Zarinpal sandbox configuration. In production, credentials come from environment variables.

## Risks / Trade-offs

- Local upload storage can be lost or fill disk space → document backup, permissions, and monitoring needs in deployment notes.
- Zarinpal and Ghasedak API details may differ from assumptions → isolate each provider in a small module and fail with clear errors when credentials or responses are invalid.
- Signed cookie sessions cannot be individually revoked → keep short enough expiry for version one and require admin active checks on admin requests.
- Users may abandon after upload but before payment → drafts persist, and final submission remains blocked until payment verification.
- Payment callback failures can leave a payment initiated but unverified → callback verification is server-side and dashboard must keep the application editable with a clear failed/pending state.
- Persian/RTL tables and forms can degrade on small screens → make RTL layout part of the final verification pass.

## Migration Plan

1. Scaffold the Next.js app and install dependencies.
2. Add Prisma schema, run the initial migration, and seed a super admin.
3. Implement validation, sessions, OTP, SMS, user flow, application drafts, uploads, payment, admin review, export, and deployment notes in phases.
4. Verify with validation tests, build, and manual smoke flow.
5. Deploy to the VPS with PostgreSQL, `UPLOAD_DIR`, Nginx reverse proxy, and production environment variables.

Rollback for the first production release is to stop the app, restore the previous deployment artifact if one exists, and preserve the database/upload directories for inspection. Since this is a new subdomain application, rollback does not affect the existing WordPress site.

## Open Questions

- Confirm the production Zarinpal merchant ID and sandbox-to-live switch timing.
- Confirm the production Ghasedak OTP template name and sender constraints.
- Confirm server backup policy for local uploads and PostgreSQL.
