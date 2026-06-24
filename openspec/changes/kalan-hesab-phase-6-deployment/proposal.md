## Why

Phases 0–5 are complete: gold theme, database schema, API layer, public form, admin panel, and QA verification are all done. Phase 6 takes the Kalan Hesab project live at `form.kalanhesab.com`. Without this phase the product exists only in development; clients and users cannot reach it.

## What Changes

No new code is introduced. This phase wires the completed implementation to production infrastructure: Ghasedak SMS template registration, environment variable configuration, DNS setup, branch deployment, database seeding, and a final smoke test to confirm the system is operating end-to-end.

## Capabilities

### Step 1 — Ghasedak SMS Template

- `kalan-hesab-user-sms-template`: The thank-you SMS text is submitted to the Ghasedak panel and a template name is received back.

  Template text: `ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت.`

  The two admin notification SMS messages are plain-text sends and do not require a Ghasedak template.

### Step 2 — Environment Variables

- `kalan-hesab-env-config`: The production environment receives one new variable:
  ```
  GHASEDAK_KALAN_HESAB_USER_TEMPLATE=<template_name>
  ```
  All other variables are inherited from the existing IOIV `.env.production`.

### Step 3 — DNS

- `kalan-hesab-dns`: An A or CNAME record points `form.kalanhesab.com` to the production server.

### Step 4 — Deploy

- `kalan-hesab-deploy`: The `kalan-hesab-form-submission` branch is deployed to production. The database migration `add_kalan_hesab_submission` is applied.

### Step 5 — Database Seed

- `kalan-hesab-seed`: `npm run db:seed` is run on production, creating the two `KALAN_HESAB_ADMIN` accounts (09224872163, 09390649614) via `skipDuplicates: true`.

### Step 6 — Smoke Test

- `kalan-hesab-smoke-test`: One real form submission is completed on `form.kalanhesab.com`. All three SMS messages arrive: thank-you to the submitter, notification to 09224872163, notification to 09390649614.

## Impact

- **No files created or modified** — all code changes are already complete in Phases 0–4
- **Infrastructure actions**: Ghasedak panel, DNS registrar, production server, production database
- **Dependencies**: Ghasedak SMS template approved, `form.kalanhesab.com` DNS resolved, production environment variables set
