# Phase 13 session recovery and intentional logout

GET reset preserves live applicant and active administrator sessions. Invalid/expired or
missing subjects may clear the unusable cookie and recover without redirect loops.
Database/configuration failures return503 and preserve cookies. No schema, retention,
payment or workflow change. Logout POST requires the exact configured Origin; normal
HTML forms remain supported, foreign/missing/null origins fail closed. GET logout cannot
mutate. Share origin validation with existing auth guard without weakening JSON login.
Verify user/admin, malformed/expired/deleted subjects, outage, cookie flags, legitimate
and foreign logout, navigation/refresh/back with production browser. Run regressions,
types/lint/build and independent critical review. Rollback retains protected routes;
production remains untouched. No new owner policy choice required.
