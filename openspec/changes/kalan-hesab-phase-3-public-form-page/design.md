## Context

Phases 0–2 are complete: the gold CSS theme lives in `app/kalan-hesab/kalan-hesab.css`, all API routes exist under `app/api/kalan-hesab/`, and `KalanHesabSubmission` is persisted to PostgreSQL. Phase 3 adds the only user-facing surface: a single-page form at `/kalan-hesab`.

The submit endpoint (`POST /api/kalan-hesab/submit`) requires the request body to include `verified: true` — the client is responsible for tracking whether the mobile has been OTP-verified before allowing submission.

## Goals / Non-Goals

**Goals:**
- Deliver a working, animated form page in a single file (`app/kalan-hesab/page.tsx`)
- Mobile OTP verification gating the submit button
- Staggered page-load animation and conditional field reveal using existing CSS
- Post-submit success screen replacing the form

**Non-Goals:**
- No new components, hooks, or utility files — all logic inline in page.tsx
- No changes to layout.tsx, kalan-hesab.css, or any API route
- No IOIV routes touched
- No server-side session created on OTP verify (this is by design: one-way form only)

## Decisions

### 1. Single Client Component file

All state, handlers, and JSX in `app/kalan-hesab/page.tsx` with `"use client"`.

**Why**: The form is short (7 fields), has no shared state with any parent, and will not be reused. Splitting into sub-components would add indirection without benefit.

**Alternative considered**: Separate `MobileOtpField` component. Rejected — the OTP state (`otpSent`, `mobileVerified`) needs to gate the submit button, which is in the same render tree.

### 2. Zod validation client-side only (mirror of server schema)

The same field constraints defined in the submit route are duplicated in page.tsx as a client-side Zod schema for immediate feedback.

**Why**: Avoids a round-trip for obviously invalid input (e.g. name too short). The server always re-validates; the client schema is a UX convenience, not a security boundary.

### 3. OTP state tracked in React state (`mobileVerified` boolean)

After `POST /api/kalan-hesab/otp/verify` returns success, the page sets `mobileVerified = true` and passes `verified: true` in the submit body.

**Why**: The API was designed this way (Phase 2). No server-side session is created on OTP verify — it's stateless beyond the OTP record itself.

### 4. Staggered page-load animation via inline `animation-delay`

Each form field receives an incrementing `style={{ animationDelay: "Nms" }}` with the `step-in` class from `globals.css` (80ms per field).

**Why**: `step-in` keyframe already exists and handles `prefers-reduced-motion` globally. No new CSS needed.

### 5. Conditional fields revealed with `step-in` class toggled by state

When `position === "سایر"` or `mainConcern === "سایر"`, the extra text input is rendered (not CSS-hidden) so it is included in DOM and focus order only when visible.

**Why**: Rendering conditionally (rather than `display: none`) avoids submitting stale values in hidden fields and keeps the Zod schema clean (`positionOther` / `concernOther` as optional strings).

## Risks / Trade-offs

- **OTP replay**: A user could verify mobile, copy the `verified: true` flag, and submit without re-verifying. This is acceptable per spec — the OTP is checked server-side against a DB record, and the submit endpoint validates the flag.
- **Single large component**: page.tsx will be ~200–250 lines. Acceptable for this scope; can be refactored if the form grows.
- **No error display specification**: The plan does not describe per-field error messages. API errors are shown inline near their respective sections (OTP request/verify errors near the mobile field; submit errors near the submit button).
