## Why

Phases 0–4 are complete: gold theme, database schema, API layer, public form, and admin panel are all implemented. Phase 5 is a pre-deployment QA gate — every item on this checklist must pass before the branch is deployed to `form.kalanhesab.com`. It also guards against regressions on the existing IOIV application.

## What Changes

No new code is introduced. This phase verifies the correctness of everything built in Phases 0–4 and confirms that IOIV functionality is fully isolated from the Kalan Hesab additions.

## Capabilities

### Verified Capabilities

- `kalan-hesab-form-flow`: Full form submission flow — fill → OTP request → OTP verify → submit → success state
- `kalan-hesab-sms-delivery`: SMS delivery to user mobile and both admin numbers (09224872163, 09390649614)
- `kalan-hesab-otp-rate-limit`: OTP rate limiting — second request within 90s is rejected
- `kalan-hesab-conditional-fields`: "سایر" conditional text fields appear and are saved
- `kalan-hesab-submit-gate`: Submit button disabled until OTP is verified
- `kalan-hesab-admin-auth`: Both admin numbers can authenticate and access `/kalan-hesab/admin`
- `kalan-hesab-admin-search`: Search filters by fullName, companyName, mobile
- `kalan-hesab-admin-export`: Excel export downloads with all columns populated
- `kalan-hesab-responsive`: Mobile-responsive layout at `/kalan-hesab`

### Regression: IOIV Routes

- `/` public page loads
- `/dashboard` loads for authenticated users
- `/admin` loads for IOIV admins
- Gold theme does NOT appear on any IOIV route
- Existing OTP flows (USER_LOGIN, ADMIN_LOGIN) still work

## Impact

- **No files created or modified** — verification only
- **Dependencies**: running dev server, Ghasedak SMS integration active in environment
