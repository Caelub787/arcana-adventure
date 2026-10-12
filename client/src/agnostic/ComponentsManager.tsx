// Reusable components: design once (a resource bar block, a stat block, an
// attack row…), place on many sheets / templates / tracker cards. Values are
// parameters ($hp, $max…) that each placement connects to its own fields.
import React, { useState } from "react";
import { Plus, Trash2, Puzzle, ChevronLeft } from "lucide-react";
import type { AgComponentDef, AgLayout } from "@shared/agnostic/types";
import { useToast } from "@/hooks/use-toast";
import { useAg } from "./hooks";
import { LayoutEditor } from "./LayoutEditor";

export function ComponentsManager() {
  const { state, request } = useAg();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const comps = [...state.components.values()].sort((a, b) => a.name.localeCompare(b.name));
  const create = async () => {
    try {
      const res = await request<{ componentId: string }>({ op: "component.upsert", component: { name: "New component", params: ["value", "max"], layout: { width: 220, height: 40, items: [
        { id: "l", x: 4, y: 2, w: 90, h: 16, widget: { kind: "text", text: "Label", fontSize: 12, color: "#d6d3d1" } },
        { id: "b", x: 4, y: 20, w: 212, h: 14, widget: { kind: "field", ref: "$value", maxRef: "$max", display: "bar", color: "#16a34a" } },
      ] } } });
      setEditing(res.componentId);
    } catch (e: any) { toast({ title: "Couldn't create it", description: e.message, variant: "destructive" }); }
  };
  if (editing && state.components.get(editing)) return <ComponentEditor comp={state.components.get(editing)!} onBack={() => setEditing(null)} />;
  return (
    <div className="p-2 space-y-2" data-testid="ag-components">
      <div className="text-[11px] text-stone-500">Design a piece once and reuse it everywhere. Its values are <span className="font-mono text-sky-300">$parameters</span> that each sheet connects to its own fields.</div>
      <button type="button" onClick={create} className="h-9 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm inline-flex items-center gap-1" data-testid="ag-component-new"><Plus className="h-4 w-4" /> New component</button>
      <div className="space-y-1">
        {comps.map((c) => (
          <button key={c.id} type="button" onClick={() => setEditing(c.id)} className="w-full flex items-center gap-2 rounded border border-stone-800 bg-stone-900/70 hover:border-stone-600 px-2 py-1.5 text-left">
            <Puzzle className="h-4 w-4 text-amber-400" />
            <span className="flex-1 min-w-0 text-sm text-stone-200 truncate">{c.name}</span>
            <span className="text-[10px] text-stone-500 font-mono truncate">{c.params.map((p) => `$${p}`).join(" ")}</span>
          </button>
        ))}
        {!comps.length && <div className="text-xs text-stone-500 p-2">No components yet.</div>}
      </div>
    </div>
  );
}

function ComponentEditor({ comp, onBack }: { comp: AgComponentDef; onBack: () => void }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const [paramsText, setParamsText] = useState(comp.params.join(", "));
  // Preview against any sheet so the GM can see real numbers while designing.
  const notes = [...state.notes.values()];
  const [previewNote, setPreviewNote] = useState(notes[0]?.id ?? "");
  // Sensible preview wiring: "value"/"current" → hp, "max" → hp_max, otherwise the same-named field.
  const guess = (p: string) => (p === "value" || p === "current" ? "hp" : p === "max" ? "hp_max" : p);
  const [bindings, setBindings] = useState<Record<string, string>>(() => Object.fromEntries(comp.params.map((p) => [p, guess(p)])));
  const save = (patch: Partial<{ name: string; params: string[]; layout: AgLayout }>) =>
    request({ op: "component.upsert", component: { id: comp.id, name: comp.name, params: comp.params, layout: comp.layout, ...patch } }).catch((e) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  return (
    <div className="p-2 space-y-2 text-stone-200" data-testid="ag-component-editor">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onBack} className="h-8 w-8 grid place-items-center rounded hover:bg-stone-800"><ChevronLeft className="h-4 w-4" /></button>
        <input defaultValue={comp.name} onBlur={(e) => e.target.value !== comp.name && save({ name: e.target.value })} className="h-8 flex-1 bg-stone-900 border border-stone-700 rounded px-2 text-sm" />
        <button type="button" onClick={() => { if (window.confirm(`Delete “${comp.name}”? Places using it will show “component removed”.`)) request({ op: "component.delete", id: comp.id }).then(onBack); }} className="h-8 w-8 grid place-items-center rounded text-red-300 hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
      </div>
      <label className="flex items-center gap-1.5 text-xs">Parameters
        <input value={paramsText} onChange={(e) => setParamsText(e.target.value)} onBlur={() => save({ params: paramsText.split(",").map((s) => s.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")).filter(Boolean) })} placeholder="value, max" className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded px-1.5 font-mono text-sky-300" />
      </label>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
        Preview with
        <select value={previewNote} onChange={(e) => setPreviewNote(e.target.value)} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-stone-200">
          {notes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        {comp.params.map((p) => (
          <label key={p} className="inline-flex items-center gap-1"><span className="font-mono text-sky-300">${p}</span>=<input value={bindings[p] ?? ""} onChange={(e) => setBindings({ ...bindings, [p]: e.target.value })} className="h-7 w-20 bg-stone-900 border border-stone-700 rounded px-1 font-mono text-stone-200" /></label>
        ))}
      </div>
      {previewNote ? (
        <LayoutEditor
          layout={comp.layout}
          params={comp.params}
          opts={{ noteId: previewNote, params: bindings }}
          onChange={(layout, final) => { if (final) save({ layout }); }}
        />
      ) : <div className="text-xs text-stone-500">Create a sheet first to preview with.</div>}
      <div className="text-[10px] text-stone-500">Changes show everywhere this component is used, immediately.</div>
    </div>
  );
}
