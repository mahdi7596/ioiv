## 1. App Foundation

- [x] 1.1 Scaffold a Next.js TypeScript App Router app with Tailwind, ESLint, and `@/*` import alias.
- [x] 1.2 Install core dependencies: Prisma, Zod, React Hook Form, resolvers, XLSX, jose, bcryptjs, Vitest, tsx, and related types.
- [x] 1.3 Add `.env.example` with database, app URL, session, upload, Zarinpal, Ghasedak, and admin alert variables.
- [x] 1.4 Set Persian RTL document defaults in `app/layout.tsx` and establish base global styles.
- [x] 1.5 Verify the app boots locally with `npm run dev`.

## 2. Database

- [x] 2.1 Initialize Prisma configuration.
- [x] 2.2 Define Prisma enums and models for users, admins, OTP codes, applications, application files, payments, and status history.
- [x] 2.3 Add uniqueness and indexes for active-round submissions and admin workflows.
- [x] 2.4 Add a seed script for a manually created super admin.
- [x] 2.5 Add database, seed, studio, and test scripts to `package.json`.
- [x] 2.6 Run the initial migration and seed locally.

## 3. Validation

- [x] 3.1 Add auth validation schemas for Iranian mobile numbers, 4-digit OTPs, company national ID, OTP request, and OTP verification.
- [x] 3.2 Add application draft and final submission validation schemas.
- [x] 3.3 Add validation tests for auth rules.
- [x] 3.4 Add validation tests for required document and optional financial statement rules.
- [x] 3.5 Run validation tests successfully.

## 4. Sessions, OTP, And SMS

- [x] 4.1 Add a reusable Prisma client helper.
- [x] 4.2 Add signed HTTP-only session helpers for user and admin sessions.
- [x] 4.3 Add SMS adapter interface with console logging in development.
- [x] 4.4 Add Ghasedak production SMS implementation with clear missing-credential errors.
- [x] 4.5 Implement OTP request action for user and admin modes.
- [x] 4.6 Implement OTP verification action, user creation after verification, OTP consumption, and session creation.
- [x] 4.7 Add OTP request and verification API route handlers with validation error responses.

## 5. Public Auth UI

- [x] 5.1 Build mobile entry form with Persian labels, validation, loading, and inline errors.
- [x] 5.2 Build registration form for company national ID when the mobile is new.
- [x] 5.3 Build OTP form with validation and resend timer display.
- [x] 5.4 Compose the public page flow for existing and new users.

## 6. User Dashboard And Drafts

- [x] 6.1 Implement application loader and draft creation helpers for the active round.
- [x] 6.2 Implement draft save action for current step and partial JSON fields.
- [x] 6.3 Build user dashboard with status, payment/submission state, admin note, and continue/edit action.
- [x] 6.4 Build application wizard shell and step indicator.
- [x] 6.5 Autosave draft data on save, file upload, and step changes.
- [x] 6.6 Enforce edit access only for draft and needs-edit applications.

## 7. Protected Uploads

- [x] 7.1 Implement upload validation for allowed file types and 20MB maximum size.
- [x] 7.2 Store uploaded files under `{UPLOAD_DIR}/{applicationId}/{fieldKey}/{generatedFileName}`.
- [x] 7.3 Create application file metadata records for successful uploads.
- [x] 7.4 Add upload API route with user authorization.
- [x] 7.5 Add protected file download route for owning users and active admins.

## 8. Application Wizard Steps

- [x] 8.1 Build tax declaration step with three default required year/file rows and add-row support.
- [x] 8.2 Build optional audited financial statements step with row completeness validation.
- [x] 8.3 Build trial balance step with required general and subsidiary ledger uploads.
- [x] 8.4 Build credit report step with required company, CEO, and board member report uploads plus instruction text.
- [x] 8.5 Build final confirmation and payment step with summary, validation state, and non-refundable payment checkbox.

## 9. Payment

- [x] 9.1 Add Zarinpal client for payment request and verification.
- [x] 9.2 Implement start payment action with final validation, pending-payment status, payment row creation, and Zarinpal redirect URL.
- [x] 9.3 Add payment callback route that verifies payments server-side.
- [x] 9.4 Mark verified payments and applications as submitted, record history, and send admin SMS.
- [x] 9.5 Keep failed payments editable and surface a clear dashboard state.

## 10. Admin Review

- [x] 10.1 Build admin OTP login page using shared auth endpoints.
- [x] 10.2 Build admin overview dashboard with status counts.
- [x] 10.3 Build submissions table with search, status filter, sort, and detail links.
- [x] 10.4 Build submission detail page with application data, file links, payment data, status history, note, and status form.
- [x] 10.5 Implement admin status change action with allowed transitions, history, notes, and user SMS notifications.

## 11. Export

- [x] 11.1 Implement XLSX export for filtered submissions and required operational columns.
- [x] 11.2 Implement CSV fallback with matching columns.
- [x] 11.3 Add authorized export route for admins only.
- [x] 11.4 Add export controls to the admin submissions page preserving current filters.

## 12. Security, Polish, And Verification

- [x] 12.1 Complete Persian/RTL layout pass across forms, tables, dashboards, and buttons.
- [x] 12.2 Verify logged-out users cannot access dashboard or admin pages.
- [x] 12.3 Verify normal users cannot access admin routes or download another user's files.
- [x] 12.4 Verify users cannot edit submitted, under-review, accepted, or rejected applications.
- [ ] 12.5 Run the full manual smoke flow from user registration through admin acceptance.
- [x] 12.6 Run `npm run build` and `npm test`.

## 13. Deployment Prep

- [x] 13.1 Create `DEPLOYMENT.md` with VPS access, PostgreSQL, Nginx, runtime, environment, and deployment command notes.
- [x] 13.2 Confirm production environment checklist for `sana.ioiv.ir`.
