// Rolls: buttons set up with simple boxes instead of steps. A sheet (an
// ability, a weapon, any item) can have as many as it likes, each with its own
// name, dice, what's added, what it costs, and how its button looks. The GM
// builds them in the sheet's Rolls block; the character sheet lists the ones
// marked "show on the character sheet" (see the "rolls" column of a list).
import React, { useMemo, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Settings2, Pencil, Check, Minus, EyeOff } from "lucide-react";
import type { AgAction, AgActionOptions, AgField, AgRollSpec } from "@shared/agnostic/types";
import type { AgActionView } from "@shared/agnostic/protocol";
import { asNumber } from "@shared/agnostic/formula";
import { useAg, follow, effOf, fieldsOf, resolveRef } from "./hooks";
import { ActionButton } from "./widgets";
import { PickField, type SelItem } from "./float";
import { ColorInput } from "./pickers";
import { ActionEditorDialog } from "./ActionEditor";
import { RollIcon, IconChooser } from "./rollIcons";
import { usePlayView } from "./viewMode";
import { useToast } from "@/hooks/use-toast";

const titleCase = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const order = (a: AgActionView, b: AgActionView) => (a.options?.sortOrder ?? 0) - (b.options?.sortOrder ?? 0) || a.name.localeCompare(b.name);

/** The sheet's buttons, in their set order. */
export function actionsOfNote(actions: Map<string, AgActionView>, noteId: string): AgActionView[] {
  return Array.from(actions.values()).filter((a) => a.noteId === noteId).sort(order);
}

type State = ReturnType<typeof useAg>["state"];

/** The sheet that rolls (and pays) for a roll on `noteId`, and fields to offer when it isn't connected yet. */
function rollerOf(state: State, noteId: string, via: string): { id: string | null; fields: AgField[] } {
  const id = via ? follow(state, noteId, via)[0] ?? null : noteId;
  if (id) return { id, fields: fieldsOf(state, id) };
  // Not held by anyone yet (e.g. the template): offer a character template's values.
  const t = Array.from(state.notes.values()).find((n) => n.isTemplate && (n.type === "character" || n.type === "npc") && fieldsOf(state, n.id).length);
  return { id: null, fields: t ? fieldsOf(state, t.id) : [] };
}

const numOrNull = (s: string) => (/^\s*-?\d+(\.\d+)?\s*$/.test(s) ? Number(s) : null);

/** "1d20 + 3" and "10 Energy · 2 Focus" for a roll, from the live values. */
export function rollSummary(state: State, action: Pick<AgAction, "noteId" | "options">): { roll: string | null; cost: string | null } {
  const spec = action.options?.roll;
  if (!spec) return { roll: null, cost: null };
  const roller = rollerOf(state, action.noteId, spec.via);
  const field = (key: string) => roller.fields.find((f) => f.key === key);
  const value = (expr: string): number | null => {
    const n = numOrNull(expr);
    if (n !== null) return n;
    const f = resolveRef(state, action.noteId, expr)[0];
    return f ? asNumber(effOf(f) as any) : null;
  };
  const count = value(spec.count) ?? 1;
  const dieN = value(spec.die);
  const dieKey = /\.([a-z0-9_]+)$/.exec(spec.die)?.[1] ?? spec.die;
  const die = dieN !== null ? String(dieN) : `(${(field(dieKey)?.label ?? titleCase(dieKey)).replace(/ die$/i, "")})`;
  const addF = spec.add ? field(spec.add) : undefined;
  const add = addF && roller.id ? asNumber(effOf(addF) as any) : 0;
  const bonus = value(spec.bonus) ?? 0;
  let roll = `${count}d${die}`;
  const mod = add + bonus;
  if (mod) roll += mod > 0 ? ` + ${mod}` : ` − ${-mod}`;
  else if (addF && !roller.id) roll += ` + ${addF.label}`;
  const cost = spec.costs
    .map((c) => ({ c, n: value(c.amount) }))
    .filter(({ n, c }) => n === null ? !!c.amount.trim() : n !== 0)
    .map(({ c, n }) => `${n ?? c.amount} ${field(c.key)?.label ?? titleCase(c.key)}`)
    .join(" · ");
  return { roll, cost: cost || null };
}

/** A roll's button with what it rolls and costs beside it. */
export function RollButton({ action, compact }: { action: AgActionView; compact?: boolean }) {
  const { state } = useAg();
  const sum = rollSummary(state, action);
  return (
    <span className="inline-flex flex-col items-start gap-0.5" data-no-open>
      <ActionButton actionId={action.id} compact={compact} look={{ height: compact ? 28 : 30, fontSize: 12 }} />
      {(sum.roll || sum.cost) && (
        <span className="text-[10px] leading-tight text-stone-400 pl-0.5" data-testid={`ag-roll-caption-${action.name}`}>
          {sum.roll && <span className="text-amber-200/90 font-mono">{sum.roll}</span>}
          {sum.roll && sum.cost && <span className="text-stone-600"> · </span>}
          {sum.cost && <span className="text-cyan-300/90">{sum.cost}</span>}
        </span>
      )}
    </span>
  );
}

