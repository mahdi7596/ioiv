## Context

All Kalan Hesab implementation phases are complete:

- **Phase 0**: `app/kalan-hesab/layout.tsx`, `app/kalan-hesab/kalan-hesab.css` — gold theme
- **Phase 1**: `KalanHesabSubmission` model, `KALAN_HESAB_VERIFICATION` OTP purpose, `KALAN_HESAB_ADMIN` role, two seeded admin accounts
- **Phase 2**: All API routes under `app/api/kalan-hesab/` — OTP request/verify (user + admin), submit, logout, submissions list, Excel export
- **Phase 3**: `app/kalan-hesab/page.tsx` — animated public form with OTP flow and success state
- **Phase 4**: `app/kalan-hesab/admin/login/page.tsx`, `app/kalan-hesab/admin/page.tsx` — admin login and submissions panel

Admin accounts seeded in `prisma/seed.ts`:
- `09224872163` — role: `KALAN_HESAB_ADMIN`
- `09390649614` — role: `KALAN_HESAB_ADMIN`

SMS functions in `lib/sms/messages.ts`:
- `createKalanHesabUserSmsMessage(mobile)` — sends via `GHASEDAK_KALAN_HESAB_USER_TEMPLATE`
- `createKalanHesabAdminSmsMessage(mobile, fullName)` — sends plain-text notification

## Goals / Non-Goals

**Goals:**
- Verify every behavior specified in Phase 5 of `docs/kalan-hesab-plan.md`
- Confirm IOIV routes are not affected by any changes on this branch

**Non-Goals:**
- No code changes — pure verification
- No automated test suite — manual verification against running dev server
- No changes to any spec, API, or UI file

## Verification Approach

### Code-level checks (static)
- Confirm gold CSS class is scoped to `.kalan-hesab-theme` and never referenced in IOIV route files
- Confirm `KALAN_HESAB_VERIFICATION` purpose is used only in kalan-hesab OTP routes
- Confirm submit button renders with `disabled` prop tied to OTP verified state

### Runtime checks (dev server)
- Navigate through the full form submission flow in a browser
- Verify conditional fields, animations, and success state
- Verify admin login, search, and export
- Verify IOIV routes at `/`, `/dashboard`, `/admin`

### Manual SMS checks (requires live environment)
- Submit a real form and confirm SMS delivery to user mobile
- Confirm SMS delivery to 09224872163 and 09390649614
- Test OTP rate limiting (second request within 90s)

## Decisions

### 1. Static code checks first
Verify gold theme isolation and OTP purpose scoping by reading source files before starting the dev server. Catches configuration errors without requiring a running app.

### 2. Dev server for UI verification
Run `npm run dev` and use browser tools to walk through the form flow, admin panel, and IOIV routes. Sufficient to verify layout, animations, button states, search, and export.

### 3. SMS and rate-limit checks require live environment
These cannot be verified without an active Ghasedak integration and real phone numbers. They are flagged for human verification during the Phase 6 smoke test if the dev environment lacks SMS credentials.
