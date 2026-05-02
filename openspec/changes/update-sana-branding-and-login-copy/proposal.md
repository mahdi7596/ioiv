## Why

The SANA app needs to match the updated public-facing name and use IOIV branding consistently across the login, dashboard, admin, and browser surfaces. The current login page also presents old instructional copy that no longer reflects the desired messaging for companies entering the Ministry of Oil long-list supplier evaluation process.

## What Changes

- Replace the displayed service name from `سامانه اعتبار سنجی نفت ایران (سانا)` to `سامانه اعتبار سنجی سانا` where it appears in public/auth-facing app surfaces.
- Replace the public login page explanatory text and three-step guidance with the new supplier evaluation, credit review, Ministry of Oil submission, and support phone messaging.
- Link the support phone number `02186122370` with a telephone link while preserving the `داخلی 3` instruction in visible text.
- Add the uploaded IOIV logo as the app favicon.
- Add the IOIV logo to the shared sidebar brand used by both the user panel and admin panel.
- Add the IOIV logo above the user login card and admin login card.
- Remove the user login-card heading and description text:
  - `شماره موبایل خود را وارد کنید`
  - `اگر قبلا ثبت‌نام کرده باشید وارد داشبورد می‌شوید؛ در غیر این صورت شناسه ملی شرکت را بعد از تایید کد وارد می‌کنید.`
- Keep the existing authentication behavior, dashboard routing, admin routing, payment behavior, and SMS behavior unchanged unless copy must be updated for consistency.

## Capabilities

### New Capabilities

- `sana-branding-and-auth-presentation`: Public and authenticated app surfaces show the updated SANA service name, IOIV logo, favicon, and revised login-page messaging.

### Modified Capabilities

- None.

## Impact

- Affects public auth page copy and layout in `app/(public)/page.tsx`.
- Affects admin login presentation in `app/admin/login/page.tsx`.
- Affects shared user/admin panel branding in `components/layout/AppShell.tsx`.
- Affects app metadata and favicon configuration in `app/layout.tsx` and/or `app/favicon.ico`.
- Adds a reusable logo asset under `public/`.
- May require small CSS updates in `app/globals.css` for logo sizing, login-card spacing, sidebar brand alignment, and responsive behavior.
