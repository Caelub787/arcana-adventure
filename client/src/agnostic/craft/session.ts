// A crafting session's live state: a map in the session sheet's document, so
// everyone who has that sheet open (the crafter, the GM, anyone it's shared
// with) sees every hammer blow, stir and stroke as it happens, and it's saved
// as it goes. Whoever can edit the sheet plays; everyone else watches.
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { noteDocName } from "@shared/agnostic/types";
import type { AgNote, AgValue } from "@shared/agnostic/types";
import { useAg, useDoc, follow } from "../hooks";

export type CraftState = Record<string, any>;

export function useCraftSession(sessionId: string | null) {
  const { state } = useAg();
  const note = sessionId ? state.notes.get(sessionId) : undefined;
  const handle = useDoc(note ? noteDocName(note.id, note.docEpoch) : null);
  const doc = handle?.synced ? handle.doc : null;
  const map = useMemo(() => (doc ? doc.getMap<any>("craft") : null), [doc]);
  const [snap, setSnap] = useState<CraftState>({});
  useEffect(() => {
    if (!map) return;
    const read = () => setSnap(map.toJSON());
    read();
    map.observe(read);
    return () => map.unobserve(read);
  }, [map]);
  const set = (patch: CraftState) => {
    if (!map || !doc || handle?.readOnly) return;
    // Plain JSON only (undefined inside objects dropped), so every client reads the same thing.
    doc.transact(() => { for (const [k, v] of Object.entries(patch)) { if (v === undefined) map.delete(k); else map.set(k, typeof v === "object" && v !== null ? JSON.parse(JSON.stringify(v)) : v); } });
  };
  return { note, ready: !!doc, readOnly: !!handle?.readOnly || !doc, state: snap, set, map: map as Y.Map<any> | null };
}

type ScopeState = ReturnType<typeof useAg>["state"];
/** A value on a sheet (its effective value, with modifiers). */
export function valueOn(state: ScopeState, noteId: string, key: string): AgValue | undefined {
  for (const f of Array.from(state.fields.values())) if (f.noteId === noteId && f.key === key) return (f.eff !== undefined ? f.eff : f.value) as AgValue;
  return undefined;
}
export function hasValue(state: ScopeState, noteId: string, key: string) {
  for (const f of Array.from(state.fields.values())) if (f.noteId === noteId && f.key === key) return true;
  return false;
}
/** Everything a character carries: the items connected to it. */
export function inventoryOf(state: ScopeState, characterId: string): AgNote[] {
  const ids = new Set<string>();
  for (const l of Array.from(state.links.values())) if (l.toNoteId === characterId) ids.add(l.fromNoteId);
  return Array.from(ids).map((id) => state.notes.get(id)).filter((n): n is AgNote => !!n && n.type === "item" && !n.isTemplate)
    .sort((a, b) => a.name.localeCompare(b.name));
}
/** The runes set into an item. */
export function runesOn(state: ScopeState, itemId: string): AgNote[] {
  return follow(state, itemId, "runes").map((id) => state.notes.get(id)).filter((n): n is AgNote => !!n && hasValue(state, n.id, "sigil"));
}
export const qtyOf = (state: ScopeState, id: string) => { const v = valueOn(state, id, "qty"); return typeof v === "number" ? v : 1; };
