---
name: World-scoped library objects
description: How items/spells/character-templates get scoped to a world vs admin/personal library, and the worldId invariant.
---

World objects (items, system_spells, characters) are library rows (`isTemplate=true`) tagged with a nullable `worldId` FK and `system` copied from the world.

**The worldId filter invariant:** in storage getters (`getSystemItems`/`getSystemSpells`/`getCharacterTemplates`), `worldId` set → filter `worldId = X` and ignore ownerScope; `worldId` absent → filter `worldId IS NULL`.
**Why:** without the `IS NULL` branch, world rows leak into the admin/personal library lists. Any new library getter or scope must keep this both-directions guard.
**How to apply:** when adding a new world-scoped object type or a new library query path, thread `worldId` through and enforce both branches; authorize via `checkWorldAccess` (owner/collaborator = write, member = read) instead of the library ACL when `worldId` is present.

**Slug vs display label:** `worlds.system` stores slugs (`arcana-adventure`|`aa-v2`|`aa-v3`), but `getSystemSpecies`/`CharacterSheet` expect display labels (`Arcana Adventure`/`A.A. V2`/`A.A. V3`). Convert slug→label when passing system into those.

Client reuses the admin library-dialogs transport pipeline: `arcanaApiTransport(slug, undefined, worldId)` + `arcanaSessionHostAdapter`. The reusable UI is `client/src/components/worldbuilder/WorldObjectsPanel.tsx`, mounted in both standalone WorldBuilder and Campaign's embedded `WorldBuilderContent`.
