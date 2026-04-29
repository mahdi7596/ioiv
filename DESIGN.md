---
version: provisional-2026-04-28
name: Sana Registration Review Platform
description: Minimal Persian-first dashboard design system for registration, document submission, payment, and admin review.
colors:
  primary: "#303849"
  on-primary: "#FFFFFF"
  secondary: "#FE8424"
  on-secondary: "#1D1A16"
  background: "#F6F3EE"
  surface: "#FFFFFF"
  surface-muted: "#F1EEE8"
  surface-raised: "#FFFFFF"
  border: "#DDD6CB"
  border-strong: "#BEB5A7"
  text: "#1D232F"
  text-muted: "#6C7280"
  text-soft: "#8A8F99"
  inverse-text: "#FFFFFF"
  success: "#147A4A"
  warning: "#B8660B"
  danger: "#C24135"
  info: "#2C638F"
typography:
  body:
    fontFamily: "IRANYekanXFaNum, IRANYekan, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: 0
  label:
    fontFamily: "IRANYekanXFaNum, IRANYekan, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: 0
  h1:
    fontFamily: "IRANYekanXFaNum, IRANYekan, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: 0
  h2:
    fontFamily: "IRANYekanXFaNum, IRANYekan, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
rounded:
  control: 6px
  card: 8px
  panel: 8px
  badge: 6px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.card}"
    padding: "24px"
---

## Overview

This platform is a Persian-first operational dashboard for company registration, document upload, payment, and admin review. The visual personality is minimal, elegant, trustworthy, quiet, and precise. It must feel like a real business workflow product, not a generated landing page.

The brand direction is provisional. Use `#303849` as the core institutional color and `#FE8424` as a restrained action/accent color. The interface should prioritize clarity, completion, and confidence over decoration.

## Colors

Primary `#303849` is used for headers, active navigation, primary buttons, progress indicators, and strong text accents. It should carry authority without turning the whole UI dark.

Secondary `#FE8424` is used sparingly for important highlights: active step accents, upload success emphasis, selected year state, and urgent but non-error calls to action. Do not flood backgrounds with orange.

Use warm off-white `#F6F3EE` for page backgrounds and white for cards/panels. Borders should be visible but quiet. Danger, warning, success, and info colors must be semantic and never replaced by brand orange.

Light mode only for launch. Dark mode is out of scope until the product visual language is stable.

## Typography

Use IRANYekan from `public/fonts/iranyekan` as the primary typeface, preferably the FaNum files so Persian/Arabic numerals feel native. Load Regular and Bold for launch; add Medium only if the UI needs finer hierarchy later.

Use Persian/RTL defaults for the public and user dashboard experience. Numeric identifiers such as mobile numbers, company national IDs, payment references, and file IDs should use `dir="ltr"` inside RTL layouts.

Avoid negative letter spacing and viewport-scaled type. Use compact but readable dashboard headings: reserve large type for page titles only.

## Spacing

Use a 4px base scale. Common gaps are 8px for field internals, 16px for related controls, 24px for panel padding, and 32px for major page rhythm.

The product should feel balanced: not dense like accounting software, not spacious like a marketing page. Forms should fit comfortably on laptop screens while remaining usable on mobile.

## Layout

Use an app shell for authenticated areas:

- Desktop: persistent right-side RTL sidebar, top header, main content region.
- Tablet/mobile: compact top header plus bottom or drawer navigation.
- Wizard pages: content area plus sticky bottom action bar.

Dashboard pages should have clear wayfinding, current status, next action, and recovery paths. Avoid centered single-card pages after login.

Max content width should generally be `1120px` for dashboards and `720px` for focused form content. Tables may stretch wider but must remain horizontally scrollable on small screens.

## Elevation & Depth

Prefer tonal layers and borders over heavy shadows. Use subtle shadows only for sticky bars, popovers, year pickers, and toast notifications.

Cards and panels should use white surfaces with warm borders. Nested cards are discouraged; if grouping is needed inside a card, use dividers, muted backgrounds, or section headings.

## Shapes

Use 8px radius for cards and panels, 6px for buttons, inputs, badges, and upload controls. Avoid pill-heavy styling except for compact status chips where the shape supports scanning.

Do not use large rounded blobs, gradient orbs, or decorative abstract backgrounds.

## Components

Buttons:
Primary buttons use `#303849`; secondary/action accents may use `#FE8424`. Disabled buttons must be visibly disabled and never look like low-contrast active controls.

Forms:
Every input needs a visible label. Required fields use a clear `*`. Error fields turn the full field group red: label, border, helper text, and optional icon. Preserve user input after errors. On validation failure, focus the first invalid field.

Year selection:
Use a small Jalali year picker/popover or constrained select rather than free text. Show recent years first and support at least the range needed by the document requirements.

Uploads:
Upload controls need file type/size hints, progress bar, success state, retry path, and error messaging. Large uploads should never leave the user guessing.

Wizard:
The step progress indicator and Previous/Save/Next/Payment controls must be sticky. Step changes should animate subtly with a short fade/slide that respects reduced motion.

Navigation:
Authenticated dashboards require sidebar/header navigation. Public login can remain focused and minimal.

Toasts:
Use toast alerts for successful OTP verification, registration/login, draft save, upload completion, upload failure, payment start/failure/success, and admin status changes. Toasts should be concise and not replace inline field errors.

Tables:
Admin tables need status badges, clear filters, horizontal overflow on mobile, and preserved filter state for exports.

## Do's and Don'ts

Do:
- Make the first post-login screen feel like a working dashboard.
- Use IRANYekan consistently.
- Keep primary actions visible and sticky in long forms.
- Use brand orange as a precise accent, not a theme wash.
- Make error recovery obvious and humane.
- Check RTL and mobile behavior before considering a flow done.

Don't:
- Do not keep Tailwind utility styling as the long-term visual source of truth.
- Do not create marketing-style hero layouts for app workflows.
- Do not hide upload progress behind generic loading text.
- Do not use placeholder text as labels.
- Do not use technical database/API errors in user-facing messages.
- Do not let admins or users reach dead ends without a next action.

## Localization

Persian is the launch locale and RTL is the default. The design must remain compatible with Arabic RTL and future LTR languages, but this implementation should perfect Persian first.

Use logical CSS properties where possible. Icons that imply direction must mirror in RTL. Numbers and codes should be direction-isolated.

## Motion

Motion should be slight and functional:

- Step change: 160-220ms fade plus small vertical or horizontal movement.
- Error: one gentle shake or pulse, no repeated animation.
- Toast: slide/fade from the viewport edge.
- Progress: smooth but truthful; do not fake completion for real uploads.

Respect `prefers-reduced-motion` by disabling non-essential movement while keeping state changes visible.

## Governance

This file is the design source of truth for future UI changes. Implementation should move toward pure CSS or CSS Modules using semantic classes and tokens. Avoid adding new UI frameworks. Tailwind currently exists from scaffolding but should be phased out during the design-system polish change.
