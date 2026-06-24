## Why

The Kalan Hesab form launched but has two issues that need immediate correction: the OTP mobile verification step adds unnecessary friction and should be removed entirely, and the single-page layout makes the form feel dense. Additionally, admin SMS routing needs to be corrected so only one specific number receives submission alerts.

## What Changes

- **Remove OTP verification from the public form** — the mobile field becomes a plain text input; no "ارسال کد" button, no verification step, no `KALAN_HESAB_VERIFICATION` OTP purpose usage on the form
- **Convert single-page form to a 2-step wizard**
  - Step 1: نام و نام خانوادگی · نام شرکت یا برند · سمت سازمانی · اندازه تیم
  - Step 2: بزرگترین دغدغه · شماره موبایل · submit button ("دریافت ارزیابی تخصصی")
- **Update admin accounts** — add `09124872163` as a second admin who can log in but receives no SMS; `09390649614` is the sole SMS recipient for new submission alerts (the previously seeded `09224872163` is removed/replaced)
- Remove `/api/kalan-hesab/otp/request` and `/api/kalan-hesab/otp/verify` routes (form-side OTP only; admin OTP login is unaffected)

## Capabilities

### New Capabilities
- `kalan-hesab-multistep-form`: 2-step form wizard replacing the current single-page layout, with step navigation and validation per step

### Modified Capabilities
- `kalan-hesab-form-submission`: mobile field no longer requires OTP verification before submit; submit API accepts mobile as plain string
- `kalan-hesab-admin-sms`: only `09390649614` receives SMS on new submission; `09124872163` has admin panel access only

## Impact

- `app/kalan-hesab/page.tsx` — full rewrite to multi-step wizard
- `app/api/kalan-hesab/submit/route.ts` — remove OTP-verified check, update SMS recipients list
- `app/api/kalan-hesab/otp/request/route.ts` — delete (form-side only)
- `app/api/kalan-hesab/otp/verify/route.ts` — delete (form-side only)
- `prisma/seed.ts` — update admin mobile numbers (09390649614 stays, add 09124872163, remove 09224872163)
- No DB schema migration needed (KalanHesabSubmission model unchanged)
- No admin login OTP touched (that flow uses `ADMIN_LOGIN` purpose, unaffected)
