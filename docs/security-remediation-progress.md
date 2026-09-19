# Security remediation progress and restart checkpoint

Updated: 2026-09-19. **Overall launch verdict: NO-GO. Phases0–13 COMPLETE locally.
Phase14 IN_PROGRESS; D4 approved by owner. Owner explicitly authorized sequential Phases7–20, without routine
phase pauses. Actual unresolved decisions, unavailable evidence and safety boundaries remain.**
R1/R2/R3/R4/R5/R6/R7/R8/R10/R12 locally VERIFIED_FIXED in their recorded scope. No production changes.
Earlier checkpoint wording is historical; the latest checkpoint controls.

## Authority and evidence

- Authorization now covers sequential Phases7–20. D1/D2/D3/D4 are settled; M9 remains open.
- [Master prompt](2026-09-18-security-remediation-master-prompt.md) contains full acceptance
  criteria; summaries below do not replace them.
- [Central closure report](2026-09-18-prelaunch-security-review.md) retains original history.
- [Design and decisions](security-remediation-2026-09-18/phase-0/design.md).
- [Evidence and replay guide](security-remediation-2026-09-18/phase-0/README.md).

## Phase register / complete finding coverage

Evidence environments for Phases0–6 are local disposable PostgreSQL16 and production-mode
localhost HTTP/browser, with controlled gateway/SMS tests. Phases7–9 are now locally verified in their own checkpoints; Phases10–20 remain.
For every NOT_STARTED phase, Changed files/Verification/Independent review are none;
migration details are proposals in the design and remain to be implemented/rehearsed.
Remaining-work item 1 maps to Phases 1–12 collectively; all other items map below.

| Phase | Review IDs/area | Scope | Acceptance | Status | Changed files | Verification | Independent review | Migration/rollback | Dependencies/blockers | Residual risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | All findings/design | Baseline, coverage, isolated evidence and proposed models | Coverage + safe reproducible baseline + agreed concrete design/scope | COMPLETE | Progress, design/evidence, central report, deployment qualification note | 308 tests; types/lint/build; 7 DB suites + synthetic recovery; R1–7/R9 evidence as qualified below | Design and evidence reviews, findings tracked below | No new migration; 24 existing migrations only in isolation | D1 decided; owner authorized proceeding with documented design | All vulnerabilities remain; no launch qualification |
| 1 | R2 | Payment coordination | Durable single obligation, safe uncertainty and recoverable capture | COMPLETE | Phase1 source-hashes.json | 326 tests;16 DB cases;5 process crashes;build/types/lint/browser | Two reviewers passed | Three additive migrations; compatible-writer rollback only | Phase0/D1 fulfilled locally; external provider qualification later | Locally VERIFIED_FIXED; no real provider finality claim |
| 2 | R1 | Cancellation/live state | Verified payment and later review state never regress; consistent history/intent | COMPLETE | Phase2 source-hashes.json and README | 341 tests;66 final delta;30 DB cases;5 process scenarios;build/types/lint/browser | Independent code/evidence reviews passed; findings fixed | No new schema/grants; retain Phase1 evidence and guarded writers | Phase1 checkpoint verified; Phase3 requires explicit continue | Locally VERIFIED_FIXED; provider/full-admin/full-journey qualification remains |
| 3 | R12 | Gateway contract | Only documented valid envelopes confirm; malformed/timeout unresolved | COMPLETE | Phase3 source-hashes.json/README | 413 tests;39 DB cases;5 process crashes;build/types/lint;390/1440 browser | Independent contract/code and evidence reviews approved | No schema/grants; preserve compatible writers and historical evidence | Phases1–2 hashes matched; live official contract checked | Locally VERIFIED_FIXED for new responses; actual sandbox/currency/finality and historical certification unqualified |
| 4 | R3 | OTP verification | At most five reservations and one live consume across processes | COMPLETE locally | phase-4/phase4-changed-files.json | 440/73;65 DB; process/browser/build/types/lint | Two critical reviewers approved after fixes | Additive limiter/helpers; pause old writers; compatible rollback | D3 approved; deployment qualification remains | VERIFIED_FIXED locally; launch NO-GO |
| 5 | R5 | OTP requests/SMS admission | Atomic90s/five-per-hour mobile+purpose/configured address limits across processes/restarts; bounded paid dispatch | COMPLETE | phase-5/phase5-changed-files.json/source-hashes.json |473/75 tests;89 real DB;8-process and crashes; browser; build/types/lint |Two critical reviewers approved after fixes |Additive intent/helper; drain auth writers; compatible rollback only |D3 approved; real SMS/proxy/images remain unqualified |VERIFIED_FIXED locally; overall launch NO-GO |
| 6 | R4 | Login CSRF | Foreign forms rejected; genuine HTTPS login works | COMPLETE | phase-6/source-hashes.json |531 tests/76 files;89 DB; TLS browser/process/build/types/lint |Two reviews approved |No schema/retention change; guarded rollback |Actual ingress still unqualified |VERIFIED_FIXED locally |
| 7 | R6 | Admin enumeration | Budgeted probes; uniform admitted response and no side-effect accounts | COMPLETE | phase-7/phase7-changed-files.json |549/78;97 DB; provider/timing/max-timeout/mobile-desktop/Origin/request browser;13 process scenarios;build/types/lint |Two critical reviewers approved after UI fixes |No schema/grants/retention; uniform compatible auth writers |Phase5 accounting/Phase6 Origin preserved |Local healthy timing evidence only; external qualification remains |
| 8 | R7 | Facilities failed replacement | Safe same/new-key retry, quota, old file and24h retention; migration rehearsal | COMPLETE locally | phase-8/phase8-changed-files.json |578/79;126 DB incl29R7; five file/five payment process scenarios; browser390/1440; migration/backfill/SQL/build/types/lint |Code and evidence reviewers approved |Additive committed lineage/repair/token migration; drain all writers, compatible-schema rollback |D2 fulfilled locally; real scanner/operations later |VERIFIED_FIXED locally; not launch qualification |
| 9 | R8 | Legacy replacement concurrency | One valid current object/reference; recoverable cleanup and stale-save protection | COMPLETE locally | phase-9/phase9-changed-files.json;119 source hashes |607/80;155 DB incl29 R8;4 file crashes;5 payment scenarios; browser390/1440;31-migration rollback/history; SQL/types/lint/build |Code and evidence reviewers approved |Additive binding/version/allocation/intent/repair; drain writers; compatible-schema rollback |Phase0/8 fulfilled; D4 untouched |VERIFIED_FIXED locally; no launch qualification |
| 10 | R10 | Required file integrity | Owned current available typed/scanned bytes; paid repair without recharge | COMPLETE locally | phase-10/source-hashes.json (133); evidence-hashes.json (105) |655/83;193 DB incl38R10; mobile/desktop;33 migrations;both rollback injections;build/types/lint |Code/evidence independently approved |Additive immutable verification and scoped editable snapshot functions; retain schema/evidence on rollback |D4 fulfilled locally; actual scanner/production still gated |VERIFIED_FIXED locally; NO-GO launch |
| 11 | R9 | Restricted maintenance and truthful outcomes | Safe OTP/file cleanup, explicit partial/failure, restart | COMPLETE locally | phase-11/source-hashes.json (145) |672/84;17 CLI tests; real facilities CLI;34 migrations/rollback;build/types/lint |Code and frozen evidence independently approved |Bounded OTP definer/cursors, no broad identity deletion; drain jobs and retain schema on rollback |Production scheduler/alerts remain gated |Local VERIFIED_FIXED; partial resweeps explicit; launch NO-GO |
| 12 | R11 | Admin transitions | Legal concurrent decisions and consistent certificates/history/SMS intent | COMPLETE locally | phase-12/source-hashes.json (162) |693/85;21 review DB cases;390/1440 browser;36 migrations;build/types/lint |Code and frozen evidence approved |Two additive migrations; compatible writers; retain schema |Real SMS qualification remains gated |Locally VERIFIED_FIXED; launch NO-GO |
| 13 | Session-reset issue | Session reset/logout | Valid GET preserved; protected logout; safe recovery | COMPLETE locally | phase-13/source-hashes.json (167) |720/86;27newcases;390/1440realbrowser+DBfailure;build/types/lint |Code and frozen evidence approved |No schema; preserve protected routes on rollback |Actual HTTPS/proxy remains gated |Local VERIFIED_FIXED; launch NO-GO |
| 14 | Dependencies; remaining item 6 | Packages/images | Exact runner/maintenance scans; no unaccepted high/critical runtime exposure | IN_PROGRESS | None | None | None | Assess in phase; no change yet | External image evidence | OPEN/unverified |
| 15 | Remaining item 3 | Scanner | Pinned actual scanner, safe/EICAR/size/archive/outage tests and monitoring | NOT_STARTED | None | None | None | Assess in phase; no change yet | 8–11; approved thresholds | OPEN/unverified |
| 16 | Default password; CSP; remaining item 4 | Proxy/config/storage | Actual intended HTTPS/proxy/private storage and limits qualified | NOT_STARTED | None | None | None | Assess in phase; no change yet | Staging access/topology | OPEN/unverified |
| 17 | Remaining items 4,7; monitoring | Backups/recovery/alerts | Matched restore within approved targets, real authorized alerts and job failure tests | NOT_STARTED | None | None | None | Assess in phase; no change yet | RPO/RTO; backups/recipients approval | OPEN/unverified |
| 18 | Remaining item 2 | Full browser journeys | Production-build applicant/admin flows, mobile RTL/accessibility and failures | NOT_STARTED | None | None | None | Assess in phase; no change yet | 1–17 applicable work | OPEN/unverified |
| 19 | Remaining item 5 | Sandbox gateway/SMS | Actual authorized provider cases, reconciliation and scoped recipient evidence | NOT_STARTED | None | None | None | Assess in phase; no change yet | Payment/auth fixes; sandbox access | OPEN/unverified |
| 20 | Remaining item 8; complete review | Final facilities/release gates | Exact candidate, approved decisions, G0–G7 and honest programme verdict | NOT_STARTED | None | None | None | Assess in phase; no change yet | All prior; external owner handoffs | OPEN/unverified |

