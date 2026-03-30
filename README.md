# Drydock

The workbench and state store for the **Gyre** autonomous coding agent loop system. Drydock tracks work items, agent runs, and provides a full audit trail — serving as the shared state surface that all other Gyre modules (Slipway, Dogwatch) consume via its REST API and CLI.

## Architecture

Drydock is one module in the Gyre system:

```
Gyre (the system)
├── Drydock  ← this repo (workbench / state store)
├── Slipway  (dispatch)
├── Dogwatch (check loop)
└── Rigger   (middleware)
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
export DRYDOCK_API_URL=http://localhost:3211

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
- **Agent Runs** — execution tracking per item (agent, branch, session_id, PR URL, CI status, review status, retry count, repo)
- **Metadata** — key-value store for system flags (e.g. global pause)
- **Changelog** — automatic field-level audit trail via DB trigger

## Environment Variables

See `.env.example`:

| Variable            | Default    | Description          |
| ------------------- | ---------- | -------------------- |
| `POSTGRES_DB`       | `drydock`  | Database name        |
| `POSTGRES_USER`     | `drydock`  | Database user        |
| `POSTGRES_PASSWORD` | `drydock`  | Database password    |
| `POSTGRES_PORT`     | `5432`     | Postgres port        |
| `API_PORT`          | `3211`     | API server port                |
| `WEB_PORT`          | `3210`     | Web frontend port              |

## API Endpoints

### Items
- `GET /items` — list items (filters: status, priority, tag, parent_id, created_by, sort, direction)
- `POST /items` — create item
- `GET /items/:id` — get item detail
- `PATCH /items/:id` — update item
- `DELETE /items/:id` — soft-delete item (→ dead status)

### Agent Runs
- `GET /items/:id/runs` — list runs for an item
- `POST /items/:id/runs` — create run for an item
- `GET /runs` — flat listing of all runs (filters: status, repo, branch; includes item_title)
- `PATCH /runs/:id` — update run (ci_status, review_status, retry_count, pr_url, notes, status)

### Metadata
- `GET /meta/paused` — get global pause flag
- `PUT /meta/paused` — set global pause flag (`{"paused": true/false}`)

### Tags
- `GET /tags` — list tags
- `POST /tags` — create tag
- `PATCH /tags/:id` — update tag
- `DELETE /tags/:id` — delete tag

### Health
- `GET /` — basic status
- `GET /health` — database connectivity check

## License

MIT — see [LICENSE](LICENSE).
