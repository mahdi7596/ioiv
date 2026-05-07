## 1. Status Model Safeguards

- [x] 1.1 Add focused tests that document the expected relationship between `ApplicationStatus` and `PaymentStatus`.
- [x] 1.2 Verify no Prisma enum or migration changes are needed for this gateway work.
- [x] 1.3 Ensure correction submission for `NEEDS_EDIT` applications with a verified payment continues to skip repayment.

## 2. Zarinpal Adapter

- [x] 2.1 Review `lib/payments/zarinpal.ts` against Zarinpal v4 request, StartPay, and verify behavior.
- [x] 2.2 Add unit tests for request URL, verify URL, merchant ID handling, sandbox/production base URL selection, callback URL payload, and reference ID parsing.
- [x] 2.3 Improve provider error handling so failed Zarinpal responses produce clear logged errors without leaking secrets.

## 3. Payment Start Flow

- [x] 3.1 Keep server-side final application validation authoritative before creating a payment attempt.
- [x] 3.2 Ensure payment start creates an `INITIATED` payment and moves the application to `PENDING_PAYMENT` only after Zarinpal returns an authority.
- [x] 3.3 Ensure a Zarinpal request failure leaves the application editable and does not strand it in `PENDING_PAYMENT`.
- [x] 3.4 Confirm the callback URL uses `APP_URL` and includes the local payment identifier needed to match the callback.

## 4. Callback Verification

- [x] 4.1 Refactor `/api/payment/callback` so authority matching and Zarinpal verification happen before any verified state transition.
- [x] 4.2 Make successful verification update payment, application, submission timestamp, raw data, reference ID, and status history in one database transaction.
- [x] 4.3 Make failed or cancelled callbacks mark the active initiated payment failed and return the application to `DRAFT` only when it is still `PENDING_PAYMENT`.
- [x] 4.4 Make callbacks for already verified payments idempotent and route to the success return page without duplicate history rows.
- [x] 4.5 Prevent stale failed callbacks from downgrading applications that already have a verified payment or have moved beyond `PENDING_PAYMENT`.

## 5. Notification Isolation

- [x] 5.1 Move admin/user submission SMS notifications outside the verification failure path.
- [x] 5.2 Log notification failures without changing verified payment or submitted application state.
- [x] 5.3 Add tests proving SMS failures after verification do not mark payment failed or application draft.

## 6. Payment Return UX

- [x] 6.1 Add a dedicated payment return page for success and failure outcomes.
- [x] 6.2 Show concise Persian success/failure copy, preserve RTL layout, and provide a visible dashboard action.
- [x] 6.3 Auto-redirect users from the return page to `/dashboard` after a short readable delay.
- [x] 6.4 Ensure the return page does not create new persisted statuses and relies on existing application/payment records.
- [x] 6.5 Add return-page rendering tests for success and failure states.

## 7. Dashboard Feedback

- [x] 7.1 Confirm the dashboard displays the authoritative application status and latest payment status after return.
- [x] 7.2 Add any needed transient dashboard feedback for payment success/failure without changing persisted statuses.
- [x] 7.3 Verify failed payment returns leave the user able to retry from the application form.

## 8. Configuration and Documentation

- [x] 8.1 Update `.env.example` and deployment guidance to clearly document `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX`, and `APP_URL`.
- [x] 8.2 Document that the production merchant ID must be configured in environment variables and not committed as application code.
- [x] 8.3 Confirm production deployment uses `ZARINPAL_SANDBOX=false` and a public HTTPS `APP_URL`.

## 9. Verification

- [x] 9.1 Run the relevant unit and component tests for payment, statuses, callback behavior, and return UX.
- [x] 9.2 Run the full test suite.
- [x] 9.3 Run lint and build.
- [x] 9.4 Perform a manual payment smoke test or documented callback simulation for success, failure, duplicate success, and SMS failure cases.
