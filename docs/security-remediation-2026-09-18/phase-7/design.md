# Phase7 design — R6

Admission already counts unknown/inactive probes using Phase5 protected rolling quotas.
Keep that transaction unchanged. After admission, all admin outcomes return200 with
identical conditional Persian information and code entry; no unknown/inactive OTP,
account, role or SMS. Lookup runs in a bounded transaction; perform equivalent hashing.
Actual dispatch remains once-only, awaited and bounded; uncertainty never refunds/replays.

Uniform minimum response duration starts after admission: shared provider timeout +12s
(lookup1+2s, claim3+5s, hash/scheduling1s allowance). Default22s, maximum42s plus admission
(up to8s). Admin browser request timeout becomes60s; loading and network-uncertain recovery
remain. This deliberate latency cost avoids the healthy fast-negative/SMS timing oracle.
It is a floor, not hard real-time or constant-time proof: overloaded scheduling/DB network
or infrastructure failures may overrun it. Qualify actual ingress/timeouts/capacity later.
Budget denials429/config/DB admission503 occur before account lookup and remain unchanged.

No schema/grant/migration/backfill/retention change. D3 protected accounting/cleanup remains
unchanged; no extra raw identifiers. Deploy all auth writers together, retain Phase4–6
controls on rollback. No production action. No new business or facilities decision.

UI separates conditional request information from invalid-code errors, uses linked status
text, and preserves mobile RTL and keyboard forms. Reproduce403 baseline; test status/body,
bounded timing helper, all roles/unknown/inactive, parallel probes, no side effects, actual
restricted DB, production browser at390/1440 and real cookies, SMS uncertainty/replay,
origin/verification/payment regression, types/lint/build and independent critical review.
