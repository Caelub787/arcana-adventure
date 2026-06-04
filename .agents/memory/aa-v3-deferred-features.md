---
name: AA V3 spell features (now built)
description: Two AA V3 spell features — NO-AI GM authoring + spell levels — are now implemented. How they actually work.
---

# AA V3 spell features (implemented)

Both features below were specified as deferred and are now built.

## 1. NO-AI GM authoring (no auto-popup)
Player spell crafting uses **no AI**. When a player crafts a brand-new composition the
server creates a `v3_spells` row `status='awaiting_gm'` and broadcasts `v3_spell_request`.
The GM authors name/description/image. The GM surface is the **Crafted Spells manager**
(`V3GmSpellManager` in `client/src/components/game/V3SpellCrafter.tsx`) which has a
**"Pending requests"** section; a non-blocking listener (`V3SpellAuthoringListener`)
only toasts + drives a badge count (it does NOT auto-open a dialog — that was the old
blocking behavior, intentionally removed). `V3SpellLiveSync` invalidates
`['spellbook-spells']` + `['v3-character-spells']` for all aa-v3 users so authored spells
appear live.

**Why no auto-popup:** a forced modal interrupted the GM mid-game; authoring must be
GM-initiated from the manager.

## 2. V3 spell levels
Dice + mana math lives in `shared/v3spells.ts`: `v3LevelDice(level)` →
count=1+floor((level-1)/4), sides cycle [6,8,10,12] by (level-1)%4, **no cap**;
`v3LevelExtraMana(level)` = level-1. Casting (level stepper + roll) is in the V3 spell
detail dialog and rolls **client-side** (see `v3-spell-rolling.md`).
