// A sheet's own copies of other sheets — an item given to a character becomes
// that character's copy (its own notes, its own wear and tear); the original
// stays as it was, to give again. A copy:
//   - remembers what it was copied from (note.copyOf),
//   - is seen and used (its buttons and rolls) by whoever has the sheets it's
//     attached to — its users follow them — but changed only by its owners,
//     whom the GM picks; only the GM sees it once it's attached to nothing,
//   - moves (rather than being copied again) when it's added somewhere else,
//   - brings what's inside it along when it's made: an ability's aspects,
//     a sword's runes, a bag's contents.
import { randomUUID } from "crypto";
import type { AgNote } from "@shared/agnostic/types";
import type { ChangeSet, ScopeStore } from "./store";
import * as snap from "./snapshot";

const isPerson = (n?: AgNote) => !!n && (n.type === "character" || n.type === "npc");

/** Make a copy of `sourceId` (and what's inside it), kept in `folder`. Not connected to anything yet. */
export async function copySheet(store: ScopeStore, sourceId: string, cs: ChangeSet, opts: { folder: string | null; ownerIds: string[]; asOriginal?: boolean }, seen = new Set<string>()): Promise<AgNote> {
  const source = store.notes.get(sourceId)!;
  seen.add(sourceId);
  const s = await snap.takeSnapshot(store, sourceId);
  // asOriginal: a normal sheet (a duplicate of someone's copy), not anybody's copy.
  const copy = await snap.createFromSnapshot(store, s, { name: source.name, folder: opts.folder, ownerIds: [...opts.ownerIds], copyOf: opts.asOriginal ? null : source.copyOf ?? source.id, isTemplate: false, templateMeta: null }, cs);
  // What's inside it: sheets connected into it (an aspect's "ability", a rune's "socket").
  for (const l of store.linksOf(sourceId)) {
    if (l.toNoteId !== sourceId || seen.has(l.fromNoteId) || seen.size > 60) continue;
    const child = store.notes.get(l.fromNoteId);
    if (!child || child.isTemplate || isPerson(child)) continue;
    const c = await copySheet(store, child.id, cs, opts, seen);
    await store.putLink({ id: randomUUID(), fromNoteId: c.id, toNoteId: copy.id, label: l.label, reverseLabel: l.reverseLabel, acl: { ...l.acl }, createdAt: Date.now() }, cs);
  }
  return store.notes.get(copy.id)!;
}

/** Turn a sheet (and what's inside it) into a copy where it is: an item made for a character. */
export async function markAsCopy(store: ScopeStore, noteId: string, cs: ChangeSet, folder: string | null, seen = new Set<string>()) {
  const n = store.notes.get(noteId);
  if (!n || n.isTemplate || seen.has(noteId)) return;
  seen.add(noteId);
  if (!n.copyOf || (folder && n.folder !== folder)) await store.putNote({ ...n, copyOf: n.copyOf ?? n.templateId ?? n.id, folder: folder ?? n.folder }, cs);
  for (const l of store.linksOf(noteId)) {
    if (l.toNoteId !== noteId) continue;
    const child = store.notes.get(l.fromNoteId);
    if (child && !isPerson(child)) await markAsCopy(store, child.id, cs, folder, seen);
  }
}

/**
 * A copy is seen and used by whoever has the sheets it's attached to: its users
 * become their owners and users (all of them, if it's on several), or nobody
 * (GM only) when it's on nothing. Using isn't changing: only its owners (whom
 * the GM picks) can change it. Then the same for what's inside it.
 */
export async function syncCopyOwners(store: ScopeStore, noteId: string, cs: ChangeSet, seen = new Set<string>()) {
  const n = store.notes.get(noteId);
  if (!n || seen.has(noteId)) return;
  seen.add(noteId);
  if (n.copyOf && !n.isTemplate) {
    const on = store.linksOf(noteId).filter((l) => l.fromNoteId === noteId).map((l) => store.notes.get(l.toNoteId)).filter((x): x is AgNote => !!x);
    const users = Array.from(new Set(on.flatMap((x) => [...x.ownerIds, ...(x.userIds ?? [])]))).filter((u) => !n.ownerIds.includes(u)).sort();
    if (users.join(",") !== [...(n.userIds ?? [])].sort().join(",")) await store.putNote({ ...n, userIds: users }, cs, true);
  }
  for (const l of store.linksOf(noteId)) {
    if (l.toNoteId !== noteId) continue;
    const child = store.notes.get(l.fromNoteId);
    if (child?.copyOf) await syncCopyOwners(store, child.id, cs, seen);
  }
}

/** After a sheet's owners change: everything attached to it that's a copy follows. */
export async function syncCopiesOn(store: ScopeStore, hostId: string, cs: ChangeSet) {
  for (const l of store.linksOf(hostId)) {
    if (l.toNoteId !== hostId) continue;
    if (store.notes.get(l.fromNoteId)?.copyOf) await syncCopyOwners(store, l.fromNoteId, cs);
  }
}
