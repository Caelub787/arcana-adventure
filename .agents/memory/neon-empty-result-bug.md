---
name: Neon driver empty-result crash
description: Why server/db.ts must use the neon-serverless WebSocket Pool, not neon-http, with drizzle 0.39.x
---

# Neon HTTP driver crashes on empty result sets

Using `drizzle-orm/neon-http` + `neon()` (the HTTP SQL client) from
`@neondatabase/serverless@0.10.x`, **any query that returns zero rows** throws
`TypeError: Cannot read properties of null (reading 'map')` inside the driver's
`processQueryResult` (`r.fields.map`). Neon's HTTP backend returns `fields: null`
for empty result sets and the 0.10.x client does not guard it. A query that
returns ≥1 row works fine — the crash is purely a function of an empty result.

**Why:** this surfaced as widespread, confusing 500s (e.g. GET /api/campaigns,
startup migrations) that looked like schema drift but were not — raw SQL and
non-empty queries worked, only zero-row queries crashed.

**How to apply / canonical pattern:** `server/db.ts` (and any new DB wiring) must
use the **WebSocket Pool** driver, mirroring `server/canvasrealms/db.ts` and the
`server/app.ts` session store:

```ts
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

The Pool uses the full Postgres wire protocol (proper RowDescription even for 0
rows), so it has no empty-result bug.

**Do NOT bump `@neondatabase/serverless` to 1.x to fix this:** neon 1.x makes the
http `neon()` client tagged-template-only (`sql\`...\`` / `sql.query(...)`), which
is incompatible with how `drizzle-orm@0.39.1` calls it (`client(sql, params, opts)`).
Upgrading the driver requires also upgrading drizzle-orm, which is risky across
this large codebase. Stay on neon `^0.10.4` + drizzle `0.39.1` and use the Pool.
