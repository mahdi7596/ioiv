## Why

Kalan Hesab needs a public-facing form at `/kalan-hesab` where prospective clients can fill in their details, verify their mobile via OTP, and submit. Phases 0–2 established the theme, database, and API layer; Phase 3 delivers the only user-visible surface of the product.

## What Changes

- New page `app/kalan-hesab/page.tsx` — animated, gold-themed Client Component
- Renders the 7-field submission form (text inputs, selects with conditional free-text, mobile+OTP flow)
- Calls three existing API endpoints: `/api/kalan-hesab/otp/request`, `/api/kalan-hesab/otp/verify`, `/api/kalan-hesab/submit`
- Shows an animated post-submit success screen in place of the form

## Capabilities

### New Capabilities

- `kalan-hesab-public-form`: Public form page at `/kalan-hesab` — header copy, 7 fields, OTP mobile verification, Zod validation, animated interactions, and post-submit success state

### Modified Capabilities

<!-- none — all API routes and DB models are already in place from Phases 0–2 -->

## Impact

- **New file**: `app/kalan-hesab/page.tsx`
- **Unchanged**: `app/kalan-hesab/layout.tsx`, `app/kalan-hesab/kalan-hesab.css` (Phase 0)
- **Unchanged**: all `app/api/kalan-hesab/**` routes (Phase 2)
- **No IOIV routes or files modified**
- **Dependencies**: `zod` (already installed), `next/image` (built-in)
