## 1. Server Action Contract

- [x] 1.1 Change the payment start action to accept the final application draft payload.
- [x] 1.2 Validate the submitted final draft on the server before any payment row or gateway request is created.
- [x] 1.3 Persist the validated final draft to the current user's application inside the payment-start flow.
- [x] 1.4 Return structured success/failure results for expected validation and provider failures instead of throwing user-facing errors.
- [x] 1.5 Preserve existing verified-payment and pending-payment retry behavior.

## 2. Client Payment Flow

- [x] 2.1 Pass the current final draft from `FinalPaymentStep` to the payment start action.
- [x] 2.2 Pass wizard save/upload pending state into the final payment step.
- [x] 2.3 Disable or block the payment button while uploads or draft saves are in progress.
- [x] 2.4 Render structured payment-start failures as inline Persian messages and toasts without triggering the production RSC digest view.

## 3. Tests

- [x] 3.1 Add/update payment action tests proving the latest submitted draft is saved before gateway request.
- [x] 3.2 Add/update payment action tests proving invalid submitted final draft does not create payment rows or gateway requests.
- [x] 3.3 Add/update payment action tests proving provider failures return structured failure results and mark initiated payment failed.
- [x] 3.4 Add/update component tests for blocked payment while save/upload work is pending, if the existing test harness supports it.
- [x] 3.5 Run the focused payment, callback, validation, and wizard tests.

## 4. Production Readiness

- [x] 4.1 Run `npm run lint`.
- [x] 4.2 Run `npm run build`.
- [x] 4.3 Document the server redeploy commands and the log checks for `payment_start_failed`/`payment_start_succeeded`.
