## Why

Users can currently reach the final application step with incomplete form data, but the final review summarizes counts and broad statuses instead of telling them exactly what must be fixed. This makes recovery unclear, especially when a user uploads a file but forgets to select the related year.

## What Changes

- Replace generic final-step completion counts with an actionable document checklist that shows completed items and exact missing or inconsistent fields.
- Style completed states, warning/error states, and final review messages distinctly so users can quickly understand what is ready and what needs attention.
- Disable the `پرداخت و ارسال نهایی` button until the application has no final validation errors and the non-refundable payment acknowledgement checkbox is checked.
- Make the credit report instruction more visible and convert `https://www.mycredit.ir/` into an external link that opens in a new tab.
- Preserve the existing five-step wizard flow, autosave behavior, upload flow, and payment action.

## Capabilities

### New Capabilities
- `final-submission-validation-ux`: Covers actionable final review validation, styled completion/error states, payment button gating, and the linked credit-report instruction notice.

### Modified Capabilities

## Impact

- Affected UI components:
  - `components/application/FinalPaymentStep.tsx`
  - `components/application/CreditReportStep.tsx`
  - `app/globals.css`
- Affected validation behavior:
  - final client-side validation summary and payment button disabled state
  - optional audited financial statement rows with partial year/file data
- No database schema, upload API, payment API, or authentication changes are expected.
