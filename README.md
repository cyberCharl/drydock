# Drydock

The workbench and state store for the **Gyre** autonomous coding agent loop system. Drydock tracks work items, agent runs, and provides a full audit trail — serving as the shared state surface that all other Gyre modules (Bosun, Dogwatch) consume via its REST API and CLI.

## Architecture

Drydock is one module in the Gyre system:

```
Gyre (the system)
├── Drydock  ← this repo (workbench / state store)
├── Bosun    (dispatch)
├── Dogwatch (check loop)
└── [TBD]    (middleware)
```

Other modules interact with Drydock exclusively through its REST API or CLI — never direct DB access.

## Stack

| Layer          | Choice                | Notes                          |
| -------------- | --------------------- | ------------------------------ |
| Database       | Postgres 16           | Triggers for changelog         |
| ORM            | Drizzle (TypeScript)  | Type-safe, schema-as-code      |
| API            | Hono (TypeScript/Bun)  | Lightweight, fast              |
| CLI            | Rust (`drydock`)      | Fast, portable, calls REST API |
| Infrastructure | Docker Compose        | Single `docker compose up`     |

## Quick Start

```bash
# 1. Copy env defaults
cp .env.example .env

# 2. Start the stack
docker compose up --build

# 3. Verify
curl http://localhost:3000/health
```

## CLI

The `drydock` CLI wraps the REST API:

```bash
# Build
cd cli && cargo build --release

# Configure
export DRYDOCK_API_URL=http://localhost:3000

# Use
drydock init                          # Seed default tags, verify connectivity
drydock items create --title "..."    # Create a work item
drydock items list --status building  # Filter by status
drydock runs create <item-id> --agent codex  # Track an agent run
drydock items changelog <item-id>     # View audit trail
```

Output formats: `--format json` (default), `--format table`, `--format quiet` (IDs only).

## Data Model

- **Items** — work entries with status lifecycle (`idea → speccing → building → evaluating → shipped → parked → dead`) and priority (`critical > high > medium > low > none`)
- **Tags** — flexible categorisation, assignable to items
- **Agent Runs** — execution tracking per item (agent, branch, PR URL, CI status)
- **Changelog** — automatic field-level audit trail via DB trigger

## Environment Variables

See `.env.example`:

| Variable            | Default    | Description          |
| ------------------- | ---------- | -------------------- |
| `POSTGRES_DB`       | `drydock`  | Database name        |
| `POSTGRES_USER`     | `drydock`  | Database user        |
| `POSTGRES_PASSWORD` | `drydock`  | Database password    |
| `POSTGRES_PORT`     | `5432`     | Postgres port        |
| `API_PORT`          | `3000`     | API server port      |

## License

MIT — see [LICENSE](LICENSE).
