# Deployment

Production domain: https://sana.ioiv.ir

Required server access:
- SSH/SFTP access
- sudo access
- PostgreSQL access
- Nginx config access
- DNS record for sana.ioiv.ir

Recommended runtime:
- Node.js LTS
- PostgreSQL
- PM2 or Docker
- Nginx reverse proxy

Nginx routes:
- client main WordPress site remains unchanged
- sana.ioiv.ir proxies to the Next.js app port

Required environment:
- DATABASE_URL
- APP_URL=https://sana.ioiv.ir
- SESSION_SECRET
- UPLOAD_DIR
- ZARINPAL_MERCHANT_ID
- ZARINPAL_SANDBOX=false
- GHASEDAK_API_KEY
- GHASEDAK_OTP_TEMPLATE
- GHASEDAK_SENDER
- ADMIN_ALERT_MOBILE

Deployment commands:
- npm ci
- npx prisma migrate deploy
- npm run db:seed
- npm run build
- npm run start

Local development:
- Use `docker compose up -d postgres` to start the project-local PostgreSQL service.
- Use `npm run db:migrate -- --name init` and `npm run db:seed` to prepare the local database.
- See `docs/local-development.md` for connection details and upload storage notes.

Operational notes:
- Back up PostgreSQL and UPLOAD_DIR together.
- Ensure the app process user can read and write UPLOAD_DIR.
- Keep ZARINPAL_SANDBOX=true outside production.
- Seed or manually create at least one active admin before handoff.
