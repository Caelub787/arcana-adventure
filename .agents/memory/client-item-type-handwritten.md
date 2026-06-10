---
name: Client Item type is hand-written, not schema-derived
description: Adding a column to the items table does not surface it on the client-side Item type
---

The client-side `Item` type is a **hand-written `interface Item`** in `client/src/lib/api.ts`, NOT `typeof items.$inferSelect` from `shared/schema.ts`. (Server code uses the schema-derived `Item` from `@shared/schema`.)

**Why:** When you add a new column to the `items` table in `shared/schema.ts`, server/Drizzle types pick it up automatically, but client components that import `Item` from `@/lib/api` will get a TS2339 "property does not exist" the moment they read the new field.

**How to apply:** Any time you add a column to a table and the client reads/writes it via the api.ts types, also add the field to the matching hand-written interface in `client/src/lib/api.ts`. Several other entity types in api.ts are likewise hand-written interfaces, not schema-inferred — check there first when a freshly-added column errors only on the client.