/** The buttons a connected sheet shows on the character sheet (its "show on the character sheet" ones). */
export function RollsList({ noteId, compact }: { noteId: string; compact?: boolean }) {
  const { state } = useAg();
  const list = actionsOfNote(state.actions, noteId).filter((a) => a.options?.listed !== false);
  if (!list.length) return null;
  return <span className="flex flex-wrap items-start gap-1.5" data-no-open data-testid="ag-rolls-list">{list.map((a) => <RollButton key={a.id} action={a} compact={compact} />)}</span>;
}

// --------------------------------------------------------------------------- the Rolls block
export interface RollsBlockAttrs {
  /** Connection to the sheet that rolls and pays ("holder", "owner"; "" = this sheet). */
  via: string;
  /** Values on that sheet each new roll can cost (e.g. ["energy", "focus"]). */
  costs: string[];
  /** Colour of new roll buttons. */
  color?: string;
}

const DICE = [4, 6, 8, 10, 12, 20, 100];

/** Every roll on a sheet: buttons for everyone; the GM also gets the boxes to build and change them. */
export function RollsBlock({ noteId, attrs }: { noteId: string; attrs: RollsBlockAttrs }) {
  const { state, request, realViewer } = useAg();
  const { toast } = useToast();
  const play = usePlayView();
  const [editing, setEditing] = useState<boolean | null>(null);
  const gm = realViewer.isGM;
  const isEditing = gm && (editing ?? !play);
  const rolls = actionsOfNote(state.actions, noteId).filter((a) => !!a.options?.roll);
  const add = async () => {
    const roll: AgRollSpec = { via: attrs.via ?? "", count: "1", die: "20", add: "", bonus: "0", costs: (attrs.costs ?? []).map((key) => ({ key, amount: "0" })) };
    const sortOrder = Math.max(0, ...rolls.map((r) => r.options?.sortOrder ?? 0)) + 1;
    try {
      await request({ op: "action.upsert", action: { noteId, name: rolls.length ? `Roll ${rolls.length + 1}` : "Roll", steps: [], color: attrs.color || "#9f1239", options: { roll, icon: "die:d20", showName: true, showIcon: true, listed: true, sortOrder } } });
    } catch (e: any) { toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }); }
  };
  return (
    <div className="space-y-2" data-testid="ag-rolls">
      {gm && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(!isEditing)} className="h-7 px-2 rounded bg-stone-800 hover:bg-stone-700 text-[11px] text-stone-300 inline-flex items-center gap-1" data-testid="ag-rolls-edit">
            {isEditing ? <><Check className="h-3 w-3" /> Done</> : <><Pencil className="h-3 w-3" /> Edit rolls</>}
          </button>
          {isEditing && <button type="button" onClick={add} className="h-7 px-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] inline-flex items-center gap-1" data-testid="ag-rolls-add"><Plus className="h-3 w-3" /> New roll</button>}
        </div>
      )}
      {isEditing
        ? rolls.map((a, i) => <RollEditor key={a.id} action={a} attrs={attrs} first={i === 0} last={i === rolls.length - 1} neighbours={rolls} index={i} />)
        : <div className="flex flex-wrap gap-2">{rolls.map((a) => <RollButton key={a.id} action={a} />)}</div>}
      {!rolls.length && <div className="text-xs text-stone-500">{gm ? "No rolls yet — press New roll." : "No rolls."}</div>}
    </div>
  );
}

function Stepper({ value, onChange, testId, min = -999, max = 999 }: { value: string; onChange: (v: string) => void; testId?: string; min?: number; max?: number }) {
  const [text, setText] = useState(value);
  const [focus, setFocus] = useState(false);
  const shown = focus ? text : value;
  const n = numOrNull(value);
  const step = (d: number) => { if (n === null) return; onChange(String(Math.max(min, Math.min(max, n + d)))); };
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => step(-1)} disabled={n === null} className="h-7 w-6 grid place-items-center rounded border border-stone-700 bg-stone-800 text-stone-300 disabled:opacity-30"><Minus className="h-3 w-3" /></button>
      <input value={shown} onFocus={() => { setText(value); setFocus(true); }} onChange={(e) => setText(e.target.value)}
        onBlur={() => { setFocus(false); if (text.trim() !== value) onChange(text.trim() || "0"); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-7 w-14 text-center bg-stone-950 border border-amber-800/50 rounded text-xs font-mono" data-testid={testId} />
      <button type="button" onClick={() => step(1)} disabled={n === null} className="h-7 w-6 grid place-items-center rounded border border-stone-700 bg-stone-800 text-stone-300 disabled:opacity-30"><Plus className="h-3 w-3" /></button>
    </span>
  );
}

