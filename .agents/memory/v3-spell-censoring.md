---
name: V3 spell name censoring
description: Where AA V3 profane spell-name censoring must be applied (all player-facing egress, not just REST reads)
---

# AA V3 spell name censoring

Censoring of flagged (profane) V3 spell names is **server-side only** (single source of
truth, `censorV3SpellForCampaign` in `server/routes.ts`, backed by `shared/profanity.ts`).
It is keyed on the **viewing campaign's** `is18Plus` flag and applies to **everyone** in
that campaign (including GM/admin viewing in-campaign). The admin panel (`/api/admin/v3-spells*`)
**never** censors — it is the moderation surface.

**Why:** A code review caught that censoring REST reads alone is insufficient — any
player-facing egress can leak the raw name.

**How to apply:** When adding any new surface that returns or broadcasts a V3 spell to
players, censor it. Known egress points that MUST stay censored:
- `GET /api/v3/characters/:id/spells` and `GET /api/v3/spellbooks/:itemId/spells`
- the craft response payload's `spell` field
- the `v3_spell_authored` WebSocket broadcast payload (censor before `broadcastToCampaign`)

Other governance gates established alongside this:
- The `is18Plus` campaign toggle is **AA V3-only**; `PATCH /api/campaigns/:id` strips the
  field unless `campaign.system === 'aa-v3'` (UI gating alone is not enough — direct API
  calls must be rejected too).
- `GET /api/v3/spells/canonical/:hash` is `requireAdmin` (it has no campaign context to
  censor by, and the craft flow resolves canonical server-side, so no player needs it).
