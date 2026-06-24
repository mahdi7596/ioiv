## Context

Phases 0–3 are complete. All API routes for the admin panel exist under `app/api/kalan-hesab/admin/`:
- `POST /api/kalan-hesab/admin/otp/request` — sends OTP, enforces 90s cooldown + 5/hr, checks `KALAN_HESAB_ADMIN` role
- `POST /api/kalan-hesab/admin/otp/verify` — verifies OTP, calls `createSession({ subjectId: admin.id, kind: "admin" })`, returns `{ redirectTo: "/kalan-hesab/admin" }`
- `POST /api/kalan-hesab/admin/logout` — calls `clearSession()`, redirects 303 to `/kalan-hesab/admin/login`
- `GET /api/kalan-hesab/admin/submissions?search=` — returns `{ submissions }` ordered newest-first, OR filter on `fullName`, `companyName`, `mobile`
- `GET /api/kalan-hesab/admin/export` — returns `kalan-hesab-submissions.xlsx` download

The parent layout at `app/kalan-hesab/layout.tsx` wraps every `/kalan-hesab/*` route in `<div className="kalan-hesab-theme">`, so all existing CSS classes pick up the gold palette automatically.

Session management: `lib/auth/session.ts` — `createSession`, `getSession`, `clearSession`.

## Goals / Non-Goals

**Goals:**
- Login page identical in structure to existing IOIV admin login (`app/admin/login/page.tsx`), only differing in logo, copy, and API endpoints
- Submissions list as a Server Component — auth guard, DB query, search via URL `?search=` param, table render
- No new components or utility files — all logic inline in each page file

**Non-Goals:**
- No pagination — show all submissions (expected volume is small)
- No status changes, no submission detail view — read-only
- No changes to API routes (Phase 2 is complete)
- No changes to `layout.tsx` or the public form page

## Decisions

### 1. Login page is a Client Component

The login page needs React state (`mobile`, `code`, `otpSent`, `loading`, `message`) and event handlers for fetch calls. It follows the same pattern as `app/admin/login/page.tsx` exactly.

**Why**: Matches the existing pattern; keeps the code easy to audit by comparison.

### 2. Submissions list is a Server Component

The page reads `searchParams`, runs a direct Prisma query, and renders the table server-side. No client state or JavaScript needed for the core flow.

**Why**: Simpler than a client fetch — no loading state, no hydration, no useEffect. The search input submits a GET form that reloads the page with `?search=` in the URL.

### 3. Route protection is server-side only

In `app/kalan-hesab/admin/page.tsx`, `getSession()` is called at the top of the server component. If the session is missing or the admin lacks `KALAN_HESAB_ADMIN` role, `redirect("/kalan-hesab/admin/login")` fires before any DB query or HTML is rendered.

**Why**: No middleware needed; consistent with how IOIV admin pages are protected (check `app/admin/submissions/page.tsx`).

### 4. Logout via native HTML form POST

The خروج button is inside `<form method="POST" action="/api/kalan-hesab/admin/logout">`. No JavaScript needed.

**Why**: Works without hydration; the API route does `clearSession()` + `redirect(303)` which the browser follows naturally.

### 5. CSS additions are append-only to kalan-hesab.css

Six new `.kh-admin-*` classes are added at the end of `app/kalan-hesab/kalan-hesab.css`. They follow the same naming convention already in the file.

**Why**: No new CSS file needed; keeps all Kalan Hesab styles co-located.

## File Map

```
app/kalan-hesab/admin/
├── login/
│   └── page.tsx     "use client" — OTP login
└── page.tsx         Server Component — submissions list

app/kalan-hesab/kalan-hesab.css   (append 6 .kh-admin-* classes)
```

## CSS Classes Added

```css
.kh-admin-page        — page shell (flex column, min-height 100vh)
.kh-admin-header      — logo + mobile + logout row
.kh-admin-mobile      — admin mobile number text (muted, pushed to end)
.kh-admin-toolbar     — search form + export button row
.kh-admin-search      — search input + submit button flex row
.kh-admin-table-wrap  — overflow-x: auto wrapper for .data-table
```
