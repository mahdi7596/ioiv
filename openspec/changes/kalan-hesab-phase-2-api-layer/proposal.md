## Why

Phase 1 added the database schema. Phase 2 wires up all server-side API endpoints: mobile OTP verification for form users, form submission, admin OTP login, admin logout, and admin data access (list + Excel export). Without these routes the Phase 3 public form and Phase 4 admin panel have nothing to call.

## What Changes

- **`lib/sms/messages.ts`** — add `createKalanHesabUserSmsMessage` (thank-you SMS to user) and `createKalanHesabAdminSmsMessage` (notification to each admin number).
- **`app/api/kalan-hesab/otp/request/route.ts`** — POST: send 4-digit OTP with purpose `KALAN_HESAB_VERIFICATION`, 90-second rate limit.
- **`app/api/kalan-hesab/otp/verify/route.ts`** — POST: verify OTP, mark consumed, return `{ verified: true }`. No session created.
- **`app/api/kalan-hesab/submit/route.ts`** — POST: validate full form body + `verified: true` flag, save `KalanHesabSubmission`, send 3 SMS (1 to user, 2 to admins).
- **`app/api/kalan-hesab/admin/otp/request/route.ts`** — POST: check `KALAN_HESAB_ADMIN` role first, then send OTP with purpose `ADMIN_LOGIN`.
- **`app/api/kalan-hesab/admin/otp/verify/route.ts`** — POST: verify OTP, check `KALAN_HESAB_ADMIN` role, call `createSession()`, return `{ redirectTo: "/kalan-hesab/admin" }`.
- **`app/api/kalan-hesab/admin/logout/route.ts`** — POST: `clearSession()` → 303 redirect to `/kalan-hesab/admin/login`.
- **`app/api/kalan-hesab/admin/submissions/route.ts`** — GET: return all `KalanHesabSubmission` rows, newest first, with optional `?search=` filter across `fullName`, `companyName`, `mobile`.
- **`app/api/kalan-hesab/admin/export/route.ts`** — GET: return all submissions as `.xlsx` download using the existing `xlsx` package.

All new files are additive. No existing IOIV routes, components, or middleware are touched.

## Capabilities

### New Capabilities

- `kalan-hesab-user-otp`: Mobile OTP flow scoped to `KALAN_HESAB_VERIFICATION` — issues and consumes codes for form-submission mobile verification without creating a session.
- `kalan-hesab-form-submission`: Accepts validated form payloads, persists `KalanHesabSubmission`, and triggers 3 SMS notifications (1 thank-you to user, 1 to each admin).
- `kalan-hesab-admin-auth`: OTP-based admin login using the shared `Admin` model and `ADMIN_LOGIN` purpose, gated to `KALAN_HESAB_ADMIN` role; logout clears the session.
- `kalan-hesab-admin-submissions`: Authenticated GET endpoint returning all submissions with optional search; plus Excel export of the full dataset.

### Modified Capabilities

- `lib/sms/messages.ts` — extended with two Kalan Hesab–specific SMS factory functions.

## Impact

- **8 new route files** under `app/api/kalan-hesab/`.
- **1 file modified**: `lib/sms/messages.ts` (2 functions added, nothing removed).
- **No new npm packages** — `xlsx` already installed.
- **1 new env var**: `GHASEDAK_KALAN_HESAB_USER_TEMPLATE` (template name from Ghasedak panel for the user thank-you SMS).
- **No IOIV routes or UI files touched.**
