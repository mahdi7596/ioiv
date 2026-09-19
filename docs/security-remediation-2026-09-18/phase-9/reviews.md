# Independent Phase9 critical reviews

## Code reviewer — phase8_design_review

Read-only design and implementation review throughout the phase. Required coverage included
all draft/payment/certificate writers, stable slots, current readers, shared historical paths,
ambiguous acknowledgements and allocation recovery. Findings fixed and tested:

- Immutable ApplicationFile identity/repair evidence and no metadata deletion grants.
- Traversal/canonical-root and shared-basename protection across allocation, insertion and
  deletion with one advisory identity; historical predecessors retained for D4.
- No adoption of unresolved historical refs by a new draft save; bound IDs/version checked.
- Live DB editability and application draft-version advancement; payment-in-flight fence.
- Pre-write allocation journal, irreversible abandonment and repeated late-write sweeps.
- Known precommit rejection permits retry; early413/429/400/403 also declare unchanged.
- Authoritative admin/export filtering prevents retained metadata appearing as current.

Final response: **Phase9 code approved**, reviewed migration SHA256
38ac352e457cb9f97d9bc3e83c46ef7115c65e48da1c9f2dff72572a5a28ebdc.
No remaining concrete code blocker; evidence/checkpoint/shutdown were separate gates.

## Evidence reviewer — phase7_evidence_review

First review required actual precommit rollback, certificate competition/revocation and
upload/payment/correction interleavings. All added to the29-case restricted DB suite.
The old race reproduction is correctly qualified as owner-authority algorithm reproduction,
not a currently exploitable restricted-role DELETE. Historical D4 preservation remains clear.

Final response: **Approved Phase9 local evidence checkpoint; earlier coverage gaps resolved.**
Reviewer independently verified607/80 tests,155 DB cases,119 source/118 copied-source/88
pre-closure evidence hashes, final browser/migration/regression evidence, exact migration
checksum, five preserved historical byte hashes and owned shutdown. No blocking evidence
finding; no reviewer edits/resources. D4 remains unresolved and launch remains NO-GO.

Post-receipt changes only record closure in README/results/history/reviews/ledger/report;
the evidence manifest is refreshed afterward. Runtime/source hashes remain unchanged.
