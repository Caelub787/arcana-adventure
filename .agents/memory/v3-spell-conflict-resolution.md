---
name: V3 spell official/canonical model & duplicate resolution
description: What "official/canonical" means for V3 spells and why duplicate resolution must never touch campaign-used rows.
---

**Decision:** an "official" (canonical) V3 spell is a GLOBAL admin template only —
both `campaignId` and `spellbookItemId` are null. Campaign-attached rows are
copies in active play and are governed separately.

**Why:** duplicate resolution (admin approve/create of a same-recipe spell) may
demote a prior official spell. If the canonical lookup matched any
`isCanonical=true` row, that demotion could mutate a spell a campaign is
currently using. The hard requirement is that resolving duplicates never alters
in-campaign spells, so the canonical lookup is constrained to global rows; the
demote then can only ever land on a global template.

**How to apply:**
- Any "is there already an official version of this recipe?" lookup must filter
  to global rows (campaignId null AND spellbookItemId null), not just
  `isCanonical=true`. Keep new callers consistent.
- Same-recipe collisions are surfaced to the admin as a decision (keep this /
  keep the other / decide later) instead of silently superseding; the prior
  official is only demoted on an explicit choice.
- The conflict is delivered to the client as a normal (2xx) response envelope,
  not an error status, because the client's fetch helper throws on non-2xx and
  that would break the decision flow.
- The route mock harness stubs the DB, so the global-only filter can't be
  exercised there; verify it via the storage query, and at the route level
  assert that no non-candidate row id is ever mutated.
