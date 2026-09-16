# Sana Platform: Architecture and Security Audit

Date: 2026-09-15
Branch: `master` at commit `43ffb26`
Scope: full application inspection before the next production deployment, focused on
security (payments first), scalability, performance, and maintainability.

## 1. Executive summary

The application is in better shape than most projects at this stage. Payments cannot be
faked: every gateway callback is verified server-side with Zarinpal, the amount is pinned
from the database, the gateway authority must match the stored row, and duplicate
callbacks are idempotent. Authorization is consistent, every applicant lookup is scoped
to the owner, admin roles are read from the database on each request, and the facilities
private-file pipeline is well designed.

However:

- There are **3 high-severity security holes** (OTP brute force, path traversal in legacy
  uploads, and network ports published on all interfaces).
- **Master is currently red**: 4 failing tests and 4 TypeScript errors.
- The server layout (single container, no memory limit, no health endpoint, unbounded
  admin lists, uncapped legacy export) has a few cheap fixes worth doing before load grows.
  It does not need a worker, object storage, or multi-replica work at this stage (see 6).

### Build health at HEAD

| Check | Result |
|---|---|
| `tsc --noEmit` | 4 errors (`FacilitiesApplicationWizard.tsx:247`, `tests/facilities-files.test.ts:221,224,227`) |
| `eslint .` | 0 errors, 2 warnings (one is a duplicate from the stray `.claude/worktrees/` copy) |
| `vitest run` | 4 tests fail in `tests/facilities-application-wizard.test.tsx`; 12 more fail only because a stray repo copy under `.claude/worktrees/` is picked up |
| Uncommitted work | Admin UI polish, +561/−63 across 5 files (`app/admin/page.tsx`, `app/globals.css`, `components/admin/FacilitiesConfiguration.tsx`, `components/layout/AppShell.tsx`, new `components/layout/AppNav.tsx`). Not related to the failures. |

## 2. Security findings

Severity scale: **High** = exploitable now with real impact; **Medium** = exploitable with
preconditions or limited impact; **Low** = hardening.

### 2.1 Payments

| # | Severity | Finding | Location |
|---|---|---|---|
| P0 | OK | Fake payments are blocked. Verification is server-side, amount is pinned, authority must match the stored row, re-callbacks are idempotent, facilities flow uses row locks. Tests cover forged authority, duplicate callback, delayed callback. | `app/api/payment/callback/route.ts`, `lib/actions/facilities-payment.ts:261-312`, `lib/payments/zarinpal.ts` |
| P1 | Medium | Success screens trust the URL. `/payment/return?status=success` and `/dashboard/facilities-application?payment=success` render a "payment confirmed" banner from the query string, even for a draft. No data changes, but users and support staff can be misled. | `app/payment/return/page.tsx:10`, `components/facilities/FacilitiesApplicationWizard.tsx:102,209,448` |
| P2 | Medium | Two SMS helpers are exposed as public server actions because they live in a `"use server"` file. `notifyUserOfSubmission(mobile, applicationId)` sends an SMS to any number with no login and no rate limit; `notifyAdminOfSubmission` spams the admin alert number. Action IDs are derived from file path and export name, so "not referenced from the client" is not protection. Fix: move both into a non-action module (they are only called from the callback route). `verifyFacilitiesPaymentCallback` is also exported from an action file, but it has the same surface as the already-public callback route and is not an extra hole. | `lib/actions/payment.ts:176,193` (callers: `app/api/payment/callback/route.ts:116-117`) |
| P3 | Medium | Stuck payments have no recovery path. In the facilities flow, if the post-verify transaction fails (database error, readiness check), the whole transaction rolls back, so the attempt is left in `REDIRECT_READY` with a spent authority, the error is swallowed without logging, and the user's next "pay" click redirects them to Zarinpal with that spent authority. Attempts stuck in `INITIATED`/`TIMED_OUT` (start-request failure) return "pending" forever. The legacy flow does the opposite: any verify error, including a network blip after Zarinpal captured the money, marks the payment `FAILED` and returns the application to draft. No job re-verifies `PENDING`/`TIMED_OUT` attempts and Zarinpal's unverified endpoint is never used. | `lib/actions/facilities-payment.ts:308-311`, `app/api/payment/callback/route.ts:103-112` |
| P4 | Low | Zarinpal `fetch` has no timeout; a hung gateway holds the request open for minutes. The SMS client already uses `AbortSignal.timeout`. | `lib/payments/zarinpal.ts:24-57` |
| P5 | Low | Legacy callback has no lock, so two concurrent callbacks both verify, both write status history, and both send SMS. Facilities flow handles this correctly. | `app/api/payment/callback/route.ts:41-97` |
| P6 | Low | `APP_URL` falls back to `http://localhost:3000`; if unset in production the gateway callback URL is silently wrong. | `lib/actions/facilities-payment.ts:44`, `lib/actions/payment.ts:112` |

