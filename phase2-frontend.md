# Drydock Phase 2 — Frontend

## Overview

Build a web frontend for the Drydock workbench. The API and CLI exist (Phase 1). Now we need a visual surface.

**Goal:** Open a browser, see items by status, see what agents are doing, and manage work.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** shadcn/ui + Tailwind v4 — initialise with: `bunx --bun shadcn@latest init --preset b1sSMVhlA --template next`
- **Runtime:** Bun
- **Real-time:** WebSocket (Bun native on the Hono API)
- **Deploy:** Same Docker Compose stack — new `web` service on port 3001

## API Reference

The Hono API runs on port 3000. Key endpoints the frontend consumes:

**Items:**
- `GET /items` — list with query params: `status`, `priority`, `tag`, `parent_id`, `created_by`, `sort` (created_at|updated_at|priority), `direction` (asc|desc), `limit`, `offset`
- `GET /items/:id` — detail including `tags`, `recent_runs`, `dependencies`, `dependents`, `blocked` flag
- `POST /items` — create: `{ title, status?, priority?, description?, parent_id? }`
- `PATCH /items/:id` — update fields
- `DELETE /items/:id` — soft delete (sets status to "dead")
- `GET /items/:id/children` — child items
- `GET /items/:id/changelog` — field-level audit trail

**Tags:**
- `GET /tags` — list all
- `POST /tags` — create: `{ name, color? }`
- `POST /items/:id/tags` — assign: `{ tag_id }` or `{ tag_name }`
- `DELETE /items/:id/tags/:tagId` — remove

**Agent Runs:**
- `GET /items/:id/runs` — list runs for item
- `POST /items/:id/runs` — create: `{ agent, branch?, status?, pr_url?, ci_status?, notes? }`
- `PATCH /runs/:id` — update run

**Dependencies:**
- `POST /items/:id/dependencies` — add: `{ depends_on: <item_id> }`
- `DELETE /items/:id/dependencies/:dependsOnId` — remove
- `GET /items/:id/dependencies` — items this depends on
- `GET /items/:id/dependents` — items depending on this

**Enums:**
- Item status: `idea`, `speccing`, `ready`, `building`, `evaluating`, `shipped`, `parked`, `dead`
- Item priority: `critical`, `high`, `medium`, `low`, `none`
- Run status: `running`, `succeeded`, `failed`, `cancelled`
- Run CI status: `pending`, `passed`, `failed`, `unknown`

**Actor header:** Mutating requests should include `X-Drydock-User` header (e.g. "charl", "clawdysseus") for the changelog trigger.

## Data Model Context

- Items have a flat structure with optional `parent_id` for lineage
- Items can have dependencies (item A depends on item B)
- `blocked: true` on item detail means at least one dependency isn't `shipped`
- Agent runs track coding agent execution per item (agent name, branch, PR URL, CI status)
- Changelog is automatic via DB trigger — every field mutation is logged

---

## Tasks (implement in order, commit after each)

### [2.1] Scaffold Next.js App

