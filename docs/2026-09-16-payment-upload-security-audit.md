# Sana: Payment and Upload Security Audit

Date: 2026-09-16
Tree audited: `master` at commit `0d223b4` (clean working tree)
Scope: security only, limited to (1) payment handling and (2) file upload, storage and download.
Method: line-level trace of both flows in the current source; the 2026-09-15 audit was treated as a set of claims and every one was re-checked. No code was changed. `tsc --noEmit` is clean and the 10 payment/upload test files (81 tests) pass at this commit.

## 1. Executive summary

Payments cannot be faked. Both flows verify every callback server-side with Zarinpal, pin the amount from the database, require the gateway authority to match the stored row, and the facilities flow records a confirmed payment before it does anything else, so a confirmed payment can no longer be lost. The remaining payment risks are edge cases in which a user who really paid is shown "failed" and can pay a second time: the older company-registration callback still marks a payment failed if the database write after a successful verification fails, and the facilities flow treats any gateway error, including a 5xx, as "rejected".

Uploads are the bigger problem. The facilities pipeline is well built (opaque storage keys, magic-byte checks, fail-closed antivirus, quotas, audited downloads), but it hands every spreadsheet to SheetJS 0.18.5, a version with two published vulnerabilities, and in the application-files route it does so before checking that the caller owns the upload slot. Because anyone with an Iranian mobile number can self-register, a stranger can hang or crash the single application container with one crafted file. Separately, the older upload path silently skips virus scanning when clamd is not configured, while the facilities path correctly refuses.

Verdict: not ready until the spreadsheet parser is upgraded and moved behind the ownership check, and the legacy scan is made fail-closed. Both are small changes.

## 2. Findings table

| ID | Area | Severity | Confidence | Title | File:line |
|---|---|---|---|---|---|
| U1 | Upload | High | Likely | Vulnerable SheetJS 0.18.5 fully parses attacker workbooks, before ownership check, reachable by any self-registered user | `lib/facilities-files/verification.ts:131,225`; `app/api/facilities/application-files/route.ts:20-24`; `package.json:44` |
| U2 | Upload | Medium | Confirmed | Legacy uploads skip malware scanning when clamd is unset or misconfigured (fail-open) | `lib/uploads/storage.ts:98-102`; `lib/facilities-files/scanner.ts:182-191` |
| U3 | Upload | Medium | Likely | No upload rate limit; each request buffers and copies the file about five times under a 1 GiB container cap | `app/api/facilities/application-files/route.ts:18-20`; `lib/facilities-files/verification.ts:90`; `lib/facilities-files/service.ts:136`; `lib/facilities-files/lifecycle.ts:23`; `docker-compose.yml:25` |
| P1 | Payment | Medium | Confirmed | Legacy callback: a database failure after a successful Zarinpal verify marks the payment FAILED and re-opens payment | `app/api/payment/callback/route.ts:62-112` |
| P2 | Payment | Medium | Likely | Facilities: any non-2xx or error-bearing gateway response is classified as "rejected", so a captured payment can be marked FAILED | `lib/payments/zarinpal.ts:39-40`; `lib/actions/facilities-payment.ts:80-84,367-380` |
| P3 | Payment | Medium | Needs-verification | Stale re-verify can close an attempt whose bank session is still live; the later real callback is discarded with no reconciliation | `lib/actions/facilities-payment.ts:226,273-280,356-361` |
| P4 | Payment | Low | Confirmed | Legacy callback has no lock: concurrent callbacks duplicate history and SMS; the retry path leaves the old gateway session payable | `app/api/payment/callback/route.ts:28-47,73-118`; `lib/actions/payment.ts:95-106` |
| P5 | Payment | Low | Likely | SMS senders are exported from a `"use server"` module and are therefore registered server actions | `lib/actions/payment.ts:1,177,194` |
| P6 | Payment | Low | Confirmed | Legacy verify uses the compile-time fee constant instead of the amount stored on the payment row | `app/api/payment/callback/route.ts:68-71`; `lib/actions/payment.ts:117` |
| U4 | Upload | Low | Confirmed | Admin multipart routes parse the whole body before authentication | `app/api/admin/submissions/certificate/route.ts:11`; `app/api/admin/submissions/status/route.ts:7` |
| U5 | Upload | Low | Confirmed | ZIP members are allow-listed by extension only; member content is never verified | `lib/facilities-files/verification.ts:244-251` |
| P7 | Payment | Low | Confirmed | Production merchant ID remains in git history | commits `859c20f`, `c18ff2b`, `54e721c` |

