# Kalan Hesab — Form Submission Implementation Plan

## Overview

A second client project built on the IOIV Next.js codebase. Users visit a public form at `form.kalanhesab.com`, fill in their details, verify their mobile via OTP, and submit. The form is **one-way** — no editing, no status changes, no user accounts. The client receives an SMS notification and can view all submissions in a simple admin panel.

| Property | Value |
|----------|-------|
| Branch | `kalan-hesab-form-submission` |
| Domain | `form.kalanhesab.com` |
| Primary color | `#C89820` (gold, from logo) |
| Logo | `public/kalan-hesab-logo.jpeg` |
| Admin SMS #1 | 09224872163 |
| Admin SMS #2 | 09390649614 |

---

## Form Fields (from client spec)

Source: "فرم پاپ آپ مدیران" — dated 1405/03/28

**Page header text:**
- Headline: `مدیران موفق، قبل از وقوع بحران تصمیم می‌گیرند.`
- Subtitle: `درباره مالیات، ساختار مالی، گزارش‌های مدیریتی یا وضعیت مالی کسب‌وکار خود، با ما در ارتباط باشید.`
- Value props: بررسی اولیه وضعیت مالی و مالیاتی · شناسایی ریسک‌های احتمالی · ارائه پیشنهادهای بهبود مدیریتی

| # | Label | Type | Options |
|---|-------|------|---------|
| 1 | نام و نام خانوادگی | text input | — |
| 2 | نام شرکت یا برند | text input | فارسی یا انگلیسی |
| 3 | سمت سازمانی | select (single) | مدیرعامل / عضو هیئت مدیره / مدیرمالی / صاحب کسب‌وکار / سایر + free-text if سایر |
| 4 | اندازه تیم | select (single) | کمتر از ۱۰ / ۱۰ تا ۵۰ / ۵۰ تا ۲۰۰ / بیش از ۲۰۰ |
| 5 | بزرگترین دغدغه | select (single) | مدیریت مالی / مالیات / تامین اجتماعی / گزارشات مدیریتی / حسابرسی / تامین مالی / سایر + free-text if سایر |
| 6 | شماره موبایل | mobile + OTP | Verified via SMS before submit; no session created |
| 7 | Submit button | — | Label: **دریافت ارزیابی تخصصی** |

**Post-submit message (displayed to user):**
> ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت.

---

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Codebase | Same repo, new branch | Fastest delivery, reuse all infrastructure |
| Theme | Separate CSS file overriding CSS variables | All existing component classes pick up gold automatically |
| OTP | Reuse `OtpCode` model + new `KALAN_HESAB_VERIFICATION` purpose | No duplicate infra; different from IOIV: no session created on verify |
| Admin auth | Reuse `Admin` model + new `KALAN_HESAB_ADMIN` role | Same OTP login flow, isolated by role |
| Admin panel | Separate at `/kalan-hesab/admin` | Not integrated with IOIV admin |
| DB | Same PostgreSQL, add 1 new model | Single source of truth |
| SMS | Reuse `lib/sms/` + Ghasedak | Add 2 new message factory functions |
| Excel export | Reuse `xlsx` package | Already installed |

---

## Phase 0 — Foundation: Theme & Layout

**Goal:** Wire the gold identity into the codebase. No DB, no API.

### Files to create

| File | Purpose |
|------|---------|
| `public/kalan-hesab-logo.jpeg` | Logo asset ✅ (already copied) |
| `app/kalan-hesab/layout.tsx` | Nested layout — imports gold CSS, wraps all `/kalan-hesab/*` routes |
| `app/kalan-hesab/kalan-hesab.css` | CSS variable overrides for gold palette |

### Gold palette (`kalan-hesab.css`)

```css
.kalan-hesab-theme {
  --color-primary: #C89820;
  --color-on-primary: #ffffff;
  --color-secondary: #A67A10;
  --color-on-secondary: #ffffff;
  --color-background: #fdfbf6;
  --color-surface-muted: #faf7ee;
  --color-border: #ead9a0;
}
```

Applied via `<div className="kalan-hesab-theme">` in `layout.tsx`. All existing `.button--primary`, `.auth-panel`, `.panel`, `.data-table` etc. automatically inherit gold.

---

## Phase 1 — Database Schema

**Goal:** Extend Prisma schema. One migration, one seed run.

### Changes to `prisma/schema.prisma`

```prisma
enum OtpPurpose {
  USER_LOGIN
  ADMIN_LOGIN
  KALAN_HESAB_VERIFICATION    // NEW — verifies mobile at submit time, no session
}

enum UserRole {
  USER
  ADMIN
  SUPER_ADMIN
  ENTRY_VIEWER
  KALAN_HESAB_ADMIN           // NEW — guards /kalan-hesab/admin/* routes
}

model KalanHesabSubmission {   // NEW
  id            String   @id @default(cuid())
  fullName      String
  companyName   String
  position      String   // enum value as string
  positionOther String?  // only set when position = "سایر"
  teamSize      String   // enum value as string
  mainConcern   String   // enum value as string
  concernOther  String?  // only set when mainConcern = "سایر"
  mobile        String
  createdAt     DateTime @default(now())

  @@index([createdAt])
  @@index([mobile])
}
```

