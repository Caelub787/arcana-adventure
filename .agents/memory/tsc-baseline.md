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
