## Why

The application already has the right form statuses, payment statuses, and relationship between them, but the live Zarinpal handoff and return experience need to be completed and hardened before production use. Users should be able to pay through the merchant account, return from the bank page, see a clear result page, and land back in their dashboard with the application/payment state preserved correctly.

## What Changes

- Configure the payment integration to use the production Zarinpal merchant ID through environment variables.
- Preserve the existing status model: application status remains the form/review workflow, and payment status remains the gateway transaction result.
- Keep the intended status relationship:
  - `DRAFT` with no payment or failed payment remains editable.
  - `PENDING_PAYMENT` pairs with an initiated payment while the user is at the gateway.
  - `SUBMITTED`, `UNDER_REVIEW`, `NEEDS_EDIT`, and `VALIDATION_COMPLETED` require a verified payment, except corrections in `NEEDS_EDIT` do not require repayment.
- Harden callback verification so successful payments cannot be downgraded by callback retries, notification errors, or unrelated failures after verification.
- Add a dedicated payment return page that shows success or failure after the bank page and redirects users to their dashboard.
- Improve dashboard feedback after payment return without introducing new persisted statuses.
- Add focused automated coverage for Zarinpal request construction, callback verification, idempotency, failure handling, and return-page behavior.

## Capabilities

### New Capabilities
- `zarinpal-payment-gateway`: Zarinpal payment initiation, callback verification, status consistency, payment return UX, and dashboard handoff.

### Modified Capabilities
- None.

## Impact

- Affected code: `lib/payments/zarinpal.ts`, `lib/actions/payment.ts`, `app/api/payment/callback/route.ts`, dashboard/payment return pages, shared UI feedback components, and payment-related tests.
- Affected configuration: production `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX=false`, and `APP_URL` for the callback URL.
- Affected systems: Zarinpal gateway, PostgreSQL payment/application records, SMS notification side effects, and the user dashboard journey.
- No database enum changes are expected; existing `ApplicationStatus` and `PaymentStatus` values remain authoritative.
