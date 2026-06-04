---
name: AA V3 spell rolling — multi-die client-side
description: Why V3 level-scaled spell rolls are computed on the client, not the server dice endpoint.
---

# AA V3 spell rolling

V3 spells scale by level into **multi-die** rolls (e.g. level 5 = 2d6, level 9 = 3d6).
The roll is computed **client-side** (`client/src/lib/v3cast.ts`) and surfaced via
`triggerRollNotification`, NOT through the server dice handler.

**Why:** the server dice handler only accepts a **single die** from a fixed set
(`d4`..`d30`); it cannot express `NdX`. Routing a multi-die V3 cast through it would
require either N round-trips or a server change. Client-side rolling + a notification
broadcast keeps it in one place and matches how the existing hotbar V3 cast worked.

**How to apply:** when adding new V3 dice mechanics that need NdX, do the dice math in
shared helpers (`shared/v3spells.ts`: `v3LevelDice`/`v3LevelDiceNotation`/`v3LevelExtraMana`)
and roll in the client; only use the server dice endpoint for single-die rolls.
Note: `RollNotification` `type` union has no `'spell'` value — use `'custom'` for the
roll and `'system'` for error toasts (the latter is not broadcast).
