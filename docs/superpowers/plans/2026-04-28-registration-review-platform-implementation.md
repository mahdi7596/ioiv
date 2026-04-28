# Registration Review Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `sana.ioiv.ir` registration, document submission, Zarinpal payment, Ghasedak SMS, and admin review platform.

**Architecture:** Create a full-stack Next.js App Router application backed by PostgreSQL. Use Prisma for the database layer, Zod for shared validation, server actions/route handlers for mutations, secure cookie sessions for user/admin auth, local protected upload storage on the VPS, and simple operational admin screens.

**Tech Stack:** Next.js, TypeScript, PostgreSQL, Prisma, Zod, React Hook Form, Tailwind CSS, Ghasedak SMS API, Zarinpal payment API, XLSX/CSV export.

---

## Key Decisions

- Subdomain: `sana.ioiv.ir`.
- Payment: Zarinpal, fixed non-refundable fee of `3,000,000 Toman`.
- SMS: Ghasedak.
- Registration field from `saana.docx`: company national ID / `شناسه ملی شرکت`.
- Mobile number is still the OTP login identifier.
- Current form uniqueness: `mobile + companyNationalId + applicationRound`. Keep `nationalCode` nullable in the schema for future expansion, but do not require it in the current UI because the provided document does not ask for it.
- Users can move between form steps.
- Drafts autosave entered data, uploaded file references, and latest step.
- Final payment/submission is blocked until all required steps are valid.
- `صورت‌های مالی حسابرسی شده` is optional.
- All other document steps are required.
- Upload default: allow `.pdf`, `.doc`, `.docx`, `.zip`, max `20MB` per file.

## File Structure

Create this application structure:

```text
.
├── app/
│   ├── (public)/
│   │   └── page.tsx
│   ├── admin/
│   │   ├── login/page.tsx
│   │   ├── page.tsx
│   │   └── submissions/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   ├── api/
│   │   ├── admin/export/route.ts
│   │   ├── auth/request-otp/route.ts
│   │   ├── auth/verify-otp/route.ts
│   │   ├── files/[id]/route.ts
│   │   ├── payment/callback/route.ts
│   │   └── uploads/route.ts
│   ├── dashboard/
│   │   ├── page.tsx
│   │   └── application/page.tsx
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── admin/
│   │   ├── StatusBadge.tsx
│   │   ├── StatusChangeForm.tsx
│   │   └── SubmissionsTable.tsx
│   ├── application/
│   │   ├── ApplicationWizard.tsx
│   │   ├── CreditReportStep.tsx
│   │   ├── FinancialStatementsStep.tsx
│   │   ├── StepIndicator.tsx
│   │   ├── TaxDeclarationStep.tsx
│   │   ├── TrialBalanceStep.tsx
│   │   └── FinalPaymentStep.tsx
│   └── auth/
│       ├── MobileEntryForm.tsx
│       ├── OtpForm.tsx
│       └── RegistrationForm.tsx
├── lib/
│   ├── actions/
│   │   ├── admin.ts
│   │   ├── application.ts
│   │   ├── auth.ts
│   │   └── payment.ts
│   ├── auth/session.ts
│   ├── db.ts
│   ├── export/submissions.ts
│   ├── payments/zarinpal.ts
│   ├── sms/ghasedak.ts
│   ├── sms/index.ts
│   ├── uploads/storage.ts
│   └── validations/
│       ├── application.ts
│       ├── auth.ts
│       └── shared.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── tests/
│   ├── validation/application.test.ts
│   └── validation/auth.test.ts
├── .env.example
└── package.json
```

## Task 1: Initialize The App

**Files:**
- Create: `package.json`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `.env.example`

- [ ] **Step 1: Initialize Next.js**

Run:

```bash
npx create-next-app@latest . --ts --app --eslint --tailwind --src-dir false --import-alias "@/*"
```

Expected: a Next.js TypeScript app is created in the current folder.

- [ ] **Step 2: Install core dependencies**

Run:

```bash
npm install prisma @prisma/client zod react-hook-form @hookform/resolvers xlsx jose bcryptjs
npm install -D vitest tsx @types/bcryptjs
```

Expected: dependencies are added to `package.json`.

- [ ] **Step 3: Add environment example**

