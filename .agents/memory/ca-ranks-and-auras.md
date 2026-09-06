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

## Physique does NOT cap the pool

`characters.ca_physique` is how much energy the body is built to carry, and it
is **not** a limit. A character can hold more, the rank follows the pool up
with it, and nothing anywhere clamps it — this was tried and explicitly
reversed by the user, so don't reintroduce a clamp in the sheet, in
`saveCAEnergyPool`, or in the character PATCH handler.

What going over does instead is put the character in **overload**, and the GM
hangs effects off that: `characters.ca_physique_effects`, the same shape as a
wound's effects (a skill or movement target plus an amount) and applied the
same way, alongside them. GM-only, via `gmOnlyFields` in the PATCH validator.

The one difference from a wound: a wound's effects are live while the wound
is, and overload effects are live **only while the pool is actually over the
Physique** (`caPhysiqueStatEffectTotal` returns 0 otherwise). They come and go
on their own as the pool moves, so there is no state to keep in sync and
nothing to clear when the character comes back under.

**A Physique of 0 means "not set", not a Physique of zero** (`caPhysiqueState`).
Characters created before the column existed default to 0 and must not read as
permanently overloaded. New characters start at `CA_STARTING_PHYSIQUE` (100),
which is a real Physique they can exceed — so existing characters sit at 0 and
never overload until a GM gives them one. A blanket
`UPDATE characters SET ca_physique = 100 WHERE ca_physique = 0` would fix that
but has not been run; ask before touching live data.

New C.A. characters also start at `CA_STARTING_ENERGY` (10) rather than their
species' figure, because C.A.'s species lists carry the other systems' numbers.

## No edit mode anywhere on the C.A. sheet

No tab has a pencil button or a Save/Cancel. Every value is its own inline
editor, opened by double-clicking it (desktop) or long-pressing it (touch) —
the same gesture the Energy Pool and the stat bars already used. Enter saves,
Escape cancels, and each field writes only itself.

The machinery is `useCaInlineEdit` in `client/src/components/game/CASheetUI.tsx`,
which also holds the sheet's layout primitives (`CaCard`, `CaFieldGrid`,
`CaField`, `CaStatRow`, `CaValue`) so every tab is built from the same pieces.
The hook takes its own `write` callback because the Overview persists through
`onUpdate` and the Skills tab through a mutation.

### The Skills tab is the one with teeth

Attributes and skills are bought from per-level budgets, and there is no Save
to validate a whole allocation against any more. So **the budget is enforced
at the edge of each editor instead**: `caAttributeBounds` / `caSkillBounds` in
`shared/ca.ts` cap what one value can be set to by what is actually left, so
the totals can never go over rather than being caught afterwards. The budget
meters are now always on screen rather than only inside an edit mode, because
they are what tells you whether there is anything left to spend.

`caSkillBounds` has two subtleties worth keeping: a skill's floor moves with
how much of the negative allowance the OTHER skills have taken (a skill's own
negative must not count against its own floor, or it could never stay where it
is), and the floor is normalised through `|| 0` because `-Math.min(2, 0)` is
`-0`, which a NumberInput will happily display.

Rolling and editing don't collide on the Skills tab: click/double-click/long-
press on a skill's **name** roll it and open the roll panel, and the
double-click that opens an editor is on its **value**.

Two fields don't follow the tick-to-save shape, for good reasons:

- **Race** writes the moment a species is picked, and pulls that species'
  size/DC/speeds along with it — otherwise picking a species inline would set
  the name and leave every stat behind, which the old whole-tab editor did not
  do.
- **Aura** is two values (colour and shape) and writes on every change, so
  there is nothing to get half-committed.

The body-type switch on the wound diagram used to appear only while the tab
was in edit mode. There is no such mode now, so it shows for anyone who could
have entered one.

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

New `characters` columns: `ca_physique`, `ca_physique_effects`, `ca_age`, `ca_birthday`,
`ca_languages`, `ca_aura_color`, `ca_aura_shape`. Applied by `db:push` on
deploy like the rest of the recent schema — see `v3-schema-migrations.md`,
including its warning about push silently skipping a new column when it
offers a rename instead.


## The sheet's look

The C.A. Overview is built from the chrome in
`client/src/components/game/CASheetUI.tsx`: `CaSheetFrame` (the gilt border
with its corner marks), `CaChip` / `CaChipGroup` / `CaChipCell` (icon, value,
field name in small caps — the sheet's unit of information), `CaSection` +
`CaMedallion` for the headed blocks, `CaDivider` for the flourish between
them, and `CaInset` for the wells inside a section.

**The gilding is its own token, not `amber-*`.** `--ca-gilt`, `--ca-gilt-bright`,
`--ca-gilt-dim`, `--ca-gilt-line` and `--ca-gilt-line-soft` are defined in
`client/src/index.css`. This matters: `amber-*` is remapped per theme and is
**blue** in the default one (see `theme-system.md`), so an ornament built from
it turns the frame, the medallions and the rules blue along with everything
else. The surfaces underneath still use `stone-*` and follow the theme — only
the metal is fixed, and a theme that wants silver overrides those five tokens
rather than every component being edited.

The aura tints the frame rather than the sheet root in C.A.; the root style is
only for the other systems.
