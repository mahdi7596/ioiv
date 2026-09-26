# Sana Deployment Runbook

Production domain: `https://sana.ioiv.ir`

This document records the current production deployment state and the operational steps learned during the first server deployment.


## Current release qualification — 2026-09-18

**NO-GO for opening the reviewed candidate to users.** The historical deployment and
hardening entries below are dated records, not current security acceptance. In particular,
the historical claims of concurrent payment idempotency and effective OTP limits are
superseded by the reproduced findings in
[the current pre-launch review](docs/2026-09-18-prelaunch-security-review.md).

Security remediation Phase 0 performed local baseline/design work only; no application,
schema, runtime grants, configuration or production change occurred. The proposed
[data/rollback design](docs/security-remediation-2026-09-18/phase-0/design.md) is not an
executable migration recipe. [The restart checkpoint](docs/security-remediation-progress.md)
records isolated verification, outstanding decisions and the pause before implementation.
Keep facilities disabled. Existing owner backup/upload/redeploy handoffs and matched
DB/uploads/config backup requirements remain prerequisites for any later authorized
production work. Local synthetic schema restore does not satisfy those prerequisites.

## Code and Production Backup Baseline

On September 10, 2026, the current application state was preserved before implementing
new client-requested functionality directly on `master`.

- Backup branch: `backup-master-2026-09-10`
- GitHub branch: `origin/backup-master-2026-09-10`
- Snapshot commit: `ab16e9122881617d6c7dcf9fb84878c00684ee03`
- `master` and the backup branch pointed to the same commit when the backup was made.

Before a future production deployment that changes data or the database schema:

1. Create and push a new dated backup branch from the then-current `master`.
2. SSH to the production server and take a database backup.
3. Back up production uploads and any server-side configuration/storage not tracked by Git.
4. Confirm the database backup can be restored before deploying destructive migrations or data changes.

The current agreed workflow is to develop the new functionality on `master`; the dated
backup branch is the code rollback point.

## Current Status

The app is deployed and verified on `sana.ioiv.ir`.

Verified on May 2, 2026:

- `https://sana.ioiv.ir` loads through Nginx.
- `sana-app` and `sana-postgres` are healthy.
- Prisma migrations are applied.
- SMS OTP sends successfully through the configured Ghasedak/SMS endpoint.
- User registration works.
- File upload works.
- Uploaded files are recorded in PostgreSQL and stored physically on the Docker upload volume.

Payment gateway implementation completed on May 7, 2026:

- Zarinpal payment initiation uses the existing fixed payment amount and existing payment statuses.
- The existing status model is preserved: application statuses track form/review workflow, payment statuses track gateway result.
- Successful Zarinpal verification moves payment to `VERIFIED` and application to `SUBMITTED`.
- Failed or cancelled active payments move payment to `FAILED` and return the application to editable `DRAFT`.
- Duplicate callbacks for already verified payments are idempotent and do not duplicate history or downgrade state.
- SMS notification failures after verification are logged without changing verified payment/application state.
- Users now return from the bank page to `/payment/return`, see a success/failure message, and are redirected to `/dashboard`.
- Automated coverage was added for payment status relationships, Zarinpal adapter behavior, payment start, callback verification, and return-page rendering.
- Verified locally with `npm test`, `npm run lint`, and `npm run build`.

Atomic payment-start fix deployment check:

- After uploading the latest source to `/data/apps/sana`, rebuild and restart the app:
  `docker compose build app && docker compose up -d`.
- Confirm the app is healthy with `docker compose ps`.
- Confirm startup has no new errors with `docker compose logs --tail=100 app`.
- After a payment test, inspect payment handoff logs:
  `docker compose logs --tail=300 app | grep -E 'payment_start_failed|payment_start_succeeded|payment_start_requested'`.
- A successful first-click handoff should log `payment_start_requested` followed by
  `payment_start_succeeded`; expected validation/provider failures should remain on the
  application page instead of rendering a production Server Components digest error.

Production redeploy and reset verified on May 7, 2026:

- Latest source was uploaded to `/data/apps/sana`.
- The production `.env` was updated to the live Zarinpal values:
  `APP_URL=https://sana.ioiv.ir`, `ZARINPAL_MERCHANT_ID=<production-zarinpal-merchant-uuid>`,
  and `ZARINPAL_SANDBOX=false`.
- A fresh Linux AMD64 Prisma engine export was generated locally and uploaded because
  the previous `prisma-engine-export.tar.gz` was older than the current schema.
- The app image was rebuilt with the offline Prisma export, restarted, and verified healthy.
- Migration `20260507120000_replace_final_statuses_with_validation_completed` was
  applied by the app entrypoint at that time. That historical startup behaviour has
  been removed: migrations are now explicit maintenance operations.
- The production database was backed up, then reset for fresh testing; admins were reseeded.
- Final reset check showed `3` admins and `0` users, applications, payments, uploaded-file records,
  status histories, and OTPs.

## Access Rules

Use L2TP when connecting to the private server IP:

- Required: SSH or any command using `192.168.50.109`. (Code now comes from GitHub; rsync is no longer used for deploys.)
- Required: internal checks against the server shell or Docker Compose.
- Not required: opening `https://sana.ioiv.ir` in a public browser.
- Not required: local-only commands inside `/Users/mahdi/Documents/work/ioiv`.

Current server details:

- Hostname: `sana`
- SSH user: `administrator`
- Current private IP: `192.168.50.109`
- Previous private IP: `192.168.40.21`
- App directory: `/data/apps/sana`
- Backup directory: `/data/backups/sana`
- Docker data root: `/data/docker`
- Upload volume host path: `/data/docker/volumes/sana_sana-uploads/_data`

Always run Docker Compose commands from:

```bash
cd /data/apps/sana
```

If Docker Compose says `no configuration file provided: not found`, the shell is not in `/data/apps/sana`.

SSH sessions may occasionally print messages such as:

```text
channel 21: open failed: connect failed: open failed
mm_receive_fd: recvmsg: expected received 1 got 0
```

These are SSH multiplexing or forwarding noise when the actual command still runs and prints its result.
If commands stop running, reconnect to `administrator@192.168.50.109` and continue from `/data/apps/sana`.

## Public Routing

Do not touch the existing `ioiv.ir` website. Sana is served only from the subdomain:

```text
sana.ioiv.ir
```

DNS currently resolves `sana.ioiv.ir` to:

```text
5.160.83.42
```

Nginx proxies this host to the local Docker app:

```nginx
server {
    listen 80;
    server_name sana.ioiv.ir;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Verify Nginx routing:

```bash
curl -I -H "Host: sana.ioiv.ir" http://127.0.0.1/
curl -I https://sana.ioiv.ir
```

## Docker Runtime

The production stack uses Docker Compose:

- App container: `sana-app`
- Database container: `sana-postgres`
- App image: `sana-app`
- App port: `3000`, bound to `127.0.0.1` only (nginx proxies to it)
- PostgreSQL host port: `55433`, bound to `127.0.0.1` only
- PostgreSQL internal port: `5432`
- App memory limit: `1g` (`mem_limit` in `docker-compose.yml`)
- App healthcheck: `GET /api/health` (returns 503 when the database ping fails)

Neither port is reachable from outside the host. To use `psql` from a workstation,
open an SSH tunnel first:

```bash
ssh -L 55433:127.0.0.1:55433 <server>
```

Useful commands:

```bash
cd /data/apps/sana

bash scripts/deploy-server.sh   # build and switch the app (see Deploy Code Changes)
docker compose ps
docker compose logs --tail=80 app
```

Never run a bare `docker compose build app` / `docker compose up -d` in production:
without `-f docker-compose.release.yml` it builds or starts an unpinned image, and
without `--no-deps` it can recreate the `sana-postgres` container. Older dated
sections below still show those commands as historical records; use
[Deploy Code Changes](#deploy-code-changes) instead.

The app container runs:

```bash
npm run start
```

It does not run Prisma migrations during startup.

## M1 database credentials and migration procedure

M1 separates the schema owner from the normal application connection:

- `DATABASE_URL` in `.env.migration` is the migration-owner connection. It is used
  only by the explicit `migrate` Compose profile during a scheduled maintenance
  operation.
- `DATABASE_URL` in `.env.runtime` is the restricted `sana_runtime` connection used
  by the app container. It must never contain the migration-owner password.
- The Compose project `.env` is used only for Compose interpolation and PostgreSQL
  initialization. The app receives `.env.runtime`; it must not contain
  `POSTGRES_PASSWORD` or the migration-owner `DATABASE_URL`. The maintenance profile receives
  `.env.migration`; it is never mounted into the app container.
- The app entrypoint does not run `prisma migrate deploy`. Do not restore automatic
  migrations to normal startup.

After the M1 migration, provision or rotate the runtime role using the one canonical,
idempotent command below. It prompts for the password, applies the least-privilege
legacy and facilities grants, and never places a password in source control or a
shell command:

```bash
psql "$DATABASE_URL" -v runtime_role=sana_runtime \
  -f prisma/facilities-runtime-role-provision.sql
```

`prisma/facilities-runtime-role-grants.sql` is the only grant policy. It permits the
legacy operations the current application actually performs, gives facilities audit
and status history only `SELECT`/`INSERT`, and denies their `UPDATE`/`DELETE`/`TRUNCATE`.
The M1 owner-level triggers are a second append-only defence.

On an isolated restored copy (never production), verify the grant policy with:

```bash
DATABASE_URL="...migration-owner connection..." npm run test:db:m1-role
```

Run the core facilities foreign-key, visibility, immutability, and legacy-preservation
checks against an isolated database with:

```bash
DATABASE_URL="...isolated test database..." npm run test:db:m1-integrity
```

The backup/restore and transactional failure/rerun rehearsal also requires two
explicitly created disposable databases:

```bash
DATABASE_URL="...source..." M1_RESTORE_DATABASE_URL="...blank restore target..." \
  npm run test:db:m1-recovery
```

### Scheduled M1 maintenance runbook

1. Create and push a new dated backup branch from the exact production `master`.
2. Take database, upload-storage, and relevant configuration backups. Verify every
   backup is non-empty and restore the database/upload pair to an isolated target
   before changing production.
3. Build the image without restarting the app. Keep Compose interpolation and
   PostgreSQL initialization values in `.env`; put app-only secrets and
   `DATABASE_URL` in `.env.runtime`; put the migration-owner `DATABASE_URL` only in
   `.env.migration`.
4. Run the migration once, explicitly:

   ```bash
   cd /data/apps/sana
   docker compose build
   docker compose --profile migration run --rm migrate
   ```

5. Provision/reconcile `sana_runtime` with
   `prisma/facilities-runtime-role-provision.sql`, then set the restricted `DATABASE_URL`
   only in `.env.runtime`.
6. Start/restart the normal service and confirm it uses the runtime role:

   ```bash
   docker compose up -d app
   docker compose ps
   docker compose logs --tail=100 app
   ```

7. Verify the legacy route, legacy file access, payment callback behaviour, and M1
   role-denial/integrity checks before enabling any facilities intake.

If the application deployment must be rolled back, redeploy the prior application and
runtime configuration. Leave the additive M1 schema in place. Do not attempt a
destructive schema rollback without the verified restore procedure and explicit
approval.

## M2 private facilities file rollout (not deployed)

M2 adds private facilities file storage but does **not** enable facilities, create an
intake, or expose facilities UI. Do not deploy this milestone by itself as a way to
open the programme.

Before a later deployment that includes M2, the release owner must:

1. Create a dated Git backup branch and verify matched PostgreSQL, upload-volume, and
   runtime-configuration backups on an isolated restore target.
2. Provision an approved, monitored `clamd` service reachable only from the app
   network. Configure `FACILITIES_CLAMAV_HOST`, `FACILITIES_CLAMAV_PORT`,
   `FACILITIES_CLAMAV_TIMEOUT_MS`, `FACILITIES_CLAMAV_CHUNK_SIZE`, and the private
   `FACILITIES_UPLOAD_DIR` in `.env.runtime`. Missing, unhealthy, timed-out, or
   malformed scanner responses fail closed and keep files quarantined.
3. Confirm the facilities private root is inside the persisted upload volume, is not
   mapped by Nginx or any static route, and has capacity for temporary replacement
   overlap plus quarantine retention. Scanner signatures, capacity monitoring,
   alerting, retention intervals, and incident ownership require operations approval.
4. Run the additive migration only through the migration profile, then rerun the
   runtime-role provision script. Regenerate/upload the Linux Prisma engine export
   before building because the schema changed.
5. Run `npm run test:db:m2-files`, `npm run test:db:m1-role`, legacy upload/download
   regressions, and a restored-environment scanner readiness test before any future
   facilities enablement.

The maintenance-only reconciliation command is:

```bash
cd /data/apps/sana
docker compose exec app npm run facilities:reconcile-files
```

Schedule it only after the scanner and private storage are ready. It retries scanner-
unavailable quarantined uploads, purges terminal quarantine objects, retries deletion
tombstones, and reaps untracked opaque objects older than `FACILITIES_ORPHAN_TTL_MS`;
it logs record counts only. The orphan reaper refuses to run (logging
`facilities_orphan_purge_skipped`) when the database knows no stored files or when
candidates outnumber `max(50, known files)`; raise the ceiling for one run with
`FACILITIES_ORPHAN_PURGE_MAX` after confirming the database is the right one.

OTP retention is a separate, cheap command that the example maintenance script runs on
every tick; it deletes `OtpCode` rows older than 24 hours in batches:

```bash
docker compose exec app npm run auth:prune-otp
```

Audit rows (`FacilitiesAuditLog`, `AuditLog`) are never deleted by the application; they
are the compliance record. Retention beyond the database's own backup policy is a manual
DBA decision and must not be automated through the runtime role.
Do not run it against production to inject failures. Controlled scanner/storage/DB
failure tests belong only to local, test, or staging environments.

## M4 facilities configuration rollout (not deployed)

M4 adds an active-`SUPER_ADMIN`-only configuration panel for programme state,
intakes, per-intake suppliers, maximum amount/payment settings, and private Word
questionnaire versions. It does not add an applicant facilities route or make the
programme usable, even if a configuration row is marked enabled.

Questionnaire files use the M2 private storage/scanner boundary. A template version
is created only from a scan-passed DOC/DOCX revision in an admin-owned binding; each
version has a new binding and cannot replace, mutate, or delete an older version.
Before an M4 deployment, follow the same dated backup and isolated restore rehearsal
required for M1/M2, apply the additive migration through the maintenance profile,
and rerun the runtime-role provision script so template versions remain non-deletable.
Verify the M4 database integrity and role checks on an isolated database, then verify
that ADMIN and ENTRY_VIEWER sessions are denied while an active SUPER_ADMIN can save
configuration. Rollback redeploys the preceding application/runtime configuration;
leave the additive schema and private template records in place.

Before M5 exposes a multipart facility upload endpoint, set a proxy wire limit above
the 25 MiB file-content cap (to allow multipart framing) while preserving the server
side 25 MiB content check. The current `25M` Nginx setting is not sufficient for a
25 MiB file plus multipart overhead.

## M4/M5 facilities configuration and applicant wizard (not deployed)

M4 adds a `SUPER_ADMIN`-only configuration page under `/admin/facilities`.
Facilities must remain disabled until an enabled programme has an enabled intake, an
enabled supplier for that intake, and a published, non-retired, scan-passed Word
template for that supplier. M5 creates drafts only after those checks and an OTP
user's completed company profile pass server-side. Applicant uploads remain private:
the 25 MiB per-file and 150 MiB application limits are still enforced by the app.

This release has no payment, submission, review, export, or production rollout.
Rollback disables the facilities programme and redeploys the preceding application;
leave the additive evidence schema in place and preserve private storage/template
versions. Run reconciliation only after scanner/storage health checks, never to
inject failures in production.

## Environment

Compose interpolation/initialization `.env` lives on the server in:

```text
/data/apps/sana/.env
```

Required keys:

```env
APP_URL=https://sana.ioiv.ir
SESSION_SECRET=...

