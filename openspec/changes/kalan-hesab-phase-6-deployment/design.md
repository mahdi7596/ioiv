## Context

All Kalan Hesab implementation phases are complete:

- **Phase 0**: `app/kalan-hesab/layout.tsx`, `app/kalan-hesab/kalan-hesab.css` — gold theme (primary: #C89820)
- **Phase 1**: `KalanHesabSubmission` model, `KALAN_HESAB_VERIFICATION` OTP purpose, `KALAN_HESAB_ADMIN` role, two seeded admin accounts
- **Phase 2**: All API routes under `app/api/kalan-hesab/` — OTP request/verify (user + admin), submit, logout, submissions list, Excel export
- **Phase 3**: `app/kalan-hesab/page.tsx` — animated public form with OTP flow and success state
- **Phase 4**: `app/kalan-hesab/admin/login/page.tsx`, `app/kalan-hesab/admin/page.tsx` — admin login and submissions panel
- **Phase 5**: QA and regression verification complete

Admin accounts seeded in `prisma/seed.ts`:
- `09224872163` — role: `KALAN_HESAB_ADMIN`
- `09390649614` — role: `KALAN_HESAB_ADMIN`

SMS functions in `lib/sms/messages.ts`:
- `createKalanHesabUserSmsMessage(mobile)` — sends via `GHASEDAK_KALAN_HESAB_USER_TEMPLATE`
- `createKalanHesabAdminSmsMessage(mobile, fullName)` — sends plain-text notification

## Goals / Non-Goals

**Goals:**
- Register the Ghasedak SMS template and obtain the template name
- Set `GHASEDAK_KALAN_HESAB_USER_TEMPLATE` in the production environment
- Point `form.kalanhesab.com` DNS to the production server
- Deploy the `kalan-hesab-form-submission` branch to production
- Run `npm run db:migrate` to apply the `add_kalan_hesab_submission` migration
- Run `npm run db:seed` to create the two admin accounts on production
- Confirm all three SMS messages arrive via a real smoke-test submission

**Non-Goals:**
- No code changes — all implementation is complete
- No new API routes, UI components, or DB models
- No changes to IOIV routes or existing functionality

## Deployment Steps

### 1. Ghasedak Template Registration

Submit the thank-you text to the Ghasedak panel:

> ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت.

Wait for approval and record the assigned template name.

### 2. Environment Variables

On the production server, add to the environment (copying from IOIV `.env.production`):

```env
GHASEDAK_KALAN_HESAB_USER_TEMPLATE=<template_name_from_step_1>
```

### 3. DNS Configuration

Create a DNS record at the domain registrar:

| Type | Name | Value |
|------|------|-------|
| A or CNAME | `form.kalanhesab.com` | Production server IP / hostname |

Wait for DNS propagation before running the smoke test.

### 4. Deploy from Branch

Deploy from `kalan-hesab-form-submission` (not `master`). After deployment, apply the migration:

```bash
npm run db:migrate   # migration: add_kalan_hesab_submission
```

### 5. Seed Production Database

```bash
npm run db:seed
```

Inserts the two admin accounts with `skipDuplicates: true` — safe to re-run.

### 6. Smoke Test

Navigate to `form.kalanhesab.com`, submit a real form, and confirm receipt of all three SMS messages.

## Decisions

### 1. Smoke test after DNS propagation
The smoke test must be run on `form.kalanhesab.com`, not on a direct server IP, to confirm that the domain is wired correctly and the deployment is serving the right branch. Do not run the smoke test via IP bypass.

### 2. db:seed is safe to re-run
The seed uses `skipDuplicates: true`, so running it on a production database that already contains other data will only insert the two new admin accounts without touching existing records.

### 3. Template registration is a prerequisite for deployment
`createKalanHesabUserSmsMessage` references `process.env.GHASEDAK_KALAN_HESAB_USER_TEMPLATE`. If that variable is missing at deploy time, the user thank-you SMS will fail silently. The template name must be obtained and set before deployment.

### 4. Admin notification SMS requires no template
`createKalanHesabAdminSmsMessage` sends plain text. No Ghasedak panel action is needed for those two messages.
