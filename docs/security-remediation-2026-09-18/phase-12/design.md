# Phase 12 — R11 concurrent administrative decisions

Standing owner authorization covers this engineering phase; preserve existing workflow.
Phase9 already added application locks, live admin checks and a timestamp conflict
check. Qualify and finish that work rather than changing allowed business transitions.

Use existing draftVersion plus status for optimistic review tokens, carried from the
rendered admin form to the server; missing/stale tokens get actionable Persian409.
Each admin transition increments version, certificate commit already increments it.
Under the application lock, revalidate token and allowed live transition, revalidate
session and lock/read the live admin role so concurrent revocation has a defined order.
A losing request cannot change note/history/certificate or send a status notification.
Known rejected staged files remain journalled candidates for safe bounded cleanup;
never unlink potentially committed bytes on an ambiguous database acknowledgement.

Additive migration: narrow fixed-search-path SECURITY DEFINER admin row-lock helper
(runtime EXECUTE only; no Admin UPDATE grant), and database-incremented facilities
reviewVersion on every application update to detect stale tabs/ABA. No retention or
payment change. Preserve Phase10 qualified
paid correction resubmission and document guards. SMS remains post-commit best effort;
failed SMS does not undo a successful decision or authorize duplicate transitions.
No automatic replay of uncertain external notifications. Certificate replacement
conflicts map to409 rather than generic500; expired admin session maps to401/Persian
recovery. UI refresh/retry must display current state and preserve clear errors.

Verify restricted real DB competing completion/correction, certificate replacements,
resubmission and version conflicts; inactive/role-changed/expired admins; SMS failure;
actual bytes/current/history/notification counts. Test HTTP and mobile/desktop conflict
recovery as changed. Run focused/regression/types/lint/build and independent critical
review. Rollback only to compatible guarded writers; existing additive schema retained.
Production remains untouched and launch NO-GO.

Review expanded qualification to facilities review actions: locked live authorization,
versioned decisions and no false success for differing notes. SMS claims require an open
NEEDS_EDIT correction; a transport error cannot prove non-delivery, so preserve spent
PENDING claim and unconfirmed reason; no retry without an explicit provider rejection.
A successful send followed by failed/lost persistence never becomes retryable FAILED.
Existing adapter provides no definitive rejection class; real provider qualification
remains Phase19. UI must not promise retry for uncertain sends.

## Reviewed refinements / attempts

Independent review caught the old SMS CHECK rejecting PENDING uncertainty codes; a
second narrow additive migration fixes it, verified by actual persisted row tests.
Post-commit claim failure now returns a saved decision with unconfirmed delivery.
Expected facilities errors use a serializable action result to avoid production Next
redaction. Browser checks demonstrated actual Persian401/409, then visual inspection
prompted persistent inline facilities errors/sign-in link and a visible legacy conflict.

Initial full regression:689/692 passed; three older fixtures lacked required tokens or
expected prior generic paid copy/immediate unjournalled candidate unlink. Updated tests
to displayed version tokens, actionable paid conflict, retained cleanup candidate; no
concurrency assertions removed. Migration fixture initially disabled lineage triggers,
then split a deferred attachment across commits: retain normal triggers and one fixture
transaction, bypassing admission only for synthetic pre-existing facilities application.
Build caught inherited scanner-mode literal branches in the new browser harness; this
harness uses clean responses only, so removed unused branches. No production or external
provider used. No three consecutive no-progress attempts.
