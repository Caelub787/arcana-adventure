---
name: V3 schema uses db:push, not migration files
description: Why AA V3 (and recent) schema changes are applied via db:push and have no migration files
---
The entire AA V3 feature set (e.g. `v3_spells` and related tables/columns) was added with `npm run db:push` and is NOT present in any file under `migrations/`. There is no `migrate()` call on server boot — migration files are stale and not applied at runtime.

**Why:** This project switched to `drizzle-kit push` as the source of truth for schema around the V3 work; the committed `migrations/*.sql` only cover older (pre-V3) schema.

**How to apply:** When adding/altering V3 (or other recent) schema in `shared/schema.ts`, apply it with `npm run db:push` only. Do NOT run `drizzle-kit generate` — since `v3_*` tables aren't in the migration snapshots, generate would emit bogus full CREATE TABLE migrations. A code reviewer flagging "missing migration file" for V3 columns is a false positive for this repo.
