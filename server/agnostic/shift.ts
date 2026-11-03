// Shapeshifting, server side: who is a form of whom, who may play them, and
// what crosses when somebody shifts. The rules themselves are shared with the
// screen (shared/agnostic/shapeshift.ts); this is the store's view of them.
import type { AgNote } from "@shared/agnostic/types";
import { shiftIndex, type ShiftIndex, type ShiftWorld } from "@shared/agnostic/shapeshift";
import type { ScopeStore } from "./store";

/** The scope as the shapeshifting rules want to see it. */
export function shiftWorld(store: ScopeStore): ShiftWorld {
  return {
    ids: () => Array.from(store.notes.keys()),
    type: (id) => store.notes.get(id)?.type,
    isTemplate: (id) => !!store.notes.get(id)?.isTemplate,
    value: (id, key) => {
      const f = store.fieldsByNote.get(id)?.get(key);
      return f ? (f.eff ?? f.value) : undefined;
    },
    linked: (id, label) => store.linksOf(id).flatMap((l) => (
      l.fromNoteId === id && l.label === label ? [l.toNoteId]
      : l.toNoteId === id && l.reverseLabel === label ? [l.fromNoteId]
      : []
    )),
  };
}

// Rebuilt whenever anything in the scope changes, and then left alone: every
// permission check in a batch asks this, and walking the whole scope each time
// would be silly.
const cache = new WeakMap<ScopeStore, { at: number; index: ShiftIndex }>();
export function shiftIndexOf(store: ScopeStore): ShiftIndex {
  const had = cache.get(store);
  if (had && had.at === store.revision) return had.index;
  const index = shiftIndex(shiftWorld(store));
  cache.set(store, { at: store.revision, index });
  return index;
}

/** The other sheets this creature can be. */
export function formsOfNote(store: ScopeStore, noteId: string): string[] {
  const ix = shiftIndexOf(store);
  const g = ix.group.get(noteId);
  return g ? (ix.forms.get(g) ?? []).filter((id) => id !== noteId) : [];
}

/**
 * A sheet as the permission checks should see it: its own owners, plus whoever
 * plays any other form of the same creature. Shift into a bear and the bear is
 * yours to play; let the number lapse, or take the ability off, and it isn't.
 *
 * Never stored — the borrowed owners would silt up the sheet. It's a view, and
 * only the checks use it.
 */
export function asPlayable(store: ScopeStore, note: AgNote | undefined): AgNote | undefined {
  if (!note) return note;
  const ix = shiftIndexOf(store);
  const g = ix.group.get(note.id);
  if (!g) return note;
  const forms = ix.forms.get(g) ?? [];
  if (forms.length < 2) return note;
  const owners = new Set(note.ownerIds);
  for (const id of forms) for (const o of store.notes.get(id)?.ownerIds ?? []) owners.add(o);
  return owners.size === note.ownerIds.length ? note : { ...note, ownerIds: [...Array.from(owners)] };
}
