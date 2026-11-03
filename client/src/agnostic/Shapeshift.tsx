// Shapeshifting, on the page.
//
// One block does the lot: tick it on, give the creature a number, and every
// character or beast whose ability carries that number is one of its shapes.
// They're listed here — open any of them, or press Shift to become one, which
// carries the state of the creature across, moves the token on the map and
// hands you the new sheet.
import React, { useMemo, useState } from "react";
import { Shuffle, Loader2, ExternalLink, Check } from "lucide-react";
import type { AgField, AgNote } from "@shared/agnostic/types";
import { mayPlayNote } from "@shared/agnostic/acl";
import {
  SHIFT_KEY, SHIFT_GROUP_KEY, SHIFT_POOLS, abilityGroup, groupOf, shiftIndex, type ShiftWorld,
} from "@shared/agnostic/shapeshift";
import { useAg, effOf, fieldsOf, linksOfNote } from "./hooks";
import { useAgWindows } from "./AgWindows";
import { useToast } from "@/hooks/use-toast";
import { Portrait } from "./widgets";

type ScopeState = ReturnType<typeof useAg>["state"];

/** The scope as the shapeshifting rules want to see it. */
export function shiftWorldOf(state: ScopeState): ShiftWorld {
  const field = (id: string, key: string) => fieldsOf(state, id).find((f: AgField) => f.key === key);
  return {
    ids: () => Array.from(state.notes.keys()),
    type: (id) => state.notes.get(id)?.type,
    isTemplate: (id) => !!state.notes.get(id)?.isTemplate,
    value: (id, key) => effOf(field(id, key)),
    linked: (id, label) => linksOfNote(state, id).flatMap((l) => (
      l.fromNoteId === id && l.label === label ? [l.toNoteId]
      : l.toNoteId === id && l.reverseLabel === label ? [l.fromNoteId]
      : []
    )),
  };
}

const fieldOf = (state: ScopeState, noteId: string, key: string): AgField | undefined =>
  fieldsOf(state, noteId).find((f: AgField) => f.key === key);
