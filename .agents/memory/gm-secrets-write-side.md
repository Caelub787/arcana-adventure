---
name: GM secrets must be re-merged on every non-GM write
description: Redaction is only half the rule — a non-GM never received the real `#...#` text, so saving their copy back would overwrite it. Every write path that redacts on read must merge on write.
---

# GM secrets: redact on read, merge on write

`#like this#` inside note content (and timeline event descriptions) is GM-only.
`redactGmSecrets()` replaces each span with a run of `█` **server-side**, so the
real characters never reach a non-GM at all.

That read-side rule creates a write-side obligation that is easy to miss:

> **A non-GM is holding a copy of the note with the secrets already destroyed.
> Saving it back verbatim overwrites the GM's real text with block characters.**

This was live: a player with edit access on a character could open that
character's note, change one word, and permanently replace every GM secret in
it with `█████`. They could also delete a secret outright, wipe the whole note
via the sheet's "delete" (which clears content rather than removing the row),
or type `#...#` to author a secret their own party couldn't read.

## The rule

Every route that returns `redactGmSecrets(...)` on read must pass content
through `mergeGmSecretsOnWrite(stored, submitted, role.isGm)` on write. It:

- swaps each redaction run back for the real secret it stood for, **in order**,
  so edits around a secret are kept;
- defuses any `#...#` the writer typed themselves (their words survive as plain
  text — they just don't get to hide things from their party);
- re-appends any secret whose run they deleted, rather than dropping it. Losing
  a GM's text to a player's edit is the one outcome that must never happen; the
  GM can move it back.

Currently applied at: `PUT /api/notes/:id`, the content-clearing branch of
`DELETE /api/notes/:id` (entity-linked notes clear rather than delete), and
`PUT /api/timeline-events/:id`.

## The trap that comes with it

**After merging, the row holds real secrets again — so the response has to be
re-redacted.** `res.json(updated)` was safe only while `updated.content` was the
player's own already-redacted text. Merge without re-redacting and the write
path hands back exactly what the read path spent effort hiding. Every merge site
above pairs with a `redactGmSecrets` on the way out.

## Client side

`client/src/lib/gmSecretGuard.ts` blocks edits that would change a `█` run
before they happen (`editKeepsGmSecrets` compares run lengths in order), so a
player doesn't type into a block and watch it snap back on save. It is a UX
affordance only — **the server merge is the authority.** Note the controlled-input
detail: rejecting an edit must also reset `el.value`, because with no state
change React never re-renders and the typed characters stay in the DOM.

A GM's copy contains no `█` at all, so every guard here is inert for them.

## How this relates to a note's "GM Only" visibility

On an entity-linked (character/item sheet) note, a note-level "GM Only" lock
does **not** override character EDIT access — whoever controls the character
controls its sheet note. It still hides the note from someone with only VIEW
access on the character. Hiding individual lines from the controller is exactly
what `#...#` is for, which is why the write-side merge above had to exist first.

This reverses commit 9e14e0e, which had made the lock beat character access
outright; that shut a character's own controller out of its sheet note. The rule
lives in two places that must stay in step: `getLinkedEntityNoteAccess` and the
inline check in `POST /api/notes/for-entity`.

## Live editing is the same rule, per recipient

Notes edit live over the `note_update` WebSocket message. That channel used to
rebroadcast `content` verbatim to everyone in the note room with no
authorization beyond room membership — a hole straight through the redaction: a
GM typing `#the vault code#` pushed the raw characters to every player watching,
on every keystroke.

The server is now authoritative for the text. On each `note_update` it merges
the sender's version (`mergeGmSecretsOnWrite`), persists it — **the live edit is
the save**, there is no separate save step — and then sends every other viewer
their **own** redacted projection. One shared payload is exactly what leaked; the
fan-out must stay per recipient.

`join_note` is where per-socket access is resolved (`resolveNoteAccess`) and
cached on `ws.noteAccess`, so the per-keystroke broadcast doesn't re-query. It
used to consult only `storage.canAccessNote`, which knows nothing about campaign
visibility or entity-linked access.

The sender also gets a `correction: true` echo when the merge changed their text
(they deleted a block, or typed `#...#` that got defused), so their editor
reconciles instead of re-sending a version the server keeps rewriting.

## An unclosed `#` is a secret too

A secret has to be hidden from the first keystroke, so `gmSecretRanges()` treats
an unterminated `#` as a secret running to the end of its line. Without that,
everything the GM typed before the closing `#` went out in the clear.

The catch: `#` is also markdown's heading marker. A run of 1-6 `#` at the start
of a line followed by whitespace is a heading and is skipped; `#word` at line
start is still a secret. Both `redactGmSecrets` and `mergeGmSecretsOnWrite` go
through this one tokenizer — they must always agree on what a span is.

Note the client's `FormattingToolbar` preview regex still only styles *closed*
pairs, so a half-typed secret renders unstyled in the GM's own preview. Cosmetic
only: the GM can read it either way, and players never receive it.

## Members for the visibility/share pickers

`CampaignNotesPanel` fetches campaign members itself when the host doesn't pass
them (a caller that does still wins, so the main panel makes no extra request).
The sheet-docked notes panels never passed them, so the "specific players"
picker and the share dialog both claimed the campaign had no players.
