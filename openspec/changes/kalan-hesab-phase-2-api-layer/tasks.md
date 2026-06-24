## 1. SMS Factory Functions

- [x] 1.1 Add `createKalanHesabUserSmsMessage(to: string): SmsMessage` to `lib/sms/messages.ts` — returns `{ to, text: "ضمن تشکر...", template: process.env.GHASEDAK_KALAN_HESAB_USER_TEMPLATE }`
- [x] 1.2 Add `createKalanHesabAdminSmsMessage(to: string, fullName: string): SmsMessage` to `lib/sms/messages.ts` — returns `{ to, text: "فرم جدید در کالان حساب ثبت شد - ${fullName}" }` with no template

## 2. User OTP — Request

- [x] 2.1 Create `app/api/kalan-hesab/otp/request/route.ts` with a `POST` handler
- [x] 2.2 Parse body with `z.object({ mobile: mobileSchema })` — return `400` on ZodError
- [x] 2.3 Query `db.otpCode.findFirst` for an unconsumed `KALAN_HESAB_VERIFICATION` OTP created within the last 90 seconds — return `429` if found
- [x] 2.4 Create `OtpCode` row: `{ mobile, code, purpose: OtpPurpose.KALAN_HESAB_VERIFICATION, expiresAt: now + 10 min }`
- [x] 2.5 Call `sendSms(createOtpSmsMessage(mobile, code))` and return `200 { ok: true }`

## 3. User OTP — Verify

- [x] 3.1 Create `app/api/kalan-hesab/otp/verify/route.ts` with a `POST` handler
- [x] 3.2 Parse body with `z.object({ mobile: mobileSchema, code: otpSchema })` — return `400` on ZodError
- [x] 3.3 Query `db.otpCode.findFirst` for matching unconsumed unexpired `KALAN_HESAB_VERIFICATION` OTP — return `400` if not found
- [x] 3.4 Update `OtpCode.consumedAt = new Date()` — return `200 { verified: true }` with no session created

## 4. Form Submission

- [x] 4.1 Create `app/api/kalan-hesab/submit/route.ts` with a `POST` handler
- [x] 4.2 Define Zod schema with all 9 fields: `fullName`, `companyName`, `position` (enum), `positionOther?`, `teamSize` (enum), `mainConcern` (enum), `concernOther?`, `mobile` (mobileSchema), `verified: z.literal(true)` — return `400` on ZodError
- [x] 4.3 Call `db.kalanHesabSubmission.create(...)` with all fields from the validated body
- [x] 4.4 Call `sendSms(createKalanHesabUserSmsMessage(data.mobile))`
- [x] 4.5 Call `sendSms(createKalanHesabAdminSmsMessage("09224872163", data.fullName))`
- [x] 4.6 Call `sendSms(createKalanHesabAdminSmsMessage("09390649614", data.fullName))` and return `200 { ok: true }`

## 5. Admin OTP — Request

- [x] 5.1 Create `app/api/kalan-hesab/admin/otp/request/route.ts` with a `POST` handler
- [x] 5.2 Parse body with `z.object({ mobile: mobileSchema })` — return `400` on ZodError
- [x] 5.3 Look up `db.admin.findUnique({ where: { mobile } })` — return `403` if not found, `!active`, or `role !== KALAN_HESAB_ADMIN`
- [x] 5.4 Apply 90-second rate limit on `ADMIN_LOGIN` OTPs for this mobile — return `429` if in-window OTP exists
- [x] 5.5 Create `OtpCode` row with purpose `ADMIN_LOGIN`, call `sendSms(createOtpSmsMessage(...))`, return `200 { ok: true }`

## 6. Admin OTP — Verify

- [x] 6.1 Create `app/api/kalan-hesab/admin/otp/verify/route.ts` with a `POST` handler
- [x] 6.2 Parse body with `z.object({ mobile: mobileSchema, code: otpSchema })` — return `400` on ZodError
- [x] 6.3 Query `db.otpCode.findFirst` for matching unconsumed unexpired `ADMIN_LOGIN` OTP — return `400` if not found
- [x] 6.4 Look up `db.admin.findUnique({ where: { mobile } })` — return `403` if `!active` or `role !== KALAN_HESAB_ADMIN`
- [x] 6.5 Update `OtpCode.consumedAt = new Date()`, call `createSession({ subjectId: admin.id, kind: "admin" })`, return `200 { redirectTo: "/kalan-hesab/admin" }`

## 7. Admin Logout

- [x] 7.1 Create `app/api/kalan-hesab/admin/logout/route.ts` with a `POST` handler
- [x] 7.2 Call `clearSession()` and return `NextResponse.redirect(new URL("/kalan-hesab/admin/login", request.url), { status: 303 })`

## 8. Admin Submissions List

- [x] 8.1 Create `app/api/kalan-hesab/admin/submissions/route.ts` with a `GET` handler
- [x] 8.2 Read session with `getSession()` — return `401` if missing or `kind !== "admin"`
- [x] 8.3 Look up `db.admin.findUnique` by `session.subjectId` — return `403` if not found, `!active`, or `role !== KALAN_HESAB_ADMIN`
- [x] 8.4 Read `?search=` query param; build `findMany` query with `OR` filter across `fullName`, `companyName`, `mobile` when search is non-empty; order by `createdAt: "desc"`
- [x] 8.5 Return `200 { submissions: [...] }`

## 9. Admin Export

- [x] 9.1 Create `app/api/kalan-hesab/admin/export/route.ts` with a `GET` handler
- [x] 9.2 Auth check identical to submissions list (tasks 8.2–8.3) — return `401`/`403` on failure
- [x] 9.3 Fetch all `KalanHesabSubmission` rows ordered by `createdAt: "desc"`
- [x] 9.4 Map rows to xlsx-ready objects with columns: نام و نام خانوادگی, نام شرکت, سمت (resolve سایر → positionOther), اندازه تیم, دغدغه (resolve سایر → concernOther), موبایل, تاریخ ثبت
- [x] 9.5 Build workbook with `XLSX.utils.book_new()` + `XLSX.utils.json_to_sheet(rows)` + `XLSX.utils.book_append_sheet()`, write to buffer, return as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `Content-Disposition: attachment; filename=kalan-hesab-submissions.xlsx`
