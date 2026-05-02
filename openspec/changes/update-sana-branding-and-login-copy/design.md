## Context

The application is a Persian RTL Next.js App Router app for SANA registration, document submission, and admin review. The current public login page, admin login page, app metadata, SMS/payment copy, and shared panel sidebar still include the older full service name or placeholder branding. The user has provided the IOIV logo file at `/Users/mahdi/Downloads/ioiv-logo.png.jpeg` and wants that logo used for favicon, sidebars, and login-card branding.

The main implementation surfaces are:

- `app/(public)/page.tsx` for public applicant login content.
- `app/admin/login/page.tsx` for admin login content.
- `components/layout/AppShell.tsx` for both user and admin panel sidebars.
- `app/layout.tsx` and `app/favicon.ico` for metadata and browser icon behavior.
- `app/globals.css` for logo sizing, spacing, and responsive presentation.

## Goals / Non-Goals

**Goals:**

- Update the visible SANA service name to `سامانه اعتبار سنجی سانا` on public/auth-facing surfaces.
- Replace the public landing explanatory content with the supplied Ministry of Oil long-list supplier evaluation messaging.
- Make the support phone number visibly clickable with a `tel:` link.
- Show the IOIV logo above both user and admin login cards.
- Show the IOIV logo in the shared sidebar for both applicant and admin panels.
- Use the IOIV logo as the favicon/browser icon.
- Preserve existing RTL layout quality, accessibility labels, form behavior, and responsive behavior.

**Non-Goals:**

- No change to OTP logic, registration flow, admin authorization, dashboard routing, payment processing, document upload, or database schema.
- No new dependency for image processing unless the existing toolchain cannot produce a suitable favicon asset.
- No redesign of the broader dashboard or admin panel beyond logo placement and necessary spacing.

## Decisions

1. Store a copy of the uploaded logo in `public/` and reference it through root-relative paths.
   - Rationale: Next.js can serve `public` assets directly across server and client components, including shared layout components.
   - Alternative considered: import the image file directly from `Downloads`; rejected because app runtime should not depend on a user-local downloads path.

2. Use Next.js `Image` where dimensions and optimization help, and plain metadata/icon references where the browser expects static icon URLs.
   - Rationale: Login and sidebar surfaces benefit from explicit dimensions and alt text. Favicon metadata should use the framework-supported `icons` field and/or `app/favicon.ico`.
   - Alternative considered: CSS background images; rejected because semantic images with alt text are clearer for brand content.

3. Replace the sidebar letter mark with the IOIV logo while keeping the existing `سانا` text and panel subtitle.
   - Rationale: This preserves navigation recognition and avoids reworking sidebar layout while satisfying both admin and user panel logo placement.
   - Alternative considered: add a large standalone logo block above navigation; rejected because it could crowd the sticky sidebar and mobile layout.

4. Keep the new public explanatory copy as content, not a step-card flow.
   - Rationale: The requested replacement is narrative policy/process text, not a three-step workflow. A simple readable text block better matches the message and reduces visual noise.
   - Alternative considered: force the new content into the existing three-step cards; rejected because it would distort the supplied wording.

5. Remove only the requested user login-card heading and explanatory paragraph, leaving the form itself intact.
   - Rationale: The user specifically requested removal of that copy, not removal of the login form title logic inside OTP or registration steps.
   - Alternative considered: hide all login-panel header copy; rejected because the eyebrow and logo still help identify the form.

## Risks / Trade-offs

- Logo aspect ratio may feel cramped in the sidebar if used at the same size as the current square letter mark -> Mitigate with a dedicated logo wrapper and explicit max width/height.
- Browser favicon rendering from a rectangular logo may be visually small -> Mitigate by generating or assigning an icon asset sized for favicon use and verifying in the browser/build output.
- Removing the login-card heading may reduce immediate form context -> Mitigate by keeping the surrounding page context, form labels, and login-card eyebrow/logo.
- Old service name may remain in operational SMS/payment descriptions if only visible UI is updated -> Mitigate by searching the codebase and updating consistency copy where it does not affect behavior.
