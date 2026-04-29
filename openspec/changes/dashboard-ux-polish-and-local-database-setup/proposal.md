## Why

The first implementation proves the registration flow, wizard, uploads, payment, and admin review shape, but local development is blocked by invalid PostgreSQL credentials and the dashboard experience still feels like a basic page rather than a polished workflow product. This change makes the app testable end-to-end locally and brings the user/admin UX in line with the new `DESIGN.md` source of truth.

## What Changes

- Add reliable local PostgreSQL setup for development, including documented connection details, migration, and seed flow.
- Remove the current upload failure caused by local DB authentication problems.
- Apply the project design system from `DESIGN.md`: IRANYekan, `#303849` primary, `#FE8424` accent, warm off-white surfaces, balanced dashboard density, 8px cards, 6px controls, and light-only launch styling.
- Move key user/admin UI styling toward semantic pure CSS/CSS Modules instead of Tailwind utility-heavy component styling.
- Add authenticated dashboard shell with responsive sidebar/header navigation.
- Improve user dashboard responsiveness, wayfinding, status summary, next action, empty states, and recovery states.
- Improve application wizard UX with sticky progress/actions, upload progress, year picker, step-change animation, stronger error states, and toast notifications.
- Improve upload behavior with progress indicators, success/failure toasts, retry path, and non-technical error messages.
- Add UX verification for Persian RTL, mobile responsiveness, logged-out access, user/admin boundaries, file authorization, and edit restrictions.

## Capabilities

### New Capabilities

- `local-dev-database`: Local PostgreSQL development setup, connection contract, migration, and seed workflow.
- `design-system-application`: Application of `DESIGN.md` tokens, typography, pure CSS styling direction, responsive layout primitives, and motion rules.
- `dashboard-shell`: Authenticated user/admin app shell with sidebar/header navigation, mobile behavior, and wayfinding.
- `wizard-ux`: Sticky wizard controls, progress visibility, year picking, step animation, field errors, upload progress, and toasts.

### Modified Capabilities

- None.

## Impact

- Adds local database infrastructure and developer documentation, likely `docker-compose.yml` and related `.env` updates.
- Updates Prisma migration/seed verification workflow.
- Updates global styles, font loading, layout components, dashboard pages, wizard components, upload components, and toast infrastructure.
- May introduce CSS Modules or semantic CSS files while keeping the existing Next.js App Router structure.
- Requires browser-based responsive and journey checks after implementation.
