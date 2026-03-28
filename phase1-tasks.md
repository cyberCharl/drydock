# Drydock — Phase 1 Tasks

Part of the **Gyre** system. Drydock is the workbench / state store that all other Gyre modules (Bosun, Dogwatch) consume via its REST API and CLI.

## Tech Stack

| Layer          | Choice                         | Rationale                                 |
| -------------- | ------------------------------ | ----------------------------------------- |
| Database       | Postgres 16                    | Triggers for changelog, solid foundations |
| ORM            | Drizzle (TypeScript)           | Type-safe, schema-as-code                 |
| API            | Hono (TypeScript + Bun)        | Lightweight, fast                         |
| CLI            | Rust (`drydock`)               | Fast, portable, calls REST API            |
| Infrastructure | Docker Compose on odyssey-core | Standard deployment model                 |

## Sequencing

```
1.1 Docker Compose → 1.2 Schema → 1.3 Changelog Trigger → 1.4 REST API → 1.5 Rust CLI
```

Each task depends on the previous one.

---

## [1.1] Set up Docker Compose stack with Postgres and Hono API

**Context:** Infrastructure foundation. Nothing else runs without this.

**What needs to happen:**
- Docker Compose with Postgres 16 (persistent volume) and Hono API service (Bun runtime)
- Shared network between services
- `.env` for DB credentials and ports, health checks on both services
- `docker compose up` should work from a fresh clone

**Acceptance criteria:**
- [ ] `docker compose up` starts both services from clean state
- [ ] Postgres reachable from API container
- [ ] Data persists across restarts
- [ ] `.env.example` documents all variables
- [ ] README documents setup

---

## [1.2] Define Postgres schema and Drizzle migrations for workbench data model

**Context:** The lean data model — items, tags, agent runs, changelog. No hierarchy, no spaces, no custom fields.

**What needs to happen:**
Drizzle schema and initial migration for: `items`, `tags`, `item_tags`, `agent_runs`, `changelog`.

- `items.status` is a Postgres enum: `idea`, `speccing`, `building`, `evaluating`, `shipped`, `parked`, `dead`
- `items.priority` is a Postgres enum: `critical`, `high`, `medium`, `low`, `none` (default: `none`)
- `agent_runs.status` is a Postgres enum: `running`, `succeeded`, `failed`, `cancelled`
- `agent_runs.ci_status` is a Postgres enum: `pending`, `passed`, `failed`, `unknown`
- `parent_id` is a self-referential nullable FK on items
- Indexes on: `items.status`, `items.priority`, `items.created_at`, `items.parent_id`, `agent_runs.item_id`

**Acceptance criteria:**
- [ ] Migration applies cleanly to fresh Postgres
- [ ] All FKs enforced, enums validated at DB level
- [ ] Self-referential `parent_id` allows null (root items) and valid item references
- [ ] Indexes present for common query patterns
- [ ] Migration is idempotent

---

## [1.3] Add field changelog DB trigger for automatic audit trail on item mutations

**Context:** Audit trail guaranteed at DB level — multiple clients (API, future direct access) all get logging for free.

**What needs to happen:**
PL/pgSQL trigger on `items` BEFORE UPDATE:
- Track: `title`, `status`, `priority`, `description`, `parent_id`
- Compare OLD vs NEW per field, insert into `changelog` if changed
- `changed_by` read from `current_setting('app.current_user', true)`
- No-op when value unchanged
- Trigger DDL in a Drizzle migration file

**Acceptance criteria:**
- [ ] Updating any tracked field produces a changelog entry
- [ ] Multiple field changes in one UPDATE produce separate entries
- [ ] `changed_by` reads session variable correctly
- [ ] No entry when value unchanged
- [ ] Idempotent migration

---

## [1.4] Implement REST API with Hono for workbench CRUD operations

**Context:** Single write path for all clients. Owns validation and transaction management. No auth in V1.

**What needs to happen:**
Hono REST API on Bun with endpoints for:

**Items:**
- `POST /items` — create (validate status and priority enums, optional parent_id reference)
- `GET /items` — list with filters: status, priority, tag, parent_id, created_by; sort by created_at/updated_at/priority; pagination
- `GET /items/:id` — detail, includes tags and recent agent_runs
- `PATCH /items/:id` — update fields (set `app.current_user` in transaction for trigger)
- `DELETE /items/:id` — soft delete (status → dead) or hard delete (decide in implementation)

**Tags:**
- `POST/GET/PATCH/DELETE /tags`
- `POST /items/:id/tags` — assign tag
- `DELETE /items/:id/tags/:tagId` — remove tag

**Agent runs:**
- `POST /items/:id/runs` — record a new agent run
- `PATCH /runs/:id` — update run status, PR URL, CI status, notes
- `GET /items/:id/runs` — list runs for an item

**Changelog:**
- `GET /items/:id/changelog` — read-only, sorted desc

**Lineage:**
- `GET /items/:id/children` — items with parent_id = :id

No auth. `app.current_user` set via `SET LOCAL` in every mutating transaction.

**Acceptance criteria:**
- [ ] All CRUD endpoints return correct HTTP status codes
- [ ] Status values validated against the fixed enum
- [ ] Parent reference validated (must exist or be null)
- [ ] Agent run lifecycle tracked correctly (create → update → final status)
- [ ] Changelog populated via trigger on item mutations
- [ ] Pagination works on list endpoints
- [ ] Structured JSON error responses

---

## [1.5] Build Rust CLI (`drydock`) wrapping the REST API with typed subcommands

**Context:** The agent interface. Clawdysseus and crons interact with the workbench through this CLI.

**What needs to happen:**
Rust binary `drydock` with subcommands:

```
drydock items list [--status] [--priority] [--tag] [--parent] [--created-by] [--sort <field>] [--limit N]
drydock items get <id>
drydock items create --title "..." [--status idea] [--priority none] [--description "..."] [--parent <id>] [--tag <name>]
drydock items update <id> [--title] [--status] [--priority] [--description] [--parent]
drydock items delete <id>
drydock items children <id>
drydock items changelog <id>

drydock tags list
drydock tags create --name "..." [--color "#hex"]

drydock runs list <item-id>
drydock runs create <item-id> --agent "codex" [--branch "..."]
drydock runs update <run-id> [--status] [--pr-url] [--ci-status] [--notes "..."]

drydock init
```

- `drydock init`: seeds sensible default tags (e.g. `aissa`, `agent-server`, `personal`, `prototype`, `infrastructure`) and confirms API connectivity
- Output: JSON by default, `--format table` for human-readable, `--format quiet` for IDs only
- Config: `DRYDOCK_API_URL` env var, optional `~/.config/drydock/config.toml`

**Acceptance criteria:**
- [ ] All subcommands call REST API (no direct DB)
- [ ] `drydock init` seeds tags and confirms API connectivity
- [ ] `drydock items create` with `--tag` creates item and assigns tag in one call
- [ ] `drydock runs create` / `drydock runs update` tracks full agent execution lifecycle
- [ ] JSON output parseable, table output readable
- [ ] Errors surfaced clearly
- [ ] `--help` on every subcommand
- [ ] Compiles and runs on Linux x86_64
