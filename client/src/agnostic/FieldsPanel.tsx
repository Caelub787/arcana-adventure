// The sheet's data: every value it holds, how it's calculated, and who may see
// or change it. Values here are the same ones shown on the sheet, the player tracker
// and tokens — edit one anywhere and it changes everywhere.
import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Gauge, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import type { AgField, AgFieldType } from "@shared/agnostic/types";
import { slugifyKey } from "@shared/agnostic/types";
import { describeAudience } from "@shared/agnostic/acl";
import { useToast } from "@/hooks/use-toast";
import { useAg, useNoteFields, usePerms, useMemberName } from "./hooks";
import { usePlayView } from "./viewMode";
import { FieldInput, CommitInput } from "./widgets";
import { FormulaInput } from "./FormulaBuilder";
import { AclEditor } from "./pickers";
import { agConfirm } from "./float";
import { TipIcon } from "./tips";
import { TooltipEditor } from "./look";

const TYPES: Array<[AgFieldType, string, string]> = [
  ["number", "Number", "HP, strength, gold…"],
  ["formula", "Calculated", "Worked out from other values"],
  ["text", "Text", "A word or line"],
  ["boolean", "Yes / No", "Equipped, stunned…"],
  ["select", "Choice", "One of a list"],
  ["dice", "Dice", "e.g. 1d8 — used by buttons"],
  ["image", "Image", "A picture"],
];

export function FieldsPanel({ noteId }: { noteId: string }) {
  const { request } = useAg();
  const fields = useNoteFields(noteId);
  // Player view: values can still be changed, but not added, removed or reconfigured.
  const play = usePlayView();
  const isGM = usePerms(noteId).isGM && !play;
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const addResource = async () => {
    const name = window.prompt("Name of the resource (e.g. Mana)", "Mana")?.trim();
    if (!name) return;
    const key = slugifyKey(name);
    try {
      await request({ op: "field.create", noteId, label: name, key, type: "number", value: 10, options: { min: 0 } });
      await request({ op: "field.create", noteId, label: `Max ${name}`, key: `${key}_max`, type: "number", value: 10, options: { min: 0 } });
      toast({ title: `${name} added`, description: `Insert → Resource bar, then pick “${name}” with “Max ${name}”.` });
    } catch (e: any) { toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-2 p-3" data-testid="ag-fields-panel">
      {isGM && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setAdding(true)} className="h-8 px-2.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1" data-testid="ag-field-add"><Plus className="h-3.5 w-3.5" /> Add value</button>
          <button type="button" onClick={addResource} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs inline-flex items-center gap-1" data-testid="ag-resource-add"><Gauge className="h-3.5 w-3.5" /> Add resource (current + max)</button>
        </div>
      )}
      {adding && <NewFieldForm noteId={noteId} onDone={(id) => { setAdding(false); if (id) setOpen(id); }} />}
      <div className="space-y-1">
        {fields.map((f, i) => (
          <FieldRow key={f.id} field={f} isGM={isGM} open={open === f.id} onToggle={() => setOpen(open === f.id ? null : f.id)}
            onMove={(d) => {
              const other = fields[i + d];
              if (!other) return;
              request({ op: "field.update", id: f.id, patch: { sortOrder: other.sortOrder } });
              request({ op: "field.update", id: other.id, patch: { sortOrder: f.sortOrder === other.sortOrder ? f.sortOrder + d : f.sortOrder } });
            }} />
        ))}
        {!fields.length && <div className="text-sm text-stone-500 p-2">{isGM ? "No values yet. Values are what formulas, bars, buttons and the player tracker use." : "Nothing shared with you here."}</div>}
      </div>
    </div>
  );
}

function NewFieldForm({ noteId, onDone }: { noteId: string; onDone: (fieldId: string | null) => void }) {
  const { request } = useAg();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<AgFieldType>("number");
  const [formula, setFormula] = useState("");
  const submit = async () => {
    if (!label.trim()) return;
    try {
      const res = await request<{ fieldId: string }>({ op: "field.create", noteId, label: label.trim(), type, formula: type === "formula" || type === "dice" ? formula : null });
      onDone(res.fieldId);
    } catch (e: any) { toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }); }
  };
  return (
    <div className="rounded border border-amber-700/60 bg-stone-950/60 p-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && type !== "formula") submit(); e.stopPropagation(); }} placeholder="Name, e.g. Strength" className="h-8 flex-1 min-w-[140px] bg-stone-900 border border-stone-700 rounded px-2 text-sm text-stone-100" data-testid="ag-field-label" />
        <select value={type} onChange={(e) => setType(e.target.value as AgFieldType)} className="h-8 bg-stone-900 border border-stone-700 rounded px-1 text-sm text-stone-100" data-testid="ag-field-type">
          {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <div className="text-[11px] text-stone-500">{TYPES.find((t) => t[0] === type)?.[2]}{label.trim() && <> · used in formulas as <span className="font-mono text-amber-300">{slugifyKey(label)}</span></>}</div>
      {(type === "formula" || type === "dice") && <FormulaInput noteId={noteId} value={formula} allowDice={type === "dice"} onChange={setFormula} testId="ag-field-formula" />}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={() => onDone(null)} className="h-8 px-3 rounded text-xs text-stone-300 hover:bg-stone-800">Cancel</button>
        <button type="button" onClick={submit} disabled={!label.trim()} className="h-8 px-3 rounded bg-amber-600 text-white text-xs disabled:opacity-50" data-testid="ag-field-create">Add</button>
      </div>
    </div>
  );
}