## 3. Finding detail

### U1. Vulnerable SheetJS parses attacker workbooks fully, before the ownership check

- **Location:** `lib/facilities-files/verification.ts:131` (`XLSX.read(bytes, { type: "buffer", WTF: true })`) and `:225` (`XLSX.CFB.read`); `app/api/facilities/application-files/route.ts:20-24`; `package.json:44` (`"xlsx": "^0.18.5"`, installed 0.18.5 per `node_modules/xlsx/package.json`); self-registration at `lib/actions/auth.ts:285`; legacy path also reaches it via `lib/uploads/storage.ts:79`.
- **What an attacker does:** Register with any mobile number (OTP login creates the user). POST a crafted `.xlsx` to `/api/facilities/application-files` with any `bindingId` string. The route buffers the file and calls the verifier on line 22 before the `binding` result is checked on line 24, so no upload slot is needed. The verifier's own ZIP inspection caps total uncompressed size at 150 MiB and ratio at 100, then SheetJS inflates and parses every sheet synchronously. Three payloads are available against 0.18.5: a ReDoS workbook (CVE-2024-22363, fixed in 0.20.2) that pins the event loop; a prototype-pollution workbook (CVE-2023-30533, fixed in 0.19.3) that corrupts `Object.prototype` for the life of the process; or simply a legitimately structured 1.5 MiB workbook that inflates to 150 MiB of sheet XML and expands into gigabytes of cell objects inside a 1 GiB container. Repeat until the container restart-loops.
- **Impact:** Availability of the whole platform (single container serves both flows), and with prototype pollution, unpredictable process-wide behaviour that can extend to authorization checks. Any registered stranger can trigger it; no upload slot, application or payment is required.
- **Evidence:** `application-files/route.ts` line 20 builds `bytes`, line 22 calls `verifyFacilitiesUpload`, line 24 is the first use of `binding`. `verification.ts:128-137` reads the full workbook with no `bookSheets`, `sheetRows` or `dense` bound. `ZIP` inspection at `:307-313` only bounds inflation, not the object graph. The CVE presence follows from the pinned version; exploitation was not executed.
- **Fix:** (1) Install SheetJS 0.20.3 from the vendor registry (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) and pin it. (2) In `verification.ts:131` use `XLSX.read(bytes, { type: "buffer", bookSheets: true })`, which returns sheet names without parsing cell data, which is all the check needs. (3) In `application-files/route.ts` move the `binding` null check and the `allowed(slot, ...)` gate above `verifyFacilitiesUpload`, matching the order already used in `profile-files/route.ts:21-25`. (4) Consider a per-user in-flight upload limit (see U3).
- **Assumptions / how to verify:** CVE applicability is from the SheetJS advisories for < 0.19.3 and < 0.20.2; confirm against the exact advisories before closing. To verify the memory effect locally, build a workbook whose `sheet1.xml` is 100 MiB of `<c>` elements compressed below the 1:100 ratio and POST it with a bogus `bindingId` while watching container memory.

### U2. Legacy uploads fail open when no scanner is configured