## Baseline outcomes and evidence limits

- `npm test`: first isolated-copy attempt 306/308 (two Git-metadata harness errors);
  corrected harness 308/308 in 68 files. No tests removed or weakened.
- `npm run build`: first copy rejected external dependency symlink; APFS copied
  dependencies and unchanged source then passed. Local Node 26.7.0 differs from target
  Node22 container; actual images remain unqualified.
- `npx tsc --noEmit`: pass. `npm run lint`: zero errors, one existing public-page image warning.
- Foundation, runtime-role, private-files, M6 payment, M7 review, M8 operations and M9
  supplier database suites pass; 24 migrations. Synthetic DB restore and intentional
  failed-transaction rollback/rerun pass. These are not matched production recovery.
- Two legacy payment race mocks reproduce R1/R2; not real gateway captures and not
  facilities real-DB concurrency acceptance. Audit-only tests removed from isolated
  normal suite after run; original .txt evidence unchanged.
- Real DB R7 reproduction fails retry after FAILED and UNAVAILABLE exactly as reported;
  rollback confirmed fixture absence. No actual scanner or stored bytes tested here.
- Production-mode HTTP using canonical restricted grants reproduces R3 count=12 for 12
  guesses, R4 foreign text/plain cookie issuance, R5 eight requests/eight codes, R6 35
  rejected unknown-admin probes with no accounting rows. HTTP is not a browser attack
  demonstration; R6 timing/active-vs-inactive uniformity not yet measured.
- Canonical grants show DELETE=false for both OtpCode and ApplicationFile (R9).
  New cleanup behavior is not implemented or tested. R8/R10/R11/R12 retain source evidence.
- Anonymous routes have expected redirect/denial behavior and CSP header; this does not
  prove full authorization coverage. Facilities enabled-row count is zero after SQL tests.
- M9 example structure valid with 20 pending records; G3 fails as expected. G0–G7 remain
  unapproved/unverified. Advisory report is preserved historical input; no fresh advisory
  or exact image scan performed (Phase 14).
- Not run: full browser journeys, real scanner/EICAR, sandbox gateway/SMS, staging
  proxy/load/alerts, production inventory or matched production backup/restore, fresh
  npm ci, Linux container builds/scans, future desired-safe-behavior regressions.

## Attempts and lessons

| phase | attempt | hypothesis | change | check | result | lesson | next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | A1 | Copied tracked source with symlinked dependencies is sufficient isolation | Fresh loopback container and env allow-list; no app changes | unit/build | Two tests need Git; Turbopack disallows outside-root symlink | Harness failure, not application regression | Copy dependencies and supply read-only Git metadata |
| 0 | A2 | Correct metadata/dependency layout permits baseline execution | Physical/APFS dependency copy; explicit GIT_DIR/GIT_WORK_TREE; tracked env examples only | unit/build/types/lint | 308 pass; build/types pass; existing lint warning | No real .env needed; no app edits | Complete DB and reproduction checks |
| 0 | A3 | Historical defects persist despite baseline suite | Audit-only mock/rollback SQL and synthetic HTTP probes | payment, file, OTP/CSRF/probes, role grants; 7 DB suites and restore | Defects reproduced; baseline suites pass | Passing baseline does not establish concurrent safety | Keep findings OPEN; design remediation |
| 0 | A4 | Proposed design covers persistence and rollback boundaries | Independent review corrections: stale capture record, legacy scan metadata, retention anchor, factual limits/order | Design follow-up review | See independent-review.md | CAS protects transitions but must not discard external evidence | Obtain D1/D2 agreement, then revalidate restart state |

No unfinished technical problem has consecutive failed attempts without progress.
Consecutive no-progress count: 0. Decision wait is not a failed engineering attempt.

## Decisions and pause basis

D1, owner decisions recorded in conversation after the baseline checkpoint: approved
blocking another payment while its outcome is uncertain, checking the original payment,
and preserving the application and payment evidence. The project owner will initially
perform manual reconciliation through the gateway dashboard/support. No new admin-panel
reconciliation feature is in scope. No automatic refund is authorized; provider finality
and reversal behavior still require verification. Owner will investigate when the client reports a case; no scheduled manual review or
response-time commitment. Applicant guidance to contact support if the status remains
unresolved is approved. Unreported cases may remain blocked until resolved; this does
not authorize skipping automatic checks or dropping payment evidence. D1 is decided
for implementation; provider contract verification remains engineering work.

