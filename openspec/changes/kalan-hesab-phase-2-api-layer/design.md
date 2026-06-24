## Context

Phase 1 established: `KalanHesabSubmission` model, `KALAN_HESAB_VERIFICATION` OTP purpose, `KALAN_HESAB_ADMIN` role, and two seeded admin accounts. The existing IOIV codebase already provides `OtpCode` CRUD, `createSession`/`clearSession`, `sendSms`, `mobileSchema`/`otpSchema`, and the `xlsx` package.

Phase 2 builds 8 API routes on top of these primitives.

## Goals / Non-Goals

**Goals:**
- Provide a mobile OTP verification flow (request + verify) for public form users — no session created.
- Accept and persist form submissions; fire 3 SMS on each save.
- Provide an OTP-based admin login flow restricted to `KALAN_HESAB_ADMIN` role.
- Provide authenticated admin data access: paginated-free list with search and full Excel export.

**Non-Goals:**
- No new npm packages.
- No changes to existing IOIV routes, middleware, or UI.
- No user accounts or sessions for form submitters.
- No server-side session state for mobile verification (client carries the `verified` flag).

## Decisions

### 1. User OTP: KALAN_HESAB_VERIFICATION purpose, no session

**Choice:** Dedicated `KALAN_HESAB_VERIFICATION` OtpPurpose; verify endpoint returns `{ verified: true }` without calling `createSession`.

**Rationale:** The form is one-way — the user verifies their mobile at submit time but does not log in. Reusing the existing `OtpCode` model with a separate purpose prevents cross-flow code reuse (an OTP issued for `USER_LOGIN` cannot be consumed here and vice versa). No new model or table is needed.

**Alternative considered:** A cookie/token proving verification — rejected as unnecessary infrastructure for a simple one-shot form.

---

### 2. Submit endpoint trusts `verified: true` flag from client

**Choice:** Submit body includes `verified: z.literal(true)`; the server validates only that this flag is present and true.

**Rationale:** The plan explicitly specifies "client passes verified=true flag". The OTP verify endpoint already consumed and marked the code; a DB re-check would add latency with no meaningful security gain for a one-shot, anonymous form.

---

### 3. Admin OTP reuses ADMIN_LOGIN purpose, gated by KALAN_HESAB_ADMIN role

**Choice:** Admin OTP request/verify endpoints use `OtpPurpose.ADMIN_LOGIN` (same as IOIV admins) but check `admin.role === UserRole.KALAN_HESAB_ADMIN` before proceeding.

**Rationale:** Phase 1 did not add a `KALAN_HESAB_ADMIN_LOGIN` purpose — the existing `ADMIN_LOGIN` purpose is sufficient because the role check ensures isolation. An IOIV admin OTP cannot be used on the kalan-hesab admin endpoint and vice versa.

---

### 4. Admin session reuses existing JWT infrastructure

**Choice:** `createSession({ subjectId: admin.id, kind: "admin" })` — same JWT cookie as IOIV admins.

**Rationale:** The session cookie is already scoped by `kind: "admin"` and the admin's role is checked on every protected endpoint. No new session type needed. The Kalan Hesab admin panel will guard its routes by reading the session and confirming `role === KALAN_HESAB_ADMIN`.

---

### 5. Submissions list returns all rows (no server-side pagination)

**Choice:** `db.kalanHesabSubmission.findMany(...)` with no `skip`/`take`.

**Rationale:** Consistent with the existing IOIV admin `listSubmissions` action, which also returns all rows. Client-side pagination handles display. Volume is bounded — this is a single client's form, not a high-traffic public service.

---

### 6. SMS factory functions added to existing lib/sms/messages.ts

**Choice:** Two new exported functions appended to `messages.ts`, following the same `SmsMessage` return type pattern.

**Rationale:** Plan specifies modifying `lib/sms/messages.ts`. No new file is needed — the existing module is the right home for all SMS message factories.

---

### 7. Excel export: xlsx logic inline in export route

**Choice:** `xlsx` workbook build inside `app/api/kalan-hesab/admin/export/route.ts` directly.

**Rationale:** No separate `lib/export/kalan-hesab.ts` is specified by the plan. Keeping the xlsx build inline avoids premature abstraction; the logic is ~10 lines.
