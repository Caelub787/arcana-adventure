---
name: V3 spell-craft consumable accounting
description: Why element-eligibility consumption must be inventory-aware across the whole composition
---

# V3 spell-craft consumable accounting

When a V3 spell craft gates elements behind unlock conditions where the only
satisfying path is a *consumed* item, eligibility/consumption MUST be evaluated
across the whole composition with units reserved as you go — not per-element
independently.

**Why:** Per-element evaluation against the same full inventory snapshot lets two
distinct elements that both depend on the same single consumable each pass on
their own; consumption then matches that one inventory row once and silently
skips the rest, so the craft succeeds while under-consuming. This was caught in
code review for the element-requirements feature.

**How to apply:** In `server/routes.ts` `/api/v3/spells/craft`, reserve a unit
(track remaining `quantity` per inventory row) for each element whose sole path
is a consumable; reject the craft (before creating the spell row, so no
mana/token/item is wasted — Neon HTTP driver has no interactive transactions) if
a unit can't be uniquely allocated. Aggregate reservations per row before
deducting (decrement, or delete at qty<=0). A row with quantity>1 can satisfy
multiple paths.
