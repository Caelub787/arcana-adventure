---
name: TypeScript build baseline
description: This repo does not type-check clean; use error-count delta, not absolute, to gauge a change.
---

# tsc is not the build gate

The app builds/runs via Vite + esbuild (`tsx server/...`), which does NOT type-check.
`npx tsc --noEmit` reports a large standing backlog of pre-existing errors
(GameComponents.tsx, Campaign.tsx, AdminSettings.tsx, rollSort.ts, drizzle
`Partial<...>` mismatches, `downlevelIteration`, missing `JSX` namespace, etc.).

**Rule:** To check whether *your* change is type-clean, compare the total
`rg -c "error TS"` count before vs. after. An unchanged count = zero new errors.
Do NOT try to drive the absolute count to zero — that backlog is unrelated to
most tasks and chasing it is out of scope.

**Why:** A single full `tsc` run is slow and floods output; filtering by filename
with `head` can hide your file's errors below the cutoff. The delta is the
reliable signal.

## Drizzle's inference cliff makes the count jump around mid-change

Past a certain schema size drizzle's inference gives up, and pre-existing
`db.insert(...).returning()` and `.set({...})` sites you never touched start
reporting `any[] | QueryResult<never>` and `not assignable to type
'[any, ...any[]] | unknown[]'`. Adding a table or a column can therefore push
the count up in files you did not edit.

**It can also come back down.** Measured during the Swampy build: adding nine
character columns took 437 → 446, the three new tables took it to 459, and
then adding the routes that *use* them brought it back to 437. Nothing was
fixed in between — the cliff simply moved.

So: an increase mid-change is not necessarily your bug, and re-checking after
the rest of the change lands is worth doing before you redesign anything to
chase it. It is type-level noise either way; esbuild strips types and the
runtime is unaffected.

**Baseline as of the Swampy build: 437.**
