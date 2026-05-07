## Context

The current payment flow creates an `INITIATED` payment and moves the application to `PENDING_PAYMENT` after Zarinpal returns an authority. If Zarinpal calls back with `Status=NOK` or verification fails, the callback marks the active payment `FAILED` and returns the application to `DRAFT`. If the user closes the gateway, presses back, loses connection, or the gateway never reaches the callback, that repair path does not run. The dashboard then shows `پرونده کامل شده و منتظر نتیجه پرداخت از درگاه است.` and the application wizard is read-only because only `DRAFT` and `NEEDS_EDIT` are editable.

The human-resources step stores `humanResources.employeeCount` and `humanResources.insuranceList` in application JSON. Admin submission details currently show employee count as a generic summary item and the insurance list as a file group. The reported review issue suggests the employee-count value is not visible enough for the منابع انسانی review task, and production data may include the count as a numeric string even though the current wizard saves it as a number.

## Goals / Non-Goals

**Goals:**
- Let users retry payment after an abandoned or incomplete gateway handoff.
- Keep payment retry safe when older callbacks arrive after a later payment attempt.
- Preserve the existing payment/application status model: `INITIATED`, `VERIFIED`, `FAILED`; `DRAFT`, `PENDING_PAYMENT`, `SUBMITTED`, review states.
- Make the dashboard and final payment step communicate that incomplete payment can be retried.
- Make admin HR review show the exact employee-count business label alongside the HR upload context.
- Display employee counts from both numeric JSON and numeric string JSON values.
- Cover the behavior with focused automated tests.

**Non-Goals:**
- Add new persisted payment or application statuses.
- Change the Zarinpal API integration or payment amount.
- Add gateway polling or reconciliation against Zarinpal outside the callback/start-payment flow.
- Parse the contents of uploaded insurance-list spreadsheets.
- Add a database migration.

## Decisions

### Treat retry as a new payment attempt, not a continuation

When a user starts payment while the latest application state is `PENDING_PAYMENT` and there is no verified payment, the server should allow `startPayment()` to run final validation again, mark any existing `INITIATED` payments for that application as `FAILED` with retry/abandoned metadata, create a fresh payment row, request a fresh authority, and keep the application in `PENDING_PAYMENT`.

Rationale: Zarinpal authorities are single gateway handoffs. Reusing an old authority after the user has left the gateway is less predictable than requesting a fresh authority. Marking the old payment failed also makes admin/payment history clearer.

Alternative considered: make `PENDING_PAYMENT` editable and let users edit the draft before retrying. This is too broad because pending payment means the submitted data is already at the payment gate; retry should be possible without reopening unrelated editing unless the payment explicitly fails.

### Keep stale callback handling idempotent

Callbacks for an old payment should update only that payment if it is still `INITIATED`. A failed stale callback must not return the application to `DRAFT` when the application has moved beyond `PENDING_PAYMENT` or when another verified payment already exists. A successful callback for an old initiated payment should continue to verify normally only if it is still a legitimate initiated payment; duplicate callbacks for verified payments remain no-ops.

Rationale: Users can create multiple attempts. Browser tabs and gateway callbacks can return out of order, so application status must be protected from older failed attempts.

Alternative considered: block retry while any initiated payment exists. That preserves the current stuck behavior and does not solve gateway-abandonment recovery.

### Show retry access through the existing application page

The dashboard action can continue to link to `/dashboard/application`, but `getApplicationAccess()` should allow viewing the wizard in a payment-retry mode for `PENDING_PAYMENT`. The final payment step should be read-only for document fields but still render an actionable retry payment control when there is no verified payment and the latest payment is incomplete.

Rationale: Users already understand `/dashboard/application` as the place to continue the workflow. A targeted retry mode keeps documents locked while payment can be restarted.

Alternative considered: add a separate `/payment/retry` route. That would work, but it duplicates final validation/error handling already owned by `startPayment()` and the final payment UI.

### Render HR employee count in the HR review context

Admin detail should show `تعداد نیروی انسانی بر اساس آخرین لیست بیمه` in a visible human-resources section or in the منابع انسانی file group header/content near the insurance-list upload. The formatter should accept finite numbers and strings containing localized or ASCII digits, and should render `-` only for missing or invalid values.

Rationale: The admin is reviewing the HR step, so the count should be colocated with the HR upload and use the same label the user saw in the wizard. Tolerating numeric strings avoids hiding valid existing records due to JSON shape drift.

Alternative considered: only rename the existing summary label. That helps, but it still leaves the count away from the HR document group and may not fix the reported review workflow.

## Risks / Trade-offs

- Older initiated payments are marked `FAILED` during retry, even if a user later completes the old gateway tab → stale callback handling must avoid downgrading application state and tests must cover out-of-order callbacks.
- Letting `PENDING_PAYMENT` expose a retry button could look like document editing is available → the UI must clearly lock document edits while allowing only payment retry.
- Re-running final validation during retry may fail if required data is missing in older records → the error should remain actionable and avoid creating a new payment request.
- Numeric-string employee counts could include localized digits → reuse existing digit-normalization helpers instead of ad hoc parsing.

## Migration Plan

No database migration is required. Deploy the code and tests together. Existing applications stuck in `PENDING_PAYMENT` with an `INITIATED` payment will become recoverable when the user opens the application payment step and starts a new payment attempt. Rollback restores the previous behavior but does not corrupt existing payment rows because retry attempts use existing statuses.

## Open Questions

- Should support/admins also get a manual action to mark very old initiated payments failed, or is user-driven retry enough for now?