Create `.env.example` with:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sana"
APP_URL="https://sana.ioiv.ir"
SESSION_SECRET="replace-with-32-plus-character-secret"
UPLOAD_DIR="/var/www/sana/uploads"
ZARINPAL_MERCHANT_ID="replace-with-zarinpal-merchant-id"
ZARINPAL_SANDBOX="true"
GHASEDAK_API_KEY="replace-with-ghasedak-api-key"
GHASEDAK_OTP_TEMPLATE="sana-otp"
GHASEDAK_SENDER=""
ADMIN_ALERT_MOBILE=""
```

- [ ] **Step 4: Verify app boots**

Run:

```bash
npm run dev
```

Expected: Next.js starts locally and serves the default page.

## Task 2: Database Schema And Seed

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: Initialize Prisma**

Run:

```bash
npx prisma init
```

Expected: Prisma config files are created.

- [ ] **Step 2: Define Prisma schema**

Use this model structure in `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  ADMIN
  SUPER_ADMIN
}

enum OtpPurpose {
  USER_LOGIN
  ADMIN_LOGIN
}

enum ApplicationStatus {
  DRAFT
  PENDING_PAYMENT
  SUBMITTED
  UNDER_REVIEW
  NEEDS_EDIT
  REJECTED
  ACCEPTED
}

enum PaymentStatus {
  INITIATED
  VERIFIED
  FAILED
}

model User {
  id                String        @id @default(cuid())
  mobile            String        @unique
  companyNationalId String?
  nationalCode      String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  applications      Application[]
}

