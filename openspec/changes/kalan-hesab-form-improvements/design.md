## Context

The Kalan Hesab form is live at `/kalan-hesab` as a single-page form with 6 fields plus an OTP mobile-verification flow. The current state:

- `app/kalan-hesab/page.tsx` — single-page form with OTP states (`otpSent`, `otpCode`, `mobileVerified`); submit button disabled until `mobileVerified === true`
- `app/api/kalan-hesab/submit/route.ts` — schema requires `verified: z.literal(true)`; `ADMIN_NUMBERS = ["09224872163", "09390649614"]` — both receive SMS
- `prisma/seed.ts` — two `KALAN_HESAB_ADMIN` records: `09224872163` (مدیر اول) and `09390649614` (مدیر دوم)
- OTP routes at `/api/kalan-hesab/otp/request` and `/api/kalan-hesab/otp/verify` exist but will no longer be called from the form

## Goals / Non-Goals

**Goals:**
- Remove all OTP UI and logic from the public form; mobile is a plain required text field
- Split the single-page form into a 2-step wizard with step-level validation before advancing
- Update SMS routing: only `09390649614` receives new-submission alerts
- Add `09124872163` as a second admin (login access, no SMS)
- Replace `09224872163` with `09124872163` in the seed

**Non-Goals:**
- Changing the admin OTP login flow (unaffected)
- Deleting the OTP API routes from disk (they are unused but harmless; cleanup is optional)
- Changing the `KalanHesabSubmission` DB model or any migration

## Decisions

### Decision 1: 2-step split

Step 1 collects identity/company info: نام و نام خانوادگی · نام شرکت یا برند · سمت سازمانی (+ other) · اندازه تیم

Step 2 collects the concern and contact: بزرگترین دغدغه (+ other) · شماره موبایل · submit button

**Rationale**: Fields 1–4 are about who the person is; fields 5–6 are about why they're reaching out. This split has a natural narrative arc and keeps each step to ~2–4 inputs.

### Decision 2: Step 1 validates before advancing

Clicking "مرحله بعد" runs Zod on step-1 fields only. If invalid, errors are shown inline and the user stays on step 1. Step 2 is never rendered until step 1 passes.

**Rationale**: Prevents carrying invalid data forward; consistent with the existing IOIV wizard pattern (`wizard__step` + `step-in` keyframe).

### Decision 3: Remove `verified: z.literal(true)` from submit schema

The API no longer requires an OTP proof flag. Mobile is accepted as a plain valid Iranian number (`/^09\d{9}$/`).

**Rationale**: OTP verification is removed from the UX; the API contract must match.

### Decision 4: SMS to single number only

`ADMIN_NUMBERS` in `submit/route.ts` changes from `["09224872163", "09390649614"]` to `["09390649614"]`. The second admin (`09124872163`) can log into the admin panel but receives no SMS.

**Considered alternative**: Two separate env vars (`KALAN_HESAB_SMS_ADMIN` and `KALAN_HESAB_PANEL_ADMIN`). Rejected — hardcoding a small fixed list is simpler and the list is unlikely to change often.

### Decision 5: Step indicator UI

A simple "مرحله ۱ از ۲ / مرحله ۲ از ۲" text indicator above the form card. Uses the existing `.step-indicator__header` CSS class (already in globals.css). No progress bar needed for 2 steps.

## Risks / Trade-offs

- **Back navigation**: Users on step 2 can go back to step 1; their step-1 values are preserved in React state. No risk of data loss within a session.
- **Mobile without OTP**: Submitting with an unverified mobile is intentional per client requirement. Any spam filtering is out of scope for this change.
- **Seeding on production**: Replacing `09224872163` with `09124872163` requires running `npm run db:seed` again on production (uses `skipDuplicates: true` so the new record is inserted; the old one remains but is no longer referenced by SMS logic). If hard removal of the old admin is needed, a manual DB delete is required — out of scope here.