- **Location:** `lib/uploads/storage.ts:98-102` (`if (scanner instanceof UnavailableFacilitiesFileScanner) { logger.warn(...); return; }`); `lib/facilities-files/scanner.ts:182-191` (returns `UnavailableFacilitiesFileScanner` when host/port are unset **or** when `FACILITIES_CLAMAV_TIMEOUT_MS` / `CHUNK_SIZE` fail integer validation). Documented as intended in `DEPLOYMENT.md:1556-1559`.
- **What an attacker does:** Wait for, or rely on, a deployment where `FACILITIES_CLAMAV_HOST` is unset, or where any of the four clamd variables contains a typo. Upload a macro-bearing `.doc`/`.xls` or an exploit PDF to `/api/uploads` (or as an admin certificate). The file passes the structural check, is not scanned, is stored with its true MIME type, and is later downloaded by an admin from `/api/files/[id]` with `Content-Type: application/msword`.
- **Impact:** Malware delivered to admin workstations through a trusted internal download. The facilities pipeline in the same misconfigured state correctly returns 503, so the two flows behave inconsistently and the legacy gap is visible only as a warning log.
- **Evidence:** `storage.ts:99-101`; `scanner.ts:184-186,189-191`. `.env.runtime.example:12-16` says scanning "always requires a reachable clamd", but no code enforces that for the legacy path.
- **Fix:** Delete the `UnavailableFacilitiesFileScanner` early-return in `scanLegacyUpload` so an unavailable scanner throws `UPLOAD_SCAN_UNAVAILABLE_MESSAGE` (503), exactly like `lifecycle.ts:41-43`. Add a startup assertion (or a `/api/health` check) that fails when `NODE_ENV=production` and the scanner factory returns the unavailable implementation.
- **Assumptions / how to verify:** The production `.env.runtime` could not be inspected. Check `grep legacy_upload_unscanned` in production logs; any hit means unscanned files are already stored.

### U3. No upload rate limit; each request holds about five copies of the file

- **Location:** `app/api/facilities/application-files/route.ts:18-20` (`request.formData()` then `Buffer.from(await file.arrayBuffer())`), `lib/facilities-files/verification.ts:90`, `lib/facilities-files/service.ts:136`, `lib/facilities-files/lifecycle.ts:23` (each `Buffer.from(input.bytes)` copies a Buffer), `docker-compose.yml:25` (`mem_limit: 1g`). The scan semaphore at `scanner.ts:169-171` bounds only scans, not buffering. No rate limiting exists outside `lib/actions/auth.ts`.
- **What an attacker does:** From one or several self-registered accounts, open 8 to 10 concurrent 25 MiB uploads. Each request buffers the multipart body, then copies it in the route, the verifier, the service and the lifecycle step (roughly 125 to 150 MiB per in-flight request). The container is killed by the memory limit before any scan finishes.
- **Impact:** Availability. Because the body is fully buffered before `file.size` is checked (line 19 runs after `formData()` completes), the only size bound before the app's memory is nginx's `client_max_body_size`. The Compose file now binds to loopback, so nginx can no longer be bypassed, but the app itself has no `Content-Length` guard.
- **Evidence:** File list above; `nginx-facilities-upload.example.conf:8-9` shows the 26 MiB limit and `proxy_request_buffering off`, which streams the body straight into the Node process.
- **Fix:** Reject `Content-Length` above 26 MiB before calling `formData()` in all upload routes. Add a small per-user in-flight counter (the semaphore in `scanner.ts:112` is reusable) and a per-user/per-IP hourly upload count. Pass the same `Buffer` down instead of re-wrapping it; `Buffer.from(buffer)` copies, `Buffer.isBuffer(x) ? x : Buffer.from(x)` does not.
- **Assumptions / how to verify:** The copy count is from reading the code; measure with `process.memoryUsage()` around one 25 MiB upload. nginx's actual production configuration was not available.

### P1. Legacy callback marks a captured payment FAILED if the database write fails