model Admin {
  id        String   @id @default(cuid())
  name      String
  mobile    String   @unique
  role      UserRole @default(ADMIN)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model OtpCode {
  id         String     @id @default(cuid())
  mobile     String
  codeHash   String
  purpose    OtpPurpose
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime   @default(now())

  @@index([mobile, purpose])
}

model Application {
  id                String            @id @default(cuid())
  userId            String
  user              User              @relation(fields: [userId], references: [id])
  mobile            String
  companyNationalId String
  nationalCode      String?
  applicationRound  String            @default("1403")
  status            ApplicationStatus @default(DRAFT)
  currentStep       Int               @default(1)
  taxDeclarations   Json              @default("[]")
  financials        Json              @default("[]")
  trialBalance      Json              @default("{}")
  creditReports     Json              @default("{}")
  adminNote         String?
  submittedAt       DateTime?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  files             ApplicationFile[]
  payments          Payment[]
  history           StatusHistory[]

  @@unique([mobile, companyNationalId, applicationRound])
  @@index([status])
  @@index([companyNationalId])
}

model ApplicationFile {
  id            String      @id @default(cuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  fieldKey      String
  originalName  String
  mimeType      String
  size          Int
  storagePath   String
  createdAt     DateTime    @default(now())

  @@index([applicationId, fieldKey])
}

model Payment {
  id            String        @id @default(cuid())
  applicationId String
  application   Application   @relation(fields: [applicationId], references: [id])
  amountToman   Int
  gateway       String        @default("zarinpal")
  authority     String?
  referenceId   String?
  status        PaymentStatus @default(INITIATED)
  rawData       Json?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

model StatusHistory {
  id            String            @id @default(cuid())
  applicationId String
  application   Application       @relation(fields: [applicationId], references: [id])
  previousStatus ApplicationStatus?
  newStatus     ApplicationStatus
  changedById   String?
  note          String?
  createdAt     DateTime          @default(now())

  @@index([applicationId])
}
```

- [ ] **Step 3: Add seed script**

Create `prisma/seed.ts`:

```ts
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const mobile = process.env.SEED_ADMIN_MOBILE || "09120000000";

  await prisma.admin.upsert({
    where: { mobile },
    update: { active: true },
    create: {
      name: "مدیر سامانه",
      mobile,
      role: UserRole.SUPER_ADMIN,
      active: true,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Add Prisma scripts**

In `package.json`, add:

```json
{
  "scripts": {
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "test": "vitest run"
  }
}
```

- [ ] **Step 5: Run migration and seed**

Run:

```bash
npx prisma migrate dev --name init
npm run db:seed
```

Expected: database tables are created and one admin is seeded.

## Task 3: Shared Validation

**Files:**
- Create: `lib/validations/shared.ts`
- Create: `lib/validations/auth.ts`
- Create: `lib/validations/application.ts`
- Create: `tests/validation/auth.test.ts`
- Create: `tests/validation/application.test.ts`

- [ ] **Step 1: Add auth validation tests**

Create `tests/validation/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mobileSchema, otpSchema, companyNationalIdSchema } from "@/lib/validations/auth";

describe("auth validation", () => {
  it("accepts Iranian mobile numbers", () => {
    expect(mobileSchema.safeParse("09123456789").success).toBe(true);
  });

  it("rejects invalid mobile numbers", () => {
    expect(mobileSchema.safeParse("08123456789").success).toBe(false);
  });

  it("requires a four digit OTP", () => {
    expect(otpSchema.safeParse("1234").success).toBe(true);
    expect(otpSchema.safeParse("12345").success).toBe(false);
  });

  it("requires company national ID digits", () => {
    expect(companyNationalIdSchema.safeParse("12345678901").success).toBe(true);
    expect(companyNationalIdSchema.safeParse("abc").success).toBe(false);
  });
});
```

- [ ] **Step 2: Implement auth validation**

Create `lib/validations/auth.ts`:

```ts
import { z } from "zod";

export const mobileSchema = z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست");
export const otpSchema = z.string().regex(/^\d{4}$/, "کد تایید باید ۴ رقم باشد");
export const companyNationalIdSchema = z
  .string()
  .regex(/^\d{11}$/, "شناسه ملی شرکت باید ۱۱ رقم باشد");

export const requestOtpSchema = z.object({
  mobile: mobileSchema,
  mode: z.enum(["user", "admin"]),
});

export const verifyOtpSchema = z.object({
  mobile: mobileSchema,
  code: otpSchema,
  mode: z.enum(["user", "admin"]),
  companyNationalId: companyNationalIdSchema.optional(),
});
```

- [ ] **Step 3: Add application validation tests**

Create `tests/validation/application.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applicationDraftSchema, finalSubmissionSchema } from "@/lib/validations/application";

const fileRef = { fileId: "file_1", name: "doc.pdf" };

describe("application validation", () => {
  it("requires three tax declaration rows for final submission", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
      ],
      financials: [],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("allows optional financial statements when empty", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
        { year: "1402", file: fileRef },
      ],
      financials: [],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(true);
  });

  it("requires year and file when optional financial row is present", () => {
    const result = finalSubmissionSchema.safeParse({
      taxDeclarations: [
        { year: "1400", file: fileRef },
        { year: "1401", file: fileRef },
        { year: "1402", file: fileRef },
      ],
      financials: [{ year: "1402" }],
      trialBalance: { generalLedger: fileRef, subsidiaryLedger: fileRef },
      creditReports: { company: fileRef, ceo: fileRef, boardMember: fileRef },
      acceptedTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it("allows draft data without requiring every final field", () => {
    expect(applicationDraftSchema.safeParse({ currentStep: 2, financials: [] }).success).toBe(true);
  });
});
```

- [ ] **Step 4: Implement application validation**

Create `lib/validations/application.ts`:

```ts
import { z } from "zod";

const fileRefSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
});

const yearFileRowSchema = z.object({
  year: z.string().regex(/^\d{4}$/, "سال باید ۴ رقم باشد"),
  file: fileRefSchema,
});

export const applicationDraftSchema = z.object({
  currentStep: z.number().int().min(1).max(5).optional(),
  taxDeclarations: z.array(yearFileRowSchema.partial()).optional(),
  financials: z.array(yearFileRowSchema.partial()).optional(),
  trialBalance: z
    .object({
      generalLedger: fileRefSchema.optional(),
      subsidiaryLedger: fileRefSchema.optional(),
    })
    .optional(),
  creditReports: z
    .object({
      company: fileRefSchema.optional(),
      ceo: fileRefSchema.optional(),
      boardMember: fileRefSchema.optional(),
    })
    .optional(),
});

export const finalSubmissionSchema = z.object({
  taxDeclarations: z.array(yearFileRowSchema).min(3, "حداقل سه سال اظهارنامه مالیاتی الزامی است"),
  financials: z.array(yearFileRowSchema),
  trialBalance: z.object({
    generalLedger: fileRefSchema,
    subsidiaryLedger: fileRefSchema,
  }),
  creditReports: z.object({
    company: fileRefSchema,
    ceo: fileRefSchema,
    boardMember: fileRefSchema,
  }),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "تایید غیرقابل استرداد بودن پرداخت الزامی است" }),
  }),
});
```

- [ ] **Step 5: Run validation tests**

Run:

```bash
npm test -- tests/validation
```

Expected: all validation tests pass.

## Task 4: Sessions, OTP, And Ghasedak Adapter

**Files:**
- Create: `lib/db.ts`
- Create: `lib/auth/session.ts`
- Create: `lib/sms/index.ts`
- Create: `lib/sms/ghasedak.ts`
- Create: `lib/actions/auth.ts`
- Create: `app/api/auth/request-otp/route.ts`
- Create: `app/api/auth/verify-otp/route.ts`

- [ ] **Step 1: Create Prisma client**

Create `lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

- [ ] **Step 2: Create secure session helpers**

Create `lib/auth/session.ts` with signed cookie helpers using `jose`. Sessions must store `{ subjectId, kind: "user" | "admin" }`, use `httpOnly`, `sameSite: "lax"`, `secure` in production, and expire after 7 days.

- [ ] **Step 3: Create SMS adapter interface**

Create `lib/sms/index.ts`:

```ts
export type SmsMessage = {
  to: string;
  text: string;
  template?: string;
  params?: Record<string, string>;
};

export async function sendSms(message: SmsMessage) {
  if (process.env.NODE_ENV !== "production") {
    console.log("[sms]", message);
    return { ok: true };
  }

  const { sendGhasedakSms } = await import("./ghasedak");
  return sendGhasedakSms(message);
}
```

- [ ] **Step 4: Create Ghasedak implementation**

Create `lib/sms/ghasedak.ts`. Use `GHASEDAK_API_KEY`, `GHASEDAK_OTP_TEMPLATE`, and `GHASEDAK_SENDER`. Prefer Ghasedak OTP/template endpoint for OTP messages and normal send endpoint for status/admin alerts. The function must throw a descriptive error when the API key is missing.

- [ ] **Step 5: Implement OTP request and verify actions**

Create `lib/actions/auth.ts` with:

```ts
export async function requestOtp(input: unknown): Promise<{ next: "otp" | "register" }> {}
export async function verifyOtp(input: unknown): Promise<{ redirectTo: string }> {}
```

Behavior:

- Generate 4-digit numeric OTP.
- Hash OTP before storing.
- Expire OTP after 2 minutes.
- For admin mode, reject if mobile is not an active admin.
- For user mode, return `register` if user does not exist.
- For new user verification, require company national ID.
- Create user only after OTP verification.
- Set user or admin session cookie after successful verification.

- [ ] **Step 6: Wire API routes**

Create route handlers:

```ts
// app/api/auth/request-otp/route.ts
export async function POST(request: Request) {}

// app/api/auth/verify-otp/route.ts
export async function POST(request: Request) {}
```

Each route parses JSON, calls the action, and returns JSON errors with HTTP 400 for validation failures.

## Task 5: Public Login And Registration UI

**Files:**
- Create: `components/auth/MobileEntryForm.tsx`
- Create: `components/auth/OtpForm.tsx`
- Create: `components/auth/RegistrationForm.tsx`
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: Build mobile entry form**

Create a client component with one mobile input, Persian label, submit button, inline validation, and loading state.

- [ ] **Step 2: Build registration form**

Create a client component for company national ID. It appears only when API returns `next: "register"`.

- [ ] **Step 3: Build OTP form**

Create a 4-digit OTP form with inline validation and resend timer display.

- [ ] **Step 4: Compose public page**

The public page flow:

```text
mobile entry -> registration if needed -> OTP -> redirect /dashboard
```

For existing users:

```text
mobile entry -> OTP -> redirect /dashboard
```

## Task 6: User Dashboard And Application Draft

**Files:**
- Create: `lib/actions/application.ts`
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/application/page.tsx`
- Create: `components/application/ApplicationWizard.tsx`
- Create: `components/application/StepIndicator.tsx`

- [ ] **Step 1: Implement application loader**

Create server functions:

```ts
export async function getCurrentUserApplication() {}
export async function createOrGetDraftApplication() {}
export async function saveApplicationDraft(input: unknown) {}
```

Behavior:

- Require user session.
- Use `applicationRound = "1403"`.
- Create a draft if none exists.
- Enforce unique `mobile + companyNationalId + applicationRound`.
- Save `currentStep` and partial step JSON.

- [ ] **Step 2: Build dashboard page**

Show:

- current application status
- admin note if present
- payment/submission state
- button to start/continue application
- edit allowed only for `DRAFT` and `NEEDS_EDIT`

- [ ] **Step 3: Build wizard shell**

Wizard has five steps:

1. `اظهارنامه مالیاتی`
2. `صورت‌های مالی حسابرسی شده`
3. `تراز کل و معین`
4. `گزارش اعتبارسنجی`
5. `تایید نهایی و پرداخت`

`StepIndicator` shows current step, total steps, and title.

- [ ] **Step 4: Autosave draft**

Autosave when:

- user changes step
- user uploads a file
- user clicks save

Persist `currentStep` so returning users resume where they left off.

## Task 7: Upload Storage

**Files:**
- Create: `lib/uploads/storage.ts`
- Create: `app/api/uploads/route.ts`
- Create: `app/api/files/[id]/route.ts`

- [ ] **Step 1: Implement upload validation**

Rules:

- max size: `20MB`
- allowed extensions: `.pdf`, `.doc`, `.docx`, `.zip`
- allowed MIME types include PDF, Word, ZIP, and generic octet-stream for ZIP fallback

- [ ] **Step 2: Store uploaded files**

Store files under:

```text
{UPLOAD_DIR}/{applicationId}/{fieldKey}/{generatedFileName}
```

Create an `ApplicationFile` row with original name, MIME type, size, field key, and storage path.

- [ ] **Step 3: Protect file download**

`app/api/files/[id]/route.ts` must allow:

- owning user
- active admin

It must reject everyone else with HTTP 403.

## Task 8: Wizard Step Components

**Files:**
- Create: `components/application/TaxDeclarationStep.tsx`
- Create: `components/application/FinancialStatementsStep.tsx`
- Create: `components/application/TrialBalanceStep.tsx`
- Create: `components/application/CreditReportStep.tsx`
- Create: `components/application/FinalPaymentStep.tsx`

- [ ] **Step 1: Tax declaration step**

Show three default rows. Each row has:

- year selector/input
- required file upload

Add plus button for extra rows. Final validation requires at least three complete rows.

- [ ] **Step 2: Financial statements step**

Show one default row. This whole step is optional. If a row has year or file, require both year and file. Add plus button for extra rows.

- [ ] **Step 3: Trial balance step**

Required uploads:

- `تراز کل`
- `تراز معین`

- [ ] **Step 4: Credit report step**

Show instruction text:

```text
با مراجعه به سایت https://www.mycredit.ir/ نسبت به تهیه گزارش اعتبارسنجی به تاریخ روز برای شرکت ، مدیرعامل و یکی از اعضای هیات مدیره ترجیحا رئیس یا نایب رئیس هیات مدیره اقدام نمائید.
```

Required uploads:

- `گزارش اعتبار سنجی شرکت`
- `گزارش اعتبار سنجی مدیرعامل`
- `گزارش اعتبار سنجی یکی از اعضای هیات مدیره`

- [ ] **Step 5: Final payment step**

Show:

- summary of uploaded items
- required non-refundable payment checkbox
- payment button disabled until final validation passes

## Task 9: Zarinpal Payment

**Files:**
- Create: `lib/payments/zarinpal.ts`
- Create: `lib/actions/payment.ts`
- Create: `app/api/payment/callback/route.ts`

- [ ] **Step 1: Create Zarinpal client**

Functions:

```ts
export async function requestZarinpalPayment(input: {
  amountToman: number;
  description: string;
  callbackUrl: string;
  mobile: string;
}): Promise<{ authority: string; paymentUrl: string }> {}

export async function verifyZarinpalPayment(input: {
  amountToman: number;
  authority: string;
}): Promise<{ referenceId: string }> {}
```

- [ ] **Step 2: Start payment action**

`startPayment()` must:

- require user session
- load application
- run `finalSubmissionSchema`
- set status `PENDING_PAYMENT`
- create `Payment` row with amount `3000000`
- request Zarinpal payment
- save authority
- return redirect URL

- [ ] **Step 3: Verify callback**

Callback route must:

- read `Authority` and `Status`
- verify with Zarinpal server-side
- mark payment `VERIFIED`
- mark application `SUBMITTED`
- set `submittedAt`
- create status history row
- send SMS to admin alert mobile
- redirect user to `/dashboard`

Failed payment must keep the application editable and show a clear dashboard message.

## Task 10: Admin Dashboard

**Files:**
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/page.tsx`
- Create: `app/admin/submissions/page.tsx`
- Create: `app/admin/submissions/[id]/page.tsx`
- Create: `components/admin/StatusBadge.tsx`
- Create: `components/admin/SubmissionsTable.tsx`
- Create: `components/admin/StatusChangeForm.tsx`
- Create: `lib/actions/admin.ts`

- [ ] **Step 1: Build admin login**

Use same OTP endpoints with `mode: "admin"`. Redirect successful login to `/admin`.

- [ ] **Step 2: Build overview dashboard**

Show counts:

- total
- submitted
- under review
- needs edit
- accepted
- rejected

- [ ] **Step 3: Build submissions table**

Support:

- search by mobile and company national ID
- filter by status
- sort newest/oldest
- link to detail page

- [ ] **Step 4: Build detail page**

Show:

- user mobile
- company national ID
- application status
- all uploaded files as protected download links
- payment status/reference ID
- status history
- optional admin note
- status change form

- [ ] **Step 5: Implement status changes**

Allowed admin transitions:

```text
SUBMITTED -> UNDER_REVIEW
UNDER_REVIEW -> NEEDS_EDIT
UNDER_REVIEW -> ACCEPTED
UNDER_REVIEW -> REJECTED
NEEDS_EDIT -> UNDER_REVIEW
SUBMITTED -> ACCEPTED
SUBMITTED -> REJECTED
```

On every status change:

- save history
- save optional note on application
- send SMS to user

## Task 11: Export

**Files:**
- Create: `lib/export/submissions.ts`
- Create: `app/api/admin/export/route.ts`

- [ ] **Step 1: Implement XLSX export**

Export one row per application with:

- created date
- submitted date
- status
- mobile
- company national ID
- payment status
- payment reference ID
- counts of tax declaration files
- counts of audited financial statement files
- trial balance file presence
- credit report file presence
- latest admin note

- [ ] **Step 2: Add CSV fallback**

If `format=csv`, return CSV with the same columns.

- [ ] **Step 3: Add export button**

Add export button to admin submissions page. Preserve current status/search filters in the export URL.

## Task 12: Polish, Security, And Verification

**Files:**
- Modify: relevant UI and route files

- [ ] **Step 1: Persian/RTL UI pass**

Set `html lang="fa" dir="rtl"` in `app/layout.tsx`. Ensure inputs, tables, and buttons work in RTL layout.

- [ ] **Step 2: Access-control pass**

Verify manually:

- logged-out users cannot access `/dashboard`
- normal users cannot access `/admin`
- users cannot download another user's file
- users cannot edit `SUBMITTED`, `UNDER_REVIEW`, `ACCEPTED`, or `REJECTED` applications
- admins cannot log in unless seeded/manual admin exists

- [ ] **Step 3: End-to-end smoke test**

Manual flow:

```text
new user -> mobile -> registration company national ID -> OTP -> dashboard -> fill required docs -> payment sandbox -> submitted -> admin SMS log -> admin login -> review -> needs_edit -> user SMS log -> user edits -> resubmits -> admin accepts
```

- [ ] **Step 4: Production env checklist**

Confirm:

- `DATABASE_URL`
- `APP_URL=https://sana.ioiv.ir`
- `SESSION_SECRET`
- `UPLOAD_DIR`
- `ZARINPAL_MERCHANT_ID`
- `ZARINPAL_SANDBOX=false`
- `GHASEDAK_API_KEY`
- `GHASEDAK_OTP_TEMPLATE`
- `ADMIN_ALERT_MOBILE`

## Task 13: Deployment Prep

**Files:**
- Create: `DEPLOYMENT.md`

- [ ] **Step 1: Write deployment notes**

Create `DEPLOYMENT.md` with:

```md
# Deployment

Production domain: https://sana.ioiv.ir

Required server access:
- SSH/SFTP access
- sudo access
- PostgreSQL access
- Nginx config access
- DNS record for sana.ioiv.ir

Recommended runtime:
- Node.js LTS
- PostgreSQL
- PM2 or Docker
- Nginx reverse proxy

Nginx routes:
- client main WordPress site remains unchanged
- sana.ioiv.ir proxies to the Next.js app port

Deployment commands:
- npm ci
- npx prisma migrate deploy
- npm run build
- npm run start
```

- [ ] **Step 2: Verify build**

Run:

```bash
npm run build
npm test
```

Expected: production build and validation tests pass.

---

## Self-Review Notes

- The plan covers the approved spec: OTP, Ghasedak, Zarinpal, user dashboard, draft autosave, step wizard, uploads, admin review, SMS status changes, and export.
- The current `saana.docx` did not include personal name/national code fields, so the implementation plan does not require them in UI. The schema keeps nullable `nationalCode` for future expansion.
- File size/type defaults are concrete: `.pdf`, `.doc`, `.docx`, `.zip`, max `20MB`.
- The plan assumes Zarinpal sandbox is used during development and production credentials are added before launch.