D2: owner agreement on the concrete design/migration/UI
proposal pending. D3 limiter-key privacy/retention and D4 legacy UNKNOWN-file policy are
future implementation decisions; existing M9 decisions remain future enablement blockers.

AGENTS.md, “Before Implementation”, says **“Produce and obtain agreement on”** requirements,
database/migrations/retention/rollback, journey/UI, payment/uploads and delivery/tests.
The master prompt Phase 0 acceptance requires **“approved scope/criteria”** and instructs
**“If a real owner decision is required, stop at that decision boundary without guessing
approval.”** Therefore preparation can be verified, but Phase 0 cannot honestly be COMPLETE
until D2 is resolved. No routine fix-by-fix approval is requested.

## Durable restart checkpoint

- Current phase: 0, BLOCKED; completed coverage, baseline reproductions, safe environment,
  concrete proposed design, review loop and evidence. Unresolved: D2 above; D1 settled by the owner.
- Branch `master`; HEAD `29705da7e148b75a56d3a4aedc3565530c1d6974`.
- Pre-existing modified `docs/2026-09-16-payment-upload-security-audit.md` preserved by
  SHA-256 check. Pre-existing untracked central report, master prompt and historical
  evidence preserved; central report only appended.
- Current task writes: this ledger; appended central report; deployment qualification
  note; `docs/security-remediation-2026-09-18/phase-0/`. Exact status saved as
  `workspace-after.txt`; source hashes `source-sha256.json` cover 397 unchanged files.
  No commit, push, stash or reset.
- Migration state: 24 existing migrations applied only to `phase0`; synthetic restored
  `phase0_restore`. No migration/schema/grant changes to project or production.
- Resource identity: container `sana-remediation-phase0-20260918`, task label
  `sana.task=remediation-phase0-20260918`, PostgreSQL16.13, initial loopback port 59677;
  runtime HTTP role `phase0_http_runtime`, synthetic owner `postgres`. Container removed
  at checkpoint; do not reconnect to that port without recreating/verifying identity.
- Temp source/fixture root is in `environment.json`; scratch data is disposable and is
  not needed for restart. No dependency on current process memory or tool sessions.
- Shutdown evidence records owned server stopped and container removed; no commands,
  transactions or review agents remain active. Other local containers were untouched.
- Restart: read master prompt, central report and this ledger; compare actual Git state
  and preserved audit hash. Recreate only disposable fixtures using README; never use
  local/production .env defaults. Existing evidence stands only for recorded source and
  environment; rerun checks invalidated by code/dependency/config changes.
- Exact next action: ask for D2 agreement on the reviewable technical design; resume Phase 0 to resolve any
  requested design revisions/review. Mark it complete only when acceptance is satisfied.
  Proposed next phase is 1 (R2) but it has NOT_STARTED and needs a subsequent explicit
  authorization to advance. “Continue” alone does not approve unresolved decisions.
- No background automation or agent will advance this plan while paused.

## Latest handoff — explicit Phase 1 authorization

This entry supersedes earlier Phase 0 D2/pause wording above, retained as checkpoint
history. After discussing the design and payment policy, the owner clarified that the
extra technical approval loop was not intended, then explicitly instructed:
“continue phase 1 only but in a new chat”. Phase 0 preparation and review are complete;
proceed with the documented design for Phase 1 without asking for D2 again. This does
not resolve later product decisions or authorize production operations.

Create a new task using the existing ioiv checkout on master as required by project
instructions. Read the master prompt, central review, design and this ledger, verify
actual state, implement and independently review Phase 1 only, record verification and
restart checkpoint, then stop before Phase 2. All code findings remain OPEN until fixes
are evidenced. No implementation was done in the originating task.

Payment handling: block a new charge while an earlier result is uncertain; check original
payment and preserve evidence/application; owner manually investigates when the client
reports an issue; no scheduled manual review or response-time promise, no new admin-panel
feature and no automatic refund. Show approved support-contact guidance only for unresolved
results. Provider finality/idempotency still requires engineering verification.

## Phase 1 execution in progress

Actual checkout verified: master/29705da; September16 audit SHA256 unchanged.
Scope R2 only. Added durable obligation/operation evidence and notification intent,
conservative historical backfill, application-first transaction locking, bounded single
provider invocation, original-authority replay and approved uncertain-payment copy.
Facilities remains disabled; no external provider/SMS or production operation.

| phase | attempt | hypothesis/change | verification/result | lesson/next |
| --- | --- | --- | --- | --- |
| 1 | A1 | Durable claim before I/O prevents competing authorities | Initial types pass; independent review found authority/rejection result replay and competing-evidence gaps | Add local replay and retain each old callback |
| 1 | A2 | Replay plus immutable selection survives concurrency/DB failure | 8 restricted-role real PostgreSQL cases pass; unit suite initially 32 failures from changed semantics/missing persistence doubles | Preserve unit coverage, change unsafe retry assertions, expand facilities/process/migration/UI evidence |
| 1 | A3 | Updated mocks and explicit conservative outcomes reflect coordinator | Payment units 54/55 pass; final remaining forged-authority expectation corrected. Expanded DB 12/13 pass; facilities seeding requires unavailable-programme fixture insertion | Seed existing synthetic application with owner-only local trigger bypass; runtime tests retain normal triggers; never enable programme |

No three consecutive no-progress attempts. Current owned isolated resource:
sana-remediation-phase1-20260918, loopback port61525, phase1 DB. Exact identity is
phase-1/environment.json. Work is not complete; no R2 closure claimed yet.

| phase | attempt | hypothesis/change | verification/result | lesson/next |
| --- | --- | --- | --- | --- |
| 1 | A4 | Real facilities execution must honor actual audit schema | Found pre-existing status validator rejects payment statuses, then missing payment audit enum values; added two scoped migrations | Both blockers reproduced and repaired; full facilities barrier test passes |
| 1 | A5 | Crash-safe replay must work beyond a single process | Five SIGKILL scenarios with loopback provider pass; nine-obligation historical migration + injected failure/rerun pass | Durable results recover local writes; remote-only facts remain uncertain |
| 1 | A6 | Broad regression/UX checks qualify actual changes | Parallel run 325/326, one bounded DB timeout under local contention (safe pending); serial run 326/326; browser four groups pass | No production timeout relaxation; one test worker for deterministic resource availability |

Independent follow-up reviewers found no remaining R2 blocker within their bounded review.
Their qualifications are in phase-1/independent-review.md. Final build/types/lint and local
shutdown/checkpoint are being completed. Phase2 remains NOT_STARTED.


## Phase 1 final durable checkpoint — 2026-09-18

This entry supersedes the in-progress resource/status statements above. Phase 1 (R2)
is COMPLETE locally; Phase 2 is NOT_STARTED. No later phase or production operation was
started. Local R2 evidence does not close external provider qualification or authorize
release; global NO-GO remains.

