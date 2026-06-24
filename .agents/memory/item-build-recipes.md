---
name: Item build recipes & recommended pricing
description: Durable decisions for item "build recipes" (AA V2/V3) and the auto-recommended price
---

# Item build recipes (AA V2/V3)

Build recipes (ingredients to construct ANY item, used to drive recommended pricing) are stored in the **same craftRecipes table** as crafter-item recipes, distinguished by an `isBuildRecipe` flag (recipe output = the item itself, one per item).

**Why:** reuse existing ingredient storage instead of a parallel table.

**How to apply:** any query listing *crafter* recipes MUST exclude build recipes (filter isBuildRecipe=false), or they leak into crafter UI/runtime. Build recipes only exist to be grouped into crafter templates (snapshot copy, not live-linked) and to drive pricing.

# Recommended price rule

Recommended sale price = ingredient cost summed in copper (10c=1s, 10s=1g, 10g=1pt), +20% markup, divided per output unit, then **rounded UP to a clean denomination** (round up to a whole count of the largest denomination tier <= the amount, then express as the largest single denomination). Worked example: 8 silver cost -> 96c after markup -> **1 gold**.

**Why:** the user chose round-up so the price always exceeds cost+markup; the example 96c->1g is canonical.

**How to apply:** the price/currency fields auto-fill from this recommendation **by default** and recompute as ingredients change; the admin can still override. Do not clobber a saved/edited price on initial dialog load — only auto-apply after a real user edit to the recipe.

**Rarity surcharge (later user-requested change, supersedes the pure-ingredient formula):** rarity adds a flat copper surcharge per item — common 2s, uncommon 5s, rare 1g, epic 3g, legendary 5g — added per ingredient (×quantity) AND once per crafted output item (×outputQty), folded into the cost **before** the +20% markup. **Why:** the user explicitly asked that "the rarity of the ingredients and item made should also be applied to the cost," so the canonical 8s->1g example above no longer holds once rarity is included; this is intended, not a regression.
