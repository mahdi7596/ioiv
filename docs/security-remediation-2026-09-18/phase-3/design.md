# Phase 3 — R12 scope and entry design

Owner authorized Phase3 only. Entry master/29705da7e148b75a56d3a4aedc3565530c1d6974;
39/39 Phase2 source hashes match; September16 audit SHA256
2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e unchanged.
All existing uncommitted work preserved. No reset/stash/commit/push.

Validate endpoint-specific numeric success codes, complete data/errors envelope, positive
safe integer reference, and 36-character alphanumeric authority (A production/S sandbox).
Success plus errors is UNKNOWN. Only documented negative error codes in an otherwise empty
data envelope classify rejection. Provider prose is not retained in errors/logs. Optional
echoed authority/amount/currency must agree with outbound server values. Stored obligation/
payment amounts remain authoritative, including legacy request creation. Browser fields
cannot confirm capture. No new remote replay of uncertain in-flight operations; preserve
Phase1 original-authority coordination and Phase2 state protection. Same-authority retry
after explicit rejection and durable local capture replay remain available.

No schema/grant/config/retention/data-repair or business-workflow change. Rollback must
retain Phase1/2 compatible writers and all payment evidence; reverting to permissive gateway
validation is unsafe. Facilities remains disabled. D1/D2 settled; no new panel, refund,
scheduled investigation or response-time promise. Existing Persian unresolved guidance stays.

Acceptance: adapter negative matrix + successful 100/101, original amount and exact authority;
restricted PostgreSQL end-to-end invalid response/no extra charge/history and recovery;
existing races/crash regressions; production browser mobile/desktop; unit/types/lint/build;
independent code and evidence reviews. Prove selected desired-safe tests fail on Phase2.
Use fresh loopback fixtures, explicit env allow-list, no inherited .env or external credentials.
No real charge/SMS, production operation, activation or Phase4 work authorized.
