## 1. Submit API — Remove OTP requirement & fix admin SMS

- [x] 1.1 In `app/api/kalan-hesab/submit/route.ts`, remove `verified: z.literal(true)` from the Zod schema
- [x] 1.2 Update `ADMIN_NUMBERS` to `["09390649614"]` — remove `09224872163`, do not add `09124872163` (panel-only, no SMS)

## 2. Seed — Update admin accounts

- [x] 2.1 In `prisma/seed.ts`, change the first `KALAN_HESAB_ADMIN` entry from `09224872163` to `09124872163` (name: "کالان حساب - مدیر دوم"), keep `09390649614` as "کالان حساب - مدیر اول"
- [x] 2.2 Run `npm run db:seed` locally to apply the new admin accounts

## 3. Form Page — Convert to 2-step wizard & remove OTP

- [x] 3.1 In `app/kalan-hesab/page.tsx`, remove all OTP state variables: `otpSent`, `otpCode`, `mobileVerified`, `otpRequestError`, `otpVerifyError` and the `handleRequestOtp` / `handleVerifyOtp` functions
- [x] 3.2 Add step state: `const [step, setStep] = useState<1 | 2>(1)`
- [x] 3.3 Add step-1 Zod sub-schema and a `validateStep1()` function that sets field errors and returns a boolean
- [x] 3.4 Render step 1 fields (نام و نام خانوادگی, نام شرکت یا برند, سمت سازمانی + conditional other, اندازه تیم) with a "مرحله بعد" button that calls `validateStep1()` before advancing to step 2
- [x] 3.5 Render step 2 fields (بزرگترین دغدغه + conditional other, شماره موبایل as plain text input) with a "مرحله قبل" back button and the "دریافت ارزیابی تخصصی" submit button
- [x] 3.6 Enable the submit button whenever the form is not submitting (remove `!mobileVerified` condition)
- [x] 3.7 Remove `verified: true` from the JSON body sent in `handleSubmit`
- [x] 3.8 Add a step indicator above the form card: "مرحله ۱ از ۲" / "مرحله ۲ از ۲" using the existing `.step-indicator__header` CSS class
- [x] 3.9 Apply `step-in` entrance animation to the step-2 fields when step 2 mounts (same pattern as current staggered `animationDelay`)