- **Location:** `app/api/payment/callback/route.ts:62-112`. The `try` at line 62 contains both `verifyZarinpalPayment` (line 68) and the `$transaction` (line 73). The `catch` at line 103 calls `markActivePaymentFailed`, which sets `PaymentStatus.FAILED` and returns the application to `DRAFT` (lines 139-167).
- **What an attacker does:** No attacker is needed; a Postgres hiccup, pool exhaustion, or a constraint error between line 68 and line 97 is enough. Zarinpal has already captured the fee. The user lands on "پرداخت ناموفق بود", the dashboard offers "retry payment", `startPayment` creates a new row (`lib/actions/payment.ts:114`), and the user pays again. Nothing re-verifies the first authority.
- **Impact:** Double charge of 3,000,000 toman per affected user, and support cannot see it: the row says FAILED with `rawData.error` set to a Prisma message.
- **Evidence:** Compare with the facilities flow, which was fixed for this exact case: `lib/actions/facilities-payment.ts:383-397` records `VERIFIED` in its own transaction first and only then attempts submission.
- **Fix:** Split the `try`: on a verify exception keep the current failure path; on a transaction exception after a successful verify, log `payment_verification_persist_failed`, leave the row `INITIATED`, and return the user to a "pending" page. Add the same "already VERIFIED at gateway" re-verify on the next `startPayment` call, or reuse the facilities two-phase pattern. Add a test mirroring `facilities-payment-action.test.ts:126`.
- **Assumptions / how to verify:** Confirmed by reading; not reproduced. `tests/payment-callback.test.ts` has no case for "verify succeeds, transaction throws".

### P2. Facilities flow classifies every gateway error as "rejected"

- **Location:** `lib/payments/zarinpal.ts:39-40` throws `Zarinpal request failed: ...` for `!response.ok` **or** a non-empty `errors` field. `lib/actions/facilities-payment.ts:80-84` maps any message with that prefix to `"failed"`. Lines 367-380 then set the attempt to `FAILED` (or `CANCELLED`) and return the application to draft.
- **What an attacker does:** Again no attacker: Zarinpal (or a proxy in front of it) answering the verify call with an HTTP 500/502/503 and a JSON body is enough. `response.json()` succeeds, the prefix matches, and a payment that the bank captured is recorded as rejected. Only a non-JSON body (SyntaxError) or a timeout reaches the `"pending"` branch.
- **Impact:** Same as P1: the user is told to pay again, and the earlier authority is never re-verified. The `TIMED_OUT` guard on line 369 does not help because the attempt is `REDIRECT_READY` at this point.
- **Evidence:** `zarinpal.ts:37-40`; `facilities-payment.ts:80-84,367-380`. `tests/facilities-payment-action.test.ts:167` covers "cannot be reached" (network) but not "reachable, returns 5xx JSON".
- **Fix:** In `postZarinpal`, throw a distinct error class for `response.status >= 500` and for network/timeout, and reserve the "rejected" classification for a 2xx/4xx body whose `errors.code` is a documented Zarinpal rejection (for example -51, -53, -54). Keep `PENDING` for everything else so the 20-minute stale re-verify (line 226) picks it up.
- **Assumptions / how to verify:** Zarinpal's exact status codes on internal errors were not verified offline; the fix is safe regardless.

### P3. Stale re-verify can close an attempt whose bank session is still open

- **Location:** `lib/actions/facilities-payment.ts:226` (attempt older than 20 minutes with an authority is re-verified), `:273-280` (a `"failed"` outcome marks it FAILED), `:356-361` (a later callback for a non-open attempt is only logged: `facilities_callback_for_terminal_attempt`).
- **What an attacker does:** The applicant opens the payment in tab A, sits on the bank page for more than 20 minutes, opens the wizard in tab B and presses pay. Tab B's re-verify asks Zarinpal, which answers "not paid" (a rejection, so `"failed"`), closes the attempt and returns the application to draft. The applicant then completes the payment in tab A. Zarinpal captures it and redirects to the callback, which finds a terminal attempt and returns `failed`. The applicant pays a third time via the new attempt.
- **Impact:** A real charge with no matching verified row and no automated reconciliation; only a `warn` log. Money lands in the merchant account with no application to attach it to.
- **Evidence:** The three line ranges above; `STALE_PAYMENT_ATTEMPT_MS` at `:28`.
- **Fix:** When the callback hits a terminal attempt with `gatewayStatus === "OK"`, still call `verifyZarinpalPayment`; if it succeeds, record `VERIFIED` on that attempt and write an audit row flagged for manual review, rather than discarding it. Alternatively, on stale re-verify, treat a "not paid" answer as `PENDING` rather than `FAILED` until the gateway session has definitely expired.
- **Assumptions / how to verify:** Depends on Zarinpal's StartPay session lifetime being 20 minutes or longer, which could not be verified offline. If Zarinpal expires the session sooner, this collapses into P2.

