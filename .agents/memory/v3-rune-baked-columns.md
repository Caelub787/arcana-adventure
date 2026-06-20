---
name: V3 rune baked-column conflicts
description: V3 rune stat effects bake into shared host item columns; some columns double as manual UI fields, so save-normalization must not clobber the rune contribution.
---

V3 runes (socketedRunes[]) bake their stat effects into real host `items` columns
via the `V3_RUNE_STAT_TARGETS` whitelist (carryCapacity, damageReduction,
dcBonusValue, mod, range, price, itemWeight). `v3AttachRune` adds onto the existing
column value; `v3DetachRune` reverts it.

**The trap:** some of those columns ALSO back a manual UI field. `dcBonusValue` is
both the "Grants DC Bonus" manual input AND a rune-bakeable column. Any save-path
that normalizes the manual field (e.g. `dcBonusValue = grantsDcBonus ? value : 0`)
will silently wipe the rune-baked contribution.

**Why:** the column is shared between two writers (manual toggle + rune bake), so
zeroing it for the manual case destroys the rune's value.

**How to apply:** when normalizing a manual field that is also a rune target, fall
back to the rune contribution instead of 0. Use
`aggregateRuneStatEffects(socketedRunes)[columnKey] || 0` (in `shared/v3.ts`) for
the rune-only amount. The other rune columns (mod/range/price/etc.) are safe
because their save paths pass the formData value straight through.

Also: new copy paths (shop add-from-template, server shop-buy item creation) do NOT
automatically carry `socketedRunes` — each spread/whitelist must explicitly include
it or the runes silently drop on copy.

**Slot-grid rendering trap:** when runes render as a fixed grid of `v3RuneSlotCount(rarity)`
cells indexed by slotIndex, never render only `0..cap-1`. Capacity can shrink below the
socketed count (rarity lowered after attaching), stranding overflow runes (slotIndex >= cap)
as invisible + unremovable while their baked stats persist. Render
`max(cap, highestSlotIndex+1)` cells; show filled cells always, cap the empty add-slots at
`cap`. Applies to both V3RuneAttachEditor (client) and the ItemDialog "Default runes" grid.
