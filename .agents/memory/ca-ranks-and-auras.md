---
name: C.A. ranks and auras
description: How a C.A. character's rank is derived, why Bronze starts at 0, what Physique caps, and how the Aura replaced beacon colours.
---

# C.A.: ranks, Physique, and auras

All of this is **C.A. only**. Swampy and the V-systems are untouched;
`shared/ca.ts` owns every constant and `shared/swampy.ts` imports none of it.

## Ranks are derived, never set

`caRankForEnergyPool(pool)` in `shared/ca.ts` is the only way a rank is
decided. Nothing stores a rank — it is read off `characters.ca_energy_pool`
every time it is shown, so a pool edit is a rank change with no second write
to keep in sync.

Two things about the numbers that look like typos and are not:

- **There is no Unranked.** Bronze Star 1 sits at 0, so a character has a
  rank the moment they exist.
- **Bronze runs 0/20/30/40/50, not 0/10/20/30/40.** Every threshold is the
  source spreadsheet's figure with one zero taken off; Star 1 then took over
  Unranked's slot at 0 while the other four kept their own values. The 10
  rung simply isn't part of the ladder. This was confirmed with the user
  rather than inferred — don't "fix" it.

Five ranks, five stars each: Bronze, Silver, Gold, Obsidian, Terran. The
sheet screenshot that says "Platinum 1" is from an older draft; **Platinum
does not exist.**

Usable Energy is exactly half the pool at every rung, so `caUsableEnergy` is
`floor(pool / 2)` and no per-star usable figure is stored. Health is in the
source table and deliberately absent here — C.A. replaced HP with wounds.
Lifespan and the absorption limit are carried as flavour, shown in the rank
reference dialog.

## Physique caps the pool

`characters.ca_physique` is a ceiling on `ca_energy_pool`: a body can only
carry so much energy. Because the rank is read off the pool, letting a pool
past the cap would hand out unearned ranks, so it is clamped on the **server**
in the character PATCH handler as well as in the sheet — and lowering Physique
drags an existing pool down with it.

**A Physique of 0 means "not set", not "a cap of zero"**
(`caClampEnergyPoolToPhysique`). Characters created before the column existed
default to 0 and must not be retroactively pinned to an empty pool.

## Auras replaced beacon colours

An aura is `ca_aura_color` plus an optional `ca_aura_shape`, and it belongs to
the **character**, not the player — that is the whole point, so two characters
run by one player look nothing alike.

The wiring is deliberately narrow: `characterTrackerColor()` in
`GameComponents.tsx` ends in `caAuraOf(character, base).color`, and that one
function already feeds the tracker outline and roll glow, the dice tray, chat
names and the free hotbar's card accent. Only C.A. characters ever have an
aura colour set, so the fallback returns the old value untouched everywhere
else — **there is no system check in that path, and it doesn't need one.**

The two surfaces that are not fed by it:

- **The battlemap ping.** Resolved server-side in the `beacon` WS handler
  from the pinging player's assigned character, because the other clients in
  the room have no reason to hold that character's sheet. It sends
  `beaconShape` alongside `beaconColor`.
- **The sheet's own outline**, applied at the `CharacterSheet` root.

`AuraShapeMark` generates its keyframes name from `useId()` — two auras on
screen sharing a name would make the second one's colour win for both.

## Schema

New `characters` columns: `ca_physique`, `ca_age`, `ca_birthday`,
`ca_languages`, `ca_aura_color`, `ca_aura_shape`. Applied by `db:push` on
deploy like the rest of the recent schema — see `v3-schema-migrations.md`,
including its warning about push silently skipping a new column when it
offers a rename instead.
