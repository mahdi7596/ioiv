# Independent critical reviews — Phase 0

Design reviewer inspected actual payment/auth/upload/schema paths, then reviewed the
written design and followed up after corrections. No implementation delegated or edits
made by reviewers.

Confirmed findings resolved in design.md:

1. Legacy ApplicationFile has no durable scan/hash/time evidence. Added verification
   metadata proposal and UNKNOWN historical inventory/re-scan/recovery decision D4.
2. A stale worker's authentic capture must survive failed coordinator CAS. Added separate
   idempotent provider-result/reconciliation evidence, with only owner able to transition.
3. Distinguish successfully scanned stale-candidate cleanup from UNAVAILABLE retention;
   preserve original creation-time 24-hour deadline without retry extension.
4. Correct Payment-before-provider request order and facilities 25/150 MiB versus legacy 20 MiB.

Reviewer follow-up: all four corrected; no further material document findings within
scope. Implementation still requires migration, real concurrency, restricted-role and
provider-contract verification. Phase 0 BLOCKED on D1/D2, future D3–D5 explicitly pending.

Evidence reviewer confirmed unit/build retry results, retained initial failures, lint
warning, seven DB suites/synthetic recovery, reproduced HTTP/payment behavior and failed
G3. Accepted limitations: HTTP not browser; payment mocks not provider; R9 privilege
inspection not actual cleanup; synthetic schema/catalogue restore not matched recovery;
runner script requires placement in recreated fixture root.

Reviewer initially inferred docs/examples were absent from copied source because the
source-only hash manifest excluded them. Root verified all 410 tracked files present
(no missing paths), including ten docs and two tracked examples, and added
copy-inventory.json with complete copied input hashes. Root also clarified the HTTP app
used the restricted role while fixture seeding/count queries used owner credentials.
Evidence reviewer follow-up inspected the inventory and server environment, retracted
both initial scope statements, and confirmed complete tracked-input coverage and
restricted-role HTTP execution. Remaining evidence limits stand. No finding closed.
