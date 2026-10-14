// Effects: what a sheet does to the sheets it's connected to — a wound's
// −2 Athletics and −5 Speed on its bearer, a ring's +1 DC on its owner while
// equipped. Each effect is a real change to that value (the green / red number
// beside it), made with simple boxes: which value, how much, and when.
import React, { useMemo, useState } from "react";
import { Trash2, Activity } from "lucide-react";
import type { AgField, AgModifier } from "@shared/agnostic/types";
import { asNumber, formatValue } from "@shared/agnostic/formula";
import { useAg, follow, fieldsOf, resolveRef, effOf } from "./hooks";
import { PickField, type SelItem } from "./float";
import { useToast } from "@/hooks/use-toast";

type State = ReturnType<typeof useAg>["state"];

/** The sheet the effects land on (or a character template's values when nothing's connected yet). */
function targetFields(state: State, noteId: string, via: string): { id: string | null; fields: AgField[] } {
  const id = via && via !== "self" ? follow(state, noteId, via)[0] ?? null : noteId;
  if (id) return { id, fields: fieldsOf(state, id) };
  const t = Array.from(state.notes.values()).find((n) => n.isTemplate && (n.type === "character" || n.type === "npc") && fieldsOf(state, n.id).length);
  return { id: null, fields: t ? fieldsOf(state, t.id) : [] };
}

/** "−2", "+1", "×2", or the amount's formula when it isn't a plain number. */
function amountText(state: State, m: AgModifier): { text: string; n: number | null } {
  const raw = m.amount.trim();
  let n: number | null = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
  if (n === null) { const f = resolveRef(state, m.noteId, raw)[0]; if (f) n = asNumber(effOf(f) as any); }
  if (m.op === "multiply") return { text: `×${n ?? raw}`, n };
  if (n === null) return { text: `+ (${raw})`, n };
  return { text: n < 0 ? `−${formatValue(-n)}` : `+${formatValue(n)}`, n };
}

