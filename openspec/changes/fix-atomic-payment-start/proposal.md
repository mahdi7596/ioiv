## Why

Users can see a production Server Components error when they click the final payment button, while a second click shortly afterward redirects to the bank gateway. This points to the payment action reading stale persisted application data or surfacing provider/server errors through an unsafe Server Action failure path, which makes the payment step feel unreliable at the most sensitive moment of the workflow.

## What Changes

- Make final payment start use the same final draft data the user is seeing, so the server saves and validates the latest form state before creating a payment attempt.
- Prevent payment from starting while uploads or draft saves are still in progress.
- Return structured, user-facing payment start results instead of letting expected validation/provider failures render as production RSC digest errors.
- Preserve the existing payment provider, fixed amount, retry behavior, callback verification, and application/payment status model.
- Add focused tests for first-click payment start, stale-draft prevention, and graceful error handling.

## Capabilities

### New Capabilities
- `atomic-payment-start`: Covers the final payment button's atomic save, validation, payment initiation, retry, and user-facing error behavior.

### Modified Capabilities

## Impact

- Affects `components/application/ApplicationWizard.tsx`, `components/application/FinalPaymentStep.tsx`, `lib/actions/payment.ts`, and related payment/action tests.
- No database schema migration is expected.
- No change to Zarinpal credentials, callback route contract, payment amount, or Shaparak/PSP routing is expected.
