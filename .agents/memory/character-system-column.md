---
name: characters have no system column
description: A character's game system comes from its campaign, not a characters.system column — guard logic that reads character.system is silently always-undefined.
---

The `characters` table has **no `system` column**. The game system
(`arcana-adventure` | `aa-v2` | `aa-v3`) lives on the **campaign** row, and on
individual `items`/`spells`/templates.

**Why this matters:** Code that reads `character.system` compiles fine (objects
are loosely typed in these routes) but evaluates to `undefined` at runtime. A
real bug: the add-to-inventory route gated template linking on
`character.system === sourceItem.system`, which was always false, so
system-scoped library templates (e.g. an aa-v3 Crafter) never set
`templateItemId` on the inventory copy and their recipes could never resolve.

**How to apply:** To know a character's system, load its campaign
(`storage.getCampaign(character.campaignId)`) and use `campaign.system`, or use
`access.campaign?.system` from `checkCharacterAccess`. For character-owned
items, treat the **campaign** system as authoritative for any system gating —
an inventory copy's own `items.system` can be a stale default
(`arcana-adventure`) and must not gate aa-v2/aa-v3 behavior.
