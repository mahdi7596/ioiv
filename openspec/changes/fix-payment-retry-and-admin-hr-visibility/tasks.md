## 1. Payment Retry Model

- [x] 1.1 Update payment action loading to include enough payment history to detect verified payments and existing initiated attempts.
- [x] 1.2 Allow `startPayment()` for `PENDING_PAYMENT` applications when no verified payment exists.
- [x] 1.3 Mark prior initiated attempts for the application as `FAILED` with retry/abandoned metadata before creating a fresh payment request.
- [x] 1.4 Prevent duplicate payment creation when the application already has a verified payment outside the existing correction-submission path.
- [x] 1.5 Keep final submission validation authoritative before every retry attempt.

## 2. Callback Safety

- [x] 2.1 Update callback failure handling so stale failed callbacks only fail their own payment attempt.
- [x] 2.2 Ensure callbacks cannot move an application back to `DRAFT` when another payment has been verified or review has started.
- [x] 2.3 Preserve existing idempotent behavior for repeated verified callbacks.
- [x] 2.4 Add or update payment callback tests for failed old callbacks after retry and after successful payment.

## 3. User Retry UX

- [x] 3.1 Update application access logic to support a payment-retry view for `PENDING_PAYMENT` without reopening document editing.
- [x] 3.2 Pass latest payment status context into the application wizard and final payment step.
- [x] 3.3 Update the final payment step to render a retry payment action for pending incomplete payment while keeping document fields read-only.
- [x] 3.4 Update dashboard pending-payment guidance copy to explain retry when payment was not completed.
- [x] 3.5 Add or update component/action tests for pending-payment retry availability and copy.

## 4. Admin HR Visibility

- [x] 4.1 Extract or add a reusable employee-count formatter that accepts numbers and numeric strings with ASCII, Persian, or Arabic digits.
- [x] 4.2 Update admin submission detail to show `تعداد نیروی انسانی بر اساس آخرین لیست بیمه` in the human-resources review context.
- [x] 4.3 Keep the insurance-list upload visible under the منابع انسانی group and colocate or cross-reference it with the employee count.
- [x] 4.4 Render a clear missing value for absent or invalid employee counts.
- [x] 4.5 Add focused tests for numeric, numeric-string, localized-digit, and invalid employee-count display.

## 5. Verification

- [x] 5.1 Run the payment action and callback test suites.
- [x] 5.2 Run admin HR visibility tests and existing export/validation tests that touch human-resources data.
- [x] 5.3 Run lint or the project’s standard verification command.
- [ ] 5.4 Manually smoke test the retry path: start payment, return without callback, revisit dashboard/application, retry payment.
- [ ] 5.5 Manually inspect admin submission detail for a record with HR employee count and insurance-list upload.