### Seed additions (`prisma/seed.ts`)

```ts
await prisma.admin.createMany({
  data: [
    { mobile: "09224872163", name: "کالان حساب - مدیر اول", role: "KALAN_HESAB_ADMIN", active: true },
    { mobile: "09390649614", name: "کالان حساب - مدیر دوم", role: "KALAN_HESAB_ADMIN", active: true },
  ],
  skipDuplicates: true,
})
```

### Commands

```bash
npm run db:migrate   # migration name: add_kalan_hesab_submission
npm run db:seed
```

---

## Phase 2 — API Layer

**Goal:** All server-side endpoints. No UI yet.

### Route files to create

```
app/api/kalan-hesab/
├── otp/
│   ├── request/route.ts      POST — send OTP (purpose: KALAN_HESAB_VERIFICATION)
│   └── verify/route.ts       POST — verify code, return { verified: true }, no session
├── submit/route.ts           POST — validate + save + send 3 SMS
└── admin/
    ├── otp/
    │   ├── request/route.ts  POST — admin OTP (checks KALAN_HESAB_ADMIN role first)
    │   └── verify/route.ts   POST — verify → createSession() → redirect to admin
    ├── logout/route.ts       POST — clearSession() → redirect to login
    ├── submissions/route.ts  GET  — paginated list with ?search= param
    └── export/route.ts       GET  — Excel download of all submissions
```

### SMS additions to `lib/sms/messages.ts`

```ts
// Thank-you SMS to user (template registered on Ghasedak panel)
export function createKalanHesabUserSmsMessage(to: string): SmsMessage {
  return {
    to,
    text: "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت.",
    template: process.env.GHASEDAK_KALAN_HESAB_USER_TEMPLATE,
  };
}

// Notification to admin(s) — plain text, no template needed
export function createKalanHesabAdminSmsMessage(to: string, fullName: string): SmsMessage {
  return {
    to,
    text: `فرم جدید در کالان حساب ثبت شد - ${fullName}`,
  };
}
```

### Submit endpoint flow

```
POST /api/kalan-hesab/submit
  1. Validate request body with Zod schema
  2. Verify mobile was OTP-verified in this session (client passes verified=true flag)
  3. Save KalanHesabSubmission to DB
  4. sendSms(createKalanHesabUserSmsMessage(mobile))
  5. sendSms(createKalanHesabAdminSmsMessage("09224872163", fullName))
  6. sendSms(createKalanHesabAdminSmsMessage("09390649614", fullName))
  7. Return { ok: true }
```

### New env vars needed

```env
GHASEDAK_KALAN_HESAB_USER_TEMPLATE=   # template name from Ghasedak panel
```

---

## Phase 3 — Public Form Page

**Goal:** Animated, gold-themed form page at `/kalan-hesab`.

### Page structure

```
app/kalan-hesab/
├── layout.tsx    (Phase 0)
├── kalan-hesab.css (Phase 0)
└── page.tsx      ← build this in Phase 3
```

### Visual layout

```
┌──────────────────────────────────────────────┐
│           [Kalan Hesab Logo]                 │
│                                              │
│  مدیران موفق، قبل از وقوع بحران...          │  headline
│  درباره مالیات، ساختار مالی...               │  subtitle
│                                              │
│  ✓ بررسی اولیه   ✓ شناسایی ریسک   ✓ ارائه  │  value props
│                                              │
│ ┌────────────── Form card ─────────────────┐ │
│ │  نام و نام خانوادگی      [____________] │ │
│ │  نام شرکت یا برند        [____________] │ │
│ │  سمت سازمانی             [▼ select    ] │ │
│ │    └─ if سایر → [text field]            │ │
│ │  اندازه تیم              [▼ select    ] │ │
│ │  بزرگترین دغدغه          [▼ select    ] │ │
│ │    └─ if سایر → [text field]            │ │
│ │  موبایل  [09__________] [ارسال کد ←]   │ │
│ │    └─ [_ _ _ _]  [تایید شماره]         │ │  slides in
│ │    └─ ✓ شماره تایید شد                  │ │  replaces after verify
│ │                                          │ │
│ │  [── دریافت ارزیابی تخصصی ────────── ] │ │  disabled until OTP verified
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

After submit:

┌──────────────────────────────────────────────┐
│               ✓  (animated)                  │
│                                              │
│   ضمن تشکر از اعتماد شما، کارشناسان        │
│   کالان حساب در اولین فرصت با شما           │
│   تماس خواهند گرفت.                         │
└──────────────────────────────────────────────┘
```

### Animation plan

| Trigger | Animation |
|---------|-----------|
| Page load | Fields fade+slide in, staggered 80ms each |
| "سایر" selected | Conditional text field slides in (`step-in` keyframe, already in globals.css) |
| OTP code sent | OTP input section slides in |
| Input focus | Gold border + `box-shadow: 0 0 0 3px rgb(200 152 32 / 0.2)` |
| Submit pending | Spinner inside button |
| Submit success | Scale-up checkmark → fade in success message |

