## Why

Users can become stuck after being redirected to the bank gateway if they leave, go back, or the gateway fails to return them through the callback. Admin reviewers can also miss the human-resources employee count because the detail page does not surface it with the same exact business label and may not tolerate production data shape drift.

## What Changes

- Allow users with an incomplete gateway handoff to retry payment instead of being locked in a read-only pending-payment state.
- Safely retire older initiated payment attempts when the user starts a new payment request, while preserving successful verified payments.
- Keep stale callback handling idempotent so an old failed callback cannot undo a newer successful payment or review workflow state.
- Improve dashboard/payment copy so the pending gateway state explains that retry is possible when payment was not completed.
- Make admin submission details show `تعداد نیروی انسانی بر اساس آخرین لیست بیمه` clearly in the human-resources review context.
- Make employee-count display tolerate both numeric JSON values and numeric strings from existing or production records.
- Add focused tests for payment retry, stale callback safety, and HR employee-count visibility.

## Capabilities

### New Capabilities
- `payment-retry-recovery`: Covers recovery from abandoned or incomplete bank gateway handoffs and safe retry behavior.
- `admin-hr-review-visibility`: Covers admin visibility of human-resources employee count and insurance-list review data.

### Modified Capabilities

## Impact

- Affected routes/actions: `lib/actions/payment.ts`, `app/api/payment/callback/route.ts`, `app/dashboard/page.tsx`, `app/dashboard/application/page.tsx`.
- Affected admin UI: `app/admin/submissions/[id]/page.tsx`, potentially `components/admin/SubmissionFiles.tsx`.
- Affected tests: payment action/callback/status relationship tests, admin detail rendering or HR formatter tests.
- No database schema change is expected.
- No payment provider API change is expected.
