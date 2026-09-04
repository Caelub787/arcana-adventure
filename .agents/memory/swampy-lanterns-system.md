---
name: Swampy — The Lanterns Beyond the Veil
description: Swampy is Daggerheart's base with freeform magic tied to Warrens. It is NOT a C.A. copy any more; where its pieces live and what deliberately doesn't exist.
---

# Swampy: The Lanterns Beyond the Veil

Built from a system brief. Daggerheart's mechanical base with its fixed classes,
Domain Cards and spellcasting removed, replaced by freeform actions for everyone
and magic ("Drawing") tied to living worlds called Warrens.

**Swampy is no longer a C.A. copy.** It began as one (see
`swampy-system-fork.md`) and replaced that ruleset wholesale. `shared/swampy.ts`
was rewritten; `isWoundSystem('swampy')` is now **false** and C.A. is the only
wound system again. Anything that still treats them as a pair is a bug.

## What the rules module carries

`shared/swampy.ts` — independent of `shared/ca.ts` and `shared/v3.ts`, both ways.

- **Six traits** (agility/strength/finesse/instinct/presence/knowledge). No skill
  list at all: expertise is traits plus per-character freeform **Experiences**,
  which cost a Hope to bring into a roll.
- **Duality Dice**: `resolveSwampyDuality(hope, fear, mod, difficulty)` → the
  five outcomes. Matching dice are a critical **regardless of Difficulty**, and
  a critical both grants a Hope and clears a Strain. With no Difficulty set the
  roll reports which die won but can't have succeeded.
- **HP behind thresholds**: `swampyHpCostForDamage` returns 1/2/3 HP by Minor/
  Major/Severe, and each Armour Slot steps it down a tier but **never below 1** —
  that is what "armour is limited" means mechanically.
- **Strain** as one track; `applySwampyStrain` spills overflow into HP damage
  rather than dropping it, and reports the moment Vulnerable is reached.
- The **nine Warren conditions**, the **Drawing checklists** (player declaration,
  GM response, four checks, routes forward, Overdraw costs), the **Working
  Ledger** fields, and the **Deck of Houses** spreads — all as data, because
  "players always know the likely cost and main risk before committing" only
  holds if the questions render rather than depending on the GM remembering.

## Where the pieces live

| Piece | Where |
|---|---|
| Rules | `shared/swampy.ts` |
| Duality roll + consequences | `client/src/lib/swampyRoll.ts` |
| Sheet + panels | `client/src/components/game/SwampyPanels.tsx` |
| Library views | `SwampyWarrensView` / `SwampyDeckView` in `AdminSettings.tsx` |
| Tables | `swampy_warrens`, `swampy_workings`, `swampy_house_cards` |
| Per-character state | `swampy_*` columns on `characters` |
| GM Fear pool | `campaigns.swampy_fear` |

The Duality roll happens **client-side** (two d12 whose relationship decides the
outcome; the server dice endpoint is single-die) — same reason as V3 level dice.

## What deliberately does not exist

Don't "add the missing piece" — these are absent on purpose:

- **No spell list, spell slots, or mana.** The sheet has no Magic tab.
- **No classes, no feat/skill trees, no skill list.**
- **No library of Workings.** The Working Ledger is campaign-scoped only,
  because it is a log of precedents set at one table, not pre-authored content.
  It is party-readable (relying on and learning from established techniques is
  the point) and GM-written (a precedent is a ruling).
- **No stored readings.** A reading is transient and broadcast to the table.

## Scoping rules that matter

- Warrens and house cards are scoped `system='swampy'` server-side, so they can
  never leak into another system's library. Warrens can also be campaign-scoped;
  a campaign's list returns its own rows **plus** the library ones it can see.
- Every Swampy route rejects a non-Swampy campaign with a 400 rather than
  returning an empty list, so a mis-scoped call is obvious immediately.
- Fear can be *added* by any member (a player's own roll landing Fear-side is the
  commonest way it grows) but only *spent* by the GM.
- A Working snapshots its Warren's **name** next to the id, so a precedent still
  reads correctly after that Warren is deleted.

## Shared surfaces Swampy opts into

- **Hotbars**: the free hotbar (`V3FreeHotbar`, shared with V3 and C.A.), not the
  V2 battle/GM hotbars — Swampy has no per-character hotbar model to slot into.
  Its stat bars are HP / Strain / Hope; C.A.'s are Wounds / Energy, so
  `CharStatBars` branches on `isSwampy` before the wound pack.
- **Fear** docks bottom-right on top of the hotbar, not with the party tracker.
  Its offset steps with the hotbar's own height, which changes twice (the slot
  grid is 5 wide until `xl`, the slots grow at `sm`), and below `md` the hotbar
  shares that right edge so it has to be cleared outright.
- **Top-left toolbar**: Search in every system, then Swampy's **Working Ledger**
  and **Deck of Houses**. Those two buttons are the *only* way into either
  panel — `activeSidePanel` still accepts `'ledger'`/`'deck'` whether or not
  anything can set them, so deleting the buttons silently orphans both panels
  rather than breaking a build. The map's select/ruler tools sit under that
  column and derive their top offset from its button count
  (`selectionToolsTop` in `Campaign.tsx`); it used to be a hardcoded `top-44`
  and left a 120px hole the moment the count changed.

## Items

Items are unchanged — the brief changes magic, not equipment. Swampy uses the
`@arcana/library-dialogs` blank-sheet ItemDialog like C.A. does, via
`isBlankItemSheetSystem()`. Note that predicate is **separate** from the
package's `isWoundSystem()`: they used to be the same function, and splitting
them is what lets Swampy keep blank item sheets without also getting C.A.'s
Linked Skill picker (Swampy has no skills to link).