All animations respect `prefers-reduced-motion` (already handled in globals.css).

### Validation schema (Zod)

```ts
const schema = z.object({
  fullName:      z.string().min(2),
  companyName:   z.string().min(1),
  position:      z.enum(["مدیرعامل", "عضو هیئت مدیره", "مدیرمالی", "صاحب کسب‌وکار", "سایر"]),
  positionOther: z.string().optional(),
  teamSize:      z.enum(["کمتر از ۱۰", "۱۰ تا ۵۰", "۵۰ تا ۲۰۰", "بیش از ۲۰۰"]),
  mainConcern:   z.enum(["مدیریت مالی", "مالیات", "تامین اجتماعی", "گزارشات مدیریتی", "حسابرسی", "تامین مالی", "سایر"]),
  concernOther:  z.string().optional(),
  mobile:        z.string().regex(/^09\d{9}$/),
})
```

---

## Phase 4 — Admin Panel

**Goal:** Login + submissions list at `/kalan-hesab/admin`.

### Pages

```
app/kalan-hesab/admin/
├── login/
│   └── page.tsx    OTP login — reuses .auth-panel, .auth-page classes
└── page.tsx        Submissions list with search + Excel export
```

### Login page

Identical flow to IOIV admin login, using existing CSS classes. Gold theme applied automatically via parent layout. On success, creates a JWT session (`kind: "admin"`) and redirects to `/kalan-hesab/admin`.

### Submissions list page

- Header: Kalan Hesab logo + admin's mobile + خروج button
- Search input (filters by fullName, companyName, mobile)
- Export button → `GET /api/kalan-hesab/admin/export` → downloads `.xlsx`
- Table columns:

| نام و نام خانوادگی | نام شرکت | سمت | اندازه تیم | دغدغه | موبایل | تاریخ ثبت |
|--------------------|----------|-----|------------|-------|--------|-----------|

- Route protection: server-side — redirect to login if no valid session or role ≠ `KALAN_HESAB_ADMIN`

---

## Phase 5 — QA & Regression

Checklist before marking complete:

**Kalan Hesab:**
- [ ] Full form submission flow (fill → OTP request → OTP verify → submit → toast + success state)
- [ ] SMS received by user mobile
- [ ] SMS received by 09224872163
- [ ] SMS received by 09390649614
- [ ] OTP rate limiting: second request within 90s is rejected
- [ ] "سایر" conditional fields appear and are included in submission
- [ ] Submit button disabled until OTP verified
- [ ] Both admin numbers can log into `/kalan-hesab/admin`
- [ ] Search filters submissions correctly
- [ ] Excel export downloads with all columns populated
- [ ] Mobile-responsive layout

**IOIV regression (nothing should break):**
- [ ] `/` (public page) loads
- [ ] `/dashboard` loads for authenticated users
- [ ] `/admin` loads for IOIV admins
- [ ] Gold theme does NOT appear on IOIV routes
- [ ] Existing OTP flows (USER_LOGIN, ADMIN_LOGIN) still work

---

## Phase 6 — Deployment

1. **Ghasedak SMS template**: Give the user thank-you text to Ghasedak, receive a template name, set `GHASEDAK_KALAN_HESAB_USER_TEMPLATE` in production env
2. **Environment variables** — copy from IOIV `.env.production` and add:
   ```
   GHASEDAK_KALAN_HESAB_USER_TEMPLATE=<template_name>
   ```
3. **DNS**: Point `form.kalanhesab.com` to the server
4. **Deploy** from `kalan-hesab-form-submission` branch
5. **Seed**: Run `npm run db:seed` on production to create the two admin accounts
6. **Smoke test**: Submit one real form, confirm all 3 SMS messages arrive

---

## File Map Summary

### New files (all in this branch)

```
public/
└── kalan-hesab-logo.jpeg            ✅ copied

app/kalan-hesab/
├── layout.tsx                       Phase 0
├── kalan-hesab.css                  Phase 0
├── page.tsx                         Phase 3
└── admin/
    ├── login/page.tsx               Phase 4
    └── page.tsx                     Phase 4

app/api/kalan-hesab/
├── otp/request/route.ts             Phase 2
├── otp/verify/route.ts              Phase 2
├── submit/route.ts                  Phase 2
└── admin/
    ├── otp/request/route.ts         Phase 2
    ├── otp/verify/route.ts          Phase 2
    ├── logout/route.ts              Phase 2
    ├── submissions/route.ts         Phase 2
    └── export/route.ts              Phase 2
```

### Modified files (minimal, additive only)

```
prisma/schema.prisma    Add OtpPurpose value, UserRole value, KalanHesabSubmission model
prisma/seed.ts          Add two KALAN_HESAB_ADMIN accounts
lib/sms/messages.ts     Add createKalanHesabUserSmsMessage, createKalanHesabAdminSmsMessage
```

No other existing files are touched. IOIV functionality is fully isolated.
