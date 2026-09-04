---
name: Swampy system fork (of C.A.)
description: How Swampy is separated from C.A., what the two still share on purpose, and where to branch when they diverge.
---

# Swampy: a fork of C.A. (historical)

> **Out of date on the ruleset.** Swampy has since replaced C.A.'s rules
> wholesale with Daggerheart + Warrens — see `swampy-lanterns-system.md`. It is
> no longer a wound system, and `shared/swampy.ts` no longer resembles
> `shared/ca.ts`. The **scoping** described below still holds: the system slug
> is what keeps the two libraries apart.

Swampy (slug `swampy`, label `Swampy`) started as a byte-for-byte copy of C.A.

## Where the separation actually lives

**The system slug is the separation.** Every admin/library table (`items`,
`system_spells`, `system_species`, `classes`, `feat_trees`,
`character_templates`, `system_traits`, `token_effects`,
`crafter_recipe_templates`, `advanced_item_types`, ...) filters on a `system`
column, and every campaign carries one. Tagging a row `swampy` is what keeps it
out of C.A.'s lists, and vice versa. Swampy's lanes start empty — same as V3's
did.

**Rules live in `shared/swampy.ts`**, an independent copy of `shared/ca.ts`.
Neither file imports the other. Editing one never moves the other's numbers;
`shared/__tests__/swampySystem.test.ts` asserts the constant objects are
distinct so an "obvious" refactor to a shared constant fails loudly.

**Swampy owns three character columns** — `swampy_wounds`, `swampy_body_sex`,
`swampy_energy_pool` — mirroring C.A.'s `ca_*` three, so the wound/body/pool
mechanics can diverge freely.

## What they still share, deliberately

Attributes and skills sit on the same character columns C.A. and V3 already
share (`might`/`finesse`/`constitution`/`will`/`anemos`/`intelligence`,
`v3Skills`, `v3SkillBoosts`). A character belongs to exactly one campaign and
therefore one system, so the rows never overlap — this is per-character
storage, not shared library content. Only the admin-authored constant lists
needed forking. C.A. made the same call against V3; see the header comment in
`shared/ca.ts`.

`roll_entries.linkedSkillKey` is likewise shared; it's resolved against the
campaign's own skill list.

## How to touch shared UI

`shared/systemRules.ts` is the seam. `isWoundSystem(slug)` replaces every
`campaignSystem === 'ca'` check, and `woundSystemRules(slug)` returns that
system's constants, helpers, **and character column names** (`woundsField`,
`bodySexField`, `energyPoolField`, plus `woundsOf`/`bodySexOf`/`energyPoolOf`
readers). Never reach for `character.caWounds` directly in shared code — that's
how one system starts reading the other's data.

When the two need genuinely different UI, branch on `rules.slug` at that spot
rather than widening `WoundSystemRules`.

**Gotcha:** `packages/library-dialogs` is standalone and has no `@shared`
alias, so it carries its own `isWoundSystem()` in `src/lib/effectTypes.ts`.
Adding a wound system means updating both copies.

**Gotcha:** local identifiers in `CharacterSheet` still read `caWound*` /
`isPlacingCAWound` / `CAAttrsAndSkillsTab`. They predate the fork and serve
both systems now — the name is historical, not a scoping hint.

## Visible systems

`shared/systems.ts` owns the slug/label pairs (species tables key on the
**label**, everything else on the **slug** — see `aa-v3-system-naming.md`) and
`PUBLIC_SYSTEM_SLUGS`, currently `['ca', 'swampy']`. The three older systems
are admin-only for new campaigns because they're incomplete. Enforced in the
creation dropdown, the admin/My Library system picker, **and**
`POST /api/campaigns` — the server check is the real one.

## Art

`client/src/lib/woundBodyImages.ts` maps a slug to its body diagrams. Swampy
currently points at C.A.'s two images; drop new files in `client/src/assets`
and repoint that one entry when it gets its own.
