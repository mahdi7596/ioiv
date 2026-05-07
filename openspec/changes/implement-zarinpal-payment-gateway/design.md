## Context

The project already has a Next.js App Router payment spine: users complete the final application step, `startPayment` creates a `Payment` row, `lib/payments/zarinpal.ts` requests a Zarinpal payment URL, and `/api/payment/callback` verifies the returned `Authority`. Prisma already defines the required status axes: `ApplicationStatus` tracks the form and review workflow, while `PaymentStatus` tracks the gateway transaction.

This change should not redesign that model. The existing statuses are correct and the relationship between them is part of the production contract. The work is to finish the Zarinpal production gateway behavior, harden the callback path, and add the missing user return experience.

The production merchant ID supplied by Zarinpal must live in environment configuration as `ZARINPAL_MERCHANT_ID`. The code must continue to support sandbox mode through `ZARINPAL_SANDBOX` and must use `APP_URL` to construct public callback URLs.

## Goals / Non-Goals

**Goals:**

- Use Zarinpal v4 request, StartPay, and verify endpoints through the existing payment adapter.
- Preserve the existing application/payment statuses and their relationship.
- Make callback verification idempotent and resistant to duplicate browser refreshes or repeated gateway callbacks.
- Ensure successful verification cannot be undone by SMS notification failures or later callback errors.
- Add a dedicated return page that communicates payment success or failure before sending users back to the dashboard.
- Add tests around request construction, callback state changes, idempotency, notification isolation, and return UX.
- Update environment/deployment guidance for the provided production merchant ID.

**Non-Goals:**

- Add, remove, or rename `ApplicationStatus` or `PaymentStatus` enum values.
- Change the fixed payment amount, non-refundable acknowledgement, review workflow, or correction-without-repayment behavior.
- Add refunds, settlement tracking, card PAN restrictions, installments, webhook processing, or other Zarinpal products.
- Store the merchant ID in source code or migrations.

## Decisions

### Keep application and payment statuses separate

`ApplicationStatus` remains the workflow state for draft, payment handoff, admin review, corrections, and validation completion. `PaymentStatus` remains the transaction state for the latest gateway attempt. This avoids overloading payment status with review semantics and keeps the current admin/user UI model intact.

Expected pairings:

| Application status | Payment status relationship |
| --- | --- |
| `DRAFT` | No payment, or latest payment failed; user can edit and retry |
| `PENDING_PAYMENT` | Latest payment is `INITIATED`; user has been sent to Zarinpal |
| `SUBMITTED` | At least one payment is `VERIFIED`; admin review can begin |
| `UNDER_REVIEW` | At least one payment is `VERIFIED`; admin review is active |
| `NEEDS_EDIT` | At least one payment is `VERIFIED`; user can submit corrections without repayment |
| `VALIDATION_COMPLETED` | At least one payment is `VERIFIED`; workflow is final |

Alternative considered: derive application state directly from payment state. That would make review statuses depend on gateway data and would blur the form workflow, so it is rejected.

### Treat verification as the only point where payment can unlock submission

The callback route should only move an application from `PENDING_PAYMENT` to `SUBMITTED` after Zarinpal verification succeeds and the returned authority matches the stored payment. The payment row should store the Zarinpal reference ID and raw verification data for audit.

Failed or cancelled callbacks should mark the relevant initiated payment as `FAILED` and return the application to `DRAFT` only when the application is still waiting on that payment. They must not downgrade an already verified payment or an application that has moved into review.

Alternative considered: trust the gateway callback `Status=OK` without verification. That is insecure because the callback query string is not authoritative.

### Make the callback idempotent

If a callback arrives for a payment that is already `VERIFIED`, the route should not call verification again or create duplicate history rows. It should route the user to the success return page. If a callback arrives for a stale failed or mismatched payment, it should fail safely without changing verified application state.

Alternative considered: always call Zarinpal verify on every callback. That risks changing stable local state based on duplicate callback behavior and creates noisy history.

### Isolate notifications from payment state transitions

The database transaction that marks payment `VERIFIED` and application `SUBMITTED` should complete before SMS notifications run. Notification failures should be logged but must not enter the payment failure path. This preserves the invariant that a verified gateway payment remains verified.

Alternative considered: keep notifications in the same `try` block as verification. The current shape can turn a successful payment into a failed payment if SMS throws, so it is rejected.

### Use a return page for UX, not persisted state

The callback route should redirect to a dedicated route such as `/payment/return?status=success` or `/payment/return?status=failed`. The page should show a concise Persian success/failure message, optionally include the reference ID for success, and automatically redirect to `/dashboard` after a short delay. The dashboard may still show the authoritative persisted status.

Alternative considered: redirect directly to `/dashboard?payment=verified`. That works technically, but it does not provide the explicit bank-return confirmation the user requested and currently has no visible query-param handling.

## Risks / Trade-offs

- Zarinpal documentation and endpoint behavior can evolve → keep all provider-specific URLs and response parsing isolated in `lib/payments/zarinpal.ts`.
- Duplicate callbacks can create duplicate state history → make verified callbacks idempotent before writing history.
- SMS gateway failures can mask successful payments → log notification failures separately after state commits.
- Incorrect `APP_URL` can send users to an invalid callback → deployment docs and env examples must call out the production URL requirement.
- A failed callback could target an application that has already moved forward → only return to `DRAFT` when the current application state is still `PENDING_PAYMENT` for that payment attempt.
- The return page auto-redirect could move too quickly for users to read → include a visible dashboard link and use a short but readable delay.

## Migration Plan

1. Configure production environment with `ZARINPAL_MERCHANT_ID=260c2494-c9f1-434b-af18-03b51b88cec2`, `ZARINPAL_SANDBOX=false`, and `APP_URL=https://sana.ioiv.ir`.
2. Deploy code with the hardened callback and payment return page.
3. Run automated payment tests and a sandbox/manual callback smoke test where possible.
4. Switch production traffic to live Zarinpal after verifying the callback URL is reachable over HTTPS.

Rollback is to redeploy the previous application build and keep existing payment/application records intact. Since no database enum or schema changes are expected, rollback should not require a migration rollback.

## Open Questions

- Confirm the production public URL remains `https://sana.ioiv.ir` for `APP_URL`.
- Confirm whether the return page should display the Zarinpal reference ID to users or keep it only in admin/export views.
