---
name: Detached floating panels
description: Why item-detail/spellbook panels are hosted by Campaign, not rendered inside CharacterSheet
---

Panels a user opens FROM the character sheet (item detail, spellbook) must NOT be
rendered as children of CharacterSheet. If they are, closing/unmounting the sheet
unmounts them too (React lifecycle — portals don't help, they still unmount with parent).

**Rule:** host such panels at the Campaign page level so each opens/closes/minimizes
independently of the character sheet.

**How it's wired:** CharacterSheet takes optional `onOpenItemDetail`/`onOpenSpellbook`
callbacks; effect bridges forward the in-sheet open state up then clear local state.
In-sheet renders are guarded with `!onOpenItemDetail`/`!onOpenSpellbook` so callback-less
hosts (AdminSettings) keep the original in-sheet behavior. Campaign keeps per-character
arrays (`detachedItemPanels`/`detachedSpellbookPanels`, keyed by character.id) and renders
`DetachedItemDetailPanel`/`DetachedSpellbookPanel` (self-contained: own items query +
update/delete mutations). Panel keys use `charPanelSuffix = -<characterId>` so multiple
characters' panels don't collide in z-index.

**Why:** user requirement — "closing the character sheet must not close item sheets or
other floating panels; all act independently."
