# D4 — historical legacy-file verification policy (approved by owner)

Status: APPROVED. The owner accepted the recommended policy with “as you recommand”
after the policy and its impact were explained. This authorizes Phase10 implementation
and isolated qualification. It does not authorize production inventory, backfill, access
changes or deployment. See Phase0 design lines179–190,277–278.

## Approved policy

1. Treat every historical file without durable verification evidence as UNKNOWN.
   Do not infer PASSED from filename, declared MIME, creation order or old upload success.
2. Block **new payment starts and new/correction submissions** when any required evidence
   is UNKNOWN, missing, corrupt, rejected, foreign, stale, unbound or unavailable. Explain
   the specific recovery step in Persian. Preserve already verified payments; corrections
   must never collect the fee again. Resume/settlement of an existing uncertain payment
   must retain the existing payment-coordination safety rules rather than create a charge.
3. Preserve existing historical bytes, metadata, established downloads and review access
   while UNKNOWN. This policy does not silently delete/quarantine historical files or
   reopen already submitted/completed cases. A confirmed malicious historical file requires
   a separate explicit containment/recovery decision before changing established access.
4. Provide a read-only inventory and an explicit, repeatable verification/backfill workflow:
   match application/slot/current reference, verify actual type/size/hash, scan actual bytes,
   record immutable verification provenance, and bind only unambiguous saved references.
   Never select newest-created history or silently adopt ambiguous certificates.
5. On scanner outage, retain UNKNOWN and allow safe retry. Missing/corrupt/rejected or
   ambiguous evidence stays unqualified, with re-upload/manual-resolution instructions.
   Previously good current bytes are preserved during failed replacements. A successful
   verified replacement or justified backfill restores new submission eligibility.
6. Rehearse on synthetic data and isolated copies first. Production inventory/backfill
   requires separately authorized access, verified backups and a reviewed rollout. Actual
   scanner, operational capacity and signature freshness remain later qualification gates.

## Expected impact and unknowns

Historical draft/correction users may temporarily be unable to start a new payment or
submit until required evidence is verified/replaced. Existing downloads/reviews remain
available under their current authorization. No production inventory has been authorized
or taken, so affected counts, scan duration and storage requirements are unknown.

The owner agreed to this impact before Phase10 implementation.
Grandfathering UNKNOWN files would leave the required-file-integrity finding partially
open and require an explicit exception in the launch verdict; it is not the recommendation.
