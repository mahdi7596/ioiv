# Sana Deployment Runbook

Production domain: `https://sana.ioiv.ir`

This document records the current production deployment state and the operational steps learned during the first server deployment.

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

## Access Rules

Use L2TP when connecting to the private server IP:

- Required: SSH, rsync, or any command using `192.168.50.109`.
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
- App port: `3000`
- PostgreSQL external host port: `55433`
- PostgreSQL internal port: `5432`

Useful commands:

```bash
cd /data/apps/sana

docker compose build app
docker compose up -d
docker compose ps
docker compose logs --tail=80 app
```

The app container runs:

```bash
npx prisma migrate deploy
npm run start
```

## Environment

Production `.env` lives on the server in:

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

UPLOAD_DIR=/app/uploads

ZARINPAL_MERCHANT_ID=260c2494-c9f1-434b-af18-03b51b88cec2
ZARINPAL_SANDBOX=false

GHASEDAK_API_KEY=...
GHASEDAK_BASE_URL=http://api.smsapp.ir/v2
GHASEDAK_OTP_TEMPLATE=sanaotp
GHASEDAK_STATUS_TEMPLATE=sanastatus
GHASEDAK_SUBMITTED_TEMPLATE=sanasubmitted
SMS_SEND_IN_DEVELOPMENT=false

ADMIN_ALERT_MOBILE=...
SEED_ADMIN_MOBILES=...
SEED_DEMO_DATA=false
```

Do not commit real secrets. Use `.env.production.example` for examples only.

Important: the real merchant ID is not committed into application source code. Set it on
the server environment:

```env
ZARINPAL_MERCHANT_ID=260c2494-c9f1-434b-af18-03b51b88cec2
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
ZARINPAL_MERCHANT_ID=260c2494-c9f1-434b-af18-03b51b88cec2
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
- `mirror.arvancloud.ir:443` for Alpine packages.

Optional/fallback:

- `gateway.ghasedak.me:443` if the SMS adapter is switched back to Ghasedak gateway.
- `binaries.prisma.sh:443` only if the Prisma pre-generated engine export workaround is removed.

Current production SMS endpoint:

```env
GHASEDAK_BASE_URL=http://api.smsapp.ir/v2
```

This was chosen because the HTTPS certificate for `api.smsapp.ir` was expired on May 1, 2026, while the HTTP endpoint works when outbound access is allowed.

## Prisma Engine Export

The production Dockerfile intentionally does not run `npx prisma generate` during the app build. It copies pre-generated Prisma client and Linux musl engines from:

```text
prisma-engine-export/.prisma
prisma-engine-export/@prisma
```

This is needed because the server cannot reliably download Prisma binaries from `binaries.prisma.sh`.

The export must contain Linux musl OpenSSL 3 files:

```text
schema-engine-linux-musl-openssl-3.0.x
libquery_engine-linux-musl-openssl-3.0.x.so.node
```

Check the export:

```bash
find prisma-engine-export -type f | grep -E 'schema-engine|libquery_engine' | head -n 20
```

Expected examples:

```text
prisma-engine-export/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
prisma-engine-export/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x
prisma-engine-export/@prisma/engines/libquery_engine-linux-musl-openssl-3.0.x.so.node
```

### Create the Export Locally

On Apple Silicon, first make sure an AMD64 Node Alpine base image is available:

```bash
docker pull --platform linux/amd64 docker.arvancloud.ir/library/node:22-alpine
docker tag docker.arvancloud.ir/library/node:22-alpine node:22-alpine-amd64
docker image inspect node:22-alpine-amd64 --format '{{.Os}}/{{.Architecture}}'
```

Build the export image:

```bash
cd /Users/mahdi/Documents/work/ioiv

docker build \
  --platform linux/amd64 \
  -f Dockerfile.prisma-export \
  -t sana-prisma-export:latest \
  .
```

Extract the generated Prisma files:

```bash
rm -rf prisma-engine-export prisma-engine-export.tar.gz

docker create --name sana-prisma-extract sana-prisma-export:latest
mkdir -p prisma-engine-export
docker cp sana-prisma-extract:/app/node_modules/.prisma prisma-engine-export/.prisma
docker cp sana-prisma-extract:/app/node_modules/@prisma prisma-engine-export/@prisma
docker rm sana-prisma-extract

tar -czf prisma-engine-export.tar.gz prisma-engine-export

find prisma-engine-export -type f | grep -E 'schema-engine|libquery_engine' | head -n 20
ls -lh prisma-engine-export.tar.gz
```

The archive is expected to be roughly 50-55 MB.

Upload it to the server:

```bash
rsync -az --progress \
  prisma-engine-export.tar.gz \
  administrator@192.168.50.109:/data/apps/sana/
```

On the server:

```bash
cd /data/apps/sana
rm -rf prisma-engine-export
tar -xzf prisma-engine-export.tar.gz
find prisma-engine-export -type f | grep -E 'schema-engine|libquery_engine' | head -n 20
```

The `LIBARCHIVE.xattr.com.apple.provenance` tar warnings are from macOS extended attributes and can be ignored.

## Deploy Code Changes

Before uploading, verify locally:

```bash
cd /Users/mahdi/Documents/work/ioiv
npm test
npm run build
```

Upload source to the server. Keep server `.env`, uploads, generated build folders, and archives out of rsync:

```bash
cd /Users/mahdi/Documents/work/ioiv

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'uploads' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  --exclude '*.tar' \
  --exclude '*.tar.gz' \
  ./ administrator@192.168.50.109:/data/apps/sana/
```

If only one missing file needs to be patched, upload that file directly, for example:

```bash
ssh administrator@192.168.50.109 'mkdir -p /data/apps/sana/app/api/uploads'

rsync -az --progress \
  app/api/uploads/route.ts \
  administrator@192.168.50.109:/data/apps/sana/app/api/uploads/
```

After upload, rebuild and restart:

```bash
cd /data/apps/sana

docker compose build app
docker compose up -d
docker compose ps
docker compose logs --tail=80 app
```

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
GHASEDAK_BASE_URL=http://api.smsapp.ir/v2
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

- `otp_request_started`
- `sms_send_started`
- `sms_send_succeeded`
- `sms_send_failed`
- `otp_request_completed`
- `otp_verify_completed`

## Health Checks

Container health:

```bash
cd /data/apps/sana
docker compose ps
```

Local app health:

```bash
curl -I http://127.0.0.1:3000
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

Then rebuild:

```bash
cd /data/apps/sana
docker compose build app
docker compose up -d
```

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
GHASEDAK_BASE_URL=http://api.smsapp.ir/v2
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