- Final suite: 326/326 across 69 files; final delta: 64/64 across 7 files.
- Real DB barriers: 16 cases; separate-process crash harness: five cases; historical
  backfill/failure/rerun and existing restricted-role/DB regression checks pass.
- Final build/types pass; lint zero errors and one pre-existing image warning. Focused
  production browser checks pass at mobile/desktop, screenshots visually inspected.
- Both independent critical reviewers found no remaining Phase 1 R2 blocker, with
  limitations retained in phase-1/independent-review.md and README.md.
- Before shutdown: 27 applied migrations, zero enabled facilities configurations,
  phase1_runtime has no superuser/create-db/create-role/inherit privileges.
- Owned Next PID14405 stopped; container a98debefb90dae75aa20cedcbaab3cb6d597908f41b860a8c7b7000f6a42825c
  (label sana.task=remediation-phase1-20260918) removed. Browser and crash workers exited.
  Other containers were untouched. No ongoing automation or agent will advance the plan.
- Master HEAD remains 29705da7e148b75a56d3a4aedc3565530c1d6974; changes uncommitted.
  September16 audit SHA256 remains 2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
  Existing unrelated changes preserved; no reset/stash/commit/push.
- Evidence/replay: docs/security-remediation-2026-09-18/phase-1/README.md,
  environment.json, shutdown.json, source-hashes.json and workspace-status.txt.
  Scratch source is disposable; never reconnect to the former loopback port without
  recreating/verifying a new isolated environment. No production .env defaults.
- Exact next action: STOP before Phase 2. On explicit owner continuation, reread the
  master prompt, central report and this ledger; verify Git state/hashes, then scope
  Phase 2 independently. Do not repeat the superseded Phase 0 D2 approval loop.

## Phase 2 execution — 2026-09-19

Owner explicitly authorized Phase2 only in this task. Phase1 entry source hashes (33/33),
master/HEAD and preserved September16 audit all match. D1/D2 settled decisions retained;
no new approval loop, provider promises, refund policy or facilities activation.
Phase2 scope/design: phase-2/design.md. Fresh isolated resource: environment.json.

| phase | attempt | hypothesis | change | check | result | lesson | next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | A1 | Phase1 retains stale cancellation/request/settlement/resubmit writes | Add eight desired-safe real DB regressions before copying fixes | baseline-r1.log against Phase1 source | All eight fail intended assertions; correction case shows missing history | Green Phase1 does not cover R1 | Guard writers using live state |
| 2 | A2 | Shared coordinator and conditional writes remove state regression | Route NOK through verification, lock correction, condition settlement/request and narrow admin CAS | focused.log/focused2.log; 24 then 29 DB cases pass | One mock queued response leaked; one old admin unit expected no CAS | Reset mock return queue and assert new guard without weakening behavior | Full suite and review |
| 2 | A3 | Review must include rollback side effects and real admin action | Added both admin/resubmit orders, retry/cancellation barrier, facilities NOK, history denial; known CAS rollback removes only new certificate | 341/341 suite and real DB/filesystem checks | Reviewer cleanup finding resolved; 30 DB cases pass | Failed transaction must preserve old bytes and remove only safe candidate | Build/browser |
| 2 | A4 | Await-only Prisma barrier mocks need explicit test typing; Next generates route types | Typed barrier casts, build before final standalone types | initial types/build logs fail; final-build/final-types pass | No application type suppression or removed checks | Fresh copied tree lacks generated RouteContext until build | Focused final delta |
| 2 | A5 | Production browser can replay durable capture and correction without external services | Use installed Chrome after missing bundled binary; account for existing dashboard profile redirect in intentionally minimal fixture | browser.log missing executable; browser2.log navigation expectation; browser-final.log passes both widths | Actual correction commit worked; full facilities profile journey is not this fixture | Assert DB outcome and documented existing redirect | Expand pending NOK check, final reviews/docs/shutdown |

No unresolved three-attempt no-progress problem; consecutive no-progress count 0.

## Phase 2 final durable checkpoint — 2026-09-19

Phase2 (R1) is **COMPLETE locally**, with full understand → implement → verify → adjust
loop and two independent critical approvals. Phase3 remains NOT_STARTED; no background
work will advance it. Overall launch stays NO-GO. The latest entry supersedes earlier
Phase0/Phase1 “not started/open” status statements for R1/R2 only.

- Entry: master/29705da7e148b75a56d3a4aedc3565530c1d6974; all33 Phase1 implementation
  hashes and preserved audit matched before edits. Branch/HEAD remain unchanged; all work
  is uncommitted. No commit/push/stash/reset or unrelated edit removal.
- R1 behavior: NOK verified server-side; captured payment cannot regress; later review
  state/time/notes survive late payment; one actual submission history/intent; locked
  correction submission without repayment; narrow admin CAS/Persian409 and safe candidate
  cleanup on confirmed conflict. Return copy reflects current dashboard status.
- Verification: 341/341 across69 files; final66/66 delta in5 files after app-URL refinement;
  30 real PostgreSQL cases (14 Phase2 +16 Phase1), five separate-process/SIGKILL scenarios,
  production build/types/lint pass. One pre-existing public-image lint warning; no errors.
  Final browser-script types/lint also pass. Eight desired-safe baseline cases failed
  against Phase1 for intended assertions; adjustments/failures retained, not suppressed.
- Production-browser: 390/1440px NOK uncertainty + refresh, saved capture replay, reviewed/
  correction state preservation, real correction action DB commit once without new payment,
  signed-out denial, no overflow. Representative mobile pending/desktop success screenshots
  visually inspected. No full Phase18/scanner/sandbox/staging/image qualification claimed.
- Reviews: phase2_review and phase2_evidence_review both complete, no remaining R1 blocker.
  Confirmed certificate cleanup finding fixed and tested with real bytes + restricted DB.
  Exact findings/resolutions in phase-2/independent-review.md.
- Migration state: no Phase2 migration/grant/config change; fresh container applied all27
  existing migrations. Before shutdown zero enabled facilities configurations; runtime
  role had no superuser/create-db/create-role/inherit privileges. No data repair or deletion
  of captured evidence. Phase1 rollout/backup/compatible-writer rollback still required.
- Owned resources: Next PID43942 stopped after cwd identity check; container
  f89983e70988ff9869fc4464df4c8dd5b2e09c262398eba34550f19400d7bd59 removed after ID and
  sana.task=remediation-phase2-20260919 label verification. Browser/worker harnesses exited;
  reviewers finished; other containers untouched. See phase-2/shutdown.json.
- Fixture: fresh container name sana-remediation-phase2-20260919, former loopback58227;
  DB/role names phase1/phase1_runtime reused only to satisfy harness guards. Never reconnect
  to the former port without creating/verifying fresh ownership. No local .env defaults.
  Source/env scratch path is environment.json; disposable, no session-memory dependency.
- Saved evidence: phase-2/README.md, design.md, logs/screenshots, independent-review.md,
  environment.json, shutdown.json, source-hashes.json, phase2-changed-files.json and
  workspace-status.txt. DEPLOYMENT.md and central review updated. September16 audit hash
  remains2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
- Outstanding: R12/Phase3 and later findings, actual provider finality/sandbox, full admin
  and file flows, operational qualification/release gates. D1/D2 stay settled; D3/D4/M9
  later decisions remain unapproved where recorded. No automatic refund, new reconciliation
  UI, scheduled review or SLA. No production action occurred; owner deployment handoff intact.
