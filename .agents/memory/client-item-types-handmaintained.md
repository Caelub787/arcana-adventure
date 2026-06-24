---
name: Client Item/ItemDraft types are hand-maintained
description: Why adding an items column also requires editing two client-side TS interfaces.
---

The client does NOT derive its item types from `shared/schema.ts` `$inferSelect`. Two hand-maintained interfaces shadow it:

- `client/src/lib/api.ts` → `export interface Item` (runtime/query shape used across GameComponents etc.)
- `packages/library-dialogs/src/dialogs/ItemDialog.tsx` → `export interface ItemDraft` (editor form shape)

**Why:** these were written by hand before/independent of the Drizzle inference, so a new `items` column compiles fine server-side and in `shared` but produces `Property 'x' does not exist on type 'Item'/'ItemDraft'` tsc errors wherever the client reads/writes it.

**How to apply:** any time you add an `items` column that the client touches, add the matching optional field to BOTH interfaces. (`server/routes.ts` PATCH passes req.body through, so no server whitelist needed.)

## Adding a new item-TYPE value (e.g. a new `itemType` string)

`itemType` is a free-form text column (no DB/zod enum), but the dropdowns are hardcoded in MANY places across TWO trees — easy to half-finish:

- Inline (client/src): `GameComponents.tsx` (the `itemTypeOptions` array, the create-item `<Select value={formData.itemType}>`, two edit `<Select>`s, and the item-picker filter), `AdminSettings.tsx` (the inline `ItemFormDialog` selector + the item-browse type filter), `Campaign.tsx` (shop-import type filter).
- **The real admin V2/V3 dialog is NOT inline** — it's `packages/library-dialogs/src/dialogs/ItemDialog.tsx`, which has its OWN `ITEM_TYPES` const + a `.filter()` that gates V3-only types (`spellbook/scroll/rune`) on `aav3`. AdminSettings renders this via `isPersonalLibSystem ? <ItemDialog>`. This one is the most-missed.

**How to apply:** V3-only types gate on `campaignSystem === 'aa-v3'` (inline) / `aav3` (library-dialogs), mirroring `spellbook`. Filter dropdowns that already list `rune` unconditionally should list the new type unconditionally too. `TemplateManager.tsx` deliberately excludes ALL V3-only types — don't add V3-only types there.
