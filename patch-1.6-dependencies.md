# Patch 1.6 — Add `ready` Status + Item Dependencies

## Context

Drydock needs two things before the frontend and dispatch system (Bosun) can work:

1. **A `ready` status** — currently there's no way to distinguish "being specced" from "fully specced and ready for agent dispatch." Bosun needs a clear signal.
2. **Item dependencies** — task B depends on task A. Nothing should dispatch B until A is complete. This was a primary pain point with Asana.

## Changes Required

### 1. Add `ready` to the item status enum

The status lifecycle becomes:
```
idea → speccing → ready → building → evaluating → shipped → parked → dead
```

`ready` means: fully specced, acceptance criteria defined, dispatchable by Bosun.

**Implementation:**
- Drizzle migration: `ALTER TYPE item_status ADD VALUE 'ready' BEFORE 'building';`
- Update the `itemStatusEnum` in `api/src/schema.ts` to include `ready`
- Update the `ITEM_STATUSES` set in `api/src/index.ts`
- Update the Rust CLI's status validation (if it has one) in `cli/src/main.rs`

### 2. Add `item_dependencies` table

```sql
CREATE TABLE item_dependencies (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  depends_on_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, depends_on_id),
  CHECK (item_id != depends_on_id)
);

CREATE INDEX item_dependencies_depends_on_idx ON item_dependencies(depends_on_id);
```

**Implementation:**
- Add Drizzle schema definition for `item_dependencies` in `api/src/schema.ts`
- Add relations (item has many dependencies, item has many dependents)
- Generate Drizzle migration

### 3. Add dependency API endpoints

**Endpoints:**
- `POST /items/:id/dependencies` — body: `{ "depends_on": <item_id> }`. Validates both items exist, no self-reference, no circular dependencies (A depends on B depends on A).
- `DELETE /items/:id/dependencies/:dependsOnId` — remove a dependency
- `GET /items/:id/dependencies` — list items this item depends on (returns serialized items)
- `GET /items/:id/dependents` — list items that depend on this item (returns serialized items)

**Circular dependency detection:** On POST, check if adding this dependency would create a cycle. Simple approach: walk the dependency chain from `depends_on` upward — if you reach the original `item_id`, reject with 400.

**Serialization:** Dependencies and dependents should return the full serialized item (same format as GET /items/:id) so the frontend can display them without extra calls.

### 4. Include dependency info in item detail endpoint

Update `GET /items/:id` to include:
- `dependencies`: array of serialized items this item depends on
- `dependents`: array of serialized items that depend on this item
- `blocked`: boolean — true if any dependency is not in `shipped` status

### 5. Add dependency commands to Rust CLI

```
drydock deps add <item-id> --depends-on <item-id>
drydock deps remove <item-id> --depends-on <item-id>
drydock deps list <item-id>          # what this item depends on
drydock deps dependents <item-id>    # what depends on this item
```

### 6. Update board priority sort

Items with `blocked: true` should sort below unblocked items of the same priority in the `ready` column. This is a display concern — Bosun will filter them out at dispatch time, but the board should also make it visible.

## Acceptance Criteria

- [ ] `ready` status works in API (create, update, filter items by status=ready)
- [ ] `item_dependencies` table created via Drizzle migration
- [ ] Dependency CRUD endpoints work (add, remove, list dependencies, list dependents)
- [ ] Circular dependency detection prevents cycles
- [ ] `GET /items/:id` includes dependencies, dependents, and blocked flag
- [ ] Rust CLI `drydock deps` subcommands work
- [ ] Existing tests/functionality not broken by the enum addition

## Plan First

Before implementing, create a brief plan in a `PLAN.md` file at the repo root outlining the order of changes and any potential issues. Then implement and commit.
