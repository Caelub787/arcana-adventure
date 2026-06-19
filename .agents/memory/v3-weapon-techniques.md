---
name: V3 weapon base attack & techniques
description: How the V3-only weapon combat surface (leveled base attack + technique groups) is wired and gated.
---

V3-only weapon combat: a weapon item carries `v3TechniqueGroupIds` (text[]). Techniques live in `v3_techniques`, grouped via `v3_technique_groups` + `v3_technique_group_members`. A weapon's unlocked techniques = union of techniques in its assigned groups, filtered by player eligibility.

**Eligibility reuses the spell element model.** Technique `requirements` use the same OR'd condition shape as element-requirements (`conditionType: 'knowledge'|'item'`), evaluated client-side with `evaluateV3ElementEligibility` (shared/v3spells.ts) against `{knowledgeNames: customSkill names, items: inventory}`. Do NOT write a parallel eligibility checker — reuse that helper.

**Rolling/cost math lives in shared + a cast lib.** `shared/v3weapons.ts`: `v3WeaponBaseAttackEnergy(level)=max(1,level)`, re-exports `v3LevelDice`/`v3LevelDiceNotation`. Damage dice reuse the spell level-dice ladder. `client/src/lib/v3weaponcast.ts` (`castV3WeaponBaseAttack`, `castV3Technique`) rolls client-side, posts a roll notification, and deducts energy via `gameWs.sendCombatEnergy(id, cost, name, false)` — mirrors v3cast.ts for spells. Technique rollMode: `base_damage` rolls weapon level dice at the chosen level; `skill_check` rolls `1d{parentAttrDie} + skillMod` (die tier from `attrValueToDieSides(attrValue)`, mod from `character.v3Skills[skillKey]`).

**One reusable player surface.** `V3WeaponUsePanel` (GameComponents.tsx) is rendered in BOTH the inventory `ItemDetailDialog` (weapon, non-editing) and the battlemap hotbar long-press info panel, each gated `itemType==='weapon' && campaignSystem==='aa-v3'`. V2/V1 weapon flow is completely untouched.
