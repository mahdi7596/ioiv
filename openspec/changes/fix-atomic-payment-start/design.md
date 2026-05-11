## Context

The final payment step currently validates the React draft before enabling the button, but the server action validates the latest application JSON already persisted in PostgreSQL. Draft saves are started in a React transition and are not awaited by the payment button. If the user clicks payment while a final autosave or upload-related draft update is still settling, the client can believe the form is complete while `startPayment()` reads incomplete persisted data and throws an expected validation error. In production, that thrown Server Action error can render as a generic Server Components digest instead of the Persian message.

The existing retry change makes a second click recoverable by allowing `PENDING_PAYMENT` applications without verified payment to create a fresh gateway attempt. This is helpful, but it also makes the underlying first-click failure easy to miss.

## Goals / Non-Goals

**Goals:**
- Make the first payment click use the latest final draft data from the screen, not a possibly stale database snapshot.
- Keep final payment server-side authoritative: the server still validates, persists, creates the payment row, requests Zarinpal, and updates payment/application state.
- Show expected validation and provider failures as inline/toast Persian errors instead of a production RSC digest.
- Keep retry behavior for abandoned pending payments.
- Avoid duplicate payment attempts caused by double clicks, in-flight saves, or uploads.

**Non-Goals:**
- Change the Zarinpal adapter endpoints, merchant configuration, callback route, or PSP routing.
- Change the fixed payment amount or currency semantics.
- Add new database statuses or migrations.
- Add gateway reconciliation/polling outside the existing callback and retry model.

## Decisions

### Pass the final draft into payment start

The payment button should call a payment action with the current final draft payload. The server action should validate that draft, persist it to the user's current application, and then start payment from the same validated data.

Rationale: this collapses the split between "client-valid draft" and "database-valid draft." It also gives the server a single atomic command for the user's intent: save this final state and start payment.

Alternative considered: wait for the background autosave to finish before calling the existing `startPayment()`. That reduces the race but still leaves separate commands and timing assumptions between save and payment.

### Return structured action results for expected failures

Expected outcomes should be represented as data:

- success with `redirectTo`
- failure with a user-facing `message`

Unexpected programming or infrastructure failures can still be logged and handled defensively, but validation/provider errors should not rely on thrown Server Action errors to communicate with the user.

Rationale: production Next.js hides server error details behind digests. Payment is a user-facing business flow, so expected failures need deterministic UI handling.

Alternative considered: keep throwing `ActionError` and improve the client catch block. The observed production POST 500 shows that Server Action thrown errors can still break the render/transport path, so a structured result is safer.

### Disable payment while writes or uploads are active

The wizard should pass enough state to the final payment step to prevent payment attempts while a draft save transition or file upload is in progress. The payment action should also be idempotent enough to avoid creating extra requests when a user double-clicks.

Rationale: user interaction should not race ongoing writes, and the UI should communicate "wait for save/upload" instead of producing a server-side failure.

Alternative considered: only fix the server action. That protects correctness, but the UX would still allow confusing clicks during known in-flight work.

### Preserve the current retry semantics

When an application is already `PENDING_PAYMENT` with no verified payment, starting payment should continue to fail prior initiated attempts and create a fresh gateway authority.

Rationale: this is already the recovery path for abandoned gateway handoffs and matches the current OpenSpec change in progress.

Alternative considered: block retry until admin/support clears pending payments. That would recreate the stuck-payment problem.

## Risks / Trade-offs

- [Risk] Passing a full draft into `startPayment` increases payload size for a Server Action. -> Mitigation: the draft contains references and small JSON objects, not file blobs.
- [Risk] Persisting final draft inside payment start could overwrite a newer concurrent save. -> Mitigation: payment should be disabled during in-flight saves/uploads, and the server uses the user's current application only.
- [Risk] Provider failures returned as data could hide unexpected errors. -> Mitigation: log unexpected/provider failures with existing structured logger while returning a generic safe Persian message.
- [Risk] Existing tests mock `startPayment()` as a no-argument action. -> Mitigation: update focused unit tests and add coverage for saving the final draft before requesting Zarinpal.

## Migration Plan

No database migration is required. Deploy the application code, rebuild the Next.js app, and restart the container. Existing draft and pending-payment records remain valid. Rollback restores the previous separate save/payment behavior without requiring data repair.

## Open Questions

- Should the payment step show a distinct message when payment is blocked only because a save/upload is in progress?
- Should provider failure messages expose sanitized Zarinpal codes to admins later, or only keep them in logs and `Payment.rawData`?
