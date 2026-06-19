---
name: Client Item/ItemDraft types are hand-maintained
description: Why adding an items column also requires editing two client-side TS interfaces.
---

The client does NOT derive its item types from `shared/schema.ts` `$inferSelect`. Two hand-maintained interfaces shadow it:

- `client/src/lib/api.ts` → `export interface Item` (runtime/query shape used across GameComponents etc.)
- `packages/library-dialogs/src/dialogs/ItemDialog.tsx` → `export interface ItemDraft` (editor form shape)

**Why:** these were written by hand before/independent of the Drizzle inference, so a new `items` column compiles fine server-side and in `shared` but produces `Property 'x' does not exist on type 'Item'/'ItemDraft'` tsc errors wherever the client reads/writes it.

**How to apply:** any time you add an `items` column that the client touches, add the matching optional field to BOTH interfaces. (`server/routes.ts` PATCH passes req.body through, so no server whitelist needed.)
