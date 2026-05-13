# @arcana/library-dialogs

Drop-in React dialogs for Arcana Adventure-compatible apps (CanvasRealms et al.).
Same fields, prompts, conditionals, and nested editors as the live Arcana UI —
but framework-agnostic, theme-free, and persisted via the existing
`@arcana/aa-sync-sdk`.

> **This release (0.6.0) ships the full library: Item, Roll-Template, Spell,
> Character, Character-Template, Species, Feat-Tree, and Class dialogs —
> plus the standalone `<FeatTreeCanvas>`, `<SkillTreeEditor>`, and
> `<ClassSkillsPanel>` editors.** 0.6.0 adds the
> `arcanaSessionHostAdapter` factory + `LibraryTransport` interface so
> Arcana itself can mount the dialogs against its existing
> session-cookie REST routes without OAuth tokens — see `MIGRATION.md`.
> The HostAdapter contract, theming surface, and transport wiring are
> stable; per-dialog migration in Arcana lands across follow-up tasks.

---

## Install

```bash
npm install @arcana/library-dialogs @arcana/aa-sync-sdk
```

React 18 is a peer dependency. No Tailwind. No Radix. No shadcn.

```ts
// once, anywhere in your app entry
import "@arcana/library-dialogs/theme.css";
```

---

## Mount

```tsx
import { useState, useMemo } from "react";
import { ItemDialog, minimalHostAdapter } from "@arcana/library-dialogs";

const host = useMemo(() => minimalHostAdapter({
  baseUrl: "https://your-arcana.example",
  accessToken: yourOAuthBearerToken,
  notify: (level, msg) => myToast[level](msg),       // optional
  imagePicker: (opts) => myAssetBrowser.pick(opts),  // optional
}), [yourOAuthBearerToken]);

const [open, setOpen] = useState(false);

return <ItemDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />;
```

That's it — four lines. The dialog talks to `/api/sync/v1/items`, bundles its
nested rolls + craft recipes + template links into one upsert, hydrates from
the children-aware GET on edit, and routes notifications/image-picks back to
your app.

---

## Theming

The package never carries a theme prop. Re-skin globally by overriding the
`--ld-*` CSS custom properties on any ancestor that has the `[data-ld-root]`
attribute (the default modal sets this on its overlay; supply it yourself if
you use a custom `host.modal`).

```css
.my-canvasrealms-skin {
  --ld-bg:            #0d0a14;
  --ld-surface:       #1a1029;
  --ld-surface-2:     #110a1d;
  --ld-surface-3:     #2a1a44;
  --ld-border:        #3b1f5e;
  --ld-border-strong: #5a2f88;
  --ld-text:          #e6e3f0;
  --ld-text-muted:    #a89fc8;
  --ld-text-subtle:   #6e6492;
  --ld-accent:        #a855f7;
  --ld-accent-hover:  #9333ea;
  --ld-accent-text:   #ffffff;
  --ld-radius:        8px;
}
```

```tsx
<div className="my-canvasrealms-skin" data-ld-root>
  <ItemDialog ... />
</div>
```

Every variable is documented inline in `src/theme.css`.

---

## HostAdapter

A single object the partner fills in:

| Field         | Type                                                  | Required | Notes                                              |
| ------------- | ----------------------------------------------------- | -------- | -------------------------------------------------- |
| `transport`   | `LibraryTransport` (typically an `ArcanaSyncClient` from `@arcana/aa-sync-sdk`, or any object implementing the same `list`/`get`/`upsert`/`patch`/`delete` surface) | yes | Pre-configured. `minimalHostAdapter` builds it from an OAuth token; `arcanaSessionHostAdapter` accepts a host-supplied shim that wraps existing in-app REST methods (no token, session-cookie auth). |
| `notify`      | `(level, message) => void`                            | yes      | Bridge to your toast system.                       |
| `imagePicker` | `(opts) => Promise<{url}|null>`                       | no       | Falls back to a plain URL input.                   |
| `modal`       | React component matching `HostModalProps`             | no       | Falls back to centered overlay (`DefaultModal`).   |

Two factories ship out-of-the-box:

