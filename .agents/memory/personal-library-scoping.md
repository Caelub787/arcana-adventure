---
name: Personal library scoping (My Library)
description: How the additive `personal` flag gives every user (admins included) a per-user library distinct from the global admin library, sharing the same admin-library REST surface.
---

# Personal library scoping

The admin-library REST surface is shared by BOTH the global admin library UI and the per-user "My Library". A single additive, default-OFF `personal` flag separates the two:

- **Scope rule:** when `personal` is true, the library scope resolves to `[callerUserId]` for EVERYONE (admins included). Implicit global null-owner rows are still unioned in, so a personal view = own rows + global, never other users' rows.
- **Write rule:** a personal create lands under the caller's user id, NOT the global library. Admin-global ownership is gated as `(isAdmin && !personal)`. The `personal` flag must NEVER reach a `storage.create*` call as a column — strip it from POST bodies before insert.
- **End-to-end threading:** the flag has to be carried through every layer — GET query param, POST body (then stripped + ownership gate), client list methods, and the dialog transport factories — including deep nested pickers (effect-target item pickers, roll-template link panels). In global mode the flag is off so behavior is byte-for-byte unchanged.

**Why:** An earlier attempt let admins fall through to `undefined` scope (all rows) with writes landing in the global library, so admins had no personal library at all. Keeping the flag default-OFF guarantees existing admin/GM/player behavior is untouched unless a caller opts in.

**How to apply:** Any new admin-library kind or any new surface that needs a per-user library must thread this same `personal` flag end-to-end.

## In-campaign "My Library" = embedded AdminSettings

The in-campaign floating "My Library" panel renders the full `AdminSettings` page in an embedded/personal mode (props `embedded`, `forcePersonal`, `embeddedSystem`) rather than a parallel lightweight panel.

**Why:** A separate lightweight panel could not reach feature parity — classes and crafter-recipe-templates are not part of the portable library-dialogs/sync-kind surface (no dialog, `class` transport unimplemented), and spell/roll-template have no get-by-id for edit. Reusing AdminSettings (which already exposes the full creatable-type set to non-admins in personal mode) is the only way to guarantee parity and avoid drift.

**How to apply:** When a surface must match the library page exactly, embed `AdminSettings` with `embedded`/`forcePersonal` instead of re-implementing a subset. AdminSettings's non-admin path already whitelists the allowed views; embedded mode also unlocks the system switcher for non-admins and seeds it from the campaign system.
