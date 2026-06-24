## 1. Page Scaffold

- [x] 1.1 Create `app/kalan-hesab/page.tsx` as a Client Component (`"use client"`) with all state variables declared: `fullName`, `companyName`, `position`, `positionOther`, `teamSize`, `mainConcern`, `concernOther`, `mobile`, `otpSent`, `otpCode`, `mobileVerified`, `submitting`, `submitted`
- [x] 1.2 Add the Zod schema matching the server schema (fullName min 2, companyName min 1, position enum, positionOther optional, teamSize enum, mainConcern enum, concernOther optional, mobile regex `/^09\d{9}$/`)

## 2. Page Header

- [x] 2.1 Render Kalan Hesab logo using `next/image` (`src="/kalan-hesab-logo.jpeg"`) centered above the form
- [x] 2.2 Render headline h1: `مدیران موفق، قبل از وقوع بحران تصمیم می‌گیرند.`
- [x] 2.3 Render subtitle paragraph: `درباره مالیات، ساختار مالی، گزارش‌های مدیریتی یا وضعیت مالی کسب‌وکار خود، با ما در ارتباط باشید.`
- [x] 2.4 Render three value-prop items inline with ✓ prefix: `بررسی اولیه وضعیت مالی و مالیاتی`, `شناسایی ریسک‌های احتمالی`, `ارائه پیشنهادهای بهبود مدیریتی`

## 3. Form Fields

- [x] 3.1 Add text input for `fullName` (label: `نام و نام خانوادگی`)
- [x] 3.2 Add text input for `companyName` (label: `نام شرکت یا برند`)
- [x] 3.3 Add single select for `position` (label: `سمت سازمانی`) with options: مدیرعامل, عضو هیئت مدیره, مدیرمالی, صاحب کسب‌وکار, سایر
- [x] 3.4 Render `positionOther` text input conditionally when `position === "سایر"`, applying `step-in` class for slide-in animation
- [x] 3.5 Add single select for `teamSize` (label: `اندازه تیم`) with options: کمتر از ۱۰, ۱۰ تا ۵۰, ۵۰ تا ۲۰۰, بیش از ۲۰۰
- [x] 3.6 Add single select for `mainConcern` (label: `بزرگترین دغدغه`) with options: مدیریت مالی, مالیات, تامین اجتماعی, گزارشات مدیریتی, حسابرسی, تامین مالی, سایر
- [x] 3.7 Render `concernOther` text input conditionally when `mainConcern === "سایر"`, applying `step-in` class for slide-in animation

## 4. Mobile OTP Flow

- [x] 4.1 Render mobile text input (`type="tel"`) bound to `mobile` state alongside an `ارسال کد` button (state A)
- [x] 4.2 Wire `ارسال کد` button to call `POST /api/kalan-hesab/otp/request` with `{ mobile }` and set `otpSent = true` on success; show API error near the mobile field on failure
- [x] 4.3 When `otpSent === true` and `mobileVerified === false`, render the OTP input row with `step-in` animation: a 4-digit input bound to `otpCode` and a `تایید شماره` button (state B)
- [x] 4.4 Wire `تایید شماره` button to call `POST /api/kalan-hesab/otp/verify` with `{ mobile, code: otpCode }`; on success set `mobileVerified = true`; on failure show error near the OTP input
- [x] 4.5 When `mobileVerified === true`, replace the OTP row with `✓ شماره تایید شد` text (state C)

## 5. Submit Button and Submission

- [x] 5.1 Render submit button with label `دریافت ارزیابی تخصصی`; set `disabled` when `mobileVerified === false`
- [x] 5.2 On click: run Zod parse on all form fields; if invalid, show field-level errors and abort
- [x] 5.3 If valid: set `submitting = true`, call `POST /api/kalan-hesab/submit` with all fields plus `verified: true`; on success set `submitted = true`; on failure show error near the submit button; always set `submitting = false` after response
- [x] 5.4 While `submitting === true`, render a spinner inside the submit button and keep it non-interactive

## 6. Post-Submit Success Screen

- [x] 6.1 When `submitted === true`, replace the form card with a centered success screen: animated checkmark that scales up, followed by the thank-you text: `ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت.`

## 7. Animations and Styling

- [x] 7.1 Apply staggered page-load animation: add `step-in` class to each form field wrapper with `style={{ animationDelay: "Nms" }}` incrementing by 80ms per field (field 1 = 0ms, field 2 = 80ms, … field 7 = 480ms)
- [x] 7.2 Add focus styles for all inputs and selects: gold border + `box-shadow: 0 0 0 3px rgb(200 152 32 / 0.2)` via CSS in `kalan-hesab.css` or inline styles scoped to the form (do not modify layout.tsx or kalan-hesab.css if it conflicts — add a focused class or use the existing `--color-primary` variable)
- [x] 7.3 Verify the success checkmark animation (scale-up) and thank-you text fade-in work correctly
