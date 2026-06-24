## Why

Phases 0–3 are complete: the gold theme, database schema, API layer, and public form are live. Phase 4 delivers the admin-facing surface — a login page and a submissions list so the Kalan Hesab team can view, search, and export all submitted forms.

## What Changes

- New page `app/kalan-hesab/admin/login/page.tsx` — OTP login for `KALAN_HESAB_ADMIN` users
- New page `app/kalan-hesab/admin/page.tsx` — server-rendered submissions list with search and Excel export
- CSS additions in `app/kalan-hesab/kalan-hesab.css` — layout classes for admin page shell

## Capabilities

### New Capabilities

- `kalan-hesab-admin-login`: Login page at `/kalan-hesab/admin/login` — two-step OTP flow reusing existing `.auth-panel` / `.auth-page` CSS classes; gold theme applied automatically via parent layout
- `kalan-hesab-admin-submissions`: Submissions list at `/kalan-hesab/admin` — server-rendered, route-protected, search by name/company/mobile, Excel export button, خروج logout

### Modified Capabilities

- `kalan-hesab-css` (minor): Six new `.kh-admin-*` layout classes appended to `kalan-hesab.css`

## Impact

- **New files**: `app/kalan-hesab/admin/login/page.tsx`, `app/kalan-hesab/admin/page.tsx`
- **Modified**: `app/kalan-hesab/kalan-hesab.css` (append only)
- **Unchanged**: all `app/api/kalan-hesab/**` routes (built in Phase 2)
- **Unchanged**: `app/kalan-hesab/layout.tsx`, `app/kalan-hesab/page.tsx`
- **No IOIV routes or files modified**
- **Dependencies**: `next/image`, `@prisma/client`, `lib/auth/session` — all already present