- Run `bunx --bun shadcn@latest init --preset b1sSMVhlA --template next` in a new `web/` directory
- If the preset creates a standalone project, that's fine — integrate it into the repo's `web/` dir
- Add `web` service to `compose.yaml` (Bun runtime, port 3001)
- Configure Next.js rewrites to proxy `/api/*` to `http://api:3000/*` (they're on the same Docker network)
- Set dark mode as default theme
- Add a basic layout with header showing "Drydock" title

**Done when:** `docker compose up --build` starts all 3 services, frontend loads at localhost:3001, `/api/health` returns OK through the proxy

### [2.2] Board View (Kanban)

- Default view at `/`
- Fetch all items from `GET /items?limit=100` (pagination later)
- Group into columns by status: `idea` | `speccing` | `ready` | `building` | `evaluating` | `shipped`
- `parked` and `dead` hidden by default (add a toggle to show them)
- Each card shows:
  - Title
  - Priority badge (color-coded: critical=red, high=orange, medium=yellow, low=blue, none=gray — use shadcn chart colors)
  - Tags as small chips
  - If the item has agent runs: show latest run's agent name + status icon (spinner for running, checkmark for succeeded, x for failed)
  - If `blocked: true`: show a lock icon or "Blocked" badge
- Within each column, sort: unblocked before blocked, then by priority (critical first)
- Quick-create: button or input at the top that creates an item with just a title (status defaults to `idea`)
- Clicking a card opens the detail panel (task 2.4)
- Empty columns show a muted placeholder

**Done when:** Board renders with correct columns, cards show all info, quick-create works, cards are clickable

### [2.3] List View (Table)

- Available at a toggle (board/list switch in the header area)
- View preference saved in localStorage
- Use shadcn's DataTable pattern (or similar)
- Columns: title, status (badge), priority (badge), tags, agent (latest run agent name), CI status (badge), last updated (relative time)
- Sortable columns (click header to toggle sort)
- Filter bar: status dropdown, priority dropdown, tag selector (multi-select)
- Clicking a row opens the same detail panel as the board view
- Pagination controls at the bottom

**Done when:** Table renders all items, sorting and filtering work, row click opens detail, view toggle persists

### [2.4] Item Detail Panel

- Slide-over panel (right side) or full modal — triggered by clicking a card/row
- Sections:
  1. **Header:** Title (editable inline), status dropdown, priority dropdown, blocked badge if applicable
  2. **Description:** Textarea with markdown preview/toggle. Saves on blur or explicit save.
  3. **Tags:** Current tags with X to remove, input to add (autocomplete from `GET /tags`)
  4. **Agent Runs:** Reverse-chronological timeline:
     - Agent name (e.g. "codex") with a small icon/avatar
     - Run status badge (running=blue spinner, succeeded=green check, failed=red x, cancelled=gray dash)
     - Branch name (monospace)
     - PR link (clickable → new tab)
     - CI status badge (pending=yellow, passed=green, failed=red)
     - Duration (started_at → completed_at, or "running for Xm")
     - Notes (expandable/collapsible)
  5. **Dependencies:** List of items this depends on (title + status badge). Add button with item search/autocomplete. Remove button per dependency.
  6. **Dependents:** List of items depending on this one (title + status badge, read-only).
  7. **Changelog:** Collapsible section. Each entry: field name, old value → new value, actor, timestamp.
  8. **Children:** List of child items if any (title + status, clickable).

- All mutations go through the API (PATCH /items/:id, POST/DELETE for tags and dependencies)
- Include `X-Drydock-User: charl` header on all mutating requests (hardcode for now, no auth)

**Done when:** All sections render and are interactive, edits save via API, dependencies manageable

### [2.5] WebSocket Real-Time Updates

**API side (modify `api/src/index.ts`):**
- Bun's `serve()` supports a `websocket` handler alongside `fetch`. Add WebSocket upgrade handling.
- Maintain a `Set<ServerWebSocket>` of connected clients
- After every successful mutating endpoint (POST/PATCH/DELETE), broadcast a JSON message to all WS clients:
  ```json
  { "type": "item.created", "data": { ...serialized } }
  { "type": "item.updated", "data": { ...serialized } }
  { "type": "run.created", "data": { ...serialized } }
  { "type": "run.updated", "data": { ...serialized } }
  { "type": "dependency.created", "data": { "item_id": N, "depends_on_id": N } }
  { "type": "dependency.removed", "data": { "item_id": N, "depends_on_id": N } }
  ```
- Handle client disconnect (remove from Set)

**Frontend side:**
- Create a `useWebSocket` hook that:
  - Connects to `ws://<api-host>:3000/ws` (direct to API, not through Next.js proxy)
  - On message: refetch/invalidate the affected queries (React Query `queryClient.invalidateQueries`)
  - Reconnects with exponential backoff on disconnect
  - Exposes connection status
- Add a small connection indicator in the header (green dot = connected, amber = reconnecting, red = disconnected)
- The Docker Compose `web` service needs the API WS port accessible — expose port 3000 to the web container or use Docker network hostname

**Done when:** Changes made via API/CLI appear on the frontend without refresh, connection indicator works, reconnection works after API restart

---

## Sequencing

```
2.1 Scaffold → 2.2 Board → 2.3 List → 2.4 Detail Panel → 2.5 WebSocket
```

Commit after each task. Push when all are complete.
