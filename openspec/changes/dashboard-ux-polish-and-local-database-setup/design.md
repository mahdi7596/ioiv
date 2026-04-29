## Context

The first platform change created the core Next.js/Prisma application, but local database access is not reliable: `.env` points to `postgres:postgres@localhost:5432/sana`, while the local server rejects those credentials. This prevents real OTP persistence, application creation, uploads, admin review, and smoke testing. A temporary development OTP fallback exists, but upload still fails because file metadata depends on a real application row.

The current user dashboard and wizard also work as basic pages but do not yet meet the UX and design direction captured in `DESIGN.md`. Authenticated areas need to feel like a proper operational dashboard with persistent navigation, responsive layout, sticky form controls, clear progress, upload feedback, year picking, toasts, and refined Persian/RTL styling.

## Goals / Non-Goals

**Goals:**

- Add a reliable local PostgreSQL setup that lets developers run migrations, seed an admin, and test the full flow locally.
- Keep production deployment aligned with the existing PostgreSQL/Prisma architecture.
- Apply `DESIGN.md` as the design source of truth, including IRANYekan, `#303849`, `#FE8424`, warm surfaces, balanced density, 8px cards, and 6px controls.
- Introduce authenticated app shell patterns for user and admin dashboards.
- Improve wizard UX with sticky progress/actions, upload progress, year picker, step animation, red field error states, and toasts.
- Verify Persian/RTL responsiveness and core access-control journeys.

**Non-Goals:**

- Replace PostgreSQL with another database.
- Redesign the product brand beyond the provisional `DESIGN.md` decisions.
- Implement dark mode.
- Add a new UI framework.
- Complete production credential provisioning for Zarinpal or Ghasedak.

## Decisions

### Use Docker Compose for local PostgreSQL

Add a project-scoped local Postgres service with a stable database, username, password, and port matching `.env`. This is the lowest-friction way to make onboarding and smoke testing reproducible without depending on the user's existing system Postgres state.

Alternative considered: ask each developer to manually fix local Postgres. That preserves fewer project files but keeps setup fragile and repeats the current failure mode.

### Keep Prisma as the database source of truth

Run `prisma migrate dev` and `npm run db:seed` against the local service. The app should stop relying on mock OTP/upload fallbacks for normal development once the database is available.

### Apply design through semantic CSS

Keep Next.js App Router and React structure, but move the visible dashboard/wizard surface toward semantic class names and CSS/CSS Modules. Tailwind was useful for scaffolding, but this polish phase should establish reusable dashboard, form, upload, toast, and navigation styling that maps to `DESIGN.md`.

Alternative considered: continue expanding Tailwind utilities. That is faster initially but makes the UI harder to govern against `DESIGN.md` and increases the risk of generic-looking screens.

### Use app shell components

Create shared authenticated shell components for user/admin areas: sidebar, top header, mobile navigation, content container, and status/action areas. This prevents every dashboard page from inventing its own layout.

### Use native-first controls where possible

For year selection, use a constrained Jalali year picker/popover or select-style control rather than free text. For upload progress, use an upload implementation that can report progress, such as `XMLHttpRequest`, while preserving the existing route handler.

### Add lightweight local toast infrastructure

Use a small internal toast provider/component rather than adding a library. Toasts should supplement inline validation, not replace it.

## Risks / Trade-offs

- [Risk] Docker may not be running locally → Mitigation: document commands and keep `.env.example` explicit.
- [Risk] Introducing CSS Modules while Tailwind still exists creates mixed styling temporarily → Mitigation: scope new polish work to authenticated shell/wizard and avoid broad rewrites.
- [Risk] Upload progress with route handlers requires client-side XHR instead of simple `fetch` → Mitigation: encapsulate upload logic in one helper/component.
- [Risk] Sticky action bars can cover content on mobile → Mitigation: add bottom padding to the form content and test mobile viewport.
- [Risk] Toasts can hide important errors → Mitigation: field-level errors remain inline; toasts are for global success/failure.

## Migration Plan

1. Add local Postgres service and verify `DATABASE_URL` works.
2. Run migration and seed; remove or narrow mock-only paths as appropriate for normal local testing.
3. Add design tokens/font loading/global CSS foundation.
4. Build shared dashboard shell components.
5. Refine user dashboard and application wizard.
6. Add upload progress, year picker, step animation, field errors, and toasts.
7. Verify with lint, tests, build, local migration/seed, and browser walkthrough across desktop/mobile.

## Open Questions

- None for this phase. The visual choices are provisional and captured in `DESIGN.md`.