* `minimalHostAdapter({ baseUrl, accessToken, ... })` — for partners.
* `arcanaHostAdapter({ accessToken, notify, imagePicker, modal })` — for Arcana's
  internal migration (task #61 of our roadmap).

---

## What's in this release (0.6.0)

### Dialogs
- `<ItemDialog>` — full create/edit dialog for the `items` table, including
  the conditional weapon / ammunition / armor / consumable / utility /
  container / currency / crafter (AAv2-only) branches.
- `<RollTemplateDialog>` — admin live-template editor (an `items` row with
  `isLiveTemplate=true`); roll edits propagate to every linked item and spell
  via the existing server-side fanout.
- `<CharacterDialog>` — full create/edit dialog for the `characters`
  table. Renders every flat column (identity, pools HP/energy/mana,
  new + legacy attributes, all `skill_*` columns, vision, exhaustion,
  level-up bonus tracking, biography, GM notes) and mounts embedded
  editors for the eight child collections that
  `replaceCharacterChildren` understands: `items`, `spells`, `hotbars`,
  `customSkills`, `traits`, `feats`, `classes`, `classSkills`. Save
  bundles all eight into a single `host.transport.upsert("character", …)`;
  the server's children-aware handler replaces existing
  children and performs FK ID remaps so brand-new hotbars referencing
  brand-new items / spells resolve correctly.
- `<CharacterTemplateDialog>` — same dialog, pinned to
  `kind="character-template"`. Forces `isTemplate=true` and hides
  campaign / user scope fields (templates live in the global admin
  library). Created templates can be cloned by GMs into player
  characters.
- `<SpeciesDialog>` — full create/edit dialog for the `system_species`
  table (`kind="species"`). Renders every flat column (identity,
  description, default token image, lifespan, speed/flySpeed, size,
  naturalArmor, sizeBonus, the three start/max/per-level pool triplets
  for HP / energy / mana, carryWeight, and vision fields) and exposes
  a feat-tree picker fed from `host.transport.list("feat-tree")` so
  the species' progression tree can be linked without inventing a
  resolver.
- `<FeatTreeDialog>` — full create/edit dialog for the `feat_trees`
  table (`kind="feat-tree"`). Renders tree metadata (name,
  description, gridWidth, gridHeight, system, default view) and
  embeds `<FeatTreeCanvas>` for graphical editing. Save bundles the
  tree row + `feats[]` + `connections[]` into a single
  `host.transport.upsert("feat-tree", …)`. The server's
  `replaceFeatTreeChildren` writes parent + both child tables in one
  bundled write with FK ID remapping so connections referencing
  brand-new feats resolve correctly.
- `<FeatTreeCanvas>` — standalone, controlled drag-to-place +
  click-to-connect grid editor. Exported on its own so partners can
  drop it into their own multi-pane editors. SVG-based with a
  pattern-fill grid; click-to-select, drag-to-reposition,
  Connect-Mode toggle for click-two-nodes-to-wire-prerequisites,
  per-edge required/optional toggle (click the line to flip), and
  an inline per-feat editor for name / description / icon / image /
  tier / cost / position / effects (matching `Feat.effects` jsonb
  shape). Maintains stable `_localId`s so brand-new feats can be
  referenced by brand-new connections in the same bundled save.
- `<ClassDialog>` — full create/edit dialog for the `classes` table
  (`kind="class"`). Renders class identity (name, description, image,
  system), an optional feat-tree picker for `skillTreeId`, the
  skill-tree grid layout fields (gridWidth/Height + default-view
  X/Y/Zoom), and embeds both `<SkillTreeEditor>` (graph view) and
  `<ClassSkillsPanel>` (flat-list view) over the same underlying
  `class_skill_nodes` array. Save bundles `skillNodes[]` +
  `skillConnections[]` into a single `host.transport.upsert("class", …)`.
  The server's `replaceClassChildren` writes the parent + both child
  tables in one bundled write with FK ID remapping so connections
  referencing brand-new nodes resolve correctly. `ClassDraft.classSkills`
  is accepted as a convenience alias for `skillNodes` on input; saves
  always send the canonical `skillNodes` key.
- `<SkillTreeEditor>` — standalone graph editor for `class_skill_nodes`
  + `class_skill_connections`. Same drag-to-place + click-to-connect
  interaction model as `<FeatTreeCanvas>`, with per-node inline editor
  for name / description / icon / image / class-level gate (tier) /
  cost / position / effects. Click a connection to delete it.
- `<ClassSkillsPanel>` — flat-list view over the same skill-tree value
  as `<SkillTreeEditor>`. Convenient when a partner UI prefers a
  list-style admin alongside (or instead of) the graph; deleting a
  row scrubs orphan connections automatically.
- `<SpellDialog>` — full create/edit dialog for AAv2 system spells
  (`kind="spell"` → `system_spells`). Renders the union of Arcana's two
  canonical spell editors: the admin form (name, description, icon,
  action type, duration, range, attribute) AND the in-game form (damage
  dice, damage/effect type with `Energy → gainEnergy` conditional,
  healing dice, flat modifier, energy cost, AAv2 mana cost, `Attack?`
  toggle, `Area of Effect` toggle with shape/range/area-size/passes-through-walls,
  `Requires Save` toggle with save attribute/DC/on-success effect
  including `Quarter Damage`). Plus the schema-only fields (school,
  level, components, target type, concentration, ritual, saving-throw
  text, raw effects JSON) so partner apps get full `system_spells`
  column coverage on create. Reuses `<RollEntriesEditor ownerType="spell">`
  for nested rolls and the AAv2-only `<ItemTemplateLinksPanel>` for
  spell↔roll-template links.

### Reusable nested editors
- `<RollEntriesEditor>` — full draft-mode editor for `roll_entries` rows
  (folders, priorities, save throws, DC checks, mana / energy costs,
  item costs, override / reset-to-template, AAv2-only mana applyToStat).
- `<CraftRecipesEditor>` — `craft_recipes` + ingredients editor for crafter
  items (AAv2 only).
- `<ItemTemplateLinksPanel>` — checkbox list to toggle which roll templates
  the item or spell inherits from (AAv2 only).
- `<CharacterItemsEditor>`, `<CharacterSpellsEditor>`, `<CharacterHotbarsEditor>`,
  `<CharacterCustomSkillsEditor>`, `<CharacterTraitsEditor>`,
  `<CharacterFeatsEditor>`, `<CharacterClassesEditor>`,
  `<CharacterClassSkillsEditor>` — host-driven panels for each of the
  eight `characters`-owned child tables. Mounted by `<CharacterDialog>`;
  also exported standalone so partner apps can build their own composite
  character editors. The items and spells panels nest the foundation
  `<RollEntriesEditor>` inline, so per-character roll collections are
  fully editable in place and round-trip through the same single sync
  upsert.

### Building blocks
- `DefaultModal`, `HostModal`, `SaveCancelFooter` — the package's modal slot
  if you don't supply one.
- `Button`, `Input`, `Select`, etc. — minimal inline-styled primitives so
  partners can build sibling dialogs that visually match.
- `sortRollsForDisplay`, `collectFolderNames`, `AAV2_EFFECT_TYPES`, etc.

---

## Persistence model

All saves bundle their nested children in one upsert against
`/api/sync/v1/{kind}s`. The server's children-aware `applyChildren` writes
the parent + the children in a single bundled write. **No new backend routes are required.**

```
ItemDialog.handleSave
  └─ host.transport.upsert("item", {
       ...itemFields,
       rolls:         RollEntryDraft[],     // → roll_entries
       craftRecipes:  CraftRecipeDraft[],   // → craft_recipes + ingredients
       templateLinks: string[],             // → item_template_links
     })
```

Loading uses `host.transport.get("item", id)`, which returns the same
enriched payload (the server's `serializeWithChildren`).

---

## Browser example

A runnable smoke test lives in `examples/canvasrealms-mount/`. It mounts
`<ItemDialog>`, `<RollTemplateDialog>`, and `<SpellDialog>` behind buttons
against a live Arcana instance using a partner OAuth bearer token, and ships
with a CanvasRealms-flavored skin so you can see end-to-end re-theming.

### Mounting `<SpellDialog>`

```tsx
import { SpellDialog, minimalHostAdapter } from "@arcana/library-dialogs";

const host = minimalHostAdapter({ baseUrl, accessToken });

// Create a new spell
<SpellDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />

// Edit an existing one — `id` is REQUIRED on initialValue for edit mode
// (the transport keys writes on the internal id, not externalId).
<SpellDialog
  open={open}
  onOpenChange={setOpen}
  host={host}
  campaignSystem="aa-v2"
  mode="edit"
  initialValue={{ id: "01HW...", name: "" }}
  onSaved={(spell) => console.log(spell)}
/>
```

Save fires `host.transport.upsert("spell", { ...spellFields, rolls, templateLinks })`.
The server's `applyChildren` writes `roll_entries` and `spell_template_links`
in the same single-request bundled write — no extra round-trips.

```bash
cd examples/canvasrealms-mount
npm install
npm run dev
# Then enter your Arcana base URL + OAuth token in the UI.
```

---

## Coming in subsequent releases

| Version | Adds                                                              |
| ------- | ----------------------------------------------------------------- |
| 0.3.0   | `<CharacterDialog>`, `<CharacterTemplateDialog>`, embedded panels (shipped) |
| 0.4.0   | `<SpeciesDialog>`, `<FeatTreeDialog>`, `<FeatTreeCanvas>` (shipped) |
| 0.5.0   | `<ClassDialog>`, `<SkillTreeEditor>`, `<ClassSkillsPanel>` (shipped) |
| 0.6.0   | `LibraryTransport` interface + `arcanaSessionHostAdapter` (session-cookie mount path; shipped) |
| 1.0.0   | Arcana itself migrates to consume the package internally          |

### Mounting `<CharacterDialog>` and `<CharacterTemplateDialog>`

```tsx
import {
  CharacterDialog, CharacterTemplateDialog, minimalHostAdapter,
} from "@arcana/library-dialogs";

const host = minimalHostAdapter({ baseUrl, accessToken });

// Player character (kind="character" — needs campaignId + userId in normal use)
<CharacterDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />

// Admin character template (kind="character-template" — isTemplate=true, no scope fields)
<CharacterTemplateDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />
```

Save fires `host.transport.upsert("character" | "character-template", { …characterFields, items, spells, hotbars, customSkills, traits, feats, classes, classSkills })`.
The server's `replaceCharacterChildren` writes the parent + every child
table in the same single-request bundled write, with full FK ID remapping across
items, spells, and traits — so hotbars referencing brand-new embedded
items, spells, or traits all resolve to the freshly-inserted child rows
without any client follow-up.

Each release is byte-compatible with Arcana's data model — created entities
round-trip identically across both UIs.

### Mounting `<SpeciesDialog>` and `<FeatTreeDialog>`

```tsx
import {
  SpeciesDialog, FeatTreeDialog, minimalHostAdapter,
} from "@arcana/library-dialogs";

const host = minimalHostAdapter({ baseUrl, accessToken });

// Create a species — feat-tree picker is auto-populated from
// host.transport.list("feat-tree")
<SpeciesDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />

// Create a feat tree — embeds <FeatTreeCanvas> for graphical editing
<FeatTreeDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />
```

`<FeatTreeDialog>` save fires
`host.transport.upsert("feat-tree", { ...treeFields, feats, connections })`.
Server writes the tree row + every feat + every connection in one
bundled request with FK ID remapping, so brand-new connections that
reference brand-new feats resolve to the freshly-inserted child rows
without any client follow-up.

### Standalone `<FeatTreeCanvas>`

```tsx
import { FeatTreeCanvas, type FeatTreeCanvasValue } from "@arcana/library-dialogs";

const [tree, setTree] = useState<FeatTreeCanvasValue>({ feats: [], connections: [] });

<FeatTreeCanvas
  value={tree}
  onChange={setTree}
  gridWidth={7}
  gridHeight={10}
/>
```

Drop the canvas into your own multi-pane editor and bundle its output
(`tree.feats`, `tree.connections`) into whatever upsert you want.

### Mounting `<ClassDialog>`

```tsx
import { ClassDialog, minimalHostAdapter } from "@arcana/library-dialogs";

const host = minimalHostAdapter({ baseUrl, accessToken });

// Create a new class — embeds <SkillTreeEditor> for the graph view and
// <ClassSkillsPanel> for the flat list view (toggle inside the dialog)
<ClassDialog open={open} onOpenChange={setOpen} host={host} campaignSystem="aa-v2" />

// Edit an existing one — `id` is REQUIRED on initialValue for edit mode
<ClassDialog
  open={open}
  onOpenChange={setOpen}
  host={host}
  campaignSystem="aa-v2"
  mode="edit"
  initialValue={{ id: "01HW...", name: "" }}
  onSaved={(cls) => console.log(cls)}
/>
```

Save fires `host.transport.upsert("class", { ...classFields, skillNodes, skillConnections })`.
The server's `replaceClassChildren` writes `class_skill_nodes` + `class_skill_connections`
in the same single-request bundled write with full FK ID remapping — brand-new
connections that reference brand-new nodes resolve to the freshly-inserted child
rows without any client follow-up.

> **Schema note.** In the Arcana data model "class skills" and "skill tree nodes"
> are the same record (`class_skill_nodes`). `<SkillTreeEditor>` and
> `<ClassSkillsPanel>` are two views of one underlying array — edits in either
> propagate. `ClassDraft.classSkills` is accepted as a convenience alias for
> `skillNodes` on input; saves always send the canonical `skillNodes` key.

### Standalone `<SkillTreeEditor>` and `<ClassSkillsPanel>`

```tsx
import {
  SkillTreeEditor, ClassSkillsPanel, type SkillTreeValue,
} from "@arcana/library-dialogs";

const [tree, setTree] = useState<SkillTreeValue>({ skillNodes: [], skillConnections: [] });

// Pick whichever metaphor your UI prefers — both edit the same array.
<SkillTreeEditor value={tree} onChange={setTree} gridWidth={7} gridHeight={10} />
<ClassSkillsPanel value={tree} onChange={setTree} />
```

Drop either component into your own multi-pane editor and bundle the output
(`tree.skillNodes`, `tree.skillConnections`) into whatever upsert you want.

---

## License

MIT.
