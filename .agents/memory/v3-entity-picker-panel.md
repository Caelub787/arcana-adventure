---
name: V3 searchable entity picker panel (item dialog)
description: AA V3-only browse/search/filter panel replacing dropdowns for build-recipe ingredients and weapon technique groups
---

In AA V3 ONLY, the item-authoring dialog uses a "browse panel" (search + filter + scrollable clickable list) instead of dropdowns/always-open lists for picking entities — mirroring the campaign "add item to inventory" UX.

**Why:** the user explicitly disliked seeing all ingredient/technique-group options at once or via a dropdown; they wanted a panel that appears with search + filters.

**How to apply:**
- The reusable panel is `EntityPickerModal` (library-dialogs/components). It renders on top of the host dialog using the shared `.ld-dialog-overlay`/`.ld-dialog` theme classes (nested modal is fine — backdrop close is target-guarded so it won't close the parent). Multi-select: pass `selectedIds`, rows toggle and the modal stays open until explicit Done/✕/backdrop.
- Build-recipe ingredients: `ItemBuildRecipeEditor` takes an `isV3` prop. V3 → "+ Add ingredient" opens the picker (Type + Rarity filters); V2 keeps its original per-row `<Select>` dropdown UNCHANGED. Keep V2 untouched on any future edits here.
- Technique groups (already V3-weapon-only) use the same picker (search only) behind a "+ Add technique groups" button; selected groups show as an inline removable list. The old inline `SearchMultiSelect` was removed.
