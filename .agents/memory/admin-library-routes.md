---
name: Admin library routes & ownership scoping
description: Where the in-app class/library editors live, and the privilege-boundary rule for admin library write routes.
---

# Admin library (classes/items/spells/etc.) routes & UI

## In-app editors are NOT the shared library-dialogs package
The in-app class editor lives in `client/src/pages/AdminSettings.tsx` (plain `fetch` to `/api/admin/classes`). The shared `packages/library-dialogs` `ClassDialog` and the `class` transport in `client/src/lib/libraryDialogsHost.tsx` are `notImpl` in-app. So class-editor UI changes go in `AdminSettings.tsx`, not the package dialog. Same gotcha likely applies to other library kinds — verify before editing the package.

## ownerUserId scoping = library tenancy
`/api/admin/*` library tables (classes, items, spells, feat-trees, ...) are multi-tenant via `ownerUserId`: `NULL` = global admin library, non-null = that user's personal library. `requireAuth` (not `requireAdmin`) guards most of these so GMs can read/use them; `enforceLibraryWrite(req,res,existing.ownerUserId)` gates writes.

**Why this matters:** any feature that "fans out" a global library row to many users/characters MUST require `ownerUserId IS NULL`, or a non-admin's personal row leaks across tenants. (AA V3 universal classes: `getUniversalClasses` filters `applyToAll && ownerUserId IS NULL`; backfill triggers re-check `ownerUserId == null`.)

## PATCH routes that write raw `req.body` are an escalation hole
Several admin library PATCH routes pass `req.body` straight to `storage.update*`. A non-admin who owns a personal row can then patch `ownerUserId: null` (or `system`) to globalize it. **How to apply:** for any privileged/global-scope field (`ownerUserId`, `system`), strip it from the payload for non-admins (`isAdminUser` from `server/lib/library-acl`) before the update — the create routes already force `ownerUserId` for non-admins; PATCH routes historically did not.