- Consecutive unresolved no-progress count0. Exact next action: STOP. On explicit
  “continue”, read required docs, verify latest Git/hashes, recreate isolated resources as
  needed and begin **Phase3 only** (R12 provider contract/response validation). Do not ask
  again for superseded D2 approval or silently advance later phases.

## Phase 3 execution — 2026-09-19

Owner explicitly authorized Phase3 only. Entry master/HEAD and39/39 Phase2 hashes match;
preserved audit unchanged. Scope/design/contract in phase-3/. D1/D2 remain settled.
A1: official documentation and independent contract review confirmed missing code/envelope/
reference/authority validation and legacy stored-amount mismatch. Preparing desired-safe
regressions and fresh isolated resources. No production or later phase operation.

| phase | attempt | hypothesis/change | verification/result | lesson/next |
| --- | --- | --- | --- | --- |
| 3 | A2 | Strict contract blocks incomplete success | New63 adapter cases:42 failed/21 passed on unchanged Phase2; fix yields63/63 plus30 existing DB and12 adapter tests | Preserve UNKNOWN coordination; do not convert contradictions into rejection |
| 3 | A3 | Full integration uses stored amount and contract-compliant fixtures | Initial suite411/413; new facilities fixture used wrong confirmed property and payment-action mock omitted stored amount. Corrected both; rerun underway | Fix test doubles, not application validation |
| 3 | A4 | Production browser verifies adapter→DB→Persian return with local HTTP provider | Both390/1440px malformed-reference/no-replay and rejection→101 recovery pass, as do build/types/lint/five crash scenarios | Controlled fixture, not actual sandbox. Evidence reviewer identified harness startup cleanup gap; fixed and rerunning |

## Phase 3 final durable checkpoint — 2026-09-19

Phase3 (R12) **COMPLETE locally**. Phase4 NOT_STARTED. Overall launch **NO-GO**.
Only Phase3 was authorized and executed; no background work advances later phases.

- Entry and exit master/29705da7e148b75a56d3a4aedc3565530c1d6974;39/39 Phase2 hashes
  matched before implementation. September16 audit remains SHA256
  2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
  All pre-existing changes preserved; no reset/stash/commit/push. Changed files are in
  phase-3/phase3-changed-files.json;42 restart source hashes match tested copy.
- R12: current official contract checked; strict endpoint code/envelope/reference/authority
  checks, optional echo match, numeric-code-only diagnostics, stored legacy request amount.
  UNKNOWN still blocks another charge/unsafe provider replay, explicit rejection permits
  original-authority recheck,101 settles once, browser success is not proof, R1/R2 retained.
- Exact results/exit codes: phase-3/results.json. Final413/413 tests across70 files includes
  39 real restricted PostgreSQL cases (9 new R12). Baseline63 adapter cases:42 failed and
  21 passed against unchanged Phase2; fixed focused105/105 before additional DB coverage.
  Five process-crash cases, production build, final types and lint pass; one existing image
  warning. Initial411/413 and412/413 harness/mock failures fixed; no suppression/removal.
- Browser-final: actual adapter to controlled loopback HTTP provider and restricted DB,
  390/1440px malformed ref/pending/no replay and rejection→101 recovery/once settlement.
  Stored765432 sent despite browser amount1; exact authority, forged success, refresh,
  signed-out denial and no overflow asserted. Mobile pending/desktop success inspected.
  Startup cleanup reviewer finding fixed and rerun. No full Phase18 or sandbox claim.
- Independent contract/code and evidence/test reviewers approved; both completed. Findings
  and resolutions in phase-3/independent-review.md. No remaining local R12 blocker.
- No schema/grant/config/retention/historical repair change. All27 migrations applied in
  new PostgreSQL16.14; zero enabled facilities configurations; runtime role has no superuser,
  create-db/create-role/inherit privileges (resource-check-final.log). Initial read-only
  inventory used wrong field isAvailable; corrected to schema isEnabled; no data mutation.
  No new migration failure rehearsal because inputs unchanged. Phase1/2 rollout/backup/
  compatible-writer rollback requirements remain; old capture evidence is not recertified.
- Owned container4360c7297caeca0844b4ed36639e34b7320db73231f3cd9137608762d82b8348,
  label sana.task=sana-phase3-sz6w9iur removed after identity verification. Former DB port61224;
  names phase1/phase1_runtime only satisfy harness guards. Next PIDs74790/75971 absent,
  browser/provider ports61872/61873/62109/62110 closed; workers/browser harnesses exited.
  Other resources untouched. Exact source/temp/resource identities in environment.json;
  shutdown.json verifies cleanup. Never reconnect to former ports without fresh identity.
- Evidence: phase-3 README/design/contract, logs/results/screenshots, source-hashes,
  phase3-changed-files, workspace-status, review/resource/shutdown records; central review
  and DEPLOYMENT updated. Scratch copy/env disposable; replay uses fresh resources and
  explicit environment allow-list without .env. Local Node26.7.0 is not Node22 image proof.
- Open: all later findings/qualification, actual sandbox/SMS, currency wording and provider
  finality, full admin/upload/browser journeys, scanner/infrastructure/images/backup gates.
  D1/D2 settled; D3/D4/M9 later decisions remain unresolved where recorded. No new panel,
  scheduled investigation/SLA or automatic refund. No production action or programme enablement.
- Consecutive unresolved no-progress count0. Exact next action: STOP. On explicit continue,
  read master prompt/central review/ledger, verify these hashes and scope **Phase4 only**
  (OTP verification limits); recreate isolated resources as needed. Do not reopen D2 or
  silently advance Phase4 now. No scheduled task or active agent will continue this plan.


## Phase 4 decision checkpoint — 2026-09-19

Owner authorized Phase4 only. Preparation verifies master/29705da7e148b75a56d3a4aedc3565530c1d6974,
42/42 Phase3 source hashes and unchanged September16 audit. R3 remains OPEN; launch NO-GO.
Source review confirms non-atomic attempt reservation, stale consume time and unbounded
dummy comparisons. No implementation, migration, runtime test or production action.

D3 explicitly requires confirmation before Phase4–5 schema implementation in Phase0
design.md. The current handoff does not approve it. Concrete proposal and acceptance
plan are in [Phase4 checkpoint](security-remediation-2026-09-18/phase-4/README.md):
dedicated-secret HMAC mobile/purpose/address keys, minimal rolling-window accounting,
24-hour healthy-operation live-table retention including unused identifying buckets,
fail-closed cleanup recovery; no silent backup-policy change or deletion guarantee during
DB downtime. Independent read-only reviewer confirmed this boundary and clarified these
limits. D1/D2 remain settled; no routine technical approval is requested.

Attempt4/A1: identity and decision/source inspection succeeded; D3 remains unresolved.
No-progress count0. No owned server/container/provider/browser was created; reviewer
completed. Application/source hashes remain identical to Phase3. No reset/stash/commit/
push; all pre-existing work preserved. DEPLOYMENT unchanged because no operational
contract has yet changed. Exact next action: owner settles D3, then recheck source and
implement/verify Phase4 only. Phase5 remains NOT_STARTED.


