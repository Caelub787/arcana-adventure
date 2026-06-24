---
name: Item build recipes
description: How item "build recipes" reuse the craftRecipes table and stay separate from crafter recipes
---

# Item build recipes (AA V2/V3)

Build recipes (ingredients to construct ANY item, used for recommended pricing) are stored in the **same `craftRecipes` table** as crafter-item recipes, distinguished only by `isBuildRecipe=true` with `parentItemId` = the owning item.

**Why:** avoided a parallel table; reuses existing ingredient storage + createCraftRecipe.

**How to apply:** any query that lists *crafter* recipes for an item MUST filter `isBuildRecipe=false` (e.g. getCraftRecipesByItem already does) or build recipes will leak into crafter UI/runtime. Conversely getItemBuildRecipe filters `isBuildRecipe=true`.

Recommended price math lives client-side in ItemBuildRecipeEditor.tsx: currency copper-rates {copper:1,silver:10,gold:100,platinum:1000}, sum*1.2/outputQty ceil'd, then denominate() picks the largest *exact* denomination (no overshoot).
