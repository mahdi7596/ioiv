## 1. Login Page

- [x] 1.1 Create `app/kalan-hesab/admin/login/page.tsx` as `"use client"` with state: `mobile` (string), `code` (string), `otpSent` (boolean), `loading` (boolean), `message` (string | undefined)
- [x] 1.2 Implement `requestOtp()`: sets `loading=true`, POSTs `{ mobile }` to `/api/kalan-hesab/admin/otp/request`, sets `otpSent=true` on success, sets `message` on error; always sets `loading=false`
- [x] 1.3 Implement `verifyOtp()`: sets `loading=true`, POSTs `{ mobile, code }` to `/api/kalan-hesab/admin/otp/verify`, calls `window.location.assign(data.redirectTo)` on success, sets `message` on error; always sets `loading=false`
- [x] 1.4 Render `<main className="auth-page">` with `.auth-info` section containing: `eyebrow` paragraph "پنل مدیریت کالان حساب", `<h1>`, description paragraph, `.auth-info__steps` with 3 numbered steps
- [x] 1.5 Render `.auth-panel` section with `auth-panel__header` containing Kalan Hesab logo (160×80, `src="/kalan-hesab-logo.jpeg"`), eyebrow "ورود مدیران", dynamic `<h2>` ("کد تایید را وارد کنید" when `otpSent`, otherwise "شماره موبایل مدیر را وارد کنید"), description paragraph
- [x] 1.6 Render `<form className="stack">` with `onSubmit` calling `requestOtp` or `verifyOtp` based on `otpSent`; mobile input field (`id="kh-admin-mobile"`, type="tel", dir="ltr", inputMode="numeric", autoComplete="tel", maxLength=11, disabled when `otpSent`); `data-invalid` on `.field` when `message && !otpSent`
- [x] 1.7 Conditionally render OTP code input when `otpSent === true`: `.field` with `data-invalid` when `message`, input (`id="kh-admin-otp"`, type="tel", dir="ltr", inputMode="numeric", autoComplete="one-time-code", maxLength=4, className "text-center text-xl"), and `<p className="field__hint">` with message if present
- [x] 1.8 Conditionally render mobile error when `!otpSent && message`: `<p className="field__hint text-red-700">`
- [x] 1.9 Render submit button (`className="button button--primary w-full"`, disabled when `loading`): label is "در حال بررسی..." when loading, "ورود به پنل مدیریت" when `otpSent`, otherwise "دریافت کد تایید"
- [x] 1.10 Conditionally render "تغییر شماره" ghost button when `otpSent === true`: `type="button"`, `className="button button--ghost w-full"`, onClick resets `otpSent=false`, `code=""`, `message=undefined`

## 2. Admin Submissions Page

- [x] 2.1 Create `app/kalan-hesab/admin/page.tsx` as a Server Component (no `"use client"`); import `getSession` from `@/lib/auth/session`, `db` from `@/lib/db`, `redirect` from `next/navigation`, `UserRole` from `@prisma/client`, `Image` from `next/image`
- [x] 2.2 Add route protection at top of component: call `getSession()`; if `!session || session.kind !== "admin"` then `redirect("/kalan-hesab/admin/login")`
- [x] 2.3 Fetch admin from DB: `db.admin.findUnique({ where: { id: session.subjectId } })`; if `!admin || !admin.active || admin.role !== UserRole.KALAN_HESAB_ADMIN` then `redirect("/kalan-hesab/admin/login")`
- [x] 2.4 Read `search` from `await searchParams`; query `db.kalanHesabSubmission.findMany` with `where: search ? { OR: [{ fullName: { contains: search } }, { companyName: { contains: search } }, { mobile: { contains: search } }] } : undefined` and `orderBy: { createdAt: "desc" }`
- [x] 2.5 Render root `<div className="kh-admin-page">`; inside render `<header className="kh-admin-header">` containing: `Image` (src="/kalan-hesab-logo.jpeg", width=120, height=60, className="kh-logo"), `<span className="kh-admin-mobile" dir="ltr">{admin.mobile}</span>`, and `<form method="POST" action="/api/kalan-hesab/admin/logout"><button type="submit" className="button button--ghost">خروج</button></form>`
- [x] 2.6 Render `<div className="kh-admin-toolbar">` containing: search form (`method="GET" action="/kalan-hesab/admin" className="kh-admin-search"`) with `<input type="search" name="search" defaultValue={search} placeholder="جستجو در نام، شرکت یا موبایل..." className="kh-input" dir="rtl" />` and `<button type="submit" className="button button--primary">جستجو</button>`; and `<a href="/api/kalan-hesab/admin/export" className="button">دریافت Excel</a>`
- [x] 2.7 Render `<div className="kh-admin-table-wrap">` containing `<table className="data-table" dir="rtl">` with `<thead>` row: نام و نام خانوادگی, نام شرکت, سمت, اندازه تیم, دغدغه, موبایل, تاریخ ثبت
- [x] 2.8 Render `<tbody>`: if `submissions.length === 0` show a single `<tr><td colSpan={7}>` with text "نتیجه‌ای یافت نشد." when `search` is set, or "هنوز فرمی ثبت نشده است." otherwise; else map over submissions rendering one `<tr key={s.id}>` per row; in the سمت cell show `s.positionOther` when `s.position === "سایر" && s.positionOther`, else `s.position`; in the دغدغه cell show `s.concernOther` when `s.mainConcern === "سایر" && s.concernOther`, else `s.mainConcern`; mobile cell has `dir="ltr"`; date cell shows `s.createdAt.toLocaleDateString("fa-IR")`

## 3. CSS Additions

- [x] 3.1 Append `.kh-admin-page` to `app/kalan-hesab/kalan-hesab.css`: `display: flex; flex-direction: column; gap: 24px; min-height: 100vh; background: var(--color-background); padding: 24px 16px 64px`
- [x] 3.2 Append `.kh-admin-header`: `display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border)`
- [x] 3.3 Append `.kh-admin-mobile`: `margin-inline-start: auto; font-size: 0.9rem; color: var(--color-text-muted)`
- [x] 3.4 Append `.kh-admin-toolbar`: `display: flex; align-items: center; gap: 12px; flex-wrap: wrap`; and `.kh-admin-search`: `display: flex; align-items: center; gap: 8px; flex: 1; min-width: 240px`; and `.kh-admin-search .kh-input { flex: 1 }`
- [x] 3.5 Append `.kh-admin-table-wrap`: `overflow-x: auto; -webkit-overflow-scrolling: touch`
