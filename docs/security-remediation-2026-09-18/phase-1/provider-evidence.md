# Provider evidence boundary

No gateway credentials, sandbox account or externally authorized payment was provided.
No real request, verification, charge, SMS, refund or reversal was performed. Web access to
https://www.zarinpal.com/docs/paymentGateway/verify.html and
https://www.zarinpal.com/docs/paymentGateway/inquiry.html failed in this session.
Third-party search results are not accepted as the provider's contract.

The implementation therefore does not rely on undocumented request idempotency, lease
expiry, automatic reversal/refund, or an unpaid/error answer making an authority final.
Automatic transport retries were removed from both request and verification. Unknown
request/verification retains its durable claim and blocks another payable attempt.
A completed rejection allows another sequential verification of the SAME authority;
it never frees another authority. Stored capture/authority evidence permits local replay
without another remote call. If the remote result could not be stored, the operation
remains a reconciliation case: local tests cannot recover facts only the provider knows.

Owner policy: inspect gateway dashboard/support when client reports the case; preserve
application/payment/operation evidence; no scheduled manual review, SLA, new admin panel,
or automatic refund. No promise that the original authority has been reversed.

Remaining engineering evidence: Phase3 official response/finality contract and Phase19
real sandbox integration (including already-verified 101 semantics, lost responses,
query/finality, duplicate authorities and reconciliation). These remain launch blockers.
The controlled fetch/loopback-provider tests prove local coordination only.