POSTGRES_DB=sana
POSTGRES_USER=postgres
POSTGRES_PASSWORD=...
```

Both env files hold credentials. They must be readable only by the deploy user and never
writable by the app container:

```bash
cd /data/apps/sana
chmod 600 .env .env.runtime .env.migration
ls -l .env .env.runtime .env.migration
```

The app-only `/data/apps/sana/.env.runtime` contains:

```env
DATABASE_URL=postgresql://sana_runtime:...@postgres:5432/sana?connection_limit=10&pool_timeout=10

UPLOAD_DIR=/app/uploads

ZARINPAL_MERCHANT_ID=<production-zarinpal-merchant-uuid>
ZARINPAL_SANDBOX=false

GHASEDAK_API_KEY=...
GHASEDAK_BASE_URL=https://api.smsapp.ir/v2
GHASEDAK_OTP_TEMPLATE=sanaotp
GHASEDAK_STATUS_TEMPLATE=sanastatus
GHASEDAK_SUBMITTED_TEMPLATE=sanasubmitted
SMS_SEND_IN_DEVELOPMENT=false

ADMIN_ALERT_MOBILE=...
SEED_ADMIN_MOBILES=...
SEED_DEMO_DATA=false

# OTP admissions per address/hour, including shared unknown (default30, range1–3000).
# Qualified X-Real-IP requires OTP_VERIFY_TRUST_PROXY=true; never trust XFF.
OTP_MAX_REQUESTS_PER_IP_PER_WINDOW=30
```

The maintenance-only `/data/apps/sana/.env.migration` contains:

```env
DATABASE_URL=postgresql://migration-owner:...@postgres:5432/sana
```

Do not commit real secrets. Use the versioned `.env.production.example`,
`.env.runtime.example`, and `.env.migration.example` files as templates only.

Important: the real merchant ID is not committed into application source code (an
earlier revision of this file did contain it; it remains in git history, so rotate it at
Zarinpal if that is ever considered a leak). Set it on the server environment:

```env
ZARINPAL_MERCHANT_ID=<production-zarinpal-merchant-uuid>
ZARINPAL_SANDBOX=false
APP_URL=https://sana.ioiv.ir
```

The callback sent to Zarinpal is built from `APP_URL`, so an incorrect value will send
users back to the wrong host after the bank page.

Server follow-up: confirm `/data/apps/sana/.env` contains the same production payment
values. The local development `.env` may use `APP_URL=http://localhost:3000`; the server
must use `APP_URL=https://sana.ioiv.ir`.

Check the current server values without printing unrelated secrets:

```bash
cd /data/apps/sana
grep -E '^(APP_URL|ZARINPAL_MERCHANT_ID|ZARINPAL_SANDBOX)=' .env
```

Expected production output:

```env
APP_URL=https://sana.ioiv.ir
ZARINPAL_MERCHANT_ID=<production-zarinpal-merchant-uuid>
ZARINPAL_SANDBOX=false
```

Check required env keys on the server:

```bash
cd /data/apps/sana

for key in \
APP_URL \
SESSION_SECRET \
POSTGRES_DB \
POSTGRES_USER \
POSTGRES_PASSWORD \
UPLOAD_DIR \
ZARINPAL_MERCHANT_ID \
ZARINPAL_SANDBOX \
GHASEDAK_API_KEY \
GHASEDAK_BASE_URL \
GHASEDAK_OTP_TEMPLATE \
GHASEDAK_STATUS_TEMPLATE \
GHASEDAK_SUBMITTED_TEMPLATE \
SMS_SEND_IN_DEVELOPMENT \
ADMIN_ALERT_MOBILE \
SEED_ADMIN_MOBILES \
SEED_DEMO_DATA
do
  if grep -q "^${key}=" .env; then
    echo "OK $key"
  else
    echo "MISSING $key"
  fi
done
```

## Network Allowlist

The server needs outbound access for the app and deployment process.

Minimum runtime access:

- `api.smsapp.ir:80` for production SMS with the current config.
- DNS resolution through the server resolver.

Deployment/build access:

- `docker.arvancloud.ir:443` for Docker image pulls when Docker Hub is unreliable or blocked.
- `registry.npmjs.org:443` for npm install during image builds if cache is cold.
- The pinned Alpine image’s official APK repositories for packages.

Optional/fallback:

- `gateway.ghasedak.me:443` if the SMS adapter is switched back to Ghasedak gateway.
- `binaries.prisma.sh:443` in the qualified build environment for locked Prisma engines.

Current production SMS endpoint:

```env
GHASEDAK_BASE_URL=https://api.smsapp.ir/v2
```

This was chosen because the HTTPS certificate for `api.smsapp.ir` was expired on May 1, 2026, while the HTTP endpoint works when outbound access is allowed.

## Prisma generation and immutable image delivery

Phase14 replaces the historical exported-engine workaround. Build runner and maintenance
images in a qualified environment with access to registry.npmjs.org, binaries.prisma.sh,
Docker Hub and the pinned Alpine image's official APK repositories. Generate Prisma from
package-lock.json and the current schema inside both images, before USER node. Never
copy an old prisma-engine-export tree into either image; .dockerignore excludes it.

The Dockerfile pins the Node22 Alpine manifest digest and uses that image's matching
repositories. Update the digest only with fresh OS/package scans and the verification
below. Build linux/amd64 for the existing intended server architecture; an ARM host's
native test is not proof of AMD64 engine compatibility.

If production cannot reach build dependencies, build and scan the complete images in
an authorized connected environment, record image IDs/digests and source/lock/schema
hashes, then transfer the exact image archives via the separately approved deployment
procedure. Do not repair a failed build by reintroducing stale generated clients.
No image transfer or production deployment is authorized by local qualification alone.

For each candidate, verify runner and maintenance independently: non-root UID, Node/
OpenSSL/Alpine versions, Prisma client/engine alignment, actual restricted database
query, maintenance migrate deploy/status and exact image vulnerability scan. Runner
must lack the Prisma CLI, config package, dangling CLI link and obsolete exported tree.
Maintenance keeps the CLI, generates its own native client and uses migration-owner
credentials only for explicit migrations. Runtime starts without schema mutation.

The scoped @prisma/config deepmerge-ts8 override addresses one advisory chain represented
by three npm entries. Its config semantics must be covered by real CLI generation and
migration checks. No blind Prisma downgrade. Rollback uses a previously qualified image
compatible with current additive schema; preserve all earlier data/backup requirements.

## Deploy Code Changes

Since 2026-09-26 production gets its code from GitHub, not from rsync or uploaded
tarballs. `/data/apps/sana` is a git checkout of `master` from the public repository
`https://github.com/mahdi7596/ioiv.git`, and the app image is built on the server.
The server can reach GitHub, the npm registry, Docker Hub, Alpine mirrors and Prisma
binaries (checked 2026-09-26), so no Mac-side image build or transfer is needed.

Never clone into another directory and run Compose from there: the Compose project
name comes from the directory name, and only `/data/apps/sana` uses the real
`sana_sana-postgres-data` and `sana_sana-uploads` volumes. A different directory
starts an empty database.

Files that stay on the server and are not in git (all ignored by `.gitignore`):
`.env`, `.env.runtime`, `.env.migration`, `docker-compose.release.yml` and its
`docker-compose.release.yml.bak-<sha>` rollback copies. `docker-compose.release.yml`
pins the running images:

```yaml
services:
  app:
    image: sana-app:<short-sha>
  migrate:
    image: sana-migrate:<short-sha-of-last-schema-release>
```

Always pass both Compose files for `up`, otherwise Compose would build or start an
unpinned image: `docker compose -f docker-compose.yml -f docker-compose.release.yml ...`.

### Routine update (no migrations, grants or env changes)

1. Push to `master` after local checks (`npm test`, `npm run lint`, `npm run build`).
2. Connect the L2TP VPN, SSH in and run:

   ```bash
   cd /data/apps/sana && bash scripts/deploy-server.sh
   ```

   The script shows the commits between the running tag and `origin/master`, asks
   for confirmation, fast-forwards the checkout, builds `sana-app:<short-sha>` (the
   live app keeps serving; about 5–10 minutes), updates the app tag in
   `docker-compose.release.yml`, recreates **only** the app container
   (`--no-deps --no-build`, Postgres is never touched) and waits for it to become
   healthy. If it does not, it restores the previous tag automatically. It stops
   before changing anything when the update touches `prisma/migrations`,
   `prisma/schema.prisma`, `prisma/*.sql`, `prisma.config.ts`, `package.json`,
   `package-lock.json` (a Prisma bump needs a matching `sana-migrate` image),
   `docker-compose.yml` or the env examples. It cannot detect a new required env
   variable that was not added to `.env.runtime.example`; keep the examples current.
   It also refuses to run when the checkout is not on `master` or tracked files
   were edited on the server.

3. Verify:

   ```bash
   curl -s http://127.0.0.1:3000/api/health; echo
   curl -sI https://sana.ioiv.ir | head -1
   docker compose logs --since 5m app | grep -iE 'error|fail|warn'
   ```

   Then check the changed screens in a browser.

4. Keep the previous app image for rollback and remove older ones, then clear the
   build cache (the server disk is 49 GB; one build cache reached 26 GB):

   ```bash
   docker images | grep sana
   docker image rm sana-app:<older-sha>
   docker image prune -f && docker builder prune -f
   df -h /data
   ```

Manual rollback (the script prints the exact command):

```bash
cd /data/apps/sana && cp docker-compose.release.yml.bak-<previous-sha> docker-compose.release.yml && docker compose -f docker-compose.yml -f docker-compose.release.yml up -d --no-deps --no-build app
```

Run the deploy and rollback commands separately. On 2026-09-26 both were pasted
together, so the release was deployed and immediately rolled back; it had to be
re-applied.

### Updates that need manual steps

When the script reports migrations, grant SQL, Compose or env-contract changes:

1. Take a fresh matched backup (see [Backups](#backups)): database dump, uploads
   archive and the config files listed above.
2. `git merge --ff-only origin/master`, then build both images:

   ```bash
   SHA=$(git rev-parse --short=7 HEAD)
   docker build -t sana-app:$SHA .
   docker build --target maintenance -t sana-migrate:$SHA .
   ```

3. Add any new runtime settings to `.env.runtime` / `.env.migration`.
4. Point both tags in `docker-compose.release.yml` at `$SHA` (keep a `.bak` copy),
   then run migrations explicitly:
   `docker compose -f docker-compose.yml -f docker-compose.release.yml --profile migration run --rm migrate`.
5. Re-apply the canonical runtime grants if `prisma/*.sql` changed (see
   [M1 database credentials and migration procedure](#m1-database-credentials-and-migration-procedure)).
6. `docker compose -f docker-compose.yml -f docker-compose.release.yml up -d --no-deps --no-build app`
   and verify as above. `docker compose restart` does not reload env files; after
   env-only changes use
   `docker compose -f docker-compose.yml -f docker-compose.release.yml up -d --no-deps --no-build --force-recreate app`.

Changing `docker-compose.yml` for the `postgres` service recreates the database
container on the next `up` without `--no-deps`; schedule that separately.

### History: rsync and image-tarball deploys

Before 2026-09-26 source was rsync'd (without `.git`) and images were built on the
Mac with `docker build --platform linux/amd64`, saved with `docker save`, copied
with `scp` and loaded on the server. That path is retired. When copying anything
from a Mac, check the prompt first: on 2026-09-26 a Mac-side `docker save | gzip`
was run on the server and produced an empty 20-byte archive, because a pipe without
`set -o pipefail` hides the failure.

The pre-git server source was archived as
`/data/backups/sana/sana-source-before-git-<timestamp>.tar.gz` (mode 600; contains the
env files).

## Database

List tables:

```bash
cd /data/apps/sana

docker compose exec postgres psql -U postgres -d sana -c '\dt'
```

List admins:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
select mobile, role, active
from "Admin"
order by mobile;
'
```

List registered users:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
select id, mobile, "companyName", "companyNationalId", "createdAt"
from "User"
order by "createdAt" desc;
'
```

List uploaded file records:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
select id, "applicationId", "fieldKey", "originalName", "mimeType", size, "storagePath", "createdAt"
from "ApplicationFile"
order by "createdAt" desc;
'
```

Seed initial admins:

```bash
docker compose exec app npm run db:seed
```

## Entry Viewer Admin Role Rollout

Use this checklist when deploying the `ENTRY_VIEWER` admin role for mobile `09362116801`.
This role can view admin entries but cannot download files, export submissions, change statuses,
write status notes, upload certificates, or replace certificates.

Do not insert the new admin row before the production migration has run. PostgreSQL must know the
`ENTRY_VIEWER` enum value first.

1. Confirm the server path and current state:

```bash
cd /data/apps/sana
git rev-parse --short HEAD || true
docker compose ps
```

2. Create a timestamped backup directory outside the app release directory:

```bash
mkdir -p /data/backups/sana/entry-viewer-$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=$(ls -td /data/backups/sana/entry-viewer-* | head -n 1)
echo "$BACKUP_DIR"
```

3. Take a full custom-format PostgreSQL backup before uploading or migrating:

```bash
docker compose exec -T postgres pg_dump -U postgres -d sana -Fc > "$BACKUP_DIR/sana-before-entry-viewer.dump"
```

4. Optionally take a plain SQL backup for quick inspection:

```bash
docker compose exec -T postgres pg_dump -U postgres -d sana > "$BACKUP_DIR/sana-before-entry-viewer.sql"
```

5. Verify the backups exist and are non-empty:

```bash
ls -lh "$BACKUP_DIR"
test -s "$BACKUP_DIR/sana-before-entry-viewer.dump" && echo "custom backup OK"
test -s "$BACKUP_DIR/sana-before-entry-viewer.sql" && echo "sql backup OK"
```

6. If possible, copy the backup directory off the server before continuing.

7. Deploy the tested code using the normal source upload/rebuild steps in this runbook. Because the
Prisma schema changes, regenerate and upload the Prisma engine export before rebuilding if the export
is older than `prisma/schema.prisma`.

8. Confirm the migration ran and the enum value exists:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
select enumlabel
from pg_enum
where enumtypid = '"'"'"UserRole"'"'"'::regtype
order by enumsortorder;
'
```

Expected output includes:

```text
ENTRY_VIEWER
```

9. Verify existing admins still exist before adding the viewer:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
select mobile, role, active
from "Admin"
order by mobile;
'
```

10. Insert or update the viewer admin row after the enum exists:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
INSERT INTO "Admin" ("id", "name", "mobile", "role", "active", "createdAt", "updatedAt")
VALUES (
  '"'"'admin-viewer-09362116801'"'"',
  '"'"'مشاهده‌گر پرونده‌ها'"'"',
  '"'"'09362116801'"'"',
  '"'"'ENTRY_VIEWER'"'"',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("mobile") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "role" = '"'"'ENTRY_VIEWER'"'"',
  "active" = true,
  "updatedAt" = NOW();
'
```

11. Verify the viewer row:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
select mobile, role, active
from "Admin"
where mobile = '"'"'09362116801'"'"';
'
```

12. Test production behavior:

- Existing `ADMIN` or `SUPER_ADMIN` can still log in and use normal admin actions.
- Mobile `09362116801` can log in through `/admin/login`.
- Mobile `09362116801` can open `/admin`, `/admin/submissions`, and a submission detail page.
- Mobile `09362116801` cannot see export buttons, file download buttons, status-change controls, or certificate replacement controls.
- Direct requests from mobile `09362116801` to file download, export, status-change, and certificate replacement endpoints are forbidden.

13. If an issue appears after adding the row, deactivate the viewer first:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
UPDATE "Admin"
SET "active" = false, "updatedAt" = NOW()
WHERE mobile = '"'"'09362116801'"'"';
'
```

Then roll back application code if needed. Do not attempt to remove the `ENTRY_VIEWER` enum value
during incident response.

Reset production data for a fresh test cycle:

1. Back up the database first:

```bash
cd /data/apps/sana
mkdir -p /data/backups/sana

docker compose exec -T postgres pg_dump -U postgres -d sana -Fc > /data/backups/sana/sana-before-reset-$(date +%Y%m%d-%H%M%S).dump
```

2. Clear test/user data while keeping schema and migrations:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
TRUNCATE TABLE
  "ApplicationFile",
  "StatusHistory",
  "Payment",
  "Application",
  "OtpCode",
  "User"
RESTART IDENTITY CASCADE;
'
```

3. Reseed admins:

```bash
docker compose exec app npm run db:seed
```

4. Verify the reset:

```bash
docker compose exec postgres psql -U postgres -d sana -c '
select
  (select count(*) from "Admin") as admins,
  (select count(*) from "User") as users,
  (select count(*) from "Application") as applications,
  (select count(*) from "Payment") as payments,
  (select count(*) from "ApplicationFile") as files,
  (select count(*) from "StatusHistory") as histories,
  (select count(*) from "OtpCode") as otps;
'
```

Expected fresh-test state after seeding is one admin per mobile listed in `SEED_ADMIN_MOBILES` (the seed no longer hardcodes any) and zero rows for the other listed tables.

## Uploads

The app stores uploaded files in the container at:

```text
/app/uploads
```

This is mounted to the Docker volume:

```text
sana_sana-uploads
```

Host path:

```text
/data/docker/volumes/sana_sana-uploads/_data
```

Check app-side upload storage:

```bash
cd /data/apps/sana

docker compose exec app sh -c 'find /app/uploads -maxdepth 5 -type f -exec ls -lh {} \;'
```

Check host-side persisted files:

```bash
sudo find /data/docker/volumes/sana_sana-uploads/_data -maxdepth 5 -type f -exec ls -lh {} \;
```

Check write access:

```bash
docker compose exec app sh -c 'echo "UPLOAD_DIR=$UPLOAD_DIR"; id; ls -ld /app/uploads; touch /app/uploads/write-test.txt && ls -l /app/uploads/write-test.txt && rm /app/uploads/write-test.txt'
```

Upload route smoke test:

```bash
curl -i -X POST http://127.0.0.1:3000/api/uploads
```

Expected result without a browser session:

```text
HTTP/1.1 401 Unauthorized
{"error":"Unauthorized"}
```

If this returns `404`, the upload route is missing from the deployed build. Confirm these files exist on the server:

```text
app/api/uploads/route.ts
lib/uploads/storage.ts
```

Then rebuild the app image.

## SMS

The current SMS adapter is configurable with:

```env
GHASEDAK_BASE_URL=https://api.smsapp.ir/v2
GHASEDAK_API_KEY=...
GHASEDAK_OTP_TEMPLATE=sanaotp
GHASEDAK_STATUS_TEMPLATE=sanastatus
GHASEDAK_SUBMITTED_TEMPLATE=sanasubmitted
```

The status and submitted templates require `%param1%`, and the app sends:

```ts
params: { recipient: "کاربر" }
```

Check SMS connectivity inside the container:

```bash
cd /data/apps/sana

docker compose exec app sh -c 'echo "GHASEDAK_BASE_URL=$GHASEDAK_BASE_URL"; node -e "fetch(process.env.GHASEDAK_BASE_URL).then(r=>console.log(r.status, r.statusText)).catch(e=>console.error(e.name, e.message, e.cause))"'
```

A plain `404` from the base URL can be fine. A timeout means network access is still blocked.

Watch SMS app logs:

```bash
docker compose logs --tail=120 app
```

Useful log events:

- `otp_request_unavailable`
- `sms_send_started`
- `sms_send_succeeded`
- `sms_send_failed`
- `otp_sms_unconfirmed`
- `otp_verify_unavailable`

## Health Checks

Container health:

```bash
cd /data/apps/sana
docker compose ps
```

Local app health (the same endpoint the Compose healthcheck polls; `503` means
the database ping failed):

```bash
curl -i http://127.0.0.1:3000/api/health
```

Public app health:

```bash
curl -I https://sana.ioiv.ir
```

Nginx logs:

```bash
sudo tail -n 80 /var/log/nginx/error.log
sudo tail -n 80 /var/log/nginx/access.log
```

App logs:

```bash
docker compose logs --tail=120 app
```

## Troubleshooting

### `no configuration file provided: not found`

Run:

```bash
cd /data/apps/sana
```

Then repeat the Docker Compose command.

### Prisma tries to download from `binaries.prisma.sh`

This means the image does not have the correct Linux Prisma engine export, or the runtime is trying to run a Prisma command without the `schema-engine`.

Fix:

1. Recreate `prisma-engine-export.tar.gz` locally using `Dockerfile.prisma-export`.
2. Confirm it contains Linux musl engine files.
3. Upload and extract it on the server.
4. Rebuild `sana-app`.

### Build error: Prisma enum or field missing

Example errors:

- `Module '"@prisma/client"' has no exported member 'ApplicationStatus'`
- `Property 'companyName' does not exist`

Cause: stale Prisma client export.

Fix: regenerate the Prisma export from the current local schema and upload it again.

### Upload API returns `404`

Cause: route file missing from server source or deployed image.

Fix:

```bash
rsync -az --progress \
  app/api/uploads/route.ts \
  administrator@192.168.50.109:/data/apps/sana/app/api/uploads/

rsync -az --progress \
  lib/uploads/storage.ts \
  administrator@192.168.50.109:/data/apps/sana/lib/uploads/
```

Then commit and push the missing file and redeploy with
`bash scripts/deploy-server.sh` (see [Deploy Code Changes](#deploy-code-changes)).

### Upload API returns `500`

Check:

```bash
docker compose logs --since=3m app | tail -n 120
docker compose exec app sh -c 'id; ls -ld /app/uploads; touch /app/uploads/write-test.txt && rm /app/uploads/write-test.txt'
```

Also check that Nginx has:

```nginx
client_max_body_size 25M;
```

The app currently limits files to 20 MB.

### Browser shows `Failed to find Server Action`

This can happen after a redeploy while the browser has stale Next.js chunks.

Fix:

- Hard refresh: `Cmd + Shift + R`
- Or use an incognito window
- Log in again

### SMS request returns app `502`

Check app logs:

```bash
docker compose logs --tail=120 app
```

If the root error is `CERT_HAS_EXPIRED`, avoid HTTPS for `api.smsapp.ir` and use:

```env
GHASEDAK_BASE_URL=https://api.smsapp.ir/v2
```

If the root error is `ConnectTimeoutError`, ask the server admin to allow outbound access to the configured SMS host and port.

## Backups

Back up PostgreSQL and uploads together.

Example database dump:

```bash
cd /data/apps/sana
mkdir -p /data/backups/sana

docker compose exec -T postgres pg_dump -U postgres -d sana > /data/backups/sana/sana-$(date +%Y%m%d-%H%M%S).sql
```

Example uploads archive:

```bash
tar -czf /data/backups/sana/sana-uploads-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C /data/docker/volumes/sana_sana-uploads/_data .
```

Do not restore database and uploads independently unless you know which application/file IDs belong together.

## M6 facilities payment and confirmed submission (not deployed)

M6 adds an additive facilities payment lifecycle and a facilities-only callback route.
It does not modify the legacy `Payment` table, legacy payment callback, legacy
application statuses, or legacy validation workflow. Payment-enabled applications
use the amount pinned when the draft was created. The applicant confirms the final
information before checkout; after the gateway callback is verified server-side, the
application is submitted atomically as `SUBMITTED`. Payment-disabled applications
skip checkout and submit after the same server-side evidence checks.

Before a future M6 deployment:

1. Create a dated Git backup branch and verify PostgreSQL, private upload storage,
   runtime configuration, and an isolated restore rehearsal.
2. Apply the additive migration through the migration Compose profile only, then
   rerun the restricted runtime-role provisioning script and regenerate the Linux
   Prisma engine export.
3. Confirm that the Zarinpal merchant configuration is present only in the runtime
   environment. Never place it in browser code, audit metadata, or logs.
4. Run Prisma validation/generation, `npm test`, `npm run lint`, `npm run build`,
   and the isolated facilities database integrity checks. Also verify forged,
   duplicate, delayed, cancelled, failed, and unknown callbacks in a non-production
   environment.
5. Confirm the applicant-facing payment confirmation wording before enabling any
   payment-enabled intake. Do not expose unapproved payment acknowledgement copy.

Rollback redeploys the prior application and runtime configuration while leaving the
additive M6 schema and immutable payment/audit history in place. A payment-enabled
facilities intake must remain disabled until the callback and submission checks pass
in the restored verification environment. No M6 production deployment has been run
by this change.

## M7 facilities review and corrections (not deployed)

M7 adds the facilities-only admin queue/detail routes, full-review permissions for
active `ADMIN` and `SUPER_ADMIN`, read-only metadata access for `ENTRY_VIEWER`, current
protected evidence downloads, repeatable correction cycles, correction-only SMS, and
applicant resubmission without another payment. It does not change legacy submissions,
legacy file routes, legacy certificates, or legacy status actions.

Required runtime settings:

```env
GHASEDAK_FACILITIES_CORRECTION_TEMPLATE=sanacorrection
SMS_REQUEST_TIMEOUT_MS=10000
```

Before an M7 production deployment:

1. Create and push a new dated backup branch from the release commit. Take verified
   PostgreSQL, private upload-storage, `.env.runtime`, and relevant configuration
   backups, then complete an isolated restore rehearsal.
2. Apply the additive M7 migrations
   `20260911160000_add_facilities_m7_review_corrections`,
   `20260911161000_restore_facilities_audit_metadata_validation`,
   `20260911162000_enforce_persian_facilities_correction_notes`, and
   `20260911163000_expand_persian_correction_note_range` with the migration-owner
   credential through the maintenance profile. The second migration restores safety
   checks accidentally omitted by an earlier audit-validator replacement; the final
   two enforce the full Persian/Arabic Unicode range for new correction notes without
   rejecting legacy rows. Re-run
   `prisma/facilities-runtime-role-provision.sql`; the app runtime must not migrate.
3. Configure and verify the correction template without logging its API credential.
   Confirm provider timeout/failure leaves the application in `NEEDS_EDIT`, shows a
   failed delivery state to full reviewers, and succeeds through the explicit retry.
4. Run `npm run test:db:m7-review`, `npm test`, `npm run lint`, and `npm run build` in
   the release environment. Manually verify two full correction cycles, entry-viewer
   denial, cross-user denial, stale-file denial, disabled-intake correction recovery,
   and profile locking.
5. Keep facilities availability disabled if the scanner, private ready storage,
   restricted database role, SMS template, or reviewer access checks are not ready.

M7 rollback redeploys the M6 application/runtime configuration while leaving the
additive correction SMS columns, officer source identifier, enum values, and immutable
history/audit rows in place. Do not attempt a destructive schema rollback without an
approved tested database restore.

## M8 facilities export, audit, and resilience (not deployed)

M8 adds a facilities-only XLSX export for active `ADMIN`/`SUPER_ADMIN`, a
`SUPER_ADMIN`-only audit viewer, application-scoped admin file downloads, typed audit
events for sensitive reads, and singleton file reconciliation. It does not change the
legacy export, enable facilities, or deploy the programme; those controls remain for M9.

Apply migration `20260912120000_add_facilities_m8_export_audit_resilience` with the
migration-owner credential, regenerate the Linux Prisma engine export, and reapply the
canonical runtime-role grants. Rollback redeploys M7 and leaves additive enum values and
indexes in place.

The synchronous facilities export rejects more than 5,000 applications or 100,000
related worksheet rows. `APP_URL` is the only origin used for workbook hyperlinks and
must be HTTPS in production. Never derive export links from request headers.

Schedule the maintenance reconciler every five minutes only as part of M9 after scanner
and storage approval. It uses a PostgreSQL advisory transaction lock; exit code `2`
means another run holds the lock, and exit code `1` means an operational failure that
requires investigation. Terminal quarantine bytes purge on the next successful run.
Scanner/storage-unavailable bytes retry for 24 hours, then become terminal and purge;
safe metadata remains. Logs contain counts, IDs, durations, and fixed reason codes only.

Before M9, run:

```bash
DATABASE_URL="...isolated migration-owner database..." npm run test:db:m8-operations
DATABASE_URL="...restricted staging runtime..." npm run facilities:check-readiness
```

The readiness command verifies the trusted URL, restricted audit grants, a private
storage write/read/delete canary, ClamAV scan canary, expired quarantine backlog,
pending deletion backlog, export limits, and at least 2 GiB free private-storage
capacity. A non-zero result keeps facilities disabled. It never prints credentials,
paths, document names, hashes, or content.

Before production rollout, create and push a new dated Git backup branch and take
matched PostgreSQL, private upload volume, `.env.runtime`, and facilities configuration
backups. Restore the database and upload pair into an isolated environment, verify audit
immutability and scoped links, run M1/M2/M6/M7/M8 suites, and rehearse rollback. Chaos
tests for database, scanner, storage, and deletion failures are local/staging only.

For a failed correction SMS, a full reviewer opens the facilities application detail
page and uses «تلاش مجدد برای پیامک اصلاح». Repeated retries do not create another
correction request or charge. Inspect only masked diagnostics matching
`facilities_correction_sms_failed`; never copy provider responses or mobile numbers
into tickets or audit metadata.

## M9 controlled rollout (repository safeguards implemented; not deployed)

The authoritative runbook is
`docs/2026-09-12-facilities-m9-controlled-rollout-plan.md`; the testable contract and
implementation checklist are under
`openspec/changes/implement-facilities-m9-controlled-rollout`. The plan aligns with the
M9 milestone, but production is a no-go until G0 decisions, external access/ownership,
staging evidence, matched backup/restore, user handoffs, canary, and observation are
real and approved. Repository examples never count as production evidence.

Run `npm audit --omit=dev` on the exact candidate. Apply supported runtime fixes and
repeat all qualification. Any remaining critical/high runtime finding is a G0/G1
no-go unless the dependency is replaced or named security and release authorities
record actual exposure, compensating controls, expiry, and accepted residual risk.
At M9 implementation time, Next.js/Vitest updates are supported; the npm `xlsx` package
still reports high advisories without a registry fix and therefore cannot be silently
waived merely because the application uses it primarily for export.

The application image now copies the readiness/reconciliation scripts and TypeScript
path configuration required by the documented runtime commands. Prisma CLI is retained
only in the Compose `maintenance` target used by the migration service; the runner
removes CLI/engine/config packages and copies back only the generated runtime client.
Build and scan both targets. Do not change the app service to the maintenance target or
run migration commands in the application container.

Validate the pending record structure safely:

```bash
npm run facilities:m9:validate
```

Copy the two pending examples from `operations/facilities-m9` to protected release
working storage, replace pending entries with approved/evidenced records, and validate
a required gate explicitly:

```bash
npm run facilities:m9:validate -- \
  --decisions /protected/release/decisions.json \
  --evidence /protected/release/evidence.json \
  --require-gate G3
```

Do not commit the working ledgers. The validator rejects secret-bearing fields and
out-of-order gates, but human approvers must still verify external evidence truth.

After committing all release inputs, generate the manifest only from the clean exact
candidate SHA. The command refuses any tracked or untracked worktree change and writes
with create-only mode when an output path is supplied:

```bash
npm run facilities:m9:manifest -- --output /protected/release/candidate-manifest.json
```

Fill and independently verify the pending Linux Prisma export checksum, candidate image
digest, actual previous deployment identity, and pushed backup-ref identity outside
Git. Any changed source/config/artifact invalidates dependent gates.

Run the read-only preflight in the protected migration-owner maintenance context while
explicitly naming the restricted runtime role. This lets it verify migration history
without granting that metadata to the application. G1–G5 require the disabled
expectation; `enabled` is valid only after the final audited G6 SUPER_ADMIN action:

```bash
DATABASE_URL="...migration-owner database..." npm run facilities:m9:preflight -- \
  --expect-programme disabled \
  --runtime-role sana_runtime
```

This complements, not replaces, `facilities:check-readiness`, which deliberately writes,
scans, reads, and deletes a private canary. Run that canary only in an authorized release
window. Neither command proves signature freshness, malware detection, static-file
privacy, scheduler/alerts, backups, load limits, or legacy behavior by itself.

If production inventory shows the four approved supplier catalogue rows are absent,
use the narrow command rather than `db:seed`:

```bash
npm run facilities:m9:provision-suppliers
npm run facilities:m9:provision-suppliers -- --apply
```

Dry-run is the default. Apply inserts only missing approved names, creates no availability
or other seed data, and blocks on unexpected suppliers. Record the safe result as G5
maintenance evidence.

Review `operations/facilities-m9/operator-checklist.md` and
`monitoring-contract.md`. The Compose override, Nginx location, maintenance wrapper,
and systemd files in that directory are examples only: pin the scanner by digest,
validate limits/network/filesystem identities in staging, install with least privilege,
and prove the real alert destination before G2/G6. A lock-held reconciler exit `2` is
not a successful batch, and exit `0` does not prove more than the bounded batch drained.

The user exclusively takes the current production database backup and uploads or
redeploys the application. Codex/operators verify identities, take matched non-database
backups where access permits, restore/rehearse in isolation, and coordinate the release.
No production migration, upload, enablement, payment canary, or destructive restore is
authorized by these repository changes.

## Security hardening phase 2 (2026-09-16): upload traversal, ports, OTP limits

Closes audit items U1, U2, A1, A2, A3, A9 from
`docs/2026-09-15-architecture-and-security-audit.md`.

What changed:

- `/api/uploads` only accepts the wizard's known `fieldKey` values and a
  single-segment `applicationId`; the storage layer also refuses any path outside
  `UPLOAD_DIR`.
- `docker-compose.yml` binds ports `3000` and `55433` to `127.0.0.1`, sets
  `mem_limit: 1g` on the app, and polls `/api/health`.
- OTP verification allows five wrong guesses per code and consumes the code
  atomically. OTP requests are additionally capped per client address per hour
  (`OTP_MAX_REQUESTS_PER_IP_PER_WINDOW`, default 30).

Deploy steps:

1. Pull, then run the migration with the migration profile (adds
   `OtpCode.attemptCount`, `OtpCode.requestIp`, one index; additive):

   ```bash
   cd /data/apps/sana
   docker compose --profile migration run --rm migrate
   ```

2. Rebuild and restart the app, then confirm the new port binding and health:

   ```bash
   docker compose build app
   docker compose up -d app
   docker compose ps
   curl -i http://127.0.0.1:3000/api/health
   curl -I https://sana.ioiv.ir
   ```

3. Historical request-count attribution is superseded by the Phase5 rollout below.
   Default is bounded shared unknown; qualify ingress before enabling
   OTP_VERIFY_TRUST_PROXY. Never rely on the former otp_ip_limit_hit/raw-IP event.

4. Manual check: request an OTP, enter five wrong codes, then the right one; it
   must be rejected. Request a new code; it must work.

## Security hardening phase 3 (2026-09-16): payments, SMS transport, headers, seed

Closes audit items P1, P3, P4, P6, A5, A6, A7 and the gateway-credential notes.

What changed:

- `/payment/return` and the facilities wizard banner read the payment row instead of the
  URL; a forged `?status=success` shows a neutral message.
- Facilities payments record `VERIFIED` before attempting submission. If submission then
  fails, the applicant sees "پرداخت ثبت شد؛ ارسال کامل نشد" and the next submit completes
  it. Attempts older than 20 minutes are re-verified (with an authority) or failed (without
  one) on the next "pay" click, so nobody is stuck on "pending". The admin detail page lists
  every attempt with its age.
- Zarinpal calls time out after `ZARINPAL_REQUEST_TIMEOUT_MS` (default 10 s).
- `APP_URL` is required; there is no localhost fallback.
- Ghasedak defaults to `https://api.smsapp.ir/v2` and refuses `http://` in production
  unless `GHASEDAK_ALLOW_INSECURE_HTTP=true`.
- Security headers (CSP, HSTS, nosniff, frame-ancestors, referrer, permissions) on every
  response.
- `/api/auth/logout` is POST-only; `/api/auth/session-reset` (GET) clears a stale cookie.
- `npm run db:seed` requires `SEED_ADMIN_MOBILES` and never modifies existing admins.

Deploy steps:

1. Pre-flight the SMS provider's TLS before switching the URL:

   ```bash
   curl -vI https://api.smsapp.ir/v2/ 2>&1 | grep -E 'SSL certificate|expire|HTTP/'
   ```

   If the certificate is valid, set `GHASEDAK_BASE_URL=https://api.smsapp.ir/v2` in
   `.env.runtime`. If it is still broken, keep the `http://` value and add
   `GHASEDAK_ALLOW_INSECURE_HTTP=true` for now; the app logs `sms_insecure_transport` once
   per start while the override is active. Remove the override as soon as TLS works.

2. Confirm `.env.runtime` has `APP_URL=https://sana.ioiv.ir` (the app refuses to build a
   payment callback without it) and add `SEED_ADMIN_MOBILES=<comma-separated>` before any
   future `db:seed`.

3. Rebuild and restart, then verify the headers and hydration:

   ```bash
   docker compose build app && docker compose up -d app
   curl -sI https://sana.ioiv.ir | grep -Ei 'content-security-policy|strict-transport|x-frame|x-content-type'
   ```

   Open the login page, the facilities wizard, and the admin overview in a browser and
   confirm there are no CSP errors in the console and the Enamad seal renders. Exactly one
   `Strict-Transport-Security` header must appear; if a CDN adds its own, drop one.

4. Sandbox payment round trip on both flows (`ZARINPAL_SANDBOX=true` on a staging copy):
   pay, confirm the wizard banner and the admin attempts list, then load
   `/payment/return?status=success&paymentId=<someone else's id>` and confirm the neutral
   message.

## Security hardening phase 4 (2026-09-16): uploads

Closes audit items U3, U5, U6, U7, U8, U12 (U1 shipped in phase 2).

What changed:

- Company-registration uploads (`/api/uploads` and the admin certificate) are verified
  by content with the facilities verifier: the browser-declared MIME type is ignored,
  the detected type is stored, and mismatched or corrupt files are rejected with a
  specific Persian message. CSV is only required to be non-empty text (Persian Excel
  exports are often Windows-1256).
- Legacy uploads are virus-scanned and fail closed exactly like the facilities pipeline:
  with no scanner configured (`FACILITIES_CLAMAV_HOST`/`PORT` unset or invalid) every
  legacy upload is rejected with 503 and the app logs
  `legacy_upload_scanner_not_configured`; a flagged or unscannable file is rejected
  (422 / 503). clamd is therefore required in production for both flows.
- `xlsx` (SheetJS) is pinned to 0.20.3 from the vendor registry
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, closes CVE-2023-30533 and
  CVE-2024-22363); `npm ci` fetches that tarball URL directly, so the build host needs
  access to `cdn.sheetjs.com` in addition to the npm registry. Workbook verification
  reads only sheet names (`bookSheets`), never cell data, and the application-files
  route checks slot ownership before parsing any file content.
- Re-uploading a legacy field replaces the previous row and file instead of adding one.
- Legacy downloads send `X-Content-Type-Options: nosniff`, `Cache-Control: private,
  no-store`, and fall back to `application/octet-stream` for rows that still carry a
  browser-declared type.
- ZIP uploads may only contain PDF, image, and Office members; nested archives and
  executables are rejected. Identity packages must be a ZIP by content. Member names are
  not trusted on their own: the head of every member (a bounded, truncated inflate for
  deflated members; nothing is extracted) must carry the magic bytes its extension
  implies, and `.docx`/`.xlsx` members must open with a known Office part, so a ZIP or
  executable renamed to `scan.pdf` or `report.docx` is rejected as `ZIP_UNSAFE`. A member
  that is a genuine OOXML container whose later parts hide something else is still caught
  only by clamd, which scans archive contents.
- Admin multipart routes (`/api/admin/submissions/certificate` and `/status`) check the
  admin session and permission before reading the request body; the shared guard lives in
  `lib/admin/require-admin.ts` (a plain module, not a server action).
- The PDF check accepts cross-reference-stream PDFs (PDF 1.5+), which the previous
  check rejected.
- Scans are limited to `FACILITIES_SCAN_CONCURRENCY` (default 4) at a time; a wait over
  `FACILITIES_SCAN_QUEUE_TIMEOUT_MS` (default 20 s) is reported as UNAVAILABLE. Set
  clamd `StreamMaxLength` to at least `26M`.
- The admin certificate replacement goes through `/api/admin/submissions/certificate`
  instead of a server action, lifting the 1 MB action body limit.
- Every upload route checks the declared `Content-Length` before reading the body
  (413 above the file limit plus 1 MiB multipart overhead) and, for authenticated
  uploads, passes an admission gate before `formData()` buffers anything. The gate is
  process-local (`lib/uploads/rate-limit.ts`) and returns 429 with `Retry-After` on:
  `UPLOAD_MAX_IN_FLIGHT_PER_USER` (default 2) and `UPLOAD_MAX_IN_FLIGHT_GLOBAL`
  (default 6) bodies buffered at once, and `UPLOAD_MAX_PER_USER_PER_HOUR` (default 60)
  / `UPLOAD_MAX_PER_IP_PER_HOUR` (default 120) uploads in a sliding hour. The global
  in-flight cap is the memory bound: about two copies of a 25 MiB file per request,
  so 6 in flight is roughly 300 MiB against the 1 GiB container limit. Counters reset
  on restart; the durable quota remains the database trigger. Log events:
  `upload_request_too_large`, `upload_rate_limited` (with `reason`).
- The upload pipeline no longer re-copies the file at each stage (`asBuffer` in
  `lib/facilities-files/verification.ts`); previously each request held about five
  copies.
- The legacy submission SMS helpers live in `lib/payments/legacy-notifications.ts`, a
  plain module, so they are no longer registered as callable server actions.
- 2026-09-16: git history was rewritten with `git filter-repo --replace-text` to remove the
  production Zarinpal merchant ID that earlier commits (2026-05-07 to 2026-09-15) carried in
  `DEPLOYMENT.md` and `openspec/.../design.md`; every branch on `origin` was force-pushed.
  Clones made before that date must be re-cloned, not pulled. The pre-rewrite repository
  is kept as a bare mirror outside the tree (`ioiv-pre-rewrite-2026-09-16.git`) and must be
  deleted once GitHub support has purged cached views. The merchant ID itself belongs only
  in `.env.runtime`; `tests/no-committed-gateway-credentials.test.ts` fails the build if a
  real one is ever tracked again.
- Gateway answers are classified in `lib/payments/zarinpal-errors.ts`: only an explicit
  Zarinpal rejection (`errors.code`, for example -51/-53/-54) closes a payment attempt.
  HTTP 5xx, non-JSON bodies, missing fields, timeouts and network errors are "unknown"
  in both flows: the attempt stays open (`INITIATED` / `PENDING` / `TIMED_OUT`) and is
  re-verified later instead of being marked failed.
- Company-registration (legacy) payments are settled by `lib/payments/legacy-settlement.ts`.
  Verification and persistence are separate steps: if Zarinpal confirms the capture but
  the database write fails, the app logs `payment_verification_persist_failed`, leaves
  the row `INITIATED` with its authority, and sends the applicant to
  `/payment/return?status=pending`. The next "pay" click re-verifies that authority
  (Zarinpal answers "already verified", code 101) and completes the submission with no
  new fee; only an explicit rejection creates a fresh attempt. The return page renders a
  pending state for an `INITIATED` row and never invites a second payment for it. Watch
  for `payment_verification_persist_failed` and `payment_verification_unavailable` in
  production logs; each is a payment that needs the applicant's next retry (or manual
  reconciliation against the Zarinpal panel) to settle.
- Legacy callbacks are idempotent under concurrency: the row is claimed with a
  conditional update (`status <> VERIFIED`) inside one transaction, so two deliveries of
  the same callback produce one history row and one set of SMS
  (`payment_verification_already_settled` marks the loser).
- Duplicate captures are never verified, in either flow. When a callback arrives for an
  attempt whose application already holds a verified payment, the attempt is closed with
  reason `DUPLICATE_NOT_VERIFIED` (legacy: `duplicate_payment_not_verified`) and the
  applicant is shown the paid state; Zarinpal reverses an unverified capture to the payer
  on its own. Log events: `payment_duplicate_capture_declined`,
  `facilities_duplicate_capture_declined`.
- Facilities late capture (migration `20260916150000_facilities_payment_late_capture`,
  backwards compatible: it only relaxes the trigger). A callback with `Status=OK` for an
  attempt that was already closed (stale re-verify, earlier rejection) is verified with
  the gateway; a confirmed capture moves FAILED/CANCELLED → VERIFIED with reason
  `LATE_CAPTURE` and completes the submission (`facilities_payment_late_capture_recorded`).
  The same migration legalises TIMED_OUT → FAILED, which the stale-attempt cleanup already
  wrote but the original trigger did not permit. Manual reconciliation is needed only for
  `facilities_late_capture_verification_unavailable` (gateway unreachable for a closed
  attempt; nothing re-verifies it automatically).

Deploy steps:

1. Rebuild and restart the app. No migration.
2. Watch upload rejections for the first week and confirm they are genuine:

   ```bash
   docker compose logs app --since 24h | grep -E 'upload_failed|legacy_upload_unscanned|legacy_upload_scan_rejected'
   ```

3. If clamd is provisioned (optional overlay in `operations/facilities-m9/`), confirm
   `legacy_upload_unscanned` no longer appears and that a maximum-size (20 MB) legacy
   PDF uploads successfully.

## Security hardening phase 5 (2026-09-16): operations

Closes audit items S1, S2, S6, S8, U9, U11.

What changed:

- Admin lists (`/admin/submissions`, `/admin/facilities/applications`) are paginated 50
  rows at a time with a forward "صفحه بعد" link; exports still cover the whole filter.
- The company-registration export refuses more than 5,000 rows with a 422, like the
  facilities export, and sends `Cache-Control: private, no-store`.
- The orphan reaper has a safety guard (see the M2 maintenance section).
- `npm run auth:prune-otp` deletes day-old OTP rows; the maintenance example script runs it.
- `DATABASE_URL` carries `connection_limit=10&pool_timeout=10`.
- The nginx upload location example covers all three upload routes.

Deploy steps:

1. Run the migration (four additive indexes: `Application(userId)`,
   `Application(createdAt, id)`, `Payment(applicationId)`,
   `FacilitiesApplication(updatedAt, id)`):

   ```bash
   cd /data/apps/sana
   docker compose --profile migration run --rm migrate
   ```

2. Append `?connection_limit=10&pool_timeout=10` to `DATABASE_URL` in `.env.runtime`,
   rebuild, restart. Confirm the runtime role may delete OTP rows:

   ```bash
   docker compose exec app npm run auth:prune-otp
   ```

3. Replace the facilities upload `location` block in nginx with the updated example and
   `nginx -t && systemctl reload nginx`.

4. Manual check: with more than 50 company-registration applications, the submissions
   page shows a "صفحه بعد" link and the second page continues without repeats.

## 2026-09-18 Phase 1 payment coordinator — deployment remains blocked

R2 introduces additive `PaymentObligation`, append-only `PaymentOperationResult`, and
`PaymentNotificationIntent` tables, plus two narrow facilities payment-audit repairs.
See [Phase 1 evidence](docs/security-remediation-2026-09-18/phase-1/README.md) and
[provider limits](docs/security-remediation-2026-09-18/phase-1/provider-evidence.md).
No production migration or deployment was performed. Facilities must remain disabled.

Before any later authorized release:

1. Owner creates the dated Git backup and verified matched production DB, uploads and
   configuration backups. The local synthetic migration rehearsal is not this backup.
2. Pause payment starts/callback mutation at the proxy and drain old application workers;
   retain callback request identifiers in protected operational intake without treating
   browser fields as payment proof. Never run old payment writers beside new ones.
3. Inventory all legacy/facilities attempts, including failed/cancelled/no-authority and
   duplicate verified rows. Apply all three new migrations with the migration owner;
   apply the canonical runtime grants. Do not edit previously applied migrations.
4. Inspect the backfilled obligations. Existing verified evidence blocks new payment.
   Multiple unresolved attempts, unknown starts and failed attempts remain UNCERTAIN;
   no rows/history/capture evidence are deleted. Duplicate historical captures remain
   preserved, with `HISTORICAL_MULTIPLE_CAPTURES` for manual investigation.
5. Deploy every compatible writer; verify restricted-role start/callback, duplicate and
   recovery behavior before reopening payment endpoints. Unknown provider outcomes are
   not a reason to create a new attempt. Other open phases still block launch.

Migration failure: the coordinator DDL/backfill is transactional; on failure inspect the
cause, confirm rollback, use Prisma's failed-migration resolution procedure only after
verifying actual schema state, then rerun. Enum additions are additive and rerunnable.
Never drop evidence or mark an uncertain attempt failed to make a migration pass.

Rollback: pause payment mutations, retain expanded schema/results and use compatible
recovery code. Returning to old payment writers is unsafe. A destructive restore needs
separate authorization and reconciliation of all external activity since the backup.

Recovery: saved AUTHORITY/CAPTURED results replay local persistence on the next applicable
start/callback. A request/verification whose result was lost stays blocked even after its
lease expires; no overlapping remote retry is assumed safe. The owner investigates when
the client reports the case through gateway dashboard/support. Record the selected attempt,
operation generation and gateway-confirmed authority/amount/reference in a protected case;
reconcile the original attempt, never erase it or automatically refund it. A future guarded
operator reconciliation procedure must be qualified with the provider before writing external
facts back into payment state. No new admin panel, scheduled review or response SLA exists.

Notification intent: legacy settlement writes one durable logical intent in its transaction.
It is claimed once before existing SMS calls. SENT/UNKNOWN/CLAIMED are not automatically
resent; a crash after claim may leave delivery unknown. This is not exactly-once SMS delivery.
Facilities gains no new submission SMS category. Operation metadata follows payment evidence
retention; no new deletion schedule or personal-data collection was introduced.

## 2026-09-19 Phase 2 payment state protection — deployment remains blocked

R1 now routes legacy cancellation returns through server verification. Browser NOK does
not prove nonpayment and cannot release another charge. Captured evidence is preserved;
settlement only submits DRAFT/PENDING_PAYMENT and never resets later review state/time.
Corrections use the application lock and one history transition without repayment. Admin
status writes use status/updatedAt compare-and-swap; stale actions return Persian 409 with
no history/SMS. On that confirmed rollback only, a freshly staged certificate is removed;
cleanup failure logs `validation_certificate_conflict_cleanup_failed` with application ID
and requires operator investigation of unreferenced candidate storage. Do not delete the
existing certificate or files after an ambiguous transaction result.

No new migration, grant, config, retention or existing-data repair is required by Phase2.
Phase1's 27 migrations, write pause/drain, compatible writers and backup prerequisites still
apply. Deploy callback, start/resubmission, settlement and admin writers together; no mixed
old writers. Preserve all captured payment/operation/history evidence during rollback and
use a compatible guarded version, never restore the stale cancellation handler. Current
uncertain cases retain the existing client-report/manual-owner reconciliation policy.

Verify using the [Phase2 replay guide](docs/security-remediation-2026-09-18/phase-2/README.md):
restricted-role concurrency, known-rollback certificate bytes, full suite/build/types/lint,
production browser cancellation/refresh/correction and one-authority process regressions.
Local verification does not qualify real provider behavior, full admin/file workflows or
release infrastructure. R11 remains Phase12; Phase3/R12 and all later release gates remain
open. Facilities stays disabled. No production operation was performed or authorized.

## 2026-09-19 Phase 3 gateway validation — deployment remains blocked

R12 now validates new Zarinpal response envelopes, request100/verify100-or101 codes,
positive safe integer references, and production A/sandbox S authorities. Contradictory
responses remain UNKNOWN. Only complete documented negative errors permit a sequential
check of the original authority; uncertainty never authorizes a second payment or unsafe
remote replay. Provider prose is excluded from diagnostics. Legacy request amount now
comes from its stored payment obligation rather than rereading the global fee constant.

No new migration/grant/config/retention/data repair. Phase1/2 prerequisites remain: all27
migrations, drain/pause payment writers, matched verified backups, compatible rollback,
and preservation of payment evidence. Never roll back to permissive gateway validation.
Historical CAPTURED records remain recoverable; this change does not certify old responses.

[Phase3 evidence/replay](docs/security-remediation-2026-09-18/phase-3/README.md) records
413 tests,39 restricted-role DB cases, five process-crash checks, production browser at
390/1440px, build/types/lint and independent review. These use controlled providers, not
actual sandbox qualification. Verify actual IRT amount behavior, accepted identifiers,
101 recovery/finality and timeout handling with authorized sandbox evidence in Phase19.
No real charge, live SMS, refund, production migration/deployment or facilities activation.
Overall launch NO-GO; Phase4 and remaining release gates require further authorized work.


## 2026-09-19 Phase4 OTP verification rollout (local qualification only)

R3 originally changed verification only; Phase5 below extends request/SMS accounting. Facilities
stays disabled; overall launch remains NO-GO. This is a future authorized rollout
procedure, not permission to deploy or migrate production. Preserve owner handoff,
new dated Git backup and verified matched DB/uploads/config backups before rollout.

D3 owner approved temporary protected identifiers and normal deletion within24 hours.
New AuthVerifyBucket holds HMAC mobile+purpose/address keys, bounded rolling-hour
timestamps, touched time, and a global secret fingerprint; no raw mobile/IP/OTP/session
is added there. Existing OtpCode retention and backups are unchanged. Cleanup deletes
inactive keys at2 hours; hourly maintenance gives headroom inside24 hours when healthy.
Mobile/address HMAC keys rotate hourly using database time; both current and previous
hour keys count toward the same rolling limit. Therefore continuously active identifiers
also become inactive and are pruned within about4 hours with hourly maintenance (about3 hours with ongoing admission cleanup). Global/unknown keys are not
personal identifiers; their event arrays discard older timestamps on admission. Backups/WAL and DB downtime do not
have a new24-hour physical-erasure guarantee. On recovery, overdue cleanup must succeed
before verification resumes; do not bypass it after an outage.

Verification caps: five reserved real-code guesses per code (correct guesses count),
30 attempts/mobile+purpose/hour,120/trusted address/hour,300/shared unknown address/hour
and3000 global/hour, all exact rolling windows shared across processes. These limits
bound missing/expired/exhausted-code work as well. Global/address spending commits even
when the mobile is denied. At most about6001 bucket keys can be created per hour;
expired keys and timestamp arrays are pruned, no permanent per-person bucket history.
Global/unknown limits can temporarily deny legitimate users during an attack; this is
the bounded fail-closed fallback until trusted proxy attribution is qualified.

Required sequence:

1. Pause auth mutations at the proxy and drain all old verification writers. Additive
   DDL alone does not fix old application instances. Payment callback handling follows
   the previous phase's continuity requirements; no payment writer behavior changes.
2. Apply new migration20260919120000_otp_verification_limits with migration owner, then
   canonical runtime grants. It adds one table/index and two fixed-purpose functions.
   Runtime receives SELECT/INSERT/UPDATE for accounting and EXECUTE on cleanup and
   active-admin lock/read, no DELETE/TRUNCATE and no Admin UPDATE. PUBLIC cannot execute
   either security-definer helper. Ownership must remain the trusted migration owner,
   never runtime; runtime must not CREATE in public schema or inherit owner privileges.
3. Set OTP_VERIFY_LIMIT_SECRET to a dedicated cryptographically random secret (at least
   32 characters) shared identically by every worker, including maintenance. Do not reuse
   SESSION_SECRET or commit/log it. Missing/mismatched config fails verification503.
   Existing global-row fingerprint rejects mixed secrets. For intentional rotation,
   pause all auth mutations and drain dispatch workers, wait more than2 hours since the last limiter admission,
   prune inactive rows, deploy the same new secret to every worker, test, then reopen.
   Never truncate live accounting or rotate a single worker to reset budgets.
4. OTP_VERIFY_TRUST_PROXY defaults false: all traffic uses the bounded unknown-address
   budget. Set true only after proving the sole ingress replaces X-Real-IP with a
   trustworthy canonical client address and direct access is blocked. X-Forwarded-For
   is never used by either OTP route. Qualify CDN topology separately; unqualified headers
   are not proof of identity. Phase5 requests use the same attribution policy.
5. Generate Prisma client/engine export from current schema for the target runtime
   before image build; do not deploy an older prisma-engine-export. Actual Node22 images
   remain unqualified by local Node26 tests. Install the hourly command
   `docker compose exec -T app npm run auth:prune-verification` even with zero login
   traffic (example: operations/auth-verification-maintenance.example.cron). Run it once
   and verify deletion with restricted role before reopening.
6. The cron example alone is not monitoring: qualify operator alert delivery for command
   nonzero exits and absence of successful hourly completion (maximum2 hours). The
   command emits only aggregate count after commit, reason-only failure and nonzero exit.
   Admission also prunes under the same short global lock and fails closed when pruning
   or DB/config access fails. Repair maintenance/DB, run cleanup and prove healthy
   restricted verification before restoring normal service. No new operator SLA implied.
7. Verify caps under concurrency, expired/replayed denial, single cookie, applicant/admin
   retry/mobile RTL, restricted privileges, cleanup and secret consistency before reopening.

The migration is transactional. A failed transaction leaves no partial table/helpers;
inspect rollback and Prisma migration status, correct the cause and retry per standard
failed-migration recovery. Existing OTP rows/attempt counts are not rewritten, including
historical counts above5 (they remain unusable). No user/payment/file backfill. Do not
change already-applied migrations. Local rollback/failure rehearsal is synthetic.

Rollback: keep expanded schema/functions and data; pause auth and use a compatible
verification build. Do not restore old count-after-bcrypt writers or delete live budgets.
A process crash spends its guess; a code consumed before a lost response/cookie must
be replaced through normal request flow, never unconsumed. No automatic replay after
ambiguous commits. Database lock waits are bounded and return actionable Persian503;
expired/code errors remain generic400 and shared limits429. A session already issued
is governed by the unchanged session lifecycle, not OTP expiry.


## 2026-09-19 Phase5 OTP request/SMS rollout (local qualification only)

R5 uses PostgreSQL atomic admission before hashing or SMS. Mobile+purpose retains the
existing90-second cooldown and five admissions per exact rolling hour (an active admin
can use both distinct login purposes). Address admissions across all mobiles/purposes
use OTP_MAX_REQUESTS_PER_IP_PER_WINDOW, default30; invalid, zero or >3000 values fail
closed503. Unknown addresses share that same configured quota; there is no bypass.
Request global3000/hour bounds allocation. Verification quotas remain separate.
Rejected mobile/admin probes spend address/global capacity; unsuccessful work never
refunds quota. Default shared unknown can deny legitimate users during abuse; qualify
proxy attribution and capacity before launch, do not silently increase/bypass limits.

Before authorized rollout, take required dated Git and verified matched DB/uploads/config
backups, pause both OTP mutations and drain every old request/verification worker and
in-flight SMS call. Apply additive migration20260919130000_otp_request_intents, canonical
runtime grants and regenerate Prisma client. Deploy all compatible app and maintenance
workers together; old count-before-insert request writers cannot overlap. No production
operation is authorized by this document. Keep facilities disabled and launch NO-GO.

AuthRequestIntent stores only UUID, rotating protected mobile+purpose key, admission time
and nullable one-use claim time. No raw mobile/IP/message/code/hash is stored in intents;
new OtpCode rows no longer store raw requestIp (existing rows/retention unchanged).
Claim and OTP replacement commit together, and only an acknowledged winning commit may
call SMS. Claims expire90 seconds after admission, rechecked after OTP row locks.
After claim, no automatic provider retry, replay queue or quota refund exists. A crash
or uncertain commit may spend quota without sending. Delayed provider delivery may arrive
out of order; latest code remains authoritative. Exactly-once remote delivery is not claimed.

SMS is awaited within its bounded provider timeout (default10s, maximum30s). Provider
failure/timeout/malformed result returns code entry with a Persian uncertainty warning;
a possibly delivered code remains usable. User may explicitly request a new code after
cooldown if quota remains. Browser network uncertainty also exposes entry. No delivery
receipt is promised. Both SMS layers omit provider prose/message/OTP from diagnostics,
including development mode; no console OTP fallback. Other notification categories remain
unchanged except shared safe error logging and conservative success-response validation.
Actual provider response/delivery semantics still require Phase19 qualification.

Reuse OTP_VERIFY_LIMIT_SECRET and OTP_VERIFY_TRUST_PROXY for both routes. Separate
request-prefixed and verification buckets never borrow quota; fingerprints check both
global rows to block mixed-secret reset. Intent cleanup uses narrowly scoped
prune_auth_request_intents(), no runtime DELETE/TRUNCATE. PUBLIC execution is revoked.
The existing hourly auth:prune-verification command now prunes both buckets and intents
in one transaction, logging success only after commit; retain the hourly scheduler and
missed/nonzero-run alerts described above. Request admission/claim fails closed if required
cleanup is unavailable. Repair, prune and verify before resuming. Intents older2hours
are removed; hourly maintenance yields about3hours healthy retention. Rotating buckets
retain the Phase4 about4hour bound inside approved24hours. No account/application deletion,
backup/WAL retention change or erasure guarantee during DB downtime.

Rehearse transactional migration failure/rollback/rerun and PUBLIC denial; run canonical
restricted-role regression and real request/verification DB suites. Before reopening,
verify eight concurrent requests admit/send one, worker-crash behavior, trusted/unknown
address limits, slow/failed/uncertain SMS, mobile/admin accessible recovery and cleanup.
Evidence/replay: docs/security-remediation-2026-09-18/phase-5/. Local Node26 and controlled
loopback provider do not qualify Node22 release images, actual proxy/SMS or monitoring.
Rollback retains expanded schema/intents/budgets, pauses auth, and uses a compatible build;
never truncate reservations or fall back to vulnerable writers. No historical backfill.

### Phase6 authentication origin boundary (local verification; not deployed)

Both OTP POST endpoints require the browser's exact serialized `Origin` to equal the
canonical origin of runtime `APP_URL`, and `Content-Type: application/json` (optionally
UTF-8 charset). Foreign, missing, null, malformed or multiple origins return403 before
body parsing or auth/SMS/database effects; unsupported media returns415, malformed JSON400.
No nonbrowser exemption is supported. Missing/invalid configuration fails closed503.
APP_URL must have HTTP(S), no credentials/query/fragment/non-root path; HTTP is permitted
only on localhost/127.0.0.1/[::1] for isolated development, HTTPS is required otherwise.
Use `APP_URL=https://sana.ioiv.ir` on every deployed instance. A different public alias
must redirect to the canonical site before the login page; do not broaden the allow-list.

The existing nginx example listens on80 and proxies to internal HTTP; actual HTTPS
ingress still requires qualification. Preserve the
browser Origin header unchanged through the actual TLS proxy. Host, Forwarded and
X-Forwarded-* never authorize login; internal HTTP does not override configured HTTPS.
Qualify actual TLS termination and canonical redirects before launch: normal applicant/
admin JSON request+verify succeeds with Secure/HttpOnly/Lax cookie; a foreign top-level
text/plain form and null/missing Origin cannot set a cookie. Local self-signed TLS proxy
checks do not qualify the production proxy, DNS, certificate or network exposure.

No Phase6 schema/grant/retention change. Drain old auth writers for a consistent cutover;
rollback must retain the origin/media guard and prior quota/verification protections,
never restore vulnerable endpoints. Diagnose503 by checking canonical APP_URL on each
instance; do not bypass checks or derive trust from Host headers. Existing logout and
session-reset workflows remain for their separately scoped phase.

### Phase7 admin request privacy (local verification; not deployed)

After shared admission, admin OTP requests return the same200 conditional code-entry
message for active, inactive and unknown numbers, including uncertain SMS or claim outcomes.
Unknown/inactive numbers do not create OTPs/accounts/roles or send SMS. Admission still
spends mobile/address/global capacity first;429 and admission/config/DB503 do not query
admin existence. Verification still requires a live active admin and one consumed code.

Admin responses wait at least SMS_REQUEST_TIMEOUT_MS (same1–30s clamp/default10s as the
provider) plus12s after admission, covering normal bounded lookup/hash/claim/dispatch work.
Default minimum22s; maximum42s plus admission. The admin browser timeout is60s and fields
remain locked while pending; an uncertain network result still permits code entry.
This deliberate latency mitigates healthy timing disclosure. It is not constant-time
certification under event-loop stalls, DB network faults, or infrastructure overload.
Qualify actual proxy timeouts/capacity before launch; keep the same timeout on all workers.
Do not remove the wait, return account-specific errors, detach/replay SMS, or bypass quotas.
Sanitized admin_otp_unconfirmed diagnostics identify an operational failure only.

No new schema/grants/retention/backfill. Existing Phase4/5 migration, secret, maintenance,
proxy qualification and drain/cutover rules remain. Deploy uniform writers together;
rollback preserves Phase4–7 auth protections. Facilities remains disabled; launch NO-GO.
Local evidence/replay lives in docs/security-remediation-2026-09-18/phase-7/.

### Phase8 facilities file replacement (local verification; not deployed)

Migration `20260919140000_facilities_committed_file_lineage` separates immutable attempted
revision/base identity from successful committed predecessor/sequence. Failed attempts no
longer occupy the next successful replacement. The migration locks relevant tables,
preflights successful history/current pointers, aborts atomically on ambiguity, and records
append-only repair evidence. Deleted successful history remains part of lineage. Do not
silently rewrite an ambiguous history; preserve a backup and investigate it before retrying.
The runtime has SELECT only on `FacilitiesFileLineageRepair`; reapply canonical grants.

This is **not a mixed-writer rolling deployment**. Before any authorized production change,
follow the dated Git/database/private-upload/configuration backup and restore requirements.
Pause admission and drain all uploads, scanner retries and reconciliation workers before
applying the migration. Deploy the matching generated Prisma client and compatible writers
on every instance, then resume only after migration, role and replacement checks pass.
Old retries lack ownership tokens; old compensating deletion is unsafe. Rollback retains
expanded schema, attempt/repair evidence and bytes and uses a compatible guarded build.
Never drop lineage fields, truncate attempts, or restore the vulnerable upload worker.

All writers lock application/company before binding. Successful scan, current pointer,
lineage, audit and predecessor tombstone commit atomically; the database rejects detached
successful revisions. Binding advancement rechecks editability and the150MiB logical quota.
Quota counts current bytes plus pending reservations with one bounded predecessor credit;
obsolete retained physical bytes still consume storage capacity and need cleanup monitoring.
Direct maintenance SQL must follow the same locking protocol; a deadlock must roll back and
be retried only after checking durable state, never compensated by deleting current bytes.

UNAVAILABLE quarantine retains its original24h deadline. Exclusive token ownership allows
one acknowledged retry; stale/noneditable work is retained until expiry. Crashed PENDING
uploads also expire at their original deadline. Never restart retention on retry or claim
another worker's in-flight scan. Same-key replay returns the durable original outcome;
new-key replacements remain possible after rejection. Network uncertainty in the UI shows
last-known content and asks for refresh instead of claiming a particular commit outcome.

Deletion requires a durable tombstone and rechecks current/template/direct-reference
protection. Reference writers lock stored metadata and reject tombstoned content, including
when cleanup I/O outlives a transaction timeout. Failed unlink/metadata cleanup remains
retryable; never delete potentially referenced ready bytes as failure compensation.
Orphan cleanup freezes candidate names before its exclusive advisory transaction, checks
for PENDING writers, and obtains fresh metadata references. Admission uses the shared lock.
Any pending upload can defer orphan cleanup globally until completion/original24h expiry;
alert on backlog/capacity. Completed tombstones and stale/noneditable retries do not consume
maintenance batches. Existing job qualification/grant issues remain Phase11 scope.

Evidence: `docs/security-remediation-2026-09-18/phase-8/`. Local controlled INSTREAM tests do
not certify real antivirus, production topology, volume capacity or backup restoration.
Facilities remains disabled outside isolated fixtures; no production deployment authorized
by this evidence and launch remains NO-GO.

### Phase9 legacy file replacement (local verification; not deployed)

Migration `20260919150000_legacy_file_bindings` adds current slot bindings/generations,
application draft versions, nullable verification metadata, an allocation journal, exact
predecessor deletion intents, and immutable historical repair inventory. Backfill uses
only unambiguous owned saved JSON references with exact original array slots. It never
selects the newest-created upload as truth. Historical scan metadata remains UNKNOWN;
missing/foreign/duplicate references and unbound certificates remain preserved for D4.
All unjournaled historical predecessor bytes are retained after replacement for review.

This requires a **drained writer cutover**, not a mixed old/new rolling deployment.
Before any authorized production migration, take and verify dated Git, database, private
upload and configuration backups. Pause applicant uploads/draft saves/payment starts,
admin certificate writers and file maintenance; drain existing requests. Apply the
migration, generate Prisma, reapply canonical runtime grants and deploy compatible
writers on every instance. Resume only after current-reference and restricted-role
checks. Rollback keeps expanded schema/journals/repair evidence and uses a compatible
writer. Never restore the old list-everything-except-my-upload cleanup algorithm.

The application row is locked before bindings; current pointer, saved JSON, version and
exact predecessor intent commit together. Payment draft saves and paid corrections use
the existing application-first payment lock. Active/uncertain payment obligations fence
applicant changes during provider I/O, including the interval where status is still DRAFT.
The browser queues its saves/uploads and uses generation/version conflicts for other tabs.
Known scan/type failures keep retry available; unknown acknowledgement requires refresh.
Admin detail/export and bound certificate readers use authoritative current pointers.

Legacy files retain the existing 20MiB/file limit; there is no new aggregate quota.
New objects use canonical private paths, exclusive writes and a pre-write allocation
journal. Verification retains detected MIME, hash, PASSED and time; scanner identity and
signature version are not available from the current protocol and remain null. This is
not real scanner certification and does not decide Phase10's historical submission policy.

Cleanup commits irreversible authorization before unlink and protects current/saved/shared
objects. Only journaled new predecessors are eligible for automatic removal; historical
paths are retained. ApplicationFile metadata has no runtime UPDATE/DELETE grant. Unlink
failure is retryable, ENOENT is success and authorized/deleted objects cannot reattach.
An uncommitted candidate expires only after24h; COMMITTED candidates never expire. After
ABANDONED is durable, a suspended old writer cannot become READY/commit. **Repeated sweeps
must include ABANDONED rows even when deletedAt is set**, since a pre-write process can
resume late and recreate an unattachable object after a prior cleanup. Do not use an
uncoordinated age-only filesystem purge. Phase11 qualifies/schedules maintenance; no
production job or grant expansion is enabled by this phase. Monitor retained bytes and
retry backlog; metadata/intents remain until an explicit retention policy is approved.

Local evidence: `docs/security-remediation-2026-09-18/phase-9/`. Facilities remains disabled
outside synthetic fixtures, production is unchanged and the overall launch verdict is NO-GO.

### Phase 10 required-document qualification and historical verification

New payments and submissions now require current, owned, correctly slotted, verified
private files whose bounded bytes match recorded type, size and SHA-256. Historical
legacy files without verification evidence remain UNKNOWN. Established downloads and
reviewed/completed cases keep their existing access; this gate does not quarantine or
remove historical files. The owner approved D4; production inventory/backfill is still a
separate operation requiring the agreed backups and rollout authorization.

Deploy the additive `20260919160000_legacy_file_verification` and
`20260919161000_facilities_editable_snapshot_refresh` migrations and reapply runtime
grants. Verification evidence is append-only. Snapshot refresh uses two narrowly scoped
functions limited to DRAFT/NEEDS_EDIT, instead of granting table DELETE. Retain these
schema objects and evidence on application rollback; reverting qualification reopens R10.

Use `tsx scripts/verify-legacy-files.ts --inventory [afterId]` for a bounded metadata-only
page (up to 100 rows, ordered by file ID). It changes nothing and omits paths. After
reviewing inventory and obtaining production authorization, an explicit
`--verify-file <fileId>` scans a current, unambiguous bound reference. Scanning happens
outside the application lock, then identity and actual bytes are rechecked under lock.
Concurrent replacement/content changes reject the record. Repeated identical outcomes
are deduplicated; UNAVAILABLE is an observation and does not replace prior conclusive
verification. UNKNOWN plus outage remains unqualified. Scanner protocol currently does
not report engine/signature versions; provenance fields remain null rather than invented.
A confirmed malicious historical file requires an explicit containment decision before
altering its established access. Never bulk-adopt newest-created files or certificates.

Confirmed payments persist before submission qualification. If files are unavailable,
a pending application returns to an editable paid draft. The applicant repairs documents
and submits without another fee. A browser retry also recovers a crash between capture
and submission; provider uncertainty still blocks unsafe remote replay. Operators must
retain payment evidence and must not reset an obligation to READY to work around a file
problem. Private storage must remain immutable outside authorized upload/cleanup paths.

### Phase 11 maintenance (local remediation; rollout remains gated)

Apply `20260919170000_bounded_otp_maintenance` as migration owner and reapply the
runtime grants before starting the new jobs. The fixed-search-path definer deletes
at most 5,000 OTP rows created over 24 hours ago whose expiry has passed, using database
time. Runtime receives EXECUTE only; direct OTP DELETE/TRUNCATE and retained legacy
file/evidence deletion remain denied. `MaintenanceCursor` holds scheduling progress,
not authorization or file identity; runtime may SELECT/INSERT/UPDATE it only.

Run `auth:prune-otp`, `legacy:reconcile-files`, and `facilities:reconcile-files` with
the restricted application role and the same private storage mounts as the app.
The optional schedule is `operations/data-maintenance.example.cron`; installation,
log retention, operator ownership and alert delivery require deployment qualification.
Existing `auth:prune-verification` continues independently. OTP uses advisory key
730180805, legacy files 730180806, facilities files 730180800; orphan exclusion retains
730180801. Concurrent jobs skip with exit 2. Never install overlapping old scripts.

Exit 0 means the observed job scope completed, exit 1 means dependency/worker failure,
and exit 2 means skipped, guarded, backlog, or partial coverage. Inspect structured
reason/counts and retry on the next bounded scheduled run. Legacy `resweepNotVisited`
is intentionally nonzero when this run did not revisit every eligible candidate;
large retained candidate sets can consistently return 2 while making progress. Alert
on failures, non-progress and increasing backlog rather than labeling this as a full
successful sweep. A late writer can recreate abandoned bytes after a prior unlink:
repeat sweeps retain identity metadata and never prove permanent absence. Historical
files are not automatically deleted. Facilities guard reasons (invalid TTL, empty
known-file inventory, orphan tripwire, active upload) are incomplete outcomes; investigate
instead of relaxing safety guards. Deferred deletion retries also remain visible.

File jobs reserve per-category time and durably rotate queue priority before I/O;
row cursors advance before work so process death cannot pin retries to one item.
A parent holds coordination while an IPC child works for a bounded interval. Parent
death disconnects the child; connection failure or the 80-second watchdog kills and
awaits it before reporting failure. Per-object lifecycle/reference fences remain the
safety authority during the connection-loss detection window; filesystem and database
changes are not atomic. Completion logs/audit occur only after coordinator transaction
acknowledgement. Terminating either process is safe to retry; never launch the private
worker flag directly.

Rollback: stop/drain these schedulers first; retain the additive schema, cursors, OTP
helper and immutable file metadata. Roll back only to compatible guarded writers.
Do not grant broad DELETE or restore the old false-success jobs to make cleanup run.
Verify the migration/grants, execute a controlled restricted-role fixture, and qualify
scheduler exit-code alerts before production rollout. No production cleanup or schedule
installation was performed by the local remediation.

### Phase 12 review concurrency and uncertain correction messages

Apply both `20260919180000_admin_review_coordination` and
`20260919181000_correction_sms_uncertainty`, then reapply runtime grants before starting
new review writers. Drain existing review/SMS writers during rollout. Runtime retains
SELECT-only Admin access; `lock_review_admin(text)` is fixed-search-path SECURITY DEFINER,
PUBLIC execution revoked, scoped to locking the specified admin row. Review mutations
lock application first and admin second, then check live session/role/version/state.
Concurrent revocation and a committed decision therefore have a defined database order.

Legacy admin forms carry draftVersion/status; each status decision increments version,
and certificate replacement already does so. Facilities adds reviewVersion=0 for existing
rows, advanced by a database trigger on every update, including resubmission, so stale
forms and state cycles cannot silently overwrite newer decisions. Old pages without
required tokens receive Persian409 and must refresh. Expired admin requests return
Persian401; facilities Server Actions serialize safe expected errors explicitly.

Correction SMS admission requires an open correction on NEEDS_EDIT and spends one durable
claim before dispatch. Provider transport exceptions do not prove non-delivery. Keep
spent PENDING with DELIVERY_UNCONFIRMED; successful dispatch whose database persistence
is uncertain stays SENT or spent PENDING/PERSISTENCE_UNCONFIRMED, never retryable FAILED.
The check constraint permits only those two uncertainty codes on spent/time-stamped
PENDING rows. A retry requires explicit PROVIDER_REJECTED plus FAILED and an active open
correction; the current adapter cannot supply that proof, so historical generic failures
are not offered as safe retries. Investigate delivery with the provider; no automatic
re-send or unsupported provider idempotency claim. Provider qualification remains Phase19.
A post-commit SMS claim failure reports the saved correction with unconfirmed delivery.

Rollback: drain new/old review and SMS writers; retain both additive migrations, version
and uncertainty evidence. Do not restore prior retry semantics or writers that ignore
review tokens/role locking. Known losing uploads remain journalled cleanup candidates;
Phase11 reaps them after retention. Ambiguous commits never authorize request-path unlink.
Local fixtures qualify code behavior only, not rollout, real SMS delivery or launch.

### Phase 13 session recovery and logout qualification

Keep APP_URL set to the canonical public origin; proxy Host headers never authorize
logout or determine its redirect. Normal same-origin HTML POST logout forms work;
missing/foreign/null Origin requests fail403 and malformed APP_URL fails503 without
clearing a cookie. GET logout remains405. Session-reset GET checks the signed token
and live subject, preserving active sessions; absent cookies produce no deletion.
Only invalid/expired tokens or missing/inactive subjects are cleared. Secret or database
unavailability returns actionable503 and preserves the cookie. Both redirects are
canonical and no-store. Session cookies retain30minute expiry, HttpOnly, SameSite=Lax,
Secure in production and root scope. No schema or retention changes. Do not roll back
to the unconditional GET reset or unguarded logout routes. Actual production proxy and
HTTPS qualification remain separate release gates; this phase uses local isolation.


## 2026-09-22 owner-authorized antivirus bypass

The owner explicitly requested disabling antivirus for the 2 GiB server. The shared
scanner factory now accepts `UPLOAD_ANTIVIRUS_DISABLED=true` in `.env.runtime`.
Only the exact value `true` disables scanning; absent, false or malformed values
retain scanner enforcement. The development passthrough remains prohibited in
production. Deploy the changed image and set this runtime value before recreating the app
with `docker compose up -d --force-recreate app`; `docker compose restart` does not
reload its environment. Changing the file alone does not change a running container.

This applies to legacy uploads/certificates, facilities/profile/template uploads,
reconciliation retries and explicit historical verification using the shared factory.
Content/type validation, size/quota limits, hashes, ownership, private storage and
payment coordination remain enforced. There is no new database migration.

Compatibility limitation: existing PASSED/scanVerdict/scannedAt fields represent
policy acceptance while this flag is enabled, NOT proof of antivirus scanning.
No per-file persistent bypass marker is added by this minimal change. Record the
release/configuration interval; do not claim these records are malware-certified.
Each bypass logs upload_antivirus_disabled without file content or identifying data.
Readiness reports antivirusDisabled=true, scannerReady=false and remains unsuccessful;
this change does not satisfy scanner qualification or authorize facilities enablement.

To re-enable scanning, provision/qualify ClamAV, set the flag to false and recreate
the app and any separately configured workers. Previously accepted files are NOT
retroactively scanned or blocked by that change; a separate inventory and explicit
rescan is required before claiming antivirus coverage for them. Keep existing
failed/malicious records intact; do not reset state or rewrite verification evidence.
All existing migration, matched backup/restore and remaining release gates still apply.
No production configuration or application was changed during this code task.

Local verification for this change: focused scanner/upload suites passed (32 tests);
full suite: 490 passed, 231 database-dependent tests skipped, one existing
`no-committed-gateway-credentials` location-allowlist failure (unchanged tracked
fixture/script paths fall outside its allowlist). Lint: zero errors, one existing
public-page image warning. Production build including TypeScript passed after
regenerating the stale local Prisma client. Independent critical review found no
blocking issue with the documented policy-acceptance limitation. Actual production
upload/download/submission and pending migrations still require deployment verification.

## 2026-09-23 rehearsal: editable company-profile permissions

The fae8c69 image rehearsal exposed a missing runtime DELETE grant: saving even
an empty shareholder list calls CompanyShareholder.deleteMany, and removing an
unbound officer calls CompanyOfficer.deleteMany. The canonical runtime grant script
now permits DELETE on only CompanyShareholder and CompanyOfficer and explicitly
revokes TRUNCATE on both. Submitted snapshot, audit and file-retention permissions
remain unchanged. Apply the updated canonical grants as database owner after
migrations and before app activation; no new schema migration or app rebuild is needed.

The existing role regression harness now asserts these grants and denies deletion
of application shareholder/officer snapshots. A rollback-only check against the
local migrated rehearsal DB applied the canonical grants and successfully executed
zero-row DELETE statements as sana_runtime on both tables; no rows or grants were
persisted by that check. Independent review approved the narrow permissions.
Subsequent local browser verification saved the profile and retained its values
after refresh. A newly uploaded private ZIP downloaded in the authenticated browser
before and after app restart; an unauthenticated curl request returned 404.
These checks do not qualify other-user authorization or all legacy uploads.
Production is unchanged.

## 2026-09-23 release-image dependency triage

Scout reported 1 critical and 12 high findings in each 44ac862 image. Inspection
of the actual images located the flagged tar, brace-expansion, ip-address, pacote,
sigstore and picomatch versions under `/usr/local/lib/node_modules/npm`.
The application image's only other flagged package was vendor SheetJS `xlsx@0.20.3`.

Both final Docker stages now install pinned npm 11.19.1, compatible with the pinned
base's Node 22.23.2. This updates retained package-manager tooling without changing
the app lockfile or dependency installation/pruning. npm and npx remain available
for documented startup and maintenance commands. Rebuild both images; installing
the new npm on the host does not update existing containers. No schema change is
required for this tooling patch.

The two SheetJS findings are not applicable to the installed vendor version:
[CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533) was fixed in
0.19.3, and [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363)
was fixed in 0.20.2. This disposition applies only to those two CVEs and the
verified vendor 0.20.3 package, not to other spreadsheet or upload risks.

Local candidate tags are `sana-app:44ac862-npm-fix` and
`sana-migrate:44ac862-npm-fix` (uncommitted Dockerfile patch atop 44ac862).
Both build successfully. As the unprivileged node user, npm startup returns
`{"ok":true}` from health and the restricted database client counts 25 applications.
Maintenance `npx --no-install prisma migrate status` with the rehearsal owner
reports all 36 migrations applied. The runtime role is correctly denied access
to migration history. Independent Dockerfile review found no blocking issue.
Final-image Scout rescans completed: both report 0 critical and 2 high findings,
only the two non-applicable SheetJS CVEs above. All 11 npm-related findings are
absent. Raw reports are retained in `docs/security-remediation-2026-09-23/`.
Verified patched npm dependencies: tar 7.5.22, brace-expansion 5.0.9,
ip-address 10.5.0, pacote 21.5.1, sigstore 4.1.1, picomatch 4.0.4.
Image IDs: app `sha256:c8784774197825c15aff91bce230f0a995242d93e880aeb7d57c7fb5a7b3f1ae`;
maintenance `sha256:d1785cdc661ade6833e60c54e74758be77d7667fb38e363baaeaf706b6c04451`.
This closes the reported high/critical dependency triage, not the remaining
production deployment and functional verification requirements.

The existing production app has been restarted and is serving HTTP 200. Because
production writes resumed, take a fresh matched database/uploads/configuration
backup before the eventual deployment; the September 22 backup is no longer the
deployment cutover snapshot. No production update was performed by this patch.

### Company-profile form error handling (2026-09-23)

Profile draft saving, upload-slot preparation, and completion now return expected
validation errors as serializable results to the client form. This preserves Persian
validation messages that production React otherwise redacts as error #441. Unexpected
failures return a generic retry message and emit `facilities.profile.action_failed`
with the operation name only; no submitted data or raw exception is logged.

No schema or storage migration is required. Deploy through the normal application
release process; rollback restores the previous application build. Verify in a
non-production environment that missing documents and a share total other than 100
show actionable Persian messages, while a valid complete profile reaches the dashboard.

### Local login prerequisites (2026-09-23)

Local development requires the current database migrations and a dedicated random
`OTP_VERIFY_LIMIT_SECRET` of at least 32 characters in the ignored `.env` file. Use
`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`
to generate it, then save the output as `OTP_VERIFY_LIMIT_SECRET` in `.env`; do not
commit the generated value or reuse production secrets. Restart the development server after changing local configuration.
The existing request/verification limits remain enabled locally.

Before updating an existing local database, take a protected `pg_dump -Fc` backup and
verify its archive listing. Run `npx prisma migrate deploy` against the confirmed local
database. If previously applied manual changes cause a duplicate-column failure,
inspect every statement in that migration and the actual column definitions before
marking it applied; do not reset the database or blindly mark pending migrations.
Restore the protected dump with the previous application/configuration if rollback is
required. This local recovery procedure does not authorize production migrations.

For actual SMS delivery during `next dev`, use valid provider configuration and
`SMS_SEND_IN_DEVELOPMENT=true`. The default false setting suppresses delivery and
neither displays nor logs the OTP; it is not an interactive login bypass.

### PDF upload detection — 2026-09-23

At the owner's request, facilities PDF detection now checks the leading `%PDF-`
signature without requiring object, trailer/cross-reference, or end-of-file markers.
The legacy uploader uses this same detector and receives the same PDF relaxation;
its application workflow is unchanged.
This is format identification, not a guarantee that a PDF is complete or readable.
Extension matching, size limits, authorization, private storage, and the separate
malware-scanning policy remain unchanged. No schema or storage migration is needed.
Verify with `npx vitest run tests/facilities-files.test.ts`; rollback consists of
restoring the previous PDF detector and its tests. Previously accepted uploads are
not revalidated by this change.

## 2026-09-26 production release 6cd4ea3 and git-based deploys

Production moved from `sana-app:80d4da9` to `sana-app:6cd4ea3` (commits `b1eade7`
facilities form actions/profile errors/PDF detection and `6cd4ea3` credit report
guidance). No migration, grant, Dockerfile or env change; `sana-migrate:80d4da9`
remains the current migration image. The owner chose to rely on the 2026-09-22
backup (`/data/backups/sana/20260922-180032`) because the release did not touch
data, schema or uploads.

`/data/apps/sana` was converted in place into a git checkout of `origin/master`
(untracked env and release files preserved) and the image was built on the server.
Verified: container healthy, `/api/health` `{"ok":true}`, public `HTTP/1.1 200`,
no app errors in the first five minutes. Old tarballs, `prisma-engine-export`,
`sana-app:latest` and 26 GB of build cache were removed; `/data` went from 89% to
30% used. `sana-app:80d4da9` is kept for rollback.

Open item: the running `sana-postgres` container was created before the loopback
port change and still publishes `0.0.0.0:55433`. Recreate it in a scheduled window
after a fresh database dump (`docker compose up -d postgres`) and confirm
`127.0.0.1:55433` in `docker compose ps`.