const numOf = (f: AgField | undefined): number => {
  const v = effOf(f);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Which shape the creature is in as far as this page is concerned: the sheet
 * itself when it's a character or a beast, otherwise whoever holds the ability
 * this page belongs to.
 */
function currentForm(w: ShiftWorld, state: ScopeState, noteId: string, forms: string[]): string | null {
  if (forms.includes(noteId)) return noteId;
  const up = new Set<string>();
  let level = [noteId];
  for (let d = 0; d < 4 && level.length; d++) {
    const next: string[] = [];
    for (const id of level) for (const label of ["holder", "ability"]) for (const to of w.linked(id, label)) {
      if (up.has(to)) continue;
      up.add(to);
      if (forms.includes(to)) return to;
      next.push(to);
    }
    level = next;
  }
  return null;
}

export function ShiftBlock({ noteId }: { noteId: string }) {
  const { state, viewer, request } = useAg();
  const { toast } = useToast();
  const windows = useAgWindows();
  const [busy, setBusy] = useState<string | null>(null);
  const note = state.notes.get(noteId);
  const w = useMemo(() => shiftWorldOf(state), [state]);
  const isAbility = note?.type === "ability";
  const on = isAbility ? !!abilityGroup(w, noteId) : false;
  const onField = fieldOf(state, noteId, SHIFT_KEY);
  const groupField = fieldOf(state, noteId, SHIFT_GROUP_KEY);
  const ticked = isAbility ? effOf(onField) === true : false;
  const group = groupOf(w, noteId);
  // The server says which creature each sheet is a shape of, because the
  // ability that says so is often one this person may not see. Where it hasn't
  // (an older server, a library), work it out from what's here.
  const forms = useMemo(() => {
    if (!group) return [];
    const told = Array.from(state.notes.values()).filter((n) => n.shiftGroup === group);
    const list = told.length ? told : (shiftIndex(w).forms.get(group) ?? []).map((id) => state.notes.get(id)).filter(Boolean) as AgNote[];
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [w, group, state]);
  const here = currentForm(w, state, noteId, forms.map((f) => f.id));
  const hereNote = here ? state.notes.get(here) : undefined;
  // You shift because you're playing this creature, not because you already
  // own the shape you're going to — a bear nobody is in is anybody's to become.
  const playingIt = !!hereNote && (viewer.isGM || mayPlayNote(hereNote, viewer.userId));
  const taken = (n: AgNote) => !viewer.isGM && n.ownerIds.length > 0 && !n.ownerIds.includes(viewer.userId);
  const canSetUp = isAbility && !!viewer.isGM;

  const set = (f: AgField | undefined, value: unknown) => {
    if (!f) return;
    request({ op: "field.set", id: f.id, value: value as any }).catch((e: any) =>
      toast({ title: "Couldn't save that", description: e?.message, variant: "destructive" }));
  };

  const shift = async (to: AgNote) => {
    if (!here) return;
    setBusy(to.id);
    try {
      await request({ op: "note.shift", fromId: here, toId: to.id });
      // The new shape opens, and the one you've left closes behind you.
      windows?.open(to.id);
      windows?.close(here);
    } catch (e: any) {
      toast({ title: "Couldn't shift", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="my-2 rounded-lg border border-violet-900/60 bg-violet-950/10 p-2.5 space-y-2" data-testid="ag-shift">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-violet-300"><Shuffle className="h-3.5 w-3.5" /> Shapeshifting</span>
        {canSetUp && onField && (
          <label className="inline-flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer" data-testid="ag-shift-on">
            <input type="checkbox" checked={ticked} onChange={(e) => set(onField, e.target.checked)} className="accent-violet-500" />
            This ability shapeshifts
          </label>
        )}
        {/* The number only matters once it's on, so it only shows once it's on. */}
        {canSetUp && ticked && groupField && (
          <label className="inline-flex items-center gap-1.5 text-xs text-stone-400">
            Creature
            <input type="number" value={String(effOf(groupField) ?? 0)} onChange={(e) => set(groupField, Math.round(Number(e.target.value) || 0))}
              className="h-7 w-20 bg-stone-950 border border-stone-700 rounded px-1.5 text-stone-100 text-xs" data-testid="ag-shift-group" />
          </label>
        )}
        {!canSetUp && !!group && <span className="text-[11px] text-stone-500">Creature {group}</span>}
      </div>

      {canSetUp && ticked && !group && (
        <div className="text-[11px] text-amber-300/90">Give it a number other than 0, then put an ability with the same number on every other shape.</div>
      )}

      {!!group && (
        <div className="space-y-1">
          {forms.map((f) => {
            const isHere = f.id === here;
            const hp = fieldOf(state, f.id, "hp"), hpMax = fieldOf(state, f.id, "hp_max");
            return (
              <div key={f.id} className={`flex items-center gap-2 rounded-md border px-1.5 py-1 ${isHere ? "border-violet-500 bg-violet-500/10" : "border-stone-800 bg-stone-900/70"}`}
                data-testid={`ag-shift-form-${f.name}`}>
                <button type="button" onClick={() => windows?.open(f.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left" title="Open this sheet">
                  <Portrait note={f} size={28} radius={6} />
                  <span className="min-w-0">
                    <span className="block text-sm text-stone-100 truncate">{f.name || "Untitled"}{isHere && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-violet-300">this shape</span>}</span>
                    {hp && <span className="block text-[10px] text-stone-500">{numOf(hp)}{hpMax ? ` / ${numOf(hpMax)}` : ""} health</span>}
                  </span>
                </button>
                {!isHere && playingIt && !taken(f) && (
                  <button type="button" onClick={() => void shift(f)} disabled={!!busy}
                    className="h-7 px-2.5 rounded bg-violet-700 hover:bg-violet-600 disabled:opacity-60 text-white text-xs inline-flex items-center gap-1 shrink-0"
                    data-testid={`ag-shift-to-${f.name}`}>
                    {busy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />} Shift
                  </button>
                )}
                {!isHere && playingIt && taken(f) && <span className="text-[10px] text-stone-500 shrink-0 px-1" title="Somebody else is in that shape">taken</span>}
                {isHere && <Check className="h-4 w-4 text-violet-400 shrink-0" />}
              </div>
            );
          })}
          {forms.length < 2 && (
            <div className="text-[11px] text-stone-500">
              {forms.length ? "Only one shape so far. Put an ability with the same number on the others." : "No shapes yet: put this ability on a character or a beast."}
            </div>
          )}
          <div className="text-[10px] text-stone-500 pt-0.5">
            Shifting carries the share of {SHIFT_POOLS.map((p) => p.label.toLowerCase()).join(", ")} across — at 1 of 10 health you arrive at 10 of 100 — and the token, the turn order and the tracker card change with you.
          </div>
        </div>
      )}
      {!group && !canSetUp && <div className="text-[11px] text-stone-500">Nothing is linked to this yet.</div>}
    </div>
  );
}
