# Drydock

The workbench / state store for the Gyre coding agent loop system.

Part of the Gyre system.

## Stack

- Postgres 16 via Docker Compose
- Hono API on Bun
- Drizzle for schema and migrations
- Rust CLI (`drydock`)

## Local setup

1. Review `.env` or copy `.env.example` if you want to override defaults.
2. Start the stack:

```bash
docker compose up --build
```

3. Check the API health endpoint:

```bash
curl http://localhost:3000/health
```

## Environment variables

`.env.example` documents the local development defaults:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `API_PORT`

The API service receives `DATABASE_URL` from Docker Compose and connects to Postgres over the shared `drydock` network.

## Persistence

Postgres data is stored in the named Docker volume `postgres_data`, so the database survives `docker compose down` / `up` cycles unless you remove volumes explicitly.