### Phase4 D3 owner resolution

Owner replied “agreed” after explanation of temporary protected phone/IP login-attempt
records and normal deletion within24 hours. D3 is approved for Phase4 implementation;
prior D3 BLOCKED checkpoint is superseded. No Phase5/production authorization. Entry
42/42 Phase3 hashes revalidated before editing. Current status IN_PROGRESS.


## Phase4 final durable checkpoint — 2026-09-19

Phase4 R3 COMPLETE locally; Phase5 NOT_STARTED; overall launch NO-GO. Owner explicitly
authorized Phase4 and approved D3 with “agreed” after the temporary protected-identifier
explanation. Earlier Phase4 D3-blocked entries are superseded; D1/D2 remain settled.

- Master/HEAD29705da7e148b75a56d3a4aedc3565530c1d6974 unchanged;42/42 Phase3 entry hashes
  match. Only package/schema/grants among those hashes changed; all payment source intact.
  September16 audit remains2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
  All changes uncommitted, no reset/stash/commit/push or unrelated removal.
- At most5 real-code reservations before bcrypt, fresh locked DB expiry/one consume,
  user/admin transaction, safe spent guesses after crash/ambiguous commit. Shared exact
  rolling limits bound missing/expired/exhausted requests; hourly HMAC current+previous
  identities plus one admission instant preserve24h normal retention without resetting
  limits. Default bounded unknown address; qualified proxy only. No Phase5 request/SMS fix.
- Persian400/429/503, accessible admin alert, clear rejected codes to prevent intermediate
  auto-submit guesses. Existing business/payment workflows and facilities-disabled preserved.
- Final440/440 tests across73 files includes26 restricted OTP PostgreSQL cases and39
  payment cases. Four OTP multiprocess/crash scenarios, five payment crash regressions,
  transactional migration rollback/rerun, existing runtime-role regression and actual
  maintenance command pass. Build/types/lint pass; one existing image warning.
- Production browser390/1440 applicant/admin loading/invalid/limit/retry/refresh/signed-out
  states; exactly1 request per code entry; two Next processes twelve wrong/correct HTTP
  requests produce capped attempts and0/1 actual cookies. Unavailable DB503 has no cookie.
  Final mobile applicant/desktop admin screenshots visually inspected.
- Independent code/evidence reviewers completed, all findings fixed. Saved failed test/
  browser attempts and corrections, no suppressed assertions. Hour-boundary and lost-commit
  evidence use explicit injected seams over real DB; not protocol-level fault certification.
-28 migrations applied to fresh PostgreSQL16.14; new limiter/table index and narrow
  cleanup/admin-lock helpers; no Admin UPDATE, bucket DELETE/schema CREATE or elevated
  runtime role.0 enabled facilities. DEPLOYMENT/runtime-env example/cron example document
  secret/proxy/scheduler/monitoring/rollout/rollback. No actual scheduler/alerts qualification.
- Owned container6c15d7de30fa383f26bebc065885906d8deeed2345b7290c3edfd06d1d6ef110 removed
  after ID/label sana.task=sana-phase4-armlocl7 verification. Former DB port63828. Eight
  recorded Next PIDs absent/ports closed; browser/worker harnesses exited, reviewers done.
  Other resources untouched. environment.json/shutdown.json provide exact identities.
- Durable evidence: phase-4 README, entry/attempt history, independent reviews, logs,
  results.json,59 restart hashes (58 match tested copy + statically reviewed runtime env
  example), phase4-changed-files, resource/shutdown/workspace records. Scratch/env disposable;
  recreate fresh isolated resources, never reconnect to former ports or inherit .env.
- Remaining: later findings, real sandbox/SMS, trusted proxy/capacity/monitoring, Node22
  images, full journeys, matched backup/recovery and release/facilities gates. No real
  charge/SMS/refund, production migration/deployment/backup or programme enablement.
- No-progress count0. STOP. On explicit owner continuation read latest checkpoint, verify
  hashes/branch/worktree and start Phase5 only. No task/agent continues automatically.


## Phase5 final durable checkpoint — 2026-09-19

Phase5 R5 **COMPLETE locally**, Phase6 NOT_STARTED, launch NO-GO. Owner explicitly
requested Phase5 in a new task. D1/D2/D3 remain settled; no routine reapproval requested.
Scope remained R5; no CSRF/admin-response uniformity or later-phase implementation.

- Entry/exit master/29705da7e148b75a56d3a4aedc3565530c1d6974;59/59 Phase4 entry hashes
  match. September16 audit remains2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
  Existing work preserved, no reset/stash/commit/push.73 restart hashes (72 match tested
  copy, runtime-env example statically reviewed); payment source remains unchanged.
- Atomic request admission reserves90s cooldown/five per mobile+purpose rolling hour,
  configured address/shared unknown quota and separate request global cap. HMAC epochs
  and one DB admission instant preserve Phase4 retention and boundaries. No quota refund
  on failure/crash; one acknowledged durable claim may send once, no automatic replay.
- Awaited bounded SMS failure/uncertainty preserves OTP entry/Persian warning; a possibly
  delivered code can authenticate. No OTP/message logs. New OTPs omit raw requestIp.
  Applicant linked accessible429 error fixed after browser caught missing alert.
- Final473 tests/75 files (24 R5+26 R3+39 payment restricted PostgreSQL cases). Baseline
  eight-request regression fails intended assertion with8 instead of1 on exact Phase4.
  Eight independent processes send1; SIGKILL after reserve/claim/send forbids fresh-worker
  resend. Four verification and five payment crash scenarios retain prior protections.
- Production browser390/1440 applicant/admin slow/failed/malformed/timeout SMS, uncertainty
  to real cookie,429/refresh/no duplicate, trusted/unknown attribution, two Next servers/
  eight HTTP requests send1, actual DB outage503/no dispatch. Every fixture OTP absent from
  captured logs. Phase4 browser/twelve guesses yields0/1 cookies, signed-out/expiry flow
  regression passes. Representative request screenshots visually inspected.
- Final build/types/lint pass; lint one existing image warning. Migration transaction
  rollback/rerun/PUBLIC denial, canonical runtime-role regression and actual combined
  maintenance command pass. Exact exit codes in phase-5/results.json. Failed attempts
  retained; no suppression. Initial suite/raw-provider error expectation corrected;
  baseline overlapped first suite tail, so repeated full suite sequentially (final2).
-29 migrations applied to PostgreSQL16.14; new intent table/index/helper, restricted grants,
 0 enabled facilities. Hourly maintenance now prunes buckets/intents in one transaction.
  Retention about3h intents/about4h rotating buckets with healthy hourly maintenance;
  approved24h boundary, no backup/WAL change/downtime-erasure claim. Deployment/env/cron
  updated with auth drain/cutover, secret/proxy, cleanup/recovery and compatible rollback.
- Both independent reviewers completed and approved; findings/resolutions in
  phase-5/independent-review.md. No active review or automation continues work.
