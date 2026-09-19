# Phase 9 — R8 legacy file replacement

Status: design reviewed; implementation pending. This extends the accepted Phase 0
legacy-file design. Independent reviewer: phase8_design_review (read-only review).
D4 remains an owner decision before Phase 10. No production changes or enablement.

## Confirmed behavior and boundaries

Applicant uploads and both certificate writers must use one serialized commit protocol.
A successful replacement atomically saves the file, current binding, original slot's
JSON reference, draft version, and exact predecessor deletion intent. Payment draft
persistence and correction resubmission participate under their existing application
lock. Failed staging, scan, storage or transactions preserve the current file. An
uncertain acknowledgement never authorizes deletion of the candidate.

Only 20 MiB per-file limits exist for legacy uploads. Test this limit and disk
ENOSPC/EDQUOT, without introducing the facilities aggregate quota. The existing
scanner/content checks remain; capture their verification metadata for new files.
Historical verification stays UNKNOWN and established historical download/review
access remains unchanged pending D4.

## Model, migration and retention

Add Application.draftVersion; LegacyFileBinding unique(applicationId, slotKey), current
file FK and monotonic generation; immutable file verification metadata; durable exact
predecessor deletion intent with retry results. Retain ApplicationFile metadata instead
of granting runtime DELETE. A tombstoned object cannot become current or saved again.
Database guards enforce ownership, canonical slot, lineage and current-reference rules.

Backfill only saved JSON references whose file exists and matches application and exact
canonical slot. Preserve missing, foreign, duplicated, malformed and unreferenced rows
and bytes; record ambiguity for repair. Certificates have no saved JSON pointer, so do
not infer their current predecessor from createdAt. Fresh replacement establishes a
binding; pre-binding historical certificates remain preserved.

Migration and rollback rehearsal must prove historical rows/bytes remain intact and
failed migrations roll back. Rollout requires draining all old writers. Rollback retains
the expanded schema and uses a compatible writer; restoring an old unsafe writer is
not an acceptable live rollback.

## Concurrency and UI

Lock application before binding. Recheck live ownership/editability or administrator
permission/status inside the transaction. Compare expected generation and draft version;
return a Persian refresh/retry conflict rather than overwriting newer state. Preserve
original array indexes when payment validation filters empty rows. Canonical indexes
reject leading zeros. Upload responses merge into current client state by slot and
generation; child components must not apply a captured whole draft after awaiting I/O.
Track pending uploads per slot. Pad existing tax rows instead of discarding 1–2 rows.

## Cleanup

Only durable committed predecessors may be deleted. Recheck current bindings, saved
references and shared storage paths. Reject paths outside configured storage and unsafe
historical paths. Make deletion authorization durable before unlink so delayed I/O after
a transaction timeout cannot race reattachment. Persist retryable unlink failure; ENOENT
is idempotent success. No broad runtime file DELETE grant. Preserve unknown candidates
following ambiguous commit until their durable state is known.

## Acceptance and evidence

Reproduce the old two-insert/two-cleanup race with isolated SQL-owner authority (the
restricted production-like role currently lacks DELETE, which masks the unsafe design).
Use real restricted PostgreSQL and real bytes for same/different-slot concurrency,
stale draft saves, reversed responses, upload/payment/status races, certificate races,
refresh/retry, crashes around staging/commit/cleanup, lost acknowledgement, disk and
unlink failure, unsafe/shared historical paths, and migration rollback. Verify exact
saved references, current bindings, surviving bytes and deletion intents. Run prior
payment/auth/facilities regression suites, types, lint and production build; exercise
mobile/desktop browser flows and obtain independent code/evidence reviews. Seal hashes
and shut down labelled resources before marking Phase 9 complete.

## Review-driven refinements (implementation draft)

- A LegacyUploadCandidate journal reserves the generated object path before writing.
  READY candidates commit under a row lock; COMMITTED and ABANDONED are terminal.
  Expiry is at least 24 hours and commits the ABANDONED fence before unlink. Repeated
  maintenance must revisit **all ABANDONED rows, including populated deletedAt**, since
  an old writer paused before write can resume after an earlier ENOENT cleanup. Its READY
  transition then fails; a later sweep safely removes the late bytes. Phase 11 schedules
  and qualifies maintenance; this phase exposes and tests the bounded retry primitives.
- New paths are canonicalized through the actual upload root; SQL also conservatively
  prevents reuse of an existing object basename. All unjournaled historical predecessor
  objects are RETAINED for explicit historical review, even after fresh replacement.
  This avoids inferring physical-object identity from historical symlink/path aliases.
- New scan results retain detected MIME type, SHA-256, PASSED verdict and timestamp.
  Scanner identity/signature version remain null because the current scanner protocol
  supplies neither; Phase 15 qualification must not mistake those nulls for evidence.
- Upload/draft commits reject active/uncertain payment obligations as well as noneditable
  application status. This closes the reservation-to-provider-response interval while
  status can still be DRAFT; settled paid corrections remain editable without repayment.
- Known precommit upload failures return an explicit unchanged outcome and preserve retry.
  Conflicts/unknown acknowledgements require refreshing. Draft/payment conflicts return
  safe Persian results rather than depending on production server-error serialization.
- The browser serializes this form's saves/uploads and merges successful uploads into
  live draft state. Other-tab concurrency remains controlled by database generation/version.
