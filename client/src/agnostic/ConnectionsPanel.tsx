// Connections between sheets (an item's "owner", a character's "items", a
// location's "occupants"…) and modifiers — values this sheet changes on the
// sheets it's connected to (a ring that adds +1 strength while equipped).
import React, { useState } from "react";
import { Plus, Trash2, ArrowRight, Link2, Wand2 } from "lucide-react";
import type { AgModifier } from "@shared/agnostic/types";
import { useToast } from "@/hooks/use-toast";
import { useAg, usePerms } from "./hooks";
import { Portrait } from "./widgets";
import { NotePickerDialog } from "./editor/AgEditor";
import { FormulaInput } from "./FormulaBuilder";

const PRESETS: Array<[string, string, string]> = [
  ["owner", "items", "Owned by (item → character)"],
  ["items", "owner", "Owns (character → item)"],
  ["location", "occupants", "Is at (→ location)"],
  ["ally", "ally", "Ally of"],
  ["species", "members", "Species"],
  ["parent", "children", "Part of"],
];

export function ConnectionsPanel({ noteId }: { noteId: string }) {
  const { state, request } = useAg();
  const { isGM } = usePerms(noteId);
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const [preset, setPreset] = useState(0);
  const [custom, setCustom] = useState({ label: "", reverse: "" });
  const links = [...state.links.values()].filter((l) => l.fromNoteId === noteId || l.toNoteId === noteId);

  const create = async (otherId: string) => {
    setPicking(false);
    const [label, reverse] = preset === -1 ? [custom.label || "link", custom.reverse || "linked"] : PRESETS[preset];
    try { await request({ op: "link.create", fromNoteId: noteId, toNoteId: otherId, label, reverseLabel: reverse }); }
    catch (e: any) { toast({ title: "Couldn't connect", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="p-3 space-y-4" data-testid="ag-connections-panel">
      <section className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-amber-400/90 flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Connections</div>
        <div className="text-[11px] text-stone-500">Formulas reach through these by name — e.g. <span className="font-mono">@owner.str</span>, <span className="font-mono">sum(@items.weight)</span>.</div>
        <div className="space-y-1">
          {links.map((l) => {
            const outgoing = l.fromNoteId === noteId;
            const other = state.notes.get(outgoing ? l.toNoteId : l.fromNoteId);
            const myName = outgoing ? l.label : l.reverseLabel;
            return (
              <div key={l.id} className="flex items-center gap-2 rounded border border-stone-800 bg-stone-900/60 px-2 py-1.5">
                <span className="font-mono text-xs text-sky-300 shrink-0">@{myName}</span>
                <ArrowRight className="h-3 w-3 text-stone-500 shrink-0" />
                <Portrait note={other} size={22} radius={4} />
                <span className="text-sm text-stone-200 truncate flex-1">{other?.name ?? "[hidden]"}</span>
                {isGM && <button type="button" onClick={() => request({ op: "link.delete", id: l.id })} className="h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400" title="Disconnect"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            );
          })}
          {!links.length && <div className="text-xs text-stone-500">Not connected to anything.</div>}
        </div>
        {isGM && (
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={preset} onChange={(e) => setPreset(Number(e.target.value))} className="h-8 bg-stone-900 border border-stone-700 rounded px-1 text-xs text-stone-100" data-testid="ag-link-preset">
              {PRESETS.map(([, , t], i) => <option key={i} value={i}>{t}</option>)}
              <option value={-1}>Custom…</option>
            </select>
            {preset === -1 && (
              <>
                <input value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} placeholder="this → it (e.g. mount)" className="h-8 w-32 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />
                <input value={custom.reverse} onChange={(e) => setCustom({ ...custom, reverse: e.target.value })} placeholder="it → this (e.g. rider)" className="h-8 w-32 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />
              </>
            )}
            <button type="button" onClick={() => setPicking(true)} className="h-8 px-2.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1" data-testid="ag-link-add"><Plus className="h-3.5 w-3.5" /> Connect to…</button>
          </div>
        )}
      </section>
      {isGM && <ModifiersSection noteId={noteId} />}
      {picking && <NotePickerDialog title="Connect to…" notes={[...state.notes.values()].filter((n) => !n.isTemplate)} exclude={noteId} onClose={() => setPicking(false)} onPick={create} />}
    </div>
  );
}

function ModifiersSection({ noteId }: { noteId: string }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const mods = [...state.modifiers.values()].filter((m) => m.noteId === noteId);
  const labels = new Set<string>(["self"]);
  for (const l of state.links.values()) { if (l.fromNoteId === noteId) labels.add(l.label); if (l.toNoteId === noteId) labels.add(l.reverseLabel); }
  const save = (m: Partial<AgModifier> & { noteId: string }) => request({ op: "modifier.upsert", modifier: { via: "owner", targetKey: "", op: "add", amount: "1", condition: null, label: null, ...m } as any })
    .catch((e) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  return (
    <section className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-amber-400/90 flex items-center gap-1"><Wand2 className="h-3.5 w-3.5" /> This sheet changes…</div>
      <div className="text-[11px] text-stone-500">E.g. a sword adds 2 to its owner's <span className="font-mono">damage</span> while <span className="font-mono">equipped</span>.</div>
      {mods.map((m) => <ModifierRow key={m.id} mod={m} labels={[...labels]} onSave={(patch) => save({ ...m, ...patch })} onDelete={() => request({ op: "modifier.delete", id: m.id })} />)}
      <button type="button" onClick={() => save({ noteId, via: [...labels].find((l) => l !== "self") ?? "self", targetKey: "", amount: "1" })} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs inline-flex items-center gap-1" data-testid="ag-modifier-add"><Plus className="h-3.5 w-3.5" /> Add a modifier</button>
    </section>
  );
}

function ModifierRow({ mod, labels, onSave, onDelete }: { mod: AgModifier; labels: string[]; onSave: (p: Partial<AgModifier>) => void; onDelete: () => void }) {
  const [amount, setAmount] = useState(mod.amount);
  const [cond, setCond] = useState(mod.condition ?? "");
  const [target, setTarget] = useState(mod.targetKey);
  return (
    <div className="rounded border border-stone-800 bg-stone-900/60 p-2 space-y-1.5 text-xs text-stone-200">
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={mod.op} onChange={(e) => onSave({ op: e.target.value as any })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1"><option value="add">Add</option><option value="multiply">Multiply</option></select>
        <span className="text-stone-400">to</span>
        <select value={mod.via} onChange={(e) => onSave({ via: e.target.value })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1">{labels.map((l) => <option key={l} value={l}>{l === "self" ? "this sheet" : `@${l}`}</option>)}</select>
        <span className="text-stone-400">'s</span>
        <input value={target} onChange={(e) => setTarget(e.target.value)} onBlur={() => target !== mod.targetKey && onSave({ targetKey: target })} placeholder="value key, e.g. str" className="h-7 w-28 bg-stone-900 border border-stone-700 rounded px-1.5 font-mono" />
        <button type="button" onClick={onDelete} className="ml-auto h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex items-center gap-1.5"><span className="text-stone-400 w-10 shrink-0">by</span><div className="flex-1"><FormulaInput noteId={mod.noteId} value={amount} onChange={setAmount} /></div>{amount !== mod.amount && <button type="button" className="h-7 px-2 rounded bg-amber-600 text-white" onClick={() => onSave({ amount })}>Save</button>}</div>
      <div className="flex items-center gap-1.5"><span className="text-stone-400 w-10 shrink-0">when</span><div className="flex-1"><FormulaInput noteId={mod.noteId} value={cond} placeholder="(always) e.g. equipped" onChange={setCond} /></div>{cond !== (mod.condition ?? "") && <button type="button" className="h-7 px-2 rounded bg-amber-600 text-white" onClick={() => onSave({ condition: cond || null })}>Save</button>}</div>
    </div>
  );
}