- Owned container cd1fda86a6b35cbe71cdd2ac10f6331a459b3d3ef06ae13921faf7b816afdfd9 removed
  after label sana.task=sana-phase5-0k02vzyo verification. Former DB port53150;10 recorded
  Next PIDs absent and all provider/server ports closed; browser/worker harnesses exited.
  Other resources untouched. Exact environment/shutdown/source/resource records saved.
  Scratch source/env disposable; recreate fresh labelled resources/automatic loopback
  ports with safe allow-list, never reconnect to former ports or inherit .env destinations.
- Limitations: local Node26, controlled SMS, synthetic trusted-proxy setting, clock/commit
  injection seams. No actual SMS/sandbox/payment/production/Node22 image/proxy/scheduler/
  monitoring/backup qualification, no charge/refund/programme activation. Later findings
  and release/facilities gates remain open; owner deployment handoff unchanged.
- Attempt history: phase-5/entry-and-attempt-history.md; unresolved no-progress count0.
  Exact next action: STOP. On explicit continuation, read master/central/progress and
  Phase5 checkpoint, verify73 hashes/master/audit, then start **Phase6 only** (R4 CSRF).
  Do not reopen settled D1/D2/D3 or advance automatically.

## Phase6 final durable checkpoint — 2026-09-19

Phase6 R4 **COMPLETE locally**, Phase7 NOT_STARTED; launch **NO-GO**. Owner explicitly
requested Phase6 in a new task. D1/D2/D3 remain settled. No later phase work.

- master/29705da7e148b75a56d3a4aedc3565530c1d6974 unchanged;73/73 entry hashes matched;
  September16 audit remains2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e.
  All existing work preserved, no reset/stash/commit/push.
- Both OTP routes require canonical configured Origin and application/json before parsing,
  quota/OTP/SMS/session effects. Foreign/null/missing403, media415, malformed400, bad config503.
  No Host/forwarded trust, no nonbrowser exemption; normal HTTPS applicant/admin works.
- Historical real browser text/plain form created user/admin cookies on unchanged Phase5;
  fixed browser rejects both with unchanged DB/no cookie, plus sandbox null Origin.58 new
  route checks (51 failed on baseline), final531 tests/76 files including89 real DB cases.
- Local TLS proxy/production Next/restricted PostgreSQL390/1440 user/admin genuine login,
  Secure HttpOnly Lax cookies, refresh; malformed/origin/media/spoof/config/DB-outage checks,
  two-process hostile12 requests. Prior request/verification browser and request/verification/
  payment process/crash regressions all pass. Build/types/lint pass, existing image warning.
- Two independent reviewers approved; fixture typo and nginx wording fixed. No schema,
  grant, retention or business change.29 existing migrations, zero enabled facilities.
  DEPLOYMENT/runtime example updated. Actual TLS/proxy/Node22/provider qualification remains
  unproved. No production migration/deployment/live SMS/charge/refund/programme enablement.
- Exact results, attempts, source hashes/comparison, changed files and owned shutdown:
  docs/security-remediation-2026-09-18/phase-6/. Fresh resources only; no former port reuse.
  Both reviewers finished; no automation or agent continues. No-progress count0.
- STOP. On explicit continuation, read latest documents, verify Phase6 restart hashes,
  master/HEAD/audit and start Phase7 only. Do not reopen settled decisions or advance now.

## Phase7 final durable checkpoint — 2026-09-19

R6 COMPLETE locally; Phases0–7 locally complete; launch NO-GO. Owner explicitly authorized
sequential Phases7–20, superseding historical routine pause instructions. Continue Phase8
next without routine permission; stop at actual decision/access/safety/no-progress boundaries.

- master/HEAD29705da7e148b75a56d3a4aedc3565530c1d6974 unchanged. Entry76 Phase6 restart,
75 actual tested-copy and47 evidence hashes all match. September16 audit remains
2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e. All prior work preserved.
No reset/stash/commit/push/worktree. Phase7 changed files/source hashes in evidence directory.
- Shared admission unchanged. Unknown/inactive/active admitted admins return same200
conditional Persian code-entry message across lookup/claim/SMS outcomes. No unknown/inactive
OTP/account/role/SMS. Active verification remains locked/transactional. Awaited once-only
SMS, protected24h accounting, Origin/JSON and payment safeguards remain intact.
- Bounded lookup/equal hashing/common response floor provider-timeout+12s after admission;
default22s/max42s, admin browser60s. Informational accessible message and pending input locks.
Healthy sampled timing is not constant-time/overload/external infrastructure qualification.
- Final549/78 tests including97 restricted DB cases, build/types/lint (existing image warning),
R6 provider/timing/max30s timeout and six390/1440 browser cases, prior HTTPS Origin and request
browser, four request/four verification/five payment process/crash scenarios pass. Baseline
7/20 desired-safe failures demonstrate disclosure. Initial DB suite collision and browser
selector/resource query harness errors fixed and retained. Exact results in phase-7/results.json.
- Two independent reviewers approved; UI pending-edit race/accessibility findings fixed.
No schema/grant/retention/backfill change.29 migrations/PG16.14/restricted role/0 enabled
facilities verified; deployment docs updated. No new migration recovery needed.
- Container40bd3542a986bd4b9e96005d1481358f4c16f8323bcd830568df2b3016fe52c6,
label sana.task=sana-phase7-mf44bhm5 removed after identity verification; former DB port60943.
15 recorded PIDs absent/18 ports closed; inherited TLS harness awaited unnumbered server closes.
All workers/browsers/reviewers done; unrelated resources untouched. Fresh resources only.
-82 restart hashes:81 matching copied files + static runtime example. Evidence README,
source comparison/results/attempts/reviews/environment/shutdown/workspace records saved.
Scratch sources/env disposable; no inherited destination or old port may be reused.
- No production action, real SMS/payment/refund, programme activation or external qualification.
Remaining R7/R8/R9/R10/R11, session/dependencies/scanner/infrastructure/full journeys/sandbox/
release gates remain open. D1/D2/D3 settled; D4 historical file policy and M9 decisions open.
- No-progress count0. Next: Phase8 R7 facilities failed replacement, read exact lineage/quota/
retention/migration code and create fresh isolated evidence. Do not skip its local acceptance.


## Phase8 final durable checkpoint — 2026-09-19

R7 COMPLETE locally. Both critical reviewers approved; launch remains NO-GO. Continue Phase9
under the existing sequential authorization, without routine permission. D1/D2/D3 settled;
D4 historical-file policy and M9 decisions remain open. Do not skip Phase10's decision gate.

