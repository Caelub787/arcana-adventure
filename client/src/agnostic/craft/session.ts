// A crafting session's live state: a map in the session sheet's document, so
// everyone who has that sheet open (the crafter, the GM, anyone it's shared
// with) sees every hammer blow, stir and stroke as it happens, and it's saved
// as it goes. Whoever can edit the sheet plays; everyone else watches.
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { noteDocName } from "@shared/agnostic/types";
import type { AgNote, AgValue } from "@shared/agnostic/types";
import { numOf, toolEffects, runeSpaceUsed, findRuneSpot, RUNE_SIZE_MIN, type ToolEffects, type RunePlacement } from "@shared/agnostic/crafting";
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

/** What a tool lends to the work: points on the craft's skill, and how fine a rune it can cut. */
export function toolEffectsOn(state: ScopeState, itemId: string | null | undefined): ToolEffects {
  return toolEffects((k) => (itemId ? valueOn(state, itemId, k) : undefined));
}

/**
 * The hand at the work: the craft's skill with the tools' points added in. A good
 * set lends a point or two and a makeshift one costs them, so the same crafter is
 * steadier with better kit. Kept inside 0–4, which is what the minigames read.
 */
export function craftHand(state: ScopeState, characterId: string, skillKey: string, tools: Array<string | null | undefined>): { skill: number; own: number; tool: number } {
  const own = Math.floor(numOf(valueOn(state, characterId, skillKey)));
  const tool = tools.reduce((a, id) => a + toolEffectsOn(state, id).skill, 0);
  return { own, tool, skill: Math.max(0, Math.min(4, own + tool)) };
}

const parseJson = <T,>(v: unknown, d: T): T => { if (typeof v !== "string" || !v) return d; try { return JSON.parse(v) as T; } catch { return d; } };

/**
 * The room left on an item for runes. There is no socket count anywhere: what
 * decides is the surface, so an item is full when nothing more will fit on it
 * without cutting across a rune already there.
 */
export function runeSpaceOn(state: ScopeState, itemId: string, minSize = RUNE_SIZE_MIN): { taken: RunePlacement[]; used: number; full: boolean; label: string } {
  const taken = runesOn(state, itemId).map((r) => parseJson<RunePlacement>(valueOn(state, r.id, "placement"), { x: 50, y: 50, s: 30 }));
  const used = runeSpaceUsed(taken);
  const full = !findRuneSpot({ x: 50, y: 50, s: minSize }, taken, minSize);
  const label = !taken.length ? "bare" : full ? `${taken.length} rune${taken.length === 1 ? "" : "s"} · no room left` : `${taken.length} rune${taken.length === 1 ? "" : "s"} · ${Math.round((1 - used) * 100)}% free`;
  return { taken, used, full, label };
}
