---
name: Personal library scoping (My Library)
description: How the additive `personal` flag isolates a user's own library rows from the global admin library, even for admins.
---

# Personal library scoping

The admin-library REST surface (`/api/admin/{system-items,item-templates,system-species,feat-trees,spells,character-templates}`) is shared by BOTH the global admin library UI (AdminSettings) and the in-campaign "My Library" panel.

To give every user — including admins — a PERSONAL library distinct from the global one, there is an additive, default-OFF `personal` flag:

- `getLibraryScope(userId, campaignId, personal)` in `server/lib/library-acl.ts`: when `personal` is true it returns `[userId]` for EVERYONE (admins included). The storage layer still unions implicit global null-owner rows, so a personal view = own rows + global, never other users' rows.
- GET routes read `?personal=1`; POST routes read `req.body.personal===true`, **strip it from the body** (drizzle rejects unknown columns for species/feat-tree/spell/char-template; items go through `insertItemSchema.parse` which strips), and gate admin-global ownership as `(isAdmin && !personal)` so a personal create lands under the caller's user id instead of the global library.
- Client: `api.ts` list methods + both transport factories (`arcanaApiTransport`, `createArcanaApiTransport`) take optional `personal` and propagate it to list reads and create bodies. `MyLibraryPanel` passes `personal:true`; AdminSettings passes nothing (global behavior preserved).

**Why:** A prior attempt failed because admins always got `undefined` scope (all rows) and writes landed in the global library, so admins had no personal library. Keeping the flag default-OFF means existing admin/GM/player behavior is untouched unless a caller opts in.

**How to apply:** Any new admin-library kind or new surface that needs a per-user library should thread this same `personal` flag end-to-end (GET query, POST body strip + ownership gate, api list method, transport). Never let `personal` reach `storage.create*` as a column.
