---
name: AA V3 deferred spell features
description: Two AA V3 spell features specified but NOT yet implemented — read before building V3 spell crafting.
---

# AA V3 deferred spell features (not yet built)

Two spell-related features were specified for AA V3 but are NOT implemented yet.

## 1. NO-AI GM popup for spell creation
When a player tries to create a spell in a V3 campaign, the feature must use **no AI**.
Instead, a GM-side popup/menu lets the GM author the spell's **name**, **description**, and **profile image** for the player's spell.

**Why:** explicit user instruction — the spell-creation feature must not rely on AI generation; the GM authors the content manually.

**How to apply:** when building V3 spell crafting, route player spell-creation requests to a GM approval/authoring dialog rather than any AI generation path.

## 2. V3 spell-levels
- Level 1 = 1d6, scaling up to level 5 = 2d6 (per-level damage scaling).
- Each level adds +1 mana cost.
- Base spell level is 1–4, plus an up-cast input to cast at a higher level.

**How to apply:** layer onto the V3 spell model when spell crafting is built.
