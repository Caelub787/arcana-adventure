---
name: V3 spell-craft consumable accounting
description: Why element-eligibility consumption needs whole-composition allocation, not per-element greedy reservation
---

# V3 spell-craft consumable accounting

When a spell craft gates each element behind OR'd unlock conditions and the only
satisfying path is a *consumed* item, deciding which items to consume is a
**capacity-constrained bipartite matching over the whole composition**, not a
per-element decision.

**Why:** Two independent traps were each found in code review:
1. Per-element eligibility against the same full inventory snapshot lets two
   elements that both depend on the same single unit each pass on their own, so
   the craft under-consumes.
2. Greedily reserving the *first* satisfied consumable per element falsely
   rejects valid crafts when elements have alternative consumable paths
   (A:[X|Y], B:[X], stock X=1,Y=1 has the valid assignment A→Y, B→X but greedy
   picks A→X then fails B).

**How to apply:** Have the eligibility helper expose ALL satisfied consumable
alternatives per element (plus a "free path exists" flag), then run a matching
that assigns each consume-needing element one unit honoring per-row quantity;
reject only if no complete assignment exists. Do this *before* creating the
spell row so a rejected craft wastes no mana/token/item (the DB driver here has
no interactive transactions, so ordering is the only safeguard).
