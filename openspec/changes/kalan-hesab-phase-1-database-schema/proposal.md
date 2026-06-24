## Why

The Kalan Hesab public form (Phase 3) and admin panel (Phase 4) require a dedicated database model to store submissions, plus two new enum values to support a mobile-verification OTP flow that creates no session and a new admin role that is isolated from IOIV admins. Without these schema additions nothing else in the Kalan Hesab feature can be built.

## What Changes

- Add `KALAN_HESAB_VERIFICATION` to the existing `OtpPurpose` enum — used to verify a user's mobile number at form-submit time without creating a session.
- Add `KALAN_HESAB_ADMIN` to the existing `UserRole` enum — grants access to `/kalan-hesab/admin/*` routes; completely isolated from all IOIV admin roles.
- Add new `KalanHesabSubmission` model — stores every public form submission with all seven field groups (full name, company, position, team size, main concern, mobile, timestamp).
- Extend `prisma/seed.ts` — create two `KALAN_HESAB_ADMIN` admin accounts (`09224872163` and `09390649614`) using `skipDuplicates: true` so re-running seed is safe.

All changes are purely additive. No existing enum values, models, or fields are altered.

## Capabilities

### New Capabilities

- `kalan-hesab-submission-storage`: Persistent storage of public form submissions with all required fields, optional free-text overrides for "سایر" selections, mobile number, and timestamp; indexed by `createdAt` and `mobile` for admin panel queries and export.
- `kalan-hesab-otp-verification`: OTP flow scoped to the `KALAN_HESAB_VERIFICATION` purpose — verifies a mobile number before form submission without creating an authenticated session.
- `kalan-hesab-admin-role`: `KALAN_HESAB_ADMIN` role on the existing `Admin` model; guards `/kalan-hesab/admin/*` server-side; two seeded admin accounts for the client's phone numbers.

### Modified Capabilities

<!-- No existing spec-level requirements are changing. -->

## Impact

- **`prisma/schema.prisma`** — two enum value additions, one new model, one new migration (`add_kalan_hesab_submission`).
- **`prisma/seed.ts`** — two new `Admin` rows inserted with `skipDuplicates: true`.
- **Database** — one new table (`KalanHesabSubmission`), no changes to existing tables.
- **No new npm packages required.**
- **No IOIV routes, components, or API handlers are touched.**