/** A sheet's effects as small chips ("Athletics −2 · Speed −5"). */
export function EffectsList({ noteId, empty }: { noteId: string; empty?: React.ReactNode }) {
  const { state } = useAg();
  const mods = Array.from(state.modifiers.values()).filter((m) => m.noteId === noteId);
  if (!mods.length) return <>{empty ?? null}</>;
  const tgt = (m: AgModifier) => targetFields(state, noteId, m.via).fields.find((f) => f.key === m.targetKey);
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="ag-effects-list">
      {mods.map((m) => {
        const a = amountText(state, m);
        const bad = a.n !== null && (m.op === "multiply" ? a.n < 1 : a.n < 0);
        return (
          <span key={m.id} className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-full border text-[10.5px] ${bad ? "border-red-800/70 text-red-300 bg-red-950/30" : "border-emerald-800/70 text-emerald-300 bg-emerald-950/30"}`}
            title={m.condition ? `Only while: ${m.condition}` : undefined}>
            {tgt(m)?.label ?? m.targetKey} <b className="font-mono">{a.text}</b>{m.condition ? <span className="text-stone-500">*</span> : null}
          </span>
        );
      })}
    </span>
  );
}

export interface EffectsBlockAttrs {
  /** The connection the effects reach ("bearer" on a wound, "owner" on an item, "holder" on a trait). */
  via: string;
  /** Only while this is true on this sheet (e.g. "equipped"); "" = always. */
  condition: string;
}

/** Every effect a sheet has: chips for everyone; the GM adds and changes them here. */
export function EffectsBlock({ noteId, attrs }: { noteId: string; attrs: EffectsBlockAttrs }) {
  const { state, request, realViewer } = useAg();
  const { toast } = useToast();
  const gm = realViewer.isGM;
  const mods = Array.from(state.modifiers.values()).filter((m) => m.noteId === noteId);
  const target = useMemo(() => targetFields(state, noteId, attrs.via), [state, noteId, attrs.via]);
  const items: SelItem[] = target.fields
    .filter((f) => (f.type === "number" || f.type === "formula") && f.options.resultType !== "text" && !/_dice$/.test(f.key))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((f) => ({ id: f.key, name: f.label, sub: target.id ? `now ${formatValue(effOf(f))}` : f.key }));
  const save = (m: Partial<AgModifier> & { id?: string }) => {
    const base = m.id ? state.modifiers.get(m.id)! : { noteId, via: attrs.via || "self", targetKey: "", op: "add" as const, amount: "-1", condition: attrs.condition || null, label: state.notes.get(noteId)?.name ?? null };
    request({ op: "modifier.upsert", modifier: { ...base, ...m } }).catch((e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  };
  const remove = (id: string) => request({ op: "modifier.delete", id }).catch((e: any) => toast({ title: "Couldn't remove it", description: e.message, variant: "destructive" }));
  const who = attrs.via && attrs.via !== "self" ? (target.id ? state.notes.get(target.id)?.name : null) ?? `its ${attrs.via}` : "this sheet";

  if (!gm) return <div className="py-0.5"><EffectsList noteId={noteId} empty={<span className="text-xs text-stone-500">No effects.</span>} /></div>;
  return (
    <div className="space-y-1.5" data-testid="ag-effects">
      {mods.map((m) => <EffectRow key={m.id} m={m} items={items} onSave={(p) => save({ ...p, id: m.id })} onRemove={() => remove(m.id)} />)}
      {!mods.length && <div className="text-xs text-stone-500">No effects yet.</div>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56"><PickField value="" items={items} placeholder="+ Add an effect on…" onChange={(targetKey) => targetKey && save({ targetKey })} title={`Which of ${who}'s values does it change?`} testId="ag-effects-add" /></div>
        <span className="text-[10px] text-stone-500 inline-flex items-center gap-1"><Activity className="h-3 w-3" /> Changes {who}{attrs.condition ? <> while <span className="font-mono">{attrs.condition}</span></> : null}. The change shows as the green / red number beside the value.</span>
      </div>
    </div>
  );
}

function EffectRow({ m, items, onSave, onRemove }: { m: AgModifier; items: SelItem[]; onSave: (p: Partial<AgModifier>) => void; onRemove: () => void }) {
  const num = /^-?\d+(\.\d+)?$/.test(m.amount.trim()) ? Number(m.amount) : null;
  const [text, setText] = useState(m.amount);
  const [focus, setFocus] = useState(false);
  const step = (d: number) => num !== null && onSave({ amount: String(num + d) });
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded border border-stone-800 bg-stone-950/50 px-2 py-1.5" data-testid={`ag-effect-${m.targetKey}`}>
      <div className="w-44"><PickField value={m.targetKey} items={items} onChange={(targetKey) => targetKey && onSave({ targetKey })} title="Which value?" display={m.targetKey} /></div>
      <select value={m.op} onChange={(e) => onSave({ op: e.target.value as AgModifier["op"] })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs">
        <option value="add">add</option><option value="multiply">× times</option>
      </select>
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={() => step(-1)} disabled={num === null} className="h-7 w-6 rounded border border-stone-700 bg-stone-800 text-stone-300 disabled:opacity-30">−</button>
        <input value={focus ? text : m.amount} onFocus={() => { setText(m.amount); setFocus(true); }} onChange={(e) => setText(e.target.value)}
          onBlur={() => { setFocus(false); if (text.trim() && text.trim() !== m.amount) onSave({ amount: text.trim() }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-7 w-16 text-center bg-stone-950 border border-amber-800/50 rounded text-xs font-mono" data-testid="ag-effect-amount" />
        <button type="button" onClick={() => step(1)} disabled={num === null} className="h-7 w-6 rounded border border-stone-700 bg-stone-800 text-stone-300 disabled:opacity-30">+</button>
      </span>
      <input defaultValue={m.condition ?? ""} placeholder="always" title="Only while (e.g. equipped)" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (m.condition ?? "")) onSave({ condition: v || null }); }}
        className="h-7 w-28 bg-stone-900 border border-stone-700 rounded px-1.5 text-[11px] font-mono" />
      <button type="button" onClick={onRemove} className="ml-auto h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400" title="Remove this effect"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