### P4. Legacy callback: no lock, duplicate notifications, and a retry path that leaves the old session payable

- **Location:** `app/api/payment/callback/route.ts:28-47` (plain `findUnique`, no lock), `:73-97` (unconditional history insert), `:114-118` (SMS). `lib/actions/payment.ts:95-106` marks the previous `INITIATED` payment `FAILED` on retry, but the callback never checks for an already-verified sibling before verifying (`route.ts:41` only short-circuits when *this* row is VERIFIED).
- **What an attacker does:** Two concurrent deliveries of the same callback (browser refresh plus Zarinpal retry) both pass the `VERIFIED` check, both verify (the second gets Zarinpal code 101 and succeeds), both insert a `statusHistory` row and both send the user and admin SMS. Separately, a user who starts payment twice keeps two live gateway sessions; both callbacks verify, producing two VERIFIED rows for one application.
- **Impact:** Duplicate SMS cost and duplicate audit rows; in the second case a genuine double charge the user caused themselves, with no warning.
- **Evidence:** File lines above. The facilities flow does this correctly with `lockFacilitiesPayment` (`facilities-payment.ts:105-108`).
- **Fix:** Wrap the status read and update in an interactive transaction with an `update` on the payment row first (the pattern at `facilities-payment.ts:105-108`), and use `updateMany({ where: { id, status: INITIATED } })` so only one caller proceeds to history and SMS. In the callback, refuse to verify if the application already has a VERIFIED payment.
- **Assumptions / how to verify:** Confirmed by reading; concurrency not reproduced.

### P5. SMS senders are registered server actions

- **Location:** `lib/actions/payment.ts:1` (`"use server"`), `:177` (`notifyAdminOfSubmission`), `:194` (`notifyUserOfSubmission(mobile, applicationId)`). Only server code imports them (`app/api/payment/callback/route.ts:6`); the client component `components/application/FinalPaymentStep.tsx:4` imports `startPayment` from the same module.
- **What an attacker does:** POST to any page with a `Next-Action` header carrying the action ID of `notifyUserOfSubmission` and a body of `[ "09xxxxxxxxx", "x" ]`. Every call sends one paid SMS to any number with no login and no rate limit.
- **Impact:** SMS budget drain and spam sent under the platform's name. Severity is Low because Next 16 salts action IDs with a per-build key (`node_modules/next/dist/build/webpack-config.js:426`) and only client-referenced actions ship in the browser bundle, so the ID is not guessable from source.
- **Evidence:** Lines above; `lib/sms/messages.ts:28-35` accepts any `to`.
- **Fix:** Move both functions to a non-action module (for example `lib/payments/notifications.ts`) and import them from the callback route. Two-line change, closes the surface regardless of ID secrecy.
- **Assumptions / how to verify:** Whether the tree-shaken client bundle still contains the unused action's ID was not checked against a production build; grep the built `.next/static` for the manifest entry after `next build`.

### P6. Legacy verify uses the compile-time constant, not the stored amount

- **Location:** `app/api/payment/callback/route.ts:68-71` verifies with `PAYMENT_AMOUNT_TOMAN`; the row stores `amountToman` (`lib/actions/payment.ts:117`) but it is never read back.
- **What an attacker does:** None. A fee change deployed while a payment is in flight makes the verify amount differ from the requested amount; Zarinpal answers -50 and the captured payment is marked FAILED (P1 path).
- **Impact:** Paid-but-failed during any fee change. The facilities flow already does this right (`facilities-payment.ts:365` uses `payment.amountToman`).
- **Fix:** `amountToman: payment.amountToman` on line 69.

