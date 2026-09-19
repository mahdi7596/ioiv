# Official provider contract checked 2026-09-19

Primary live documentation:
- https://www.zarinpal.com/docs/paymentGateway/connectToGateway — numeric request100;
  verify100/101; Integer ref_id; data object and errors empty array; production endpoints.
- https://www.zarinpal.com/docs/paymentGateway/ — authority36 chars, production prefix A.
- https://www.zarinpal.com/docs/paymentGateway/sandBox — sandbox prefix S, arbitrary UUID merchant.
- https://www.zarinpal.com/docs/paymentGateway/errorList — public -9..-19,
  request -40/-41, verify -50..-55; negative results do not prove irreversible nonpayment.
- https://www.zarinpal.com/docs/paymentGateway/moreFeatures/currency — IRT request supported.
- https://www.zarinpal.com/docs/paymentGateway/otherMethods/Inquiry — inquiry is not confirmation.

Local conservative validation: positive safe numeric integer ref_id only (reject string,
zero, fractional/unsafe values rather than persist ambiguous financial identifiers); authority
ASCII alphanumeric36 with environment prefix. Optional echoes must match but are not required
because documented verify response omits them. Ignore informational message/card/fee fields.
Only complete noncontradictory documented error envelopes permit rejection classification;
all other transport/envelope failures UNKNOWN. Logs retain only numeric rejection code.

Limits: reference positivity/safe-number bounds are local usability constraints; docs do not
specify a maximum. Request supports IRT while verify table labels rial and omits currency;
preserve existing stored Toman+IRT behavior, do not invent conversion. Actual sandbox currency,
format/finality and timeout/idempotency qualification remains Phase19. Sequential101 does not
prove retry is safe while an earlier request may still be executing. No sandbox request or
payment was made to qualify the provider. These are current document observations, not live
provider behavior. Browser NOK is untrusted, so existing Phase2 server verification is retained.

Historical limitation: previously durable CAPTURED evidence remains replayable without
applying new reference rules retroactively. This fix validates new gateway responses;
it does not certify or repair historical records written by the permissive adapter.
Do not discard or rewrite those records; actual reconciliation remains an owner operation.
