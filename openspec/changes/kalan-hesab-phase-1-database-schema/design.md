## Context

The IOIV codebase uses a single PostgreSQL database managed by Prisma. All authentication flows (user and admin) share the `OtpCode` model keyed on `(mobile, purpose)` — purpose prevents cross-flow code reuse. Admin accounts live in the `Admin` model and are gated by `UserRole`. This phase adds three purely additive changes: two enum values and one new model. No existing rows, columns, or enum values are touched.

Current schema state:
- `OtpPurpose` has `USER_LOGIN` and `ADMIN_LOGIN`.
- `UserRole` has `USER`, `ADMIN`, `SUPER_ADMIN`, `ENTRY_VIEWER`.
- `Admin.role` references `UserRole` and defaults to `ADMIN`.
- No `KalanHesabSubmission` table exists.

## Goals / Non-Goals

**Goals:**
- Add `KALAN_HESAB_VERIFICATION` to `OtpPurpose` so the Phase 2 OTP API can issue and consume codes scoped to mobile verification without creating a session.
- Add `KALAN_HESAB_ADMIN` to `UserRole` so the existing `Admin` model and its OTP login flow can be reused for Kalan Hesab admins, isolated from IOIV admin routes.
- Add the `KalanHesabSubmission` model with all fields required by the public form (Phase 3) and queryable by the admin panel (Phase 4).
- Seed two Kalan Hesab admin accounts idempotently.

**Non-Goals:**
- No new npm packages.
- No changes to existing `User`, `Admin`, `OtpCode`, or any IOIV model.
- No Kalan Hesab API routes, UI, or session logic (those are Phases 2–4).
- No enum removal — PostgreSQL requires a full migration cycle to drop enum values; only additions are safe here.

## Decisions

### 1. Store `position`, `teamSize`, `mainConcern` as `String`, not Prisma enums

**Choice:** Plain `String` columns.

**Rationale:** The display labels are Persian strings (e.g., `"مدیرعامل"`, `"کمتر از ۱۰"`). If stored as Prisma enum values, any label rename requires a database migration and a Prisma client rebuild. Storing as strings keeps the database agnostic to Persian label wording, and validation happens at the API layer (Zod enum) before the row is written.

**Alternative considered:** Prisma enums for position/teamSize/mainConcern — rejected because label changes (likely as the product evolves) would require schema migrations with no functional benefit.

---

### 2. Reuse `OtpCode` model with a new `purpose` value rather than a new table

**Choice:** Add `KALAN_HESAB_VERIFICATION` to `OtpPurpose`.

**Rationale:** The `OtpCode` model already handles expiry, consumption, and the `(mobile, purpose)` index that prevents cross-flow reuse. A new table would duplicate all of this. The `purpose` discriminator is exactly the right abstraction.

**Alternative considered:** A new `KalanHesabOtpCode` table — rejected as unnecessary duplication of existing infrastructure.

---

### 3. Reuse `Admin` model with a new `UserRole` value rather than a separate admin model

**Choice:** Add `KALAN_HESAB_ADMIN` to `UserRole`.

**Rationale:** The `Admin` model already provides mobile, name, active flag, and the OTP login infrastructure. Role-based isolation (`role = KALAN_HESAB_ADMIN`) is the same pattern used to distinguish `ADMIN`, `SUPER_ADMIN`, and `ENTRY_VIEWER`. No new model or table is needed.

**Alternative considered:** A separate `KalanHesabAdmin` model — rejected because it would duplicate the entire admin login infrastructure.

---

### 4. Seed with `skipDuplicates: true`

**Choice:** `prisma.admin.createMany({ data: [...], skipDuplicates: true })`.

**Rationale:** `mobile` is a unique constraint on `Admin`. Running `db:seed` a second time (e.g., after a reset) would fail with a unique-constraint error without `skipDuplicates`. This makes the seed operation fully idempotent.

## Risks / Trade-offs

- **PostgreSQL enum value removal is expensive** → Mitigation: only add values, never remove them in this phase. If `KALAN_HESAB_VERIFICATION` or `KALAN_HESAB_ADMIN` need to be removed later, a separate cleanup migration is required. This is acceptable for now.
- **String fields for position/teamSize/mainConcern bypass database-level constraints** → Mitigation: the Zod schema in the submit API enforces allowed values before any write. Invalid values can only enter if the API layer is bypassed.
- **Seed admin accounts use real phone numbers** → Mitigation: `skipDuplicates: true` ensures re-running seed never overwrites or duplicates existing rows. If an admin's mobile changes, a manual SQL update is needed (no automated migration path).

## Migration Plan

1. Run `npm run db:migrate` with migration name `add_kalan_hesab_submission`. Prisma generates and applies a SQL migration that:
   - Alters `OtpPurpose` enum to add `KALAN_HESAB_VERIFICATION`.
   - Alters `UserRole` enum to add `KALAN_HESAB_ADMIN`.
   - Creates the `KalanHesabSubmission` table with all columns and indexes.
2. Run `npm run db:seed` to insert the two `KALAN_HESAB_ADMIN` admin rows.
3. Rollback: Prisma does not auto-generate rollback SQL. To roll back, manually drop the `KalanHesabSubmission` table and remove the enum values (requires `ALTER TYPE ... RENAME VALUE` workaround in PostgreSQL). This is a last-resort step; the migration itself carries no data risk since only new structures are added.
