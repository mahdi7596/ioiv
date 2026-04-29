# Local Development

This project uses PostgreSQL through Prisma. The local Docker Compose service matches the default development `DATABASE_URL`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:55433/sana"
```

## Start And Stop PostgreSQL

Start the database:

```bash
docker compose up -d postgres
```

Check status:

```bash
docker compose ps
```

Stop the database:

```bash
docker compose stop postgres
```

## Connect To The Database

From inside the container:

```bash
docker compose exec postgres psql -U postgres -d sana
```

Connection details:

- Host: `localhost`
- Port: `55433`
- Database: `sana`
- User: `postgres`
- Password: `postgres`

## Migrate And Seed

Run migrations:

```bash
npm run db:migrate -- --name init
```

Seed the active admin account:

```bash
npm run db:seed
```

The default seeded admin mobile is `09120000000`. Override it with `SEED_ADMIN_MOBILE` in `.env`.

## Uploads

Local uploads are stored in `./uploads` by default. Keep this directory out of git and back it up together with the database in production.
