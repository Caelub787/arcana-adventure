---
name: V3 attribute species-bonus accounting
description: V3 species attribute bonuses are baked into the character attr columns with no separate base/species split stored — how to recover player-allocated points.
---

# V3 attribute species-bonus accounting

In AA V3, a species' `attributeBonuses` are **added directly onto** the character's
attribute columns (`might/finesse/constitution/will/anemos/intelligence`) at
character-create and re-applied/reverted on species change (server
`applyV3SpeciesDefaults` / `reapplyV3SpeciesOnChange`). There is **no stored
separation** of "player-allocated base" vs "species bonus" on the character.

**Why it matters:** any feature that needs the player's *own* allocated points
(e.g. level-up point budgets) must subtract the species bonus:
`playerAllocated[attr] = max(0, storedColumn[attr] - speciesBonus[attr])`.

**How to apply:** resolve the species the same way the server does — campaign
species (`getCampaignSpecies(campaignId)`) win over the shared system species,
which is stored under the **display name `'A.A. V3'`** (not the slug `aa-v3`).
Read `species.attributeBonuses`. Species *default skills* are separate custom-skill
rows (not in the `v3Skills` canonical map), so skill-point math needs no such
subtraction.

**Convention:** the V3 point-budget trackers (`V3AttrsAndSkillsTab` in
`GameComponents.tsx`) are **display-only**, matching the existing AA V2 point
tracker — no hard save-block and no server-side budget validation. Budgets:
attr = 4 + floor(level/3) (no negatives); skill = 8 + (level-1), each skill min
-2, total reclaimed negatives capped at 6. Helpers live in `shared/v3.ts`
(`v3AttrPointBudget`, `v3SkillPointBudget`, `V3_MAX_NEGATIVE_SKILL_POINTS`).