### U4. Admin multipart routes parse the body before authentication

- **Location:** `app/api/admin/submissions/certificate/route.ts:11` and `app/api/admin/submissions/status/route.ts:7` call `request.formData()` first; the session check happens inside `replaceValidationCertificate` (`lib/actions/admin.ts:221`) and `changeSubmissionStatus`.
- **What an attacker does:** Unauthenticated POSTs of nginx-limit-sized bodies to these two routes; each is fully buffered before the 401.
- **Impact:** Cheap memory pressure without a login. Bounded by nginx, so Low.
- **Fix:** Call `requireSession("admin")` (or the permission helper) before `formData()`, as `app/api/uploads/route.ts:14-15` does.

### U5. ZIP members are allow-listed by extension only

- **Location:** `lib/facilities-files/verification.ts:244-251` checks `path.extname(baseName)` against `ZIP_MEMBER_ALLOWED_EXTENSIONS`; member bytes are never inspected.
- **What an attacker does:** Put an executable or a nested archive inside the ZIP under `scan.pdf`. The nested-archive rule is bypassed by name.
- **Impact:** Low. clamd scans archive contents by default, so the file is still virus-checked, and members are never extracted on the server. The rule exists to stop admins receiving archives-in-archives, and that intent is not enforced by content.
- **Fix:** For stored (method 0) members, and for deflated members up to a small size cap, run the existing magic-byte detector on the first bytes of the member and require it to match the extension. Reuse `readZipText`'s bounded `inflateRawSync`.

### P7. Production merchant ID remains in git history

- **Location:** a `git log -S` for the merchant ID (prefix redacted here) returns `859c20f`, `c18ff2b` (2026-05-07) and `54e721c` (the prior audit, which quotes it). The working tree is clean of it.
- **Impact:** Low. Zarinpal v4 has no secret key; the merchant ID is sent in every payment request and lets a third party create payment requests that credit this merchant, which is a nuisance rather than a loss.
- **Fix:** Rewrite history only if the repository is or becomes shared outside the team; otherwise record the exposure and rotate the merchant ID at Zarinpal if their panel allows.

## 4. Re-check of the 2026-09-15 audit claims

| Prior | Status now | Note |
|---|---|---|
| P0 fake payments blocked | Still holds | Confirmed end-to-end in both flows. |
| P1 success screens trust URL | Fixed | `app/payment/return/page.tsx:19-31` reads the row; `lib/facilities/payment-notice.ts` derives the banner from DB state. |
| P2 SMS helpers as server actions | Still open | See P5. |
| P3 stuck/unrecoverable payments | Facilities fixed, legacy open | Facilities now has two-phase verify, stale re-verify and `paid-unsubmitted` recovery; legacy still fails a captured payment (P1). New edge cases in P2/P3. |
| P4 no gateway timeout | Fixed | `lib/payments/zarinpal.ts:53` uses `AbortSignal.timeout`. |
| P5 legacy callback no lock | Still open | See P4. |
| P6 `APP_URL` default | Fixed | `lib/app-url.ts` throws when unset. |
| Merchant ID in `DEPLOYMENT.md` | Fixed in tree, present in history | See P7. |
| U1 path traversal | Fixed | `LEGACY_UPLOAD_FIELD_KEY_PATTERN` plus root check at `lib/uploads/storage.ts:130-143`. |
| U2 ports on all interfaces | Fixed | `docker-compose.yml:24,70` bind `127.0.0.1`. |
| U3 legacy unscanned / MIME trusted | Partly fixed | Content is verified and scanned, but scanning is fail-open when unconfigured (U2 above). `nosniff` and type allow-list on legacy downloads are in place. |
| U4 SheetJS CVEs, parse before ownership | Still open | See U1. Version and ordering unchanged. |
| U5 ZIP members not allow-listed | Fixed by extension | See U5 for the remaining content gap. |
| U6 certificate 1 MB action limit | Fixed | Route handler at `app/api/admin/submissions/certificate/route.ts`. |
| U7 no scan concurrency limit | Fixed | Semaphore at `scanner.ts:169-171`. |
| U8 legacy uploads never deleted | Fixed | `lib/uploads/replace.ts`. |
| U9 reaper wipes on empty DB | Fixed | Tripwire at `lib/facilities-files/orphans.ts:27-29`. |
| U10 whole-file reads, buffer copies | Still open | Reads are bounded at 25 MiB; copies contribute to U3. |
| U11 nginx location covers one route | Fixed in example | `nginx-facilities-upload.example.conf:7`; production config not inspected. |
| U12 raw errors, no per-slot profile allow-list | Partly fixed | Template route returns generic errors; profile-files only pins the identity package to ZIP (`profile-files/route.ts:26-33`). Functional rather than security. |

