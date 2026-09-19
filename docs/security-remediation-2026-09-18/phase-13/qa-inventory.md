# Phase 13 QA inventory

Existing applicant/admin logout forms, login and recovery destinations at390/1440.
Valid same-origin and hostile top-level GET preserve cookie; hostile formPOST rejects;
GETlogout405; legitimate formPOST clears and refresh/back cannot restore authentication.
Deleted user/admin, inactive admin, malformed/expired/absent cookie recovery; no loops.
Secret/APP_URL/database failure preserves cookie; spoofedHost cannot alter redirect.
Production cookie options tested at creation. Browser fixtures inject signed synthetic
cookies; actual HTTPS issuance/ingress remains separately qualified in Phase16.
No new UI composition. Inspect logout/recovery screenshots for Persian readability,
mobile overflow and usable destinations. Browser and local fixture servers stop in finally.
