---
name: V3 magic hotbar holds spellbook/scroll items
description: How AA V3 casts spells in play — magic hotbar carries spellbook/scroll ITEMS, scroll consumption is centralized
---

In AA V3, the magic hotbar holds **spellbook/scroll items** (not loose `v3SpellId` spells like the older foundation pass). Tapping such a hotbar slot opens the reusable `SpellbookPanel` to browse + cast its spell(s). Loose-spell hotbar entries (`hotbar.v3SpellId`) still work but are no longer how players send spells to the bar (the "Send to Hotbar" affordance in the V3 spellbook view was removed; rows tap straight to the cast/detail dialog).

A **scroll** is just a single-spell spellbook item (`itemType==='scroll'`, max spells forced to 1) that is consumed on a successful cast.

**Why:** keeps one casting surface (`SpellbookPanel` + `V3SpellDetailDialog`) instead of bespoke per-slot UIs, and makes consumable spells (scrolls) fall out of the existing item/quantity/hotbar machinery.

**How to apply:**
- Scroll/consumption is centralized through `V3SpellDetailDialog`'s `onCast` callback, threaded through `SpellbookPanel.onSpellCast`. Any place that casts a V3 spell from an item should pass an `onSpellCast` that decrements quantity / deletes the item (and clears the hotbar slot when cast from the battlemap). `onCast` fires only on a *successful* cast (mana sufficient), so scrolls are never wasted on a blocked cast.
- New gameplay item types (`spellbook`, `scroll`) are plain `itemType` text — no schema change. They are gated on `isAAV3`/`campaignSystem==='aa-v3'`; V2 paths must stay untouched.
- Item-type **filter** dropdowns (admin list, char-sheet inventory, add-item flow) intentionally list ALL types for ALL systems (they only narrow display); the **creation** gating for spellbook/scroll stays V3-only in the package `ItemDialog`.