function FieldRow({ field: f, isGM, open, onToggle, onMove }: { field: AgField; isGM: boolean; open: boolean; onToggle: () => void; onMove: (d: number) => void }) {
  const { request } = useAg();
  const { toast } = useToast();
  const memberName = useMemberName();
  const update = (patch: any) => request({ op: "field.update", id: f.id, patch }).catch((e) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  const restricted = f.acl.view !== "inherit" || f.acl.edit !== "inherit";
  return (
    <div className="rounded border border-stone-800 bg-stone-900/60" data-testid={`ag-field-row-${f.key}`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        {isGM && <button type="button" onClick={onToggle} className="h-6 w-6 grid place-items-center text-stone-400">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-stone-200 truncate inline-flex items-center gap-1 max-w-full">{f.label}{f.options.tooltip && <TipIcon text={f.options.tooltip} current={String(f.eff ?? f.value ?? "")} />}</div>
          {isGM && <div className="text-[10px] text-stone-500 font-mono truncate">{f.key}{f.type === "formula" && f.formula ? ` = ${f.formula}` : ""}</div>}
        </div>
        {restricted && isGM && <span className="text-[10px] text-violet-300 hidden sm:inline">{describeAudience(f.acl.view === "inherit" ? "inherit" : f.acl.view, memberName)}</span>}
        {f.err && <span title={f.err}><AlertTriangle className="h-3.5 w-3.5 text-red-400" /></span>}
        <div className="shrink-0"><FieldInput field={f} /></div>
      </div>
      {open && isGM && (
        <div className="border-t border-stone-800 p-2 space-y-2 text-stone-200">
          <div className="flex flex-wrap gap-1.5 items-center">
            <CommitInput value={f.label} className="h-8 flex-1 min-w-[120px]" onCommit={(label) => update({ label })} aria-label="Label" />
            <span className="text-[11px] text-stone-500">key</span>
            <CommitInput value={f.key} className="h-8 w-32 font-mono" onCommit={(key) => update({ key: slugifyKey(key) })} aria-label="Key" />
            <select value={f.type} onChange={(e) => update({ type: e.target.value })} className="h-8 bg-stone-900 border border-stone-700 rounded px-1 text-sm">
              {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          {(f.type === "formula" || f.type === "dice") && <FormulaEdit field={f} onSave={(formula) => update({ formula })} />}
          {f.type === "number" && (
            <div className="flex flex-wrap gap-2 text-xs items-center">
              <label className="inline-flex items-center gap-1">Min <CommitInput type="number" value={f.options.min ?? ""} className="h-7 w-16" onCommit={(v) => update({ options: { ...f.options, min: v === "" ? undefined : Number(v) } })} /></label>
              <label className="inline-flex items-center gap-1">Max <CommitInput type="number" value={f.options.max ?? ""} className="h-7 w-16" onCommit={(v) => update({ options: { ...f.options, max: v === "" ? undefined : Number(v) } })} /></label>
              <label className="inline-flex items-center gap-1">Step <CommitInput type="number" value={f.options.step ?? ""} className="h-7 w-14" onCommit={(v) => update({ options: { ...f.options, step: v === "" ? undefined : Number(v) } })} /></label>
            </div>
          )}
          {f.type === "number" && <ResourceOptions field={f} onChange={(options) => update({ options })} />}
          {f.type === "formula" && (
            <label className="text-xs inline-flex items-center gap-1">Result is
              <select value={f.options.resultType ?? "number"} onChange={(e) => update({ options: { ...f.options, resultType: e.target.value } })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1"><option value="number">a number</option><option value="text">text</option></select>
            </label>
          )}
          {f.type === "select" && (
            <>
              <label className="text-xs flex items-center gap-1">Choices
                <CommitInput value={(f.options.choices ?? []).join(", ")} className="h-7 flex-1" placeholder="Fighter, Wizard, Rogue" onCommit={(v) => update({ options: { ...f.options, choices: v.split(",").map((s) => s.trim()).filter(Boolean) } })} />
              </label>
              {(f.options.choices ?? []).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-stone-400">Colours</span>
                  {(f.options.choices ?? []).map((c) => (
                    <label key={c} className="inline-flex items-center gap-1 h-7 px-1.5 rounded border border-stone-700 bg-stone-900 cursor-pointer" title={`Colour for “${c}” (badges and values)`}>
                      <input type="color" value={f.options.choiceColors?.[c] ?? "#a8a29e"} onChange={(e) => update({ options: { ...f.options, choiceColors: { ...(f.options.choiceColors ?? {}), [c]: e.target.value } } })} className="h-4 w-5 bg-transparent border-0 p-0" />
                      <span style={{ color: f.options.choiceColors?.[c] }}>{c}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          <TooltipEditor value={f.options.tooltip} onChange={(tooltip) => update({ options: { ...f.options, tooltip: tooltip || undefined } })} hint="Shown behind a ? wherever this value appears (optional)" />
          <div>
            <div className="text-[11px] text-stone-400 mb-1">Who can see / change this value</div>
            <AclEditor acl={f.acl} onChange={(acl) => update({ acl })} editLabel="Change" />
            {f.type === "formula" && <div className="text-[10px] text-stone-500 mt-1">Calculated values can't be typed over — change the formula instead.</div>}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onMove(-1)} className="h-7 w-7 grid place-items-center rounded hover:bg-stone-800 text-stone-400" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => onMove(1)} className="h-7 w-7 grid place-items-center rounded hover:bg-stone-800 text-stone-400" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
            {f.err && <span className="text-[11px] text-red-400 ml-1">{f.err}</span>}
            <button type="button" onClick={() => { agConfirm(`Formulas and bars that use “${f.label}” will show a warning.`, { title: `Delete “${f.label}”?`, confirm: "Delete" }).then((ok) => { if (ok) request({ op: "field.delete", id: f.id }); }); }} className="ml-auto h-7 px-2 rounded text-xs text-red-300 hover:bg-red-950 inline-flex items-center gap-1" data-testid="ag-field-delete"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormulaEdit({ field, onSave }: { field: AgField; onSave: (f: string) => void }) {
  const [draft, setDraft] = useState(field.formula ?? "");
  const dirty = draft !== (field.formula ?? "");
  return (
    <div className="space-y-1">
      <FormulaInput noteId={field.noteId} value={draft} allowDice={field.type === "dice"} onChange={setDraft} />
      {dirty && <div className="flex justify-end gap-1"><button type="button" onClick={() => setDraft(field.formula ?? "")} className="h-7 px-2 text-xs text-stone-400">Reset</button><button type="button" onClick={() => onSave(draft)} className="h-7 px-3 rounded bg-amber-600 text-white text-xs" data-testid="ag-formula-save">Save formula</button></div>}
    </div>
  );
}

/**
 * A current value's links to its maximum and its temporary points:
 *   Goes up with — when that maximum rises (a rank up), this rises by the same amount.
 *   Temporary points — losses come off that value first; bars show it as a green layer.
 */
function ResourceOptions({ field: f, onChange }: { field: AgField; onChange: (o: AgField["options"]) => void }) {
  const { state } = useAg();
  const siblings = Array.from(state.fields.values()).filter((x) => x.noteId === f.noteId && x.id !== f.id);
  const maxes = siblings.filter((x) => x.type === "number" || x.type === "formula");
  const temps = siblings.filter((x) => x.type === "number");
  const sel = (value: string | undefined, list: AgField[], set: (v: string | undefined) => void, testId: string) => (
    <select value={value ?? ""} onChange={(e) => set(e.target.value || undefined)} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs max-w-[160px]" data-testid={testId}>
      <option value="">— none</option>
      {list.map((x) => <option key={x.id} value={x.key}>{x.label}</option>)}
    </select>
  );
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs items-center">
      <label className="inline-flex items-center gap-1" title="When that value goes up (e.g. Max HP on a rank up), this one goes up by the same amount; when it goes down, this one is kept within it">Goes up with {sel(f.options.follows, maxes, (follows) => onChange({ ...f.options, follows }), "ag-field-follows")}</label>
      <label className="inline-flex items-center gap-1" title="Losses come off this value first (e.g. Temp HP); bars show it in green on top">Temporary points {sel(f.options.shield, temps, (shield) => onChange({ ...f.options, shield }), "ag-field-shield")}</label>
    </div>
  );
}