**Gateway credentials.** Zarinpal v4 uses only a merchant ID and has no secret key, so the
credential surface is small. Findings:

- The production merchant ID is committed to git in `DEPLOYMENT.md` (lines 69, 387, 415,
  438) and `openspec/changes/implement-zarinpal-payment-gateway/design.md:84`. Scrub it.
- `.env`, `.env.runtime`, `.env.production.example` are git-ignored and never appear in
  history. Good.
- On the server, `.env.runtime` is the only protection. It must be owned by root or the
  deploy user with mode `600`, and the app container must not be able to write it.
- The Ghasedak SMS API key is sent over **plain HTTP** (`GHASEDAK_BASE_URL=http://...`).
  Switch to HTTPS.
- The merchant ID is validated as a UUID and never logged or returned in errors. Good.

### 2.2 Authentication and sessions

| # | Severity | Finding | Location |
|---|---|---|---|
| A1 | **High** | No failed-attempt limit on OTP verification. A 6-digit code lives 2 minutes; wrong guesses cost nothing and are not counted; no per-IP limit. The admin login uses the same flow, so an attacker who knows an admin mobile can brute-force in parallel. Two concurrent correct verifies also both succeed because `consumedAt` is set after the compare. | `lib/actions/auth.ts:165-210`, `prisma/schema.prisma` model `OtpCode` |
| A2 | Medium | OTP requests are limited per mobile only (90 s cooldown, 5/hour). No per-IP or global cap, so iterating numbers yields unlimited paid SMS and unbounded `OtpCode` growth. | `lib/actions/auth.ts:49-76` |
| A3 | Medium | Admin mobile enumeration: the "admin access not active" 403 is returned before rate limiting runs. | `lib/actions/auth.ts:93-105` |
| A4 | Medium | Sessions are stateless HS256 JWTs with a 30-minute lifetime, no `jti`, no session table. Logout only deletes the cookie; a stolen token works until expiry. Admin deactivation is honoured because admin actions re-read `Admin.active`. `jwtVerify` does not pin `algorithms`. | `lib/auth/session.ts:24-82` |
| A5 | Medium | Seed script hardcodes 3 real admin mobiles and upserts them with `role: SUPER_ADMIN, active: true` on every run, silently undoing any deactivation or demotion in production. | `prisma/seed.ts:19,202-246` |
| A6 | Medium | No security headers anywhere (note: the CSP added in hardening phase 3 uses `script-src 'unsafe-inline'` because Next.js emits inline RSC scripts, so it does not stop reflected XSS; its value is framing, object, and third-party-origin control): no HSTS, CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy`. Documented nginx block listens on port 80 only; TLS termination is not documented. | `next.config.ts`, `DEPLOYMENT.md:135-152` |
| A7 | Low | Logout is a GET, so any third-party page can log users out. | `app/api/auth/logout/route.ts:16` |
| A8 | Low | OTP codes are logged in non-production; `secure` cookie and scanner passthrough also depend on `NODE_ENV`. A production host started without `NODE_ENV=production` degrades silently. | `lib/sms/index.ts:12-19`, `lib/auth/session.ts:36` |
| A9 | Low | Timing oracle: verify short-circuits without bcrypt when no pending OTP exists. | `lib/actions/auth.ts:175` |

Done well: `crypto.randomInt` codes, bcrypt-hashed storage, previous codes invalidated on
re-request, purposes bound so a user OTP can never mint an admin session,
`SESSION_SECRET` required to be 32+ characters with no fallback, cookie is `httpOnly`,
`sameSite=lax`, `secure` in production. Every exported server action except P2 calls
`requireSession`. Every applicant lookup is scoped by `userId`. Permission matrix is
evaluated from the database role, not the JWT, so `ENTRY_VIEWER` cannot download,
export, or mutate. All zod schemas strip unknown keys.

### 2.3 File uploads and storage

| # | Severity | Finding | Location |
|---|---|---|---|
| U1 | **High** | Path traversal in the legacy upload route. The client-supplied `fieldKey` is joined into the disk path with no validation: `path.join(uploadDir, applicationId, fieldKey)`. A logged-in user with an editable application can send `fieldKey=../../../app/public` and write a random-named file (allow-listed extension only) anywhere the `node` user can write, including web-served directories. The facilities storage already validates keys and asserts `startsWith(root)`. | `app/api/uploads/route.ts:12,29`, `lib/uploads/storage.ts:72` |
| U2 | **High** | Docker Compose publishes app port `3000:3000` and Postgres `55433:5432` on all host interfaces. Anyone reaching the host bypasses nginx's `client_max_body_size` and can POST multi-gigabyte bodies; every upload route calls `request.formData()` first, which buffers the whole body in memory before any size check. Postgres is one password away from the internet. No firewall rules are documented. | `docker-compose.yml:22-25,50`, `app/api/uploads/route.ts:10`, `app/api/facilities/*-files/route.ts` |
| U3 | **High** | Legacy (company-registration) uploads are never virus-scanned and trust the browser's MIME type, which is stored and echoed back as `Content-Type` to admins. Admins can receive macro documents or exploit PDFs. `X-Content-Type-Options: nosniff` is missing on legacy downloads. The facilities scanner and magic-byte verifier are generic and reusable. | `lib/uploads/storage.ts:30-44,81`, `app/api/files/[id]/route.ts:48-53` |
| U4 | Medium | Pinned `xlsx@0.18.5` carries CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS). Untrusted workbooks up to 25 MiB are parsed synchronously on the event loop, and in the application-files route the parse runs before the ownership check. | `lib/facilities-files/verification.ts:131,223`, `app/api/facilities/application-files/route.ts:21-23`, `package.json` |
| U5 | Medium | ZIP members are not allow-listed and nested archives are accepted. Structure checks (bounds, ratio, entry count, traversal, encryption) are excellent, but a `.exe` or `.zip` inside an accepted ZIP passes. Client requirement notes say some slots are images-only. | `lib/facilities-files/verification.ts:236-301` |
| U6 | Medium | The validation-certificate upload is a server action, so it hits Next's default 1 MB action body limit and fails with an opaque error above it while the UI advertises 20 MB. Move it to a route handler or raise `serverActions.bodySizeLimit`. Separately, `lib/actions/facilities-admin.ts` and `components/facilities/FacilitiesConfigurationForm.tsx` are dead code (the form is rendered nowhere; the admin UI uses `facilities-config.ts` and the questionnaire route); `uploadQuestionnaireTemplate` there bypasses the owned-file lifecycle. Delete both files rather than fix them. | `lib/actions/admin.ts:184`, `lib/actions/facilities-admin.ts`, `components/facilities/FacilitiesConfigurationForm.tsx`, `next.config.ts` |
| U7 | Medium | No scan concurrency limit. Each upload opens its own clamd socket; clamd's default `MaxThreads` is about 10, so 20+ simultaneous uploads time out, become `UNAVAILABLE`, and the user gets 503. clamd's default `StreamMaxLength` (25 M) can also reject a file at exactly the app's 25 MiB limit. No per-user or per-IP upload rate limit exists. | `lib/facilities-files/scanner.ts:142`, `lib/facilities-files/lifecycle.ts:30-39` |
| U8 | Medium | Legacy uploads have no count limit and are never deleted; every "change file" adds a 20 MiB row and disk object. The shared volume means legacy disk fill causes facilities writes to fail. | `app/api/uploads/route.ts:19-39` |
| U9 | Medium | Orphan reaper loads all storage keys into memory and deletes anything not in the set. Pointed at an empty or restored-old database, one run wipes every object older than 24 h. | `scripts/reconcile-facilities-files.ts:64-66` |
| U10 | Low | Downloads read the whole file, hash it, and copy it per request; no `Range`. Uploads copy the same buffer about 4 times (roughly 125 MiB per in-flight 25 MiB upload). | `app/api/files/[id]/route.ts:40-48`, `lib/facilities-files/lifecycle.ts:23`, `service.ts:136` |
| U11 | Low | nginx 26 M location only covers `/api/facilities/application-files`; `profile-files` and the admin questionnaire route fall to the site-wide 25 M, which rejects a valid 25 MiB file after multipart overhead. Extend the location match to all three routes. | `operations/facilities-m9/nginx-facilities-upload.example.conf`, `DEPLOYMENT.md:140` |
| U12 | Low | Raw error messages (may include filesystem paths) returned to admins from the template route. Profile-files route lacks a per-slot type allow-list. | `app/api/admin/facilities/questionnaire-templates/route.ts:36`, `app/api/facilities/profile-files/route.ts:20` |

Done well in facilities storage: opaque UUID keys, strict regex plus root check, `open(..., "wx", 0o600)`,
atomic link-then-unlink promotion, `0o700` directories, staging/ready separation, fail-closed
scanner with bounded responses, magic-byte and structure verification for PDF/JPEG/PNG/HEIF/CFB,
sanitized `Content-Disposition`, `nosniff` and `no-store` on facilities downloads, owner-bound
bindings, `PASSED` lifecycle check before serving, 404 instead of 403 to avoid ID oracles,
every download audited, idempotency keys, database-trigger quota, tombstone deletion,
advisory-locked batched reconciler.

## 3. Scalability and performance findings

| # | Impact | Finding | Location |
|---|---|---|---|
| S1 | High | Admin lists are unbounded `findMany` with six `contains` OR-branches and no pagination. At 50k applications each admin page load seq-scans, hydrates every row with a payments sub-select, and renders a 50k-row table. One admin refresh can starve the connection pool. The audit page already implements correct cursor pagination to copy. | `lib/actions/admin.ts:63-84`, `lib/actions/facilities-review.ts:141-162`, `lib/actions/facilities-audit.ts:70` (good example) |
| S2 | High | Legacy export loads the whole table with includes into one in-memory SheetJS workbook, synchronously. One large export can OOM the single container (no memory limit) and blocks the event loop for everyone. Facilities export pre-counts and caps rows but still holds about 3 copies in RAM. | `lib/export/submissions.ts:53-75`, `lib/export/facilities.ts:117-134,257-266` |
| S3 | Medium | SMS sends (10 s default timeout), exports, and virus scans run inside the request and hold a database connection. Correction SMS has `PENDING`/`FAILED` status columns and an admin "retry" action, but no automatic retry. For this app's volume a background worker is not justified; the cheap fix is to fire-and-forget non-critical SMS after the transaction commits and keep the existing admin retry. | `lib/actions/auth.ts:128`, `lib/actions/admin.ts:153`, `lib/actions/payment.ts:187,194`, `lib/actions/facilities-review.ts:73` |
| S4 | Medium | Wizard page load runs one write transaction per draft application on every GET, with per-officer updates inside a loop, then re-reads everything with a wide include. Two open tabs race on the same rows. | `lib/actions/facilities-application.ts:68-73`, `lib/facilities/submission.ts:111-121` |
| S5 | Medium | Missing indexes: `Application.userId` (queried on every payment start and dashboard load), `Payment.applicationId`, `Application.createdAt` (admin sort), `FacilitiesApplication.updatedAt` (review list sort). `FacilitiesApplication` has 9 secondary indexes, several likely unused, on a write-heavy table. | `prisma/schema.prisma` |
| S6 | Medium | Audit and OTP tables grow forever. `FacilitiesAuditLog` is written on every audit page view, download, and export, carries 6 indexes, and stores full user-agent strings. No retention job for `OtpCode` or audit rows. A monthly delete of consumed OTPs and audit rows older than the legal retention period is enough; partitioning is not. | `lib/actions/facilities-audit.ts:75`, `prisma/schema.prisma` |
| S7 | Low | Single-host storage on one Docker volume with hard-link promotion. A second app replica cannot serve files written by the first. Not a problem until a second replica is actually planned; the storage interface is already clean enough to swap for object storage then. | `lib/facilities-files/storage.ts:72`, `docker-compose.yml:24` |
| S8 | Medium | Connection pool is implicit (Prisma default, no `connection_limit`). Fine for one replica; hits Postgres `max_connections=100` once a second replica or the migration profile runs alongside under load. | `lib/db.ts`, `.env.runtime.example:3` |
| S9 | Medium | Container: not `output: "standalone"`, ships full `node_modules` plus TypeScript sources, `tsx` is a runtime dependency, no `mem_limit`, healthcheck hits `/` (full SSR) instead of a cheap `/api/health` with a DB ping. Build depends on a 52 MB `prisma-engine-export.tar.gz` that is git-ignored and must first be produced with `Dockerfile.prisma-export`; a fresh clone that skips that step cannot build, and a Prisma version bump breaks silently if the tarball is stale. | `Dockerfile:22-25,40-58`, `docker-compose.yml`, `next.config.ts` |
| S10 | Low | Client bundle is mostly clean (xlsx, fflate, jalaali stay server-side). The full Iran cities JSON ships to the browser via the profile form, and the wizard page serializes the entire submission include as props with `JSON.parse(JSON.stringify(data))`. | `components/facilities/CompanyProfileForm.tsx:8`, `app/dashboard/facilities-application/page.tsx:9` |
| S11 | Low | Logger always includes full stack traces; no request-id correlation; no log-level env var. | `lib/logger.ts` |

## 4. Maintainability findings

| # | Finding | Location |
|---|---|---|
| M1 | Master is red: 4 wizard tests fail and 4 TypeScript errors exist at HEAD. The stray `.claude/worktrees/` copy is not git-ignored and breaks `vitest` with 12 extra failures. | `tests/facilities-application-wizard.test.tsx`, `vitest.config.ts`, `.gitignore` |
| M2 | Two parallel systems. Legacy validation (JSON columns, `lib/uploads`, `lib/audit/log.ts`, `lib/export/submissions.ts`) and facilities (normalised tables, `lib/facilities-files`, `lib/audit/facilities.ts`, `lib/export/facilities.ts`) duplicate audit, files, payments, exports, and status history (about 1,800 lines in `lib/` alone, plus components). Every cross-cutting fix must be done twice. `lib/actions/facilities-admin.ts` is a dead, unvalidated duplicate of `facilities-config.ts` (see U6). | `lib/`, `components/` |
| M3 | Config: 27 `process.env` reads across 15 files, no central validated config module, inline defaults that hide misconfiguration in production (`APP_URL`, `GHASEDAK_BASE_URL`). | `lib/actions/facilities-payment.ts:44`, `lib/uploads/storage.ts:26`, others |
| M4 | Test coverage is weighted toward pure functions and route handlers. No tests for `lib/actions/facilities-company.ts` (155 lines of profile rules), `lib/actions/facilities-admin.ts`, `lib/utils/jalali.ts`. The 511-line `lib/facilities-files/service.ts` is exercised by only 3 test files. Database integration tests are manual shell scripts. | `tests/`, `prisma/tests/` |
| M5 | Docs drift: `DEPLOYMENT.md` is 1,400 lines and labels milestones M2 through M9 "(not deployed)" although M6 to M9 have landed on master. Readers cannot tell what production runs. `openspec/changes/` holds 15 change folders (492 KB) next to an `archive/` folder that should hold them after merge. Stray `saana.docx` at repo root. | `DEPLOYMENT.md:283,323,346,1179,1211,1256,1304` |
| M6 | Uncommitted admin UI polish (+561/−63 across 5 files) should be committed on its own before any fix work starts. | `git status` |

## 5. What is done well

- Server-side payment verification with pinned amounts, authority matching, idempotent
  callbacks, row locks, and a documented payment state machine.
- Session guard on every action, route, and page; owner-scoped lookups everywhere;
  database-backed role checks; zod schemas that strip unknown fields.
- Facilities file pipeline: fail-closed scanner, magic-byte verification, safe storage
  names, staging/ready separation, quotas, tombstones, audited downloads.
- Restricted runtime database role separate from the migration owner; migrations are an
  explicit Compose profile.
- Structured JSON logging with mobile masking; no OTPs or secrets logged in production.
- Cursor-paginated audit page and row-capped facilities export as templates for the rest.
- SMS client has a bounded timeout; Zarinpal client has bounded retry.

## 6. Proposed work list

### Right-sizing

This is a single-host Next.js app behind nginx with one Postgres. The facilities export
already caps itself at 5,000 applications, and nothing in the code or the runbook suggests
multi-replica deployment or tens of thousands of applications. The work list below is
therefore limited to fixes that change the security posture or remove a concrete failure
mode today. The following were considered and deliberately **not** scheduled:

- Background job worker / outbox (S3): fire-and-forget SMS plus the existing admin retry is enough.
- Object-storage abstraction or multi-replica storage (S7): revisit only if a second replica is planned.
- Table partitioning (S6): a periodic delete job is sufficient.
- Server-side session table / revocation (A4): tokens live 30 minutes; pin `algorithms: ["HS256"]` and stop there.
- HTTP `Range` support and zero-copy downloads (U10): files are at most 25 MiB.
- Request-id correlation and log-level env var (S11): nice to have, not a blocker.
- `output: "standalone"` image (S9): smaller image, no security or correctness change; do it opportunistically.
- Central `lib/env.ts` (M3): worth doing, but only the `APP_URL` and `GHASEDAK_BASE_URL` defaults are actually dangerous; remove those two defaults first.

### Phases

Each phase is independently deployable and should be reviewed and tested on its own.

| Phase | Name | Items | Outcome |
|---|---|---|---|
| 1 | Green master | M1, M6 | Commit the UI polish; fix the 4 tests and 4 type errors; add `.claude/` to `.gitignore` and to the vitest/eslint exclude lists. |
| 2 | Close the High findings | U1, U2, A1 | `fieldKey` allow-list plus `startsWith(root)` check in legacy uploads; Compose ports bound to `127.0.0.1`; OTP attempt counter (e.g. 5 wrong tries burns the code) and atomic consume via `updateMany({ where: { id, consumedAt: null } })`. |
| 3 | Payment and auth hardening | P1, P2, P3, P4, P6, A2, A3, A6, A7, credentials | Success screens read the payment row; SMS helpers moved out of the action file; stuck facilities payments logged and admin-visible; Zarinpal `fetch` gets `AbortSignal.timeout`; `APP_URL` and `GHASEDAK_BASE_URL` required with no default and SMS over HTTPS; per-IP cap on OTP request/verify; admin check moved after rate limiting; security headers in `next.config.ts`; logout POST-only once the stale-cookie redirect case is handled another way; merchant ID scrubbed from `DEPLOYMENT.md` and openspec; server `.env.runtime` permissions documented; seed script stops force-reactivating admins. |
| 4 | Upload hardening | U3, U4, U5, U6, U7, U8, U12 | Legacy uploads run through the existing facilities verifier and scanner, `nosniff` on legacy downloads; SheetJS upgraded from the vendor registry and ownership check before parse; ZIP member extension allow-list; small scan semaphore (e.g. 4 concurrent); legacy per-field replace-or-cap; dead `facilities-admin.ts` and `FacilitiesConfigurationForm.tsx` deleted; template route returns generic errors. |
| 5 | Operations | U9, U11, S1, S2, S5, S6, S8, S9 (partial) | Reaper refuses to run when the `StoredFile` table is empty or the orphan set exceeds a threshold; nginx location covers all three upload routes; cursor pagination on the two admin lists using the audit page pattern; legacy export gets the same row cap as facilities; indexes on `Application.userId`, `Application.createdAt`, `Payment.applicationId`, `FacilitiesApplication.updatedAt`; monthly OTP/audit retention delete; explicit `connection_limit` in `DATABASE_URL`; `/api/health` with a DB ping and `mem_limit` in Compose. |
| 6 | Maintainability | M2, M4, M5 | Runbook gets a short "current production state" section at the top; merged openspec changes moved to `openspec/changes/archive/`; `saana.docx` removed; tests for `facilities-company.ts` and `jalali.ts`; written decision on retiring the legacy company-registration flow. |

## 7. Verification commands used

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint .
npx vitest run --exclude '.claude/**'
git grep -nE '<merchant-id-prefix>' -- . ':!*.example'   # prefix redacted on 2026-09-16
git log --all --diff-filter=A --name-only --pretty=format: | grep -E '^\.env'
grep -rn 'process\.env' lib app scripts | wc -l
grep -rn 'FacilitiesConfigurationForm\b' app components   # no importers: dead code
```
