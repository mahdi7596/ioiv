# Deployment

Production domain: https://sana.ioiv.ir

Required server access:
- SSH/SFTP access
- sudo access
- PostgreSQL access
- Nginx config access
- DNS record for sana.ioiv.ir

Recommended runtime:
- Docker Engine with Docker Compose
- Nginx reverse proxy

Nginx routes:
- client main WordPress site remains unchanged
- sana.ioiv.ir proxies to the Next.js app port

Required environment:
- DATABASE_URL is set automatically by Docker Compose for the app container
- APP_URL=https://sana.ioiv.ir
- SESSION_SECRET
- UPLOAD_DIR=/app/uploads
- ZARINPAL_MERCHANT_ID
- ZARINPAL_SANDBOX=false
- GHASEDAK_API_KEY
- GHASEDAK_OTP_TEMPLATE=sanaotp
- GHASEDAK_STATUS_TEMPLATE=sanastatus
- GHASEDAK_SUBMITTED_TEMPLATE=sanasubmitted
- GHASEDAK_SENDER
- ADMIN_ALERT_MOBILE
- POSTGRES_DB=sana
- POSTGRES_USER=postgres
- POSTGRES_PASSWORD=replace-with-strong-password

Docker deployment commands:

```bash
docker compose build app
docker compose up -d
docker compose ps
docker compose logs -f app
```

The app container runs `npx prisma migrate deploy` before starting Next.js.

Run the seed command once after the first deploy:

```bash
docker compose exec app npm run db:seed
```

If Docker Hub or npm is blocked from the server network, configure a Docker registry mirror before building, or build while connected through a reliable route. For npm registry issues, set `NPM_CONFIG_REGISTRY` in `.env` before running `docker compose build app`.

Example:

```env
NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
```

Local development:
- Use `docker compose up -d postgres` to start the project-local PostgreSQL service.
- Use `npm run db:migrate -- --name init` and `npm run db:seed` to prepare the local database.
- See `docs/local-development.md` for connection details and upload storage notes.

Operational notes:
- Back up PostgreSQL and UPLOAD_DIR together.
- Ensure the app process user can read and write UPLOAD_DIR.
- Keep ZARINPAL_SANDBOX=true outside production.
- Rotate the Ghasedak API key if it was shared during setup, then store only the new key in the production environment.
- Wait for Ghasedak approval on `sanaotp`, `sanastatus`, and `sanasubmitted` before enabling production SMS.
- Seed or manually create at least one active admin before handoff.
