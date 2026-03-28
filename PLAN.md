# Implementation Plan

## Order of work

1. Update the schema and migrations first:
   - add `ready` to the `item_status` enum in the schema and migration layer
   - add the `item_dependencies` table, indexes, and self-referential relations in Drizzle
   - update Drizzle metadata so the migration history stays consistent
2. Extend the API next:
   - add dependency lookup helpers and cycle detection
   - add CRUD endpoints for dependencies and dependents
   - enrich `GET /items/:id` with `dependencies`, `dependents`, and `blocked`
   - update priority sorting so blocked `ready` items sort after unblocked peers
3. Extend the Rust CLI after the API is in place:
   - add a `deps` command group with `add`, `remove`, `list`, and `dependents`
   - make sure any item status handling accepts `ready`
4. Verify with targeted checks:
   - run the API typecheck / startup path if available
   - run `cargo fmt` and `cargo check`
   - inspect the generated migration files and route behavior for obvious regressions

## Potential issues

- The dependency table is a self-reference on `items`, so the Drizzle relation names need to be explicit to avoid ambiguous self-joins.
- Cycle detection must reject both direct cycles and longer chains; the simplest safe implementation is a recursive walk from the proposed dependency target back upward.
- The spec only requires dependency metadata on `GET /items/:id`, but the board-sort requirement implies blocked-state awareness in list ordering. I plan to keep list payloads stable and only change ordering for `sort=priority`, using the blocked calculation in SQL.
- Adding a new enum value before `building` is order-sensitive in Postgres, so the migration needs to use `ALTER TYPE ... ADD VALUE ... BEFORE ...` exactly as specified.
- There are no obvious automated API tests in the repo, so verification will rely on migration inspection, API/build checks, and `cargo check` unless I discover an existing test entrypoint while implementing.