- master/HEAD29705da7e148b75a56d3a4aedc3565530c1d6974 and September16 audit SHA
2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e unchanged.
82 entry hashes matched.19 protected auth/payment/SMS runtime files unchanged; prior
payment fixture now creates template success/current in one transaction for the new invariant.
No reset/stash/commit/push/worktree or production action. Prior uncommitted work preserved.
- Separate attempted/committed lineage, immutable repair evidence, exclusive retry token,
scope/binding locking, original24h expiry including crashed PENDING, atomic current/audit/
tombstone, quota one-predecessor credit, durable deletion/reference/orphan protection.
UI retains last-known good state with Persian refresh/retry uncertainty copy and narrow-screen
paragraphs. Details/changed files in phase-8/README.md and phase8-changed-files.json.
- Exact30th migration SHA8ea72e679cfa0820479d79eb25a075690289be2a33f038060a3c476a51d5c6e3;
fresh30 migrations and canonical restricted role,0 enabled facilities. Rehearsed original29
history including deleted successful bytes/failed attempt, ambiguity abort/full rollback,
corrected rerun and immutable repair. No mixed writers; drain before migration, retain schema
and evidence with compatible guarded rollback. No production backfill/migration authorized.
-578/79 tests including126 restricted DB cases (29 R7+97 prior), real filesystem bytes,
five file and five preserved payment process scenarios, full150MiB quota SQL, M1/M2/M6/M7/M8
SQL and isolated M9 provisioning, role denials, production390/1440 browser, build/types/lint
pass. Only preexisting public image warning. Controlled INSTREAM is not antivirus certification.
Final evidence/results/logs/screenshots and initial failed attempts retained in phase-8/.
- Independent reviewer findings fixed: orphan timeout, batch starvation, detached success/
quota bypass, active quarantine deletion, ambiguous UI claims, legacy reference/unlink race,
completed tombstone FOUND replay. Evidence additions cover same-key failures and aged crash
orphans with old/current bytes. Both reviewers approved; no delegated work remains.
- All3 owned containers removed after label/ID verification;7 recorded fixture PIDs absent,
7 ports closed;12 abandoned synthetic test roots removed. No task worker process remains.
Scratch source/env are disposable retained evidence; create fresh resources next phase.
-95 restart hashes (94 matching copied files + one static env example); evidence hash manifest,
workspace/protected-source/migration/resource records saved. No-progress count0.
- Next Phase9: map every legacy ApplicationFile/draft/certificate writer, use the agreed binding/
generation/deletion-intent design and safe migration preflight. Do not enable broad DELETE;
Phase11 handles actual maintenance permissions after replacement safety. Phase10 D4 remains
an actual decision boundary; earlier routine per-phase STOP wording is superseded.


## Phase9 final restart checkpoint — 2026-09-19

- Phase9 COMPLETE locally; R8 VERIFIED_FIXED within isolated qualification. Source remains
  uncommitted on master HEAD29705da7e148b75a56d3a4aedc3565530c1d6974, original audit SHA256
  2c775286f74363868519d05f7af6886cf38f77454e4c7394d6f90def8716716e preserved.
- Migration20260919150000_legacy_file_bindings SHA256
  38ac352e457cb9f97d9bc3e83c46ef7115c65e48da1c9f2dff72572a5a28ebdc: authoritative stable-slot
  pointers/version, immutable metadata/repair, allocation journal and exact deletion intents.
  Saved-reference-only historical backfill; UNKNOWN/unbound/ambiguous bytes remain preserved.
- All upload/draft/payment/certificate writers coordinate under application-first locks;
  active/uncertain payment operations fence changes. UI queues saves/uploads, preserves
  sibling/year edits and handles retry/uncertainty; current readers/export avoid old metadata.
  Cleanup authorization is durable before unlink; allocation/alias/late-write fences tested.
  Historical unjournaled predecessors are RETAINED for D4; no broad ApplicationFile DELETE.
-607/80 tests including155 restrictedDB (29 R8+126 prior), real bytes,4 new file process-death
  boundaries,5 preserved R7 process cases,5 payment process scenarios. Production390/1440
  browser with14 controlled INSTREAM calls, migration rollback/history, M1/M2/M6/M7/M8,
  restricted quota/roles and M9 provisioning all pass. Build/types/lint pass; one prior warning.
- Two critical reviewers approved after fixes; coverage gaps were added and requalified.
 119 root/118 copied fingerprints match.18 prior auth/payment/SMS runtime files unchanged;
  payment action intentionally integrates R8 checks and prior payment protections pass.
- Both labelled containers removed,17 recorded PIDs absent,6 ports closed, no phase worker.
  Disposable scratch sources/synthetic bytes retained at recorded paths; no production,
  external SMS/gateway, commit/push/reset or facilities enablement. No-progress count0.
- Phase10 NOT_STARTED at the explicit D4 decision boundary. Owner question pending;
  concrete policy/impact/recovery proposal:security-remediation-2026-09-18/phase-10/D4-decision-proposal.md.
  Do not infer assent from silence. M9 remains unresolved; launch NO-GO. On approval, record
  D4, verify this checkpoint and continue the authorized sequence in fresh isolated resources.


## Phase10 entry — D4 approved

Owner accepted the recommended historical-file verification policy with “as you recommand”.
Phase9 hashes verified:119 source,118 copied-source,88 evidence. Phase10 starts under the
existing sequential authorization with isolated resources only. D4 policy recorded in
phase-10/D4-decision-proposal.md; production inventory/backfill/deployment remain separate.
Historical download/review access preserved; required UNKNOWN evidence blocks new payment/
submission until verified/replaced; paid corrections never charge again. No-progress count0.

## Phase10 sealed / Phase11 entry — 2026-09-19

D4 was approved with “as you recommand”; owner reiterated autonomous continuation when
an acknowledgement incorrectly stopped work. Phase10 now COMPLETE locally. Code reviewer
phase8_design_review and evidence reviewer phase7_evidence_review independently approved.
Final evidence review verified655/83 tests,38 actual R10 cases, browser/build/types/lint,
133root/132copied/105evidence hashes,33migration checksums, masterHEAD/audit preservation,
and shutdown1ownedcontainer/25PIDs/11ports. Evidence is sealed in phase-10; do not rewrite.
Actual scanner identity/signature qualification and production backfill remain unperformed.

Phase11 starts without another approval request. Read-only design review confirmed OTP
DELETE denial, split-client lock lifetime issue, advisory-key collision, absent legacy
standalone cleanup and facilities skipped/partial success reporting. Fresh isolated setup
and concrete design in phase-11. No production actions or programme enablement.

## Phase 11 closure / Phase 12 entry — 2026-09-19

Phase11 local R9 COMPLETE. Independent code and evidence reviewers approved after
starvation/coverage fixes and actual facilities CLI failure/recovery proof. Frozen
evidence:672/84 tests,17 new maintenance CLI cases,145 source/144 copied/37 evidence
hashes,34 migration checksums. Phase10 evidence unchanged. Owned container removed,
port63845 closed, no copied-source worker remains. Phase12 R11 begins under standing
sequential authorization; no routine pause. No production/deployment/enablement.

## Phase 12 closure / Phase 13 entry — 2026-09-19

Two independent reviewers approved code, qualification and frozen evidence:693/85 tests,
21 real review DB cases, mobile/desktop production browser,36 migrations including two
rollback rehearsals.162source/161copied/52evidence hashes; prior Phase10/11 evidence unchanged.
Owned container removed and all nine recorded ports closed. R11 locally VERIFIED_FIXED.
Phase13 proceeds under standing authorization; production and facilities remain untouched.

## Phase 13 closure / Phase 14 entry — 2026-09-19

Independent reviews approved720/86tests, applicant/admin390/1440 hostile navigation,
logout, invalid-cookie recovery and real DB-denial503/cookie preservation/recovery.
167source/166copied/34evidence hashes;36unchanged migrations; ownedresources stopped.
Phase14 starts fresh advisory and exact image qualification. No production changes.
