## 1. Validation Model

- [x] 1.1 Add a deterministic final review checklist derivation for tax declarations, audited financial statements, trial balance uploads, credit report uploads, and acknowledgement state.
- [x] 1.2 Ensure empty audited financial statement rows are treated as optional while partial year/file rows produce explicit validation errors.
- [x] 1.3 Keep a defensive validation guard in the payment click handler so invalid final state cannot start payment.

## 2. Final Payment UI

- [x] 2.1 Replace generic final-step counts/status text with checklist rows that show labels, completed state, and exact Persian recovery messages.
- [x] 2.2 Add distinct visual styles for completed checklist states, error states, and final validation helper messages.
- [x] 2.3 Disable `پرداخت و ارسال نهایی` whenever the checklist has errors, final schema validation fails, terms are unchecked, or payment is pending.
- [x] 2.4 Show clear Persian guidance near the disabled payment area so users know what remains before payment can continue.

## 3. Credit Report Instruction

- [x] 3.1 Restyle the credit report instruction as a prominent notice using the existing design tokens.
- [x] 3.2 Convert `https://www.mycredit.ir/` into an external link with `target="_blank"` and `rel="noopener noreferrer"`.

## 4. Verification

- [x] 4.1 Add or update focused validation tests for optional empty financial statements and partial year/file rows.
- [x] 4.2 Run the relevant automated checks for validation and application UI changes.
- [x] 4.3 Manually inspect the final payment and credit report steps in the browser for Persian copy, disabled/enabled button behavior, link behavior, and responsive styling.
