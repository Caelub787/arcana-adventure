# @arcana/library-dialogs

Drop-in React dialogs for Arcana Adventure-compatible apps (CanvasRealms et al.).
Same fields, prompts, conditionals, and nested editors as the live Arcana UI —
but framework-agnostic, theme-free, and persisted via the existing
`@arcana/aa-sync-sdk`.

> **This release ships the foundation + Item, Roll-Template, and Spell dialogs.**
> Character, Character-Template, Species, Class, and Feat-Tree dialogs follow
> in subsequent releases. The HostAdapter contract, theming surface, and
> transport wiring established here are stable.

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
| `transport`   | `ArcanaSyncClient` (from `@arcana/aa-sync-sdk`)       | yes      | Pre-configured. `minimalHostAdapter` builds it.    |
| `notify`      | `(level, message) => void`                            | yes      | Bridge to your toast system.                       |
| `imagePicker` | `(opts) => Promise<{url}|null>`                       | no       | Falls back to a plain URL input.                   |
| `modal`       | React component matching `HostModalProps`             | no       | Falls back to centered overlay (`DefaultModal`).   |

Two factories ship out-of-the-box:

* `minimalHostAdapter({ baseUrl, accessToken, ... })` — for partners.
* `arcanaHostAdapter({ accessToken, notify, imagePicker, modal })` — for Arcana's
  internal migration (task #61 of our roadmap).

---

## What's in this release (0.1.0)

### Dialogs
- `<ItemDialog>` — full create/edit dialog for the `items` table, including
  the conditional weapon / ammunition / armor / consumable / utility /
  container / currency / crafter (AAv2-only) branches.
- `<RollTemplateDialog>` — admin live-template editor (an `items` row with
  `isLiveTemplate=true`); roll edits propagate to every linked item and spell
  via the existing server-side fanout.
- `<SpellDialog>` — full create/edit dialog for the `spells` table. Mirrors
  Arcana's admin spell editor (name, description, image, action type,
  duration, range, attribute) plus reuses `<RollEntriesEditor ownerType="spell">`
  for nested rolls and `<ItemTemplateLinksPanel>` for AAv2 spell↔roll-template
  links. All other spell columns are round-tripped through the draft so an
  edit never drops schema fields.

### Reusable nested editors
- `<RollEntriesEditor>` — full draft-mode editor for `roll_entries` rows
  (folders, priorities, save throws, DC checks, mana / energy costs,
  item costs, override / reset-to-template, AAv2-only mana applyToStat).
- `<CraftRecipesEditor>` — `craft_recipes` + ingredients editor for crafter
  items (AAv2 only).
- `<ItemTemplateLinksPanel>` — checkbox list to toggle which roll templates
  the item or spell inherits from (AAv2 only).

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
the parent + the children atomically. **No new backend routes are required.**

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
in the same atomic request — no extra round-trips.

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
| 0.3.0   | `<CharacterDialog>`, `<CharacterTemplateDialog>`, embedded panels |
| 0.4.0   | `<SpeciesDialog>`, `<FeatTreeDialog>`, `<FeatTreeCanvas>`         |
| 0.5.0   | `<ClassDialog>`, `<SkillTreeEditor>`                              |
| 1.0.0   | Arcana itself migrates to consume the package internally          |

Each release is byte-compatible with Arcana's data model — created entities
round-trip identically across both UIs.

---

## License

MIT.
