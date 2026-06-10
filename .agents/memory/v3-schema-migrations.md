---
name: V3 schema uses db:push, not migration files
description: Why AA V3 (and recent) schema changes are applied via db:push and have no migration files
---
The entire AA V3 feature set (e.g. `v3_spells` and related tables/columns) was added with `npm run db:push` and is NOT present in any file under `migrations/`. There is no `migrate()` call on server boot — migration files are stale and not applied at runtime.

**Why:** This project switched to `drizzle-kit push` as the source of truth for schema around the V3 work; the committed `migrations/*.sql` only cover older (pre-V3) schema.

**How to apply:** When adding/altering V3 (or other recent) schema in `shared/schema.ts`, apply it with `npm run db:push` only. Do NOT run `drizzle-kit generate` — since `v3_*` tables aren't in the migration snapshots, generate would emit bogus full CREATE TABLE migrations. A code reviewer flagging "missing migration file" for V3 columns is a false positive for this repo.

**Post-merge push can silently skip a new column (rename-collision trap):** When a task adds a new column near an existing same-type column (e.g. `items.v3_armor_boosts` added while `items.world_id` already existed), the automatic post-merge `db:push` shows an interactive "create column vs rename `world_id` → new_col" prompt. If it isn't answered with "create column", the new column is never created and the DB drifts from the schema — every insert/update touching that column then fails with a generic route error (e.g. `POST /api/admin/system-items 400 "Failed to create system item"`, underlying Postgres 42703 undefined column, swallowed by the catch block).
**How to diagnose/fix:** Symptom is a feature that worked in the task's isolated repl but 400s on main right after merge. Compare schema columns to live DB columns (`information_schema.columns`) for the affected table; add any missing column directly with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` matching the schema's column name/type/default, then verify with a rollback-only test insert. The leftover `items.world_id` in the DB (not in the `items` schema block) is a harmless artifact of this same trap.
