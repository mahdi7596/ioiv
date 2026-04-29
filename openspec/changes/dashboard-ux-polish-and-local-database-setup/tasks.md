## 1. Local Database

- [x] 1.1 Add project-local PostgreSQL setup, preferably `docker-compose.yml`, matching the development `DATABASE_URL`.
- [x] 1.2 Document local database start/stop, connection, migration, and seed commands.
- [x] 1.3 Run Prisma migration against the local database.
- [x] 1.4 Run the admin seed successfully.
- [x] 1.5 Verify OTP, draft creation, upload metadata, and admin access use the real local database without auth errors.

## 2. Design Foundation

- [x] 2.1 Load IRANYekan FaNum Regular and Bold globally from `public/fonts/iranyekan`.
- [x] 2.2 Add CSS design tokens from `DESIGN.md` for colors, typography, radii, spacing, surfaces, and states.
- [x] 2.3 Create semantic CSS/CSS Module foundations for app shell, buttons, forms, cards, tables, badges, sticky bars, and toasts.
- [x] 2.4 Begin replacing Tailwind-heavy styling on public auth, dashboard, admin, and wizard surfaces with semantic classes.
- [x] 2.5 Verify visual contrast and Persian/RTL typography across key screens.

## 3. Dashboard Shell

- [x] 3.1 Build shared authenticated app shell with RTL sidebar, top header, content container, and responsive mobile navigation.
- [x] 3.2 Apply shell to user dashboard and application wizard pages.
- [x] 3.3 Apply shell to admin overview, submissions list, and submission detail pages.
- [x] 3.4 Improve dashboard empty, draft, submitted, needs-edit, accepted, and rejected states with clear next actions.
- [x] 3.5 Verify desktop, tablet, and mobile dashboard responsiveness.

## 4. Wizard UX

- [x] 4.1 Make wizard progress and previous/save/next/payment controls sticky without covering content.
- [x] 4.2 Add subtle step transition animation and reduced-motion handling.
- [x] 4.3 Replace free-text year inputs with a constrained Jalali year picker or year-select popover.
- [x] 4.4 Add full-field required/error styling for missing or invalid wizard fields.
- [x] 4.5 Focus the first invalid field or field group when final validation fails.

## 5. Upload UX

- [x] 5.1 Add upload progress tracking to file uploads.
- [x] 5.2 Show upload constraints, progress, success state, failure state, and retry action.
- [x] 5.3 Ensure upload errors never expose raw Prisma/database/server stack messages.
- [x] 5.4 Verify successful uploads persist file metadata in the real local database.

## 6. Toasts And Feedback

- [x] 6.1 Add lightweight toast provider and toast viewport.
- [x] 6.2 Show success/failure toasts for OTP verification, login/register, draft save, upload completion/failure, payment start/failure/success, and admin status changes.
- [x] 6.3 Keep inline field errors for validation while using toasts only for global feedback.

## 7. Verification

- [x] 7.1 Run `npm run lint`, `npm test`, and `npm run build`.
- [x] 7.2 Verify logged-out users cannot access dashboard or admin pages.
- [x] 7.3 Verify normal users cannot access admin pages or download another user's files.
- [x] 7.4 Verify users cannot edit submitted, under-review, accepted, or rejected applications.
- [ ] 7.5 Run desktop and mobile browser walkthrough for new user registration, draft save, upload, payment handoff, admin review, and export.
- [x] 7.6 Update the original implementation change tasks if its remaining DB/UX verification tasks are satisfied by this work.
