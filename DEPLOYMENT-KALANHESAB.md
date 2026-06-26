# Kalan Hesab Deployment Runbook

Production domain: `https://ceo.kalanhesab.com`

This document records every decision made during the initial deployment and is the single reference for all future updates, database operations, and troubleshooting on the Kalan Hesab server.

---

## Current Status

Verified on June 26, 2026:

- `https://ceo.kalanhesab.com` loads the Kalan Hesab form at the root URL.
- `https://ceo.kalanhesab.com/admin` redirects to `/admin/login`.
- `kalanhesab_postgres` Docker container is healthy on `127.0.0.1:5433`.
- PM2 process `kalan-hesab` is online running on port 3100.
- Nginx proxies `form.kalanhesab.com` → `127.0.0.1:3100`.
- Arvan Cloud CDN handles HTTPS (Let's Encrypt, valid 89 days from setup).
- All 8 Prisma migrations have been applied.

---

## Server Access

```bash
ssh -i ~/.ssh/arvan_hamkalan ubuntu@95.38.177.2
```

| Detail | Value |
|---|---|
| IP | `95.38.177.2` |
| SSH user | `ubuntu` |
| SSH key | `~/.ssh/arvan_hamkalan` |
| OS | Ubuntu 24.04.4 LTS |
| CPU | 2 vCPU Intel Xeon Cascadelake |
| RAM | 3.8 GiB + 2 GiB swap |
| Disk | 47 GB root (≈13 GB free at setup) |

---

## What Else Lives on This Server — Do Not Touch

Another production app (`hamkalan`) is running on the same server. Never touch:

- `/var/www/hamkalan/` — Hamkalan app files
- `/var/www/hamkalanwebapp/` — Hamkalan Docker Compose (Postgres + Redis)
- Docker containers `hamkalan_postgres` and `hamkalan_redis`
- PM2 process named `hamkalan`
- Nginx config `/etc/nginx/sites-enabled/hamkalan.conf`
- Docker volumes prefixed with `hamkalanwebapp_`

---

## Kalan Hesab Directory Structure

```
/var/www/kalanhesab/
├── current/          ← app source code lives here (rsync target)
│   ├── .env          ← production env file (never in git, never in rsync)
│   ├── .next/        ← Next.js build output (generated on server)
│   ├── node_modules/ ← installed on server via npm ci
│   ├── ecosystem.config.js  ← PM2 config
│   └── prisma/migrations/   ← run with migrate deploy on each schema change
└── shared/
    ├── uploads/      ← file uploads (not used yet, reserved)
    └── docker-compose.db.yml  ← PostgreSQL-only Docker Compose for Kalan Hesab
```

---

## Installed Runtimes on Server

These are already installed — no setup needed for future deploys:

| Tool | Version |
|---|---|
| Node.js | v20.19.5 |
| npm | 10.8.2 |
| PM2 | 7.0.1 |
| Nginx | 1.24.0 |
| Docker | 29.1.3 |
| Docker Compose | 2.37.1 |

---

## Architecture Decisions

- **No Docker for the app**: The Next.js app runs natively via PM2, not in a container. This avoids cross-platform build complexity.
- **Docker only for PostgreSQL**: A minimal single-service Docker Compose runs the Kalan Hesab database in isolation, completely separate from Hamkalan's database.
- **Port 3100**: Hamkalan owns port 3000. Kalan Hesab uses 3100.
- **Arvan Cloud CDN + HTTPS**: Arvan terminates TLS. The server only listens on port 80. The origin protocol in Arvan is set to HTTP.
- **Shared codebase, separate database**: This branch (`kalan-hesab-form-submission`) shares the IOIV codebase. It has its own PostgreSQL database (`kalanhesab` on port 5433). Migrations are applied independently.
- **URL rewrites**: Next.js `beforeFiles` rewrites serve `/kalan-hesab` at `/` and `/kalan-hesab/admin` at `/admin` without changing the URL in the browser.

---

## Database

### Container

The Kalan Hesab database runs in a Docker container separate from Hamkalan:

```
Container name : kalanhesab_postgres
Image          : postgres:15-alpine
Host port      : 127.0.0.1:5433
Database name  : kalanhesab
DB user        : kalanhesab
Docker Compose : /var/www/kalanhesab/shared/docker-compose.db.yml
Volume         : shared_kalanhesab_pg_data
```

Start/stop the database container:

```bash
cd /var/www/kalanhesab/shared
sudo docker compose -f docker-compose.db.yml up -d
sudo docker compose -f docker-compose.db.yml down
```

Check health:

```bash
sudo docker ps --filter name=kalanhesab_postgres
```

### DATABASE_URL

```
postgresql://kalanhesab:<PASSWORD>@127.0.0.1:5433/kalanhesab
```

The password is stored in `/var/www/kalanhesab/current/.env` and in the Docker Compose file at `/var/www/kalanhesab/shared/docker-compose.db.yml`.

### Run migrations

Only run this when the Prisma schema has changed (new migration files exist):

```bash
cd /var/www/kalanhesab/current
npx prisma migrate deploy
```

### Inspect the database

```bash
sudo docker exec kalanhesab_postgres psql -U kalanhesab -d kalanhesab -c '\dt'
```

List submissions:

```bash
sudo docker exec kalanhesab_postgres psql -U kalanhesab -d kalanhesab -c '
SELECT id, "fullName", "companyName", mobile, "createdAt"
FROM "KalanHesabSubmission"
ORDER BY "createdAt" DESC
LIMIT 20;
'
```

List admins:

```bash
sudo docker exec kalanhesab_postgres psql -U kalanhesab -d kalanhesab -c '
SELECT mobile, role, active FROM "Admin" ORDER BY mobile;
'
```

### Seed Kalan Hesab admins

The three admin mobiles that can log in to the admin panel are:

| Mobile | Name |
|---|---|
| `09224872163` | کالان حساب - مدیر |
| `09390649614` | کالان حساب - مدیر اول |
| `09124872163` | کالان حساب - مدیر دوم |

After a fresh deploy or database reset, seed all admins:

```bash
cd /var/www/kalanhesab/current
npm run db:seed
```

Or insert/update all three directly in one SQL:

```bash
sudo docker exec kalanhesab_postgres psql -U kalanhesab -d kalanhesab -c '
INSERT INTO "Admin" (id, name, mobile, role, active, "createdAt", "updatedAt") VALUES
  ('"'"'kh-admin-09224872163'"'"', '"'"'کالان حساب - مدیر'"'"',       '"'"'09224872163'"'"', '"'"'KALAN_HESAB_ADMIN'"'"', true, NOW(), NOW()),
  ('"'"'kh-admin-09390649614'"'"', '"'"'کالان حساب - مدیر اول'"'"', '"'"'09390649614'"'"', '"'"'KALAN_HESAB_ADMIN'"'"', true, NOW(), NOW()),
  ('"'"'kh-admin-09124872163'"'"', '"'"'کالان حساب - مدیر دوم'"'"', '"'"'09124872163'"'"', '"'"'KALAN_HESAB_ADMIN'"'"', true, NOW(), NOW())
ON CONFLICT (mobile) DO UPDATE
SET role = '"'"'KALAN_HESAB_ADMIN'"'"', active = true, "updatedAt" = NOW();
'
```

### Backup the database

```bash
mkdir -p /data/backups/kalanhesab
sudo docker exec -T kalanhesab_postgres pg_dump -U kalanhesab -d kalanhesab \
  > /data/backups/kalanhesab/kalanhesab-$(date +%Y%m%d-%H%M%S).sql
```

---

## Environment Variables

The `.env` file lives at `/var/www/kalanhesab/current/.env` on the server. It is never committed to git and never overwritten by rsync.

To edit it:

```bash
nano /var/www/kalanhesab/current/.env
```

Required keys:

```env
APP_URL=https://ceo.kalanhesab.com
SESSION_SECRET=<64-char random string>

DATABASE_URL=postgresql://kalanhesab:<PASSWORD>@127.0.0.1:5433/kalanhesab

UPLOAD_DIR=/var/www/kalanhesab/shared/uploads

MELIPAYAMAK_USERNAME=<Melipayamak account username>
MELIPAYAMAK_PASSWORD=<Melipayamak account password>
MELIPAYAMAK_API_URL=https://rest.payamak-panel.com/api/SendSMS
MELIPAYAMAK_OTP_BODY_ID=90229
MELIPAYAMAK_KALAN_HESAB_USER_BODY_ID=481620
MELIPAYAMAK_KALAN_HESAB_ADMIN_BODY_ID=481583
SMS_SEND_IN_DEVELOPMENT=false

SEED_DEMO_DATA=false
```

### SMS body IDs

| Body ID | Recipient | Trigger | `{0}` variable |
|---|---|---|---|
| `90229` | Admin (any of the 3 mobiles) | Admin panel OTP login | OTP code |
| `481620` | User who submitted the form | Successful form submission | User's full name |
| `481583` | `09224872163` (admin notification) | Successful form submission | User's full name |

After editing `.env`, restart the app:

```bash
pm2 restart kalan-hesab --update-env
```

---

## Deploy Code Updates

This is the standard workflow for every code change going forward.

### Step 1 — Verify locally (optional but recommended)

```bash
cd /Users/mahdi/Documents/work/ioiv
npm run build
```

### Step 2 — Upload source to server

Run from your Mac, in the project root (on the `kalan-hesab-form-submission` branch):

```bash
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '/uploads' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  --exclude '*.tar' \
  --exclude '*.tar.gz' \
  --exclude 'prisma-engine-export' \
  -e "ssh -i ~/.ssh/arvan_hamkalan" \
  ./ ubuntu@95.38.177.2:/var/www/kalanhesab/current/
```

Key excludes explained:
- `/uploads` — anchored to root only, so `lib/uploads/` code is still synced
- `.env` — production secrets stay on server, never overwritten
- `.next` / `node_modules` — generated on server, not from local Mac

### Step 3 — Build on the server

```bash
ssh -i ~/.ssh/arvan_hamkalan ubuntu@95.38.177.2 \
  "cd /var/www/kalanhesab/current && npm run build"
```

### Step 4 — Run migrations (only if Prisma schema changed)

```bash
ssh -i ~/.ssh/arvan_hamkalan ubuntu@95.38.177.2 \
  "cd /var/www/kalanhesab/current && npx prisma migrate deploy"
```

Only run this step if there are new files under `prisma/migrations/` that haven't been applied yet. `migrate deploy` is safe to run multiple times — it skips already-applied migrations.

### Step 5 — Restart the app

```bash
ssh -i ~/.ssh/arvan_hamkalan ubuntu@95.38.177.2 "pm2 restart kalan-hesab"
```

### Step 6 — Verify

```bash
curl -s -o /dev/null -w '%{http_code}' https://form.kalanhesab.com/
```

Expected: `200`

| URL | Purpose |
|---|---|
| `https://ceo.kalanhesab.com/` | Public lead capture form |
| `https://ceo.kalanhesab.com/admin` | Admin panel (redirects to login if not authenticated) |
| `https://ceo.kalanhesab.com/admin/login` | Admin login page |

---

## PM2 Process Management

The app runs as a PM2 process named `kalan-hesab`.

```bash
pm2 list                      # show all processes
pm2 status kalan-hesab        # show just this app
pm2 restart kalan-hesab       # restart (keeps env)
pm2 restart kalan-hesab --update-env  # restart and reload .env changes
pm2 stop kalan-hesab          # stop
pm2 start ecosystem.config.js # start from scratch (if stopped)
pm2 logs kalan-hesab          # tail live logs
pm2 logs kalan-hesab --lines 200  # last 200 lines
pm2 save                      # save process list (survives reboot)
```

The PM2 ecosystem config is at `/var/www/kalanhesab/current/ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name: 'kalan-hesab',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/var/www/kalanhesab/current',
    env: {
      PORT: 3100,
      NODE_ENV: 'production'
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M'
  }]
}
```

If the server reboots and PM2 does not start automatically, run:

```bash
pm2 startup   # prints a command — run that command
pm2 save
```

---

## Nginx Configuration

Config file: `/etc/nginx/sites-available/kalan-hesab.conf`
Enabled via: `/etc/nginx/sites-enabled/kalan-hesab.conf` (symlink)

Current config:

```nginx
# Redirect www.ceo -> ceo (canonical)
server {
    listen 80;
    listen [::]:80;
    server_name www.ceo.kalanhesab.com;
    return 301 https://ceo.kalanhesab.com$request_uri;
}

# Main Kalan Hesab app
server {
    listen 80;
    listen [::]:80;
    server_name ceo.kalanhesab.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;
    }
}
```

To edit and reload:

```bash
sudo nano /etc/nginx/sites-available/kalan-hesab.conf
sudo nginx -t
sudo systemctl reload nginx
```

Verify routing:

```bash
curl -I -H "Host: form.kalanhesab.com" http://127.0.0.1/
```

---

## Arvan Cloud DNS and SSL

Domain: `kalanhesab.com` — managed via Arvan Cloud DNS panel.

| Record | Type | Value | CDN |
|---|---|---|---|
| `@` | A | `195.28.169.24` | ON (Netafraz WordPress) |
| `www` | A | `195.28.169.24` | ON (Netafraz WordPress) |
| `ceo` | A | `95.38.177.2` | ON (this server — main domain) |
| `www.ceo` | A | `95.38.177.2` | ON (this server — redirects to ceo) |

**HTTPS**: Arvan Cloud CDN terminates TLS for `form.kalanhesab.com` using a Let's Encrypt certificate. The certificate auto-renews via Arvan.

**Origin protocol**: The `form` A record in Arvan must have its "پروتکل ارتباطی با سرور اصلی" set to **HTTP** (not Auto or HTTPS). The server only listens on port 80. Arvan handles HTTPS with users and connects to the server on HTTP.

**HTTPS default**: "پیش‌فرض‌شدن HTTPS" should be ON so HTTP requests redirect to HTTPS automatically.

If the SSL certificate expires or stops working, go to the Arvan panel → "ارتباط با سرورهای لبه" → request a new Let's Encrypt certificate.

---

## URL Routing

The app uses Next.js `beforeFiles` rewrites so routes are clean:

| Public URL | Next.js internal route |
|---|---|
| `form.kalanhesab.com/` | `/kalan-hesab` |
| `form.kalanhesab.com/admin` | `/kalan-hesab/admin` |
| `form.kalanhesab.com/admin/login` | `/kalan-hesab/admin/login` |
| `form.kalanhesab.com/api/kalan-hesab/*` | unchanged |

`beforeFiles` is required (not the default array form) because `app/page.tsx` exists in the codebase and would otherwise be served at `/` before the rewrite runs.

---

## Health Checks

```bash
# PM2 processes
pm2 list

# Docker containers
sudo docker ps

# App responds on port 3100
curl -I http://127.0.0.1:3100

# Nginx routes correctly
curl -I -H "Host: form.kalanhesab.com" http://127.0.0.1/

# Live HTTPS
curl -I https://form.kalanhesab.com/

# Nginx logs
sudo tail -n 80 /var/log/nginx/error.log
sudo tail -n 80 /var/log/nginx/access.log

# App logs
pm2 logs kalan-hesab --lines 100
```

---

## Troubleshooting

### App shows IOIV/Sana page instead of Kalan Hesab form

The Next.js `beforeFiles` rewrite in `next.config.ts` is not active. Check:

1. `next.config.ts` has `beforeFiles` (not a plain array) inside `rewrites()`
2. The app was rebuilt after the config change: `npm run build`
3. PM2 was restarted after the build: `pm2 restart kalan-hesab`

### 502 Bad Gateway from Arvan CDN

Arvan is trying to connect to the server on HTTPS (port 443) instead of HTTP (port 80). Fix: edit the `form` DNS record in Arvan and set "پروتکل ارتباطی با سرور اصلی" to **HTTP**.

### App starts then crashes (PM2 restart loop)

Check logs:

```bash
pm2 logs kalan-hesab --lines 200
```

Common causes:
- `.env` is missing or has wrong `DATABASE_URL`
- `kalanhesab_postgres` container is not running (check `sudo docker ps`)
- Port 3100 already in use (check `ss -tlnp | grep 3100`)

### Prisma cannot connect to database

```bash
sudo docker ps --filter name=kalanhesab_postgres
```

If the container is not running:

```bash
cd /var/www/kalanhesab/shared
sudo docker compose -f docker-compose.db.yml up -d
```

Then restart the app:

```bash
pm2 restart kalan-hesab
```

### `Cannot find module 'dotenv/config'` during build

`dotenv` must be in `dependencies` (not `devDependencies`) because `prisma.config.ts` imports it at deploy time. This was fixed in the initial setup — if it reappears, check `package.json`.

### Build error: Prisma enum or field missing

The Prisma client was not regenerated. Run:

```bash
cd /var/www/kalanhesab/current
npx prisma generate
npm run build
```

### Nginx shows old config

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Backups

### Database backup

```bash
ssh -i ~/.ssh/arvan_hamkalan ubuntu@95.38.177.2
mkdir -p /data/backups/kalanhesab
sudo docker exec -T kalanhesab_postgres pg_dump -U kalanhesab -d kalanhesab \
  > /data/backups/kalanhesab/kalanhesab-$(date +%Y%m%d-%H%M%S).sql
```

### Restore from backup

```bash
sudo docker exec -i kalanhesab_postgres psql -U kalanhesab -d kalanhesab \
  < /data/backups/kalanhesab/<filename>.sql
```
