---
name: characters have no system column
description: How to system-gate character-related logic when characters lack a system field
---

The `characters` table has **no `system` column** (unlike `items`, `spells`/`system_spells`, and `campaigns`, which all do).

**Why:** When gating logic by game system (arcana-adventure / aa-v2 / aa-v3) for characters, you cannot read `character.system` — it's always undefined and the hand-written/inferred type doesn't include it.

**How to apply:** Derive a character's system from its owning context instead:
- A campaign character → its `campaign.system`.
- A world/template character → its `world.system` (via `character.worldId` → `getWorld`).
Item/spell imports compare the object's own `system` to the target `campaign.system`; character imports compare the source world's `system` to the campaign's.
