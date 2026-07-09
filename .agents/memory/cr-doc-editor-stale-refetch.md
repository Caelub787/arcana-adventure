---
name: CR DocumentEditor stale-refetch caret teleport
description: Why the document body re-sync must skip while saves are in flight or a block is focused
---

**Rule:** In the CR DocumentEditor, never accept an upstream blocks refetch while any PATCH save is in flight or a block textarea is focused.

**Why:** `lastSaved` is bumped optimistically at mutate time. With two saves in flight (save A → keep typing → save B), the realtime "nodes" bump from save A refetches PRE-B content; local blocks look "clean" vs lastSaved(B), so the old guard accepted the stale snapshot — reverting typed text and teleporting the caret. Reported live as "cursor keeps teleporting".

**How to apply:** `pendingSavesRef` (inc before debounced/urgent block mutate, dec in onSettled) + `focusedBlockIdRef` guard the re-sync effect. Convergence still happens via the save's `patchLocal` onSuccess. Keep this pattern for any editor that mixes optimistic lastSaved bookkeeping with invalidation-driven refetches.
