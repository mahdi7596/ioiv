## Context

The application wizard already has five steps and a final payment step. The final step currently computes simple counts for tax declarations and financial statements, and broad `تکمیل` / `ناقص` labels for trial balance and credit reports. Final validation exists through `finalSubmissionSchema`, but the UI does not translate validation failures into precise recovery guidance.

The relevant UI surface is client-side and localized in Persian:

- `components/application/FinalPaymentStep.tsx`
- `components/application/CreditReportStep.tsx`
- `app/globals.css`

The change should improve user clarity without changing persistence, upload storage, payment provider behavior, or the wizard step model.

## Goals / Non-Goals

**Goals:**

- Show an actionable final review checklist with exact missing or inconsistent items.
- Distinguish completed states and error states visually.
- Keep final payment disabled until both conditions are true:
  - final application data has no validation errors
  - the non-refundable payment acknowledgement is checked
- Make the credit report instruction visually prominent and make `https://www.mycredit.ir/` open in a new tab.
- Preserve optional audited financial statements when no financial statement rows are provided, while still flagging partially completed rows.

**Non-Goals:**

- Do not add a new wizard step or change the step order.
- Do not change upload API behavior, file constraints, or stored draft shape.
- Do not change payment amount, payment provider, or payment callback behavior.
- Do not introduce a new UI framework or dependency.

## Decisions

### Derive a final review checklist from draft state

Create a small deterministic checklist derivation in the final payment UI layer. Each checklist item should include:

- a Persian label
- completion state
- zero or more Persian recovery messages

This keeps the final step understandable and testable without making Zod error paths responsible for user-facing sentence composition.

Alternative considered: rendering raw `finalSubmissionSchema` errors. That would reduce duplicated validation logic, but the resulting paths and default messages are not specific enough for cases like “file uploaded but year not selected.”

### Keep schema validation as payment enforcement

The final button disabled state should be based on the same validity concepts used before starting payment. The click handler should still guard against invalid state in case the UI is stale or manipulated.

Alternative considered: relying only on disabled UI. This is insufficient because client-side disabled states are not a validation boundary.

### Treat empty optional financial statements as valid

Audited financial statements are optional when the user has not provided any year/file pair. If a financial row has either year or file, it becomes a row that must have both values before final payment.

Alternative considered: requiring all visible default financial rows to be complete. That conflicts with the existing requirement that empty audited financial statements are optional.

### Use existing visual language

Add scoped classes in `app/globals.css` for final review cards, status badges, error text, and the credit report notice. Use existing design tokens such as `--color-success`, `--color-danger`, `--color-warning`, `--color-info`, borders, and control radius.

Alternative considered: Tailwind-only styling in the components. The app already centralizes many component-level styles in `globals.css`, and scoped classes keep this UI consistent.

## Risks / Trade-offs

- [Risk] Checklist derivation and schema validation could drift over time. → Mitigation: keep the derivation small, align it with `finalSubmissionSchema`, and add focused tests for the checklist or final validation behavior.
- [Risk] Disabling the payment button can leave users unsure why payment is unavailable. → Mitigation: always show visible error messages beside the final checklist and acknowledgement area before the disabled button.
- [Risk] Optional financial rows may contain default empty objects from the UI. → Mitigation: normalize or validate financial rows so entirely empty rows do not block final submission, but partial rows do.