function Check1({ on, onChange, label, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return <label className="inline-flex items-center gap-1.5 text-[11px] text-stone-300 cursor-pointer"><input type="checkbox" className="accent-amber-500" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />{label}</label>;
}

/** One roll's boxes: name, icon, dice, what's added, costs, and where its button shows. */
function RollEditor({ action, attrs, first, last, neighbours, index }: { action: AgActionView; attrs: RollsBlockAttrs; first: boolean; last: boolean; neighbours: AgActionView[]; index: number }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const [name, setName] = useState(action.name);
  const [iconOpen, setIconOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const opts = action.options ?? {};
  const spec = opts.roll!;
  const roller = useMemo(() => rollerOf(state, action.noteId, spec.via), [state, action.noteId, spec.via]);
  const P = spec.via ? `@${spec.via}.` : "";
  const sum = rollSummary(state, action);

  const save = (patch: { name?: string; color?: string | null; options?: Partial<AgActionOptions>; roll?: Partial<AgRollSpec> }) => {
    const options: AgActionOptions = { ...opts, ...(patch.options ?? {}), roll: { ...spec, ...(patch.roll ?? {}) } };
    request({ op: "action.upsert", action: { id: action.id, noteId: action.noteId, name: patch.name ?? action.name, steps: action.steps ?? [], color: patch.color !== undefined ? patch.color : action.color, options } })
      .catch((e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  };
  const swap = (d: number) => {
    const other = neighbours[index + d];
    if (!other) return;
    const a = opts.sortOrder ?? index, b = other.options?.sortOrder ?? index + d;
    const same = a === b;
    save({ options: { sortOrder: same ? a + d : b } });
    request({ op: "action.upsert", action: { id: other.id, noteId: other.noteId, name: other.name, steps: other.steps ?? [], color: other.color, options: { ...(other.options ?? {}), sortOrder: same ? b : a } } }).catch(() => {});
  };
  const remove = async () => {
    try { await request({ op: "action.delete", id: action.id }); } catch (e: any) { toast({ title: "Couldn't delete it", description: e.message, variant: "destructive" }); }
  };

  // Die: a fixed size, or a die off the roller (e.g. their Might die).
  const dieItems: SelItem[] = [
    ...DICE.map((d) => ({ id: String(d), name: `d${d}`, sub: "Fixed", icon: <RollIcon icon={`die:d${d}`} size={20} /> })),
    ...roller.fields.filter((f) => /_die$/.test(f.key)).map((f) => ({ id: `${P}${f.key}`, icon: <RollIcon icon={`die:d${roller.id ? formatNum(effOf(f)) : "20"}`} size={20} />, name: f.label.replace(/ die$/i, ""), sub: `Their ${f.label.toLowerCase()}${roller.id ? ` (d${formatNum(effOf(f))})` : ""}` })),
  ];
  const addItems: SelItem[] = roller.fields
    .filter((f) => (f.type === "number" || f.type === "formula") && !/_die$|_dice$/.test(f.key) && f.options.resultType !== "text")
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((f) => ({ id: f.key, name: f.label, sub: roller.id ? `now ${formatNum(effOf(f))}` : f.key }));
  const costItems: SelItem[] = roller.fields.filter((f) => f.type === "number" && !spec.costs.some((c) => c.key === f.key)).map((f) => ({ id: f.key, name: f.label, sub: f.key }));
  const dieDisplay = dieItems.find((d) => d.id === spec.die)?.name ?? spec.die;
  const costLabel = (key: string) => roller.fields.find((f) => f.key === key)?.label ?? titleCase(key);

  return (
    <div className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: "#d4a24c55", background: "#1c1917" }} data-testid={`ag-roll-editor-${action.name}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setIconOpen(true)} className="h-8 w-8 grid place-items-center rounded border border-stone-700 bg-stone-800 text-amber-300 hover:border-amber-600 shrink-0" title="Button icon" data-testid="ag-roll-icon">
          {opts.icon ? <RollIcon icon={opts.icon} size={18} /> : <span className="text-[9px] text-stone-500">icon</span>}
        </button>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== action.name) save({ name: name.trim() }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-8 flex-1 min-w-0 bg-stone-950 border border-stone-700 rounded px-2 text-sm font-semibold" placeholder="Roll name (e.g. Attack)" data-testid="ag-roll-name" />
        <ColorInput value={action.color ?? "#9f1239"} onChange={(c) => save({ color: c })} title="Button colour" />
        <button type="button" disabled={first} onClick={() => swap(-1)} className="h-7 w-6 grid place-items-center text-stone-500 hover:text-stone-200 disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={last} onClick={() => swap(1)} className="h-7 w-6 grid place-items-center text-stone-500 hover:text-stone-200 disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={remove} className="h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400" title="Delete this roll" data-testid="ag-roll-delete"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-[11px] text-stone-400 flex items-center gap-1.5"><b className="text-stone-200">Roll</b> <span className="font-mono text-amber-300">{sum.roll}</span></div>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><span className="w-12 shrink-0">Dice</span><Stepper value={spec.count} min={1} max={100} onChange={(count) => save({ roll: { count } })} testId="ag-roll-count" /></div>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><span className="w-12 shrink-0">Die</span><div className="flex-1 min-w-0"><PickField value={spec.die} display={dieDisplay} items={dieItems} onChange={(die) => save({ roll: { die } })} title="Which die?" testId="ag-roll-die" /></div></div>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><span className="w-12 shrink-0">Adds</span><div className="flex-1 min-w-0"><PickField value={spec.add} items={addItems} noneLabel="— nothing" onChange={(add) => save({ roll: { add } })} title="Add which value of theirs? (a skill, an attribute…)" testId="ag-roll-add" /></div></div>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-400"><span className="w-12 shrink-0">Bonus</span><Stepper value={spec.bonus} onChange={(bonus) => save({ roll: { bonus } })} testId="ag-roll-bonus" /></div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] text-stone-400"><b className="text-stone-200">Cost</b> <span className="text-cyan-300">{sum.cost ?? "free"}</span></div>
          {spec.costs.map((c, ci) => (
            <div key={c.key} className="flex items-center gap-1.5 text-[11px] text-stone-400">
              <span className="w-12 shrink-0 truncate" title={costLabel(c.key)}>{costLabel(c.key)}</span>
              <Stepper value={c.amount} min={0} max={100000} onChange={(amount) => save({ roll: { costs: spec.costs.map((x, j) => (j === ci ? { ...x, amount } : x)) } })} testId={`ag-roll-cost-${c.key}`} />
              {!(attrs.costs ?? []).includes(c.key) && <button type="button" onClick={() => save({ roll: { costs: spec.costs.filter((_, j) => j !== ci) } })} className="h-7 w-6 grid place-items-center text-stone-500 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>}
            </div>
          ))}
          {costItems.length > 0 && <div className="w-40"><PickField value="" items={costItems} placeholder="+ Another cost…" onChange={(key) => key && save({ roll: { costs: [...spec.costs, { key, amount: "1" }] } })} title="What else does it spend?" /></div>}
          <div className="text-[10px] text-stone-500">Spent from {spec.via ? <>its <b>{spec.via}</b></> : "this sheet"} before rolling; if they don't have enough, nothing happens and they're told why.</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-800 pt-2">
        <Check1 on={opts.listed !== false} onChange={(listed) => save({ options: { listed } })} label="Button on the character sheet" testId="ag-roll-listed" />
        <Check1 on={opts.showName !== false} onChange={(showName) => save({ options: { showName } })} label="Show name" testId="ag-roll-showname" />
        <Check1 on={opts.showIcon !== false} onChange={(showIcon) => save({ options: { showIcon } })} label="Show icon" testId="ag-roll-showicon" />
        <span className="ml-auto inline-flex items-center gap-1.5">
          <button type="button" onClick={() => setStepsOpen(true)} className="h-7 px-2 rounded bg-stone-800 text-[11px] text-stone-300 inline-flex items-center gap-1" title="Extra steps after the roll (change values, messages…)"><Settings2 className="h-3 w-3" /> More steps{action.steps?.length ? ` (${action.steps.length})` : ""}</button>
          <ActionButton actionId={action.id} compact look={{ height: 28, fontSize: 12 }} />
        </span>
      </div>
      {opts.listed === false && <div className="text-[10px] text-stone-500 inline-flex items-center gap-1"><EyeOff className="h-3 w-3" /> Only on this sheet — not on the character sheet.</div>}
      {iconOpen && <IconChooser value={opts.icon} onClose={() => setIconOpen(false)} onPick={(icon) => { setIconOpen(false); save({ options: { icon: icon ?? undefined, showIcon: icon ? opts.showIcon : false } }); }} />}
      {stepsOpen && <ActionEditorDialog noteId={action.noteId} actionId={action.id} onClose={() => setStepsOpen(false)} onSaved={() => setStepsOpen(false)} />}
    </div>
  );
}

const formatNum = (v: unknown) => { const n = asNumber(v as any); return Number.isInteger(n) ? String(n) : n.toFixed(1); };