## 5. What is already done well

- Server-side Zarinpal verification with the amount pinned from the database row (facilities) and the authority matched to the stored row in both flows; the browser's `Status` value never confirms a payment.
- Facilities payment state machine: row locks via update-in-transaction, idempotent re-delivery, a separate "record VERIFIED first" transaction, stale-attempt recovery, and DB-backed success banners. Seventeen action tests cover forged, duplicate, delayed, timed-out and correction scenarios.
- Gateway client: bounded timeout, bounded retries, sanitized error payloads, merchant ID validated and never logged.
- `APP_URL` and `SESSION_SECRET` have no defaults; HS256 is pinned in `jwtVerify`; every applicant lookup is scoped by `userId`; admin permissions are re-read from the database on each download.
- Facilities storage: opaque UUID keys, strict key regex plus root check, `wx`/`0o600` writes, `0o700` directories, atomic link-then-unlink promotion, staging/ready separation, fail-closed clamd INSTREAM client with bounded replies, quota trigger in Postgres, tombstoned deletion, tripwired orphan reaper.
- Verification: magic bytes and structure for PDF, JPEG, PNG, WebP, HEIF, CFB; bounded ZIP metadata parsing with traversal, encryption, ratio and entry-count checks; bounded inflate for Office XML checks; sanitized `Content-Disposition`; `nosniff` and `no-store` on every download; integrity hash check before serving.
- Legacy path now shares the verifier, validates `fieldKey` against an allow-list, replaces instead of accumulating, and refuses to serve browser-declared types inline.
- Security headers, loopback-only ports, non-root container user, memory limit, migration credentials separated from runtime credentials.

## 6. Prioritized action list

1. **U1** Upgrade SheetJS to 0.20.3 from the vendor registry, read workbooks with `bookSheets: true`, and move the binding/ownership check above the verifier in `application-files/route.ts`.
2. **U2** Make the legacy scan fail closed (remove the unavailable-scanner early return) and assert scanner availability at startup in production.
3. **P1** Split verify and persist in the legacy callback so a post-verify database failure leaves the payment recoverable instead of FAILED; add the missing test.
4. **P2** Classify gateway 5xx and malformed responses as pending, not rejected, in `postZarinpal` / `classifyVerificationFailure`.
5. **P3** Verify, record and flag callbacks that arrive for terminal attempts instead of discarding them.
6. **U3** Reject oversized `Content-Length` before `formData()`, add a per-user in-flight and hourly upload limit, and stop re-copying the buffer.
7. **P4** Lock the legacy callback and refuse to verify when the application already has a VERIFIED payment.
8. **P5** Move the two SMS helpers out of the `"use server"` module.
9. **P6, U4, U5, P7** Use `payment.amountToman` in the legacy verify; authenticate before parsing admin multipart bodies; content-check ZIP members; decide on history rewrite for the merchant ID.

**Verdict: NOT READY to accept live payments and uploads, because any self-registered user can hang or crash the only application container through the unpatched SheetJS parser before any ownership check, and the legacy upload path silently skips malware scanning when clamd is absent; the payment flows themselves block fake payments but the legacy callback can still double-charge after a mid-transaction failure.**
