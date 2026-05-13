# Migrating Arcana to `@arcana/library-dialogs`

This file documents the swap from Arcana's inline dialog implementations
in `client/src/pages/AdminSettings.tsx` and
`client/src/components/game/GameComponents.tsx` to the package's
exports. It is the source of truth for the field-by-field, prop-by-prop
mapping that future contributors should rely on when adding or changing
any of the eight dialog kinds.

## TL;DR

```ts
// Before:
<EditItemDialog
  open={!!editingItem}
  item={editingItem}
  onSave={(data) => updateItemMutation.mutate({ id: editingItem.id, data })}
  onClose={() => setEditingItem(null)}
/>

// After:
import { ItemDialog, arcanaSessionHostAdapter } from "@arcana/library-dialogs";
import "@arcana/library-dialogs/theme.css";

const host = useMemo(
  () => arcanaSessionHostAdapter({
    transport: arcanaApiTransport,    // wraps api.* methods
    notify: (level, msg) => toast({ title: msg, variant: level === "error" ? "destructive" : "default" }),
    imagePicker: openImageBrowser,    // promise-returning <ImageBrowser> wrapper
    modal: ArcanaDialogChrome,        // wraps Radix <Dialog>
  }),
  [],
);

<ItemDialog
  open={!!editingItem}
  onOpenChange={(o) => { if (!o) setEditingItem(null); }}
  mode="edit"
  initialValue={editingItem}
  host={host}
  campaignSystem={systemSlug}
/>
```

## Why a session adapter

Arcana authenticates via `express-session` cookies; the package's
default transport (`ArcanaSyncClient` from `@arcana/aa-sync-sdk`) only
accepts OAuth bearer tokens. Rather than mint internal tokens (which
would require a new backend route), we extended the package with
`arcanaSessionHostAdapter` (added in 0.6.0), which accepts any object
satisfying the `LibraryTransport` interface. Arcana wraps its existing
`api.*` REST methods in such a shim and hands it in directly — no new
routes, no token storage, no OAuth round-trip.

```ts
const arcanaApiTransport: LibraryTransport = {
  list: async (kind) => {
    switch (kind) {
      case "item":           return { data: await api.getSystemItems(systemSlug) };
      case "spell":          return { data: await api.getSystemSpells(systemSlug) };
      case "species":        return { data: await api.getSystemSpecies(selectedSystem) };
      case "feat-tree":      return { data: await api.getFeatTrees(systemSlug) };
      case "class":          return { data: await api.getClasses(systemSlug) };
      case "roll-template":  return { data: await api.getItemTemplates(systemSlug) };
      // ...
    }
  },
  get: async (kind, id) => {
    const data = await /* api.getX(id) */;
    return { kind, id, externalId: null, data };
  },
  upsert: async (kind, body) => {
    const created = await /* api.createX(body) */;
    return { kind, id: created.id, externalId: null, data: created };
  },
  patch: async (kind, id, body) => {
    const updated = await /* api.updateX(id, body) */;
    return { kind, id, externalId: null, data: updated };
  },
  delete: async (kind, id) => { await /* api.deleteX(id) */; return { ok: true }; },
};
```

## Per-dialog import map

| Old (inline)                       | New (package)                                          |
|------------------------------------|--------------------------------------------------------|
| `EditItemDialog` (AdminSettings)   | `ItemDialog`                                           |
| `EditSpellDialog` (AdminSettings)  | `SpellDialog`                                          |
| `EditSpeciesDialog`                | `SpeciesDialog`                                        |
| `EditClassDialog`                  | `ClassDialog`                                          |
| `EditFeatTreeDialog`               | `FeatTreeDialog`                                       |
| `EditCharacterTemplateDialog`      | `CharacterTemplateDialog` (alias of `CharacterDialog`) |
| `EditItemTemplateDialog` (admin)   | `RollTemplateDialog`                                   |
| `EditCharacterSheet` in-game       | `CharacterDialog`                                      |

Each dialog accepts the same `DialogProps<T>` shape:
`{ open, onOpenChange, mode?, initialValue?, host, campaignSystem?, onSaved?, onCancel? }`.

## Bridges to existing infra

- `host.notify` → `useToast()` from `client/src/hooks/use-toast.ts`.
  Map `error → variant: "destructive"`, others → default variant.
- `host.imagePicker` → wrap `<ImageBrowser>` in a promise:
  ```ts
  const openImageBrowser = (opts) => new Promise<{ url: string } | null>((resolve) => {
    setBrowserState({
      open: true,
      title: opts.title,
      onSelect: (url) => { setBrowserState({ open: false }); resolve({ url }); },
      onCancel: () => { setBrowserState({ open: false }); resolve(null); },
    });
  });
  ```
- `host.modal` → an Arcana-styled wrapper around the package's
  `HostModalProps` that mounts `<Dialog>` from `@/components/ui/dialog`.

## Migration cadence

Per task #61 follow-up plan, dialogs are migrated **one kind at a time**
to keep regression risk bounded:

1. Item (admin + in-game embedded) — depends on `RollEntriesEditor`,
   `CraftRecipesEditor`, `ItemTemplateLinksPanel` parity.
2. Roll Template (admin only).
3. Spell (admin + in-game embedded) — same template-link wiring.
4. Species (admin only).
5. Feat Tree (admin only).
6. Class (admin only).
7. Character Template (admin only).
8. In-game Character Sheet (game).

Each follow-up task adds the package import, deletes the corresponding
inline component, and verifies parity for the affected flows. Any drift
discovered during a migration is fixed in the package, never patched
inline in Arcana — that's what keeps the package the single source of
truth.

## Things to watch out for

- **Auto-rolls.** Arcana's item create path auto-creates a "Detonate"
  roll when `isDetonatable=true`. The package mirrors this in
  `ItemDialog`'s save loop; verify it still fires after the swap.
- **Template-link side effects.** `setItemTemplateLinks` and
  `setSpellTemplateLinks` fan out to every linked owner. The shim's
  `upsert`/`patch` path must call those helpers when `templateLinks`
  appears in the body.
- **Query invalidation.** Arcana's existing mutations call
  `queryClient.invalidateQueries({ queryKey: [...] })` on success. The
  shim should expose an `onSaved` hook or do the invalidation inline so
  list views refresh.
- **Folder-scoped lists.** Character templates are folder-grouped in
  Arcana's UI. The package's `CharacterTemplateDialog` is folder-aware
  on the input shape; Arcana keeps owning the list view.
