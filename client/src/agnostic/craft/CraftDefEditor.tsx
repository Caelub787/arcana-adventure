// The setup of a blueprint, recipe or rune recipe — the block on its page.
// The GM builds it here (parts and their shapes, steps, ingredients, the
// sigil, what it makes and what each tier does); players see what it needs.
// It's kept as JSON in the sheet's "craft" value.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Hammer, FlaskConical, PenTool, Package, Eraser, ScrollText } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import {
  parseCraftConfig, emptyCraftConfig, FORGE_SHAPES, SIGILS, ALCHEMY_STEP_LABEL, CRAFT_TIERS, TIER_LABEL, TIER_COLOR, CRAFT_KIND_LABEL, TIER_BONUS, TIER_DICE, TIER_WORTH, moreDice,
  type CraftConfig, type CraftKind, type CraftNeed, type CraftTierEffect, type ForgeConfig, type AlchemyConfig, type RuneConfig, type AlchemyStepType, type CraftTier,
} from "@shared/agnostic/crafting";
import { useAg, usePerms } from "../hooks";
import { AgSelector, type SelItem } from "../float";
import { useToast } from "@/hooks/use-toast";
import { drawSigil, weaponPortrait } from "./render";

const KIND_OF_TYPE: Record<string, CraftKind> = { blueprint: "forge", recipe: "alchemy", rune_recipe: "rune" };

export function CraftDefBlock({ noteId }: { noteId: string }) {
  const { state, request, viewer } = useAg();
  const { canEditBody } = usePerms(noteId);
  const { toast } = useToast();
  const note = state.notes.get(noteId);
  const field = Array.from(state.fields.values()).find((f) => f.noteId === noteId && f.key === "craft");
  const config = useMemo(() => parseCraftConfig(field?.value), [field?.value]);
  // A scroll carries a copy of what it teaches (kept in step with the recipe) — it's read here, never edited.
  const scroll = Array.from(state.fields.values()).some((f) => f.noteId === noteId && f.key === "teaches");
  const editable = viewer.isGM && canEditBody && !scroll;
  const [giving, setGiving] = useState(false);
  if (!note) return null;
  const save = (c: CraftConfig) => {
    if (!field) return;
    request({ op: "field.set", id: field.id, value: JSON.stringify(c) }).catch((e: any) => toast({ title: "Couldn't save it", description: e.message, variant: "destructive" }));
  };
  if (!field || !config) {
    if (!editable) return <div className="text-xs text-stone-500 italic">Not set up yet.</div>;
    const make = async (kind: CraftKind) => {
      try {
        const c = JSON.stringify(emptyCraftConfig(kind));
        if (field) await request({ op: "field.set", id: field.id, value: c });
        else await request({ op: "field.create", noteId, label: "Crafting setup", key: "craft", type: "text", value: c });
      } catch (e: any) { toast({ title: "Couldn't set it up", description: e.message, variant: "destructive" }); }
    };
    const suggested = KIND_OF_TYPE[note.type];
    return (
      <div className="rounded-xl border border-dashed border-amber-700/60 p-3 space-y-2" data-testid="craft-def-setup">
        <div className="text-xs text-stone-300">Make this sheet a crafting recipe:</div>
        <div className="flex flex-wrap gap-1.5">
          {(["forge", "alchemy", "rune"] as CraftKind[]).map((k) => (
            <button key={k} type="button" onClick={() => make(k)} className={`h-8 px-3 rounded-lg border text-xs inline-flex items-center gap-1.5 ${k === suggested ? "border-amber-500 text-amber-100 bg-amber-500/10" : "border-stone-700 text-stone-300"}`} data-testid={`craft-def-make-${k}`}>
              {k === "forge" ? <Hammer className="h-3.5 w-3.5" /> : k === "alchemy" ? <FlaskConical className="h-3.5 w-3.5" /> : <PenTool className="h-3.5 w-3.5" />}{k === "forge" ? "Blueprint" : k === "alchemy" ? "Alchemy recipe" : "Rune recipe"}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-3 space-y-3" data-testid={`craft-def-${config.kind}`}>
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-wide text-amber-400/80 flex-1">{scroll ? `Teaches — ${CRAFT_KIND_LABEL[config.kind]}` : `${CRAFT_KIND_LABEL[config.kind]}${editable ? " — setup" : ""}`}</div>
        {editable && <button type="button" onClick={() => setGiving(true)} className="h-7 px-2.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium inline-flex items-center gap-1.5" title="A scroll that teaches this — whoever carries one knows it" data-testid="craft-def-make-scroll"><ScrollText className="h-3.5 w-3.5" /> Make a scroll</button>}
      </div>
      {giving && <ScrollGiver defId={noteId} onClose={() => setGiving(false)} />}
      <DefSummary c={config} />
      {!editable && config.kind !== "rune" && <StatsEditor kind={config.kind} outputId={config.output} effects={config.effects ?? []} editable={false} onChange={() => {}} note="what the made item gets by how well it's made" />}
      {!editable && config.kind === "alchemy" && !(config.effects ?? []).length && <BrewDefaults />}
      {!editable && config.kind === "rune" && config.effect && (
        <div className="space-y-1"><Head>{config.effect.key.replace(/_/g, " ")} by craftsmanship</Head><TierTable values={config.effect.values} editable={false} tiers={["default", "slight", "huge"]} onChange={() => {}} /></div>
      )}
      {editable && <div className="border-t border-stone-800 pt-2 text-[10px] uppercase tracking-wide text-stone-500">Setup (GM)</div>}
      {editable && config.kind === "forge" && <ForgeDef c={config} save={save} editable={editable} />}
      {editable && config.kind === "alchemy" && <AlchemyDef c={config} save={save} editable={editable} />}
      {editable && config.kind === "rune" && <RuneDef c={config} save={save} editable={editable} />}
      {!editable && config.kind === "rune" && <div className="max-w-[160px]"><SigilPad strokes={config.sigil} editable={false} onChange={() => {}} /></div>}
    </div>
  );
}

/** The GM makes a scroll of a recipe: straight into a character's inventory, or kept with the recipe to hand out later. */
function ScrollGiver({ defId, onClose }: { defId: string; onClose: () => void }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const NONE = "__keep";
  const items: SelItem[] = [
    { id: NONE, name: "Just make it (kept with the recipe)", group: "Make", icon: <ScrollText className="h-4 w-4" /> },
    ...Array.from(state.notes.values()).filter((n) => !n.isTemplate && (n.type === "character" || n.type === "npc")).sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => ({ id: n.id, name: n.name || "Untitled", image: n.portrait, group: "Give it to", icon: <Package className="h-4 w-4" /> })),
  ];
  const make = (id: string) => {
    onClose();
    request<{ name: string }>({ op: "craft.makeScroll", defId, characterId: id === NONE ? null : id })
      .then((r) => toast({ title: `${r.name} made`, description: id === NONE ? "It's in the recipe's folder." : `${state.notes.get(id)?.name ?? "They"} can use it now.` }))
      .catch((e: any) => toast({ title: "Couldn't make the scroll", description: e.message, variant: "destructive" }));
  };
  return <AgSelector title="Make a scroll" items={items} onPick={make} onClose={onClose} testId="craft-scroll-giver" />;
}

// --------------------------------------------------------------------------- what it takes (everyone)
/** What a recipe needs and makes, at a glance — for the players who read it, and on its scrolls. */
function DefSummary({ c }: { c: CraftConfig }) {
  const { state } = useAg();
  const name = (id?: string | null) => (id ? state.notes.get(id)?.name : undefined);
  const chip = "inline-flex items-center gap-1 h-6 px-2 rounded-md border border-stone-700 bg-stone-900 text-[11px] text-stone-200";
  const needs = (list: CraftNeed[]) => list.map((n, i) => <span key={i} className={chip}>{n.qty > 1 ? `${n.qty}× ` : ""}{n.name || "?"}</span>);
  const rows: Array<[string, React.ReactNode]> = [];
  if (c.kind === "forge") {
    rows.push(["Parts", <>{c.parts.map((p) => <span key={p.key} className={chip}>{p.label}{p.optional ? <span className="text-stone-500">optional</span> : null}</span>)}</>]);
    rows.push(["Materials", <span className="text-[11px] text-stone-300">One per part — a metal for blades and extras (heated at the forge); wood, leather or metal for handles.</span>]);
    rows.push(["Weapon", <span className="text-[11px] text-stone-300">d{c.damageDie} damage{name(c.output) ? ` · makes ${name(c.output)}` : ""}</span>]);
  }
  if (c.kind === "alchemy") {
    rows.push(["Ingredients", c.ingredients.length ? <>{needs(c.ingredients)}</> : <span className="text-[11px] text-stone-500">none</span>]);
    rows.push(["Steps", <span className="text-[11px] text-stone-300">{c.steps.map((s) => ALCHEMY_STEP_LABEL[s.type]).join(" → ") || "none"}</span>]);
    if (name(c.output)) rows.push(["Makes", <span className={chip}>{name(c.output)}</span>]);
  }
  if (c.kind === "rune") {
    rows.push(["Ingredients", c.ingredients.length ? <>{needs(c.ingredients)}</> : <span className="text-[11px] text-stone-500">none</span>]);
    if (c.tools.length) rows.push(["Tool", <>{c.tools.map((t, i) => <span key={i} className={chip}>{t.name}</span>)}<span className="text-[10px] text-stone-500">any one</span></>]);
    rows.push(["Ink", <span className="text-[11px] text-stone-300">{c.needsInk ? "Needs a liquid or ink" : "Optional (colours the rune)"}</span>]);
    rows.push(["Socket", <span className="text-[11px] text-stone-300">Takes one free rune socket on the item</span>]);
  }
  return (
    <div className="space-y-1.5" data-testid="craft-def-summary">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-stone-500 w-20 shrink-0 pt-1">{k}</span>
          <div className="flex flex-wrap items-center gap-1 min-w-0">{v}</div>
        </div>
      ))}
    </div>
  );
}

/** Suggested values a craft's output stats change (any value on the made item works). */
const STAT_KEYS: Record<CraftKind, Array<[string, string]>> = {
  forge: [["damage_bonus", "Damage bonus"], ["accuracy", "Accuracy"], ["durability", "Durability"], ["value", "Worth"], ["weight", "Weight"]],
  alchemy: [["potency", "Potency"], ["value", "Worth"], ["qty", "How many"]],
  rune: [],
};
const HIDDEN_KEYS = new Set(["craft", "craft_tier", "inert", "qty", "equipped", "teaches", "sell_value", "durability_max", "rune_sockets", "station_for", "station_bonus", "station_recipes", "base_portrait"]);
/** What a tier's cell holds for a value: a number, dice / words, or one of a choice's options. */
type Cell = { kind: "num" } | { kind: "text" } | { kind: "choice"; choices: string[] };
/** The output's own values a recipe can change by tier (its dice, numbers and choices), with a sensible start for each. */
function useOutputStats(outputId?: string | null) {
  const { state } = useAg();
  return useMemo(() => {
    const out: Array<{ key: string; label: string; cell: Cell; start: CraftTierEffect }> = [];
    if (!outputId) return out;
    for (const f of Array.from(state.fields.values())) {
      if (f.noteId !== outputId || HIDDEN_KEYS.has(f.key)) continue;
      const label = f.label || f.key;
      if (f.type === "dice" && f.formula) out.push({ key: f.key, label, cell: { kind: "text" }, start: { key: f.key, mode: "set", values: Object.fromEntries(CRAFT_TIERS.filter((t) => t !== "fail").map((t) => [t, moreDice(f.formula!, TIER_DICE[t])])) } });
      else if (f.type === "select" && Array.isArray(f.options?.choices) && f.options.choices.length) out.push({ key: f.key, label, cell: { kind: "choice", choices: f.options.choices as string[] }, start: { key: f.key, mode: "set", values: { default: String(f.value ?? f.options.choices[0]) } } });
      else if (f.type === "number") out.push({ key: f.key, label, cell: { kind: "num" }, start: { key: f.key, mode: "add", values: { fail: 0, weak: 0, default: 0, slight: 0, huge: 0 } } });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [state.fields, outputId]);
}
const statLabel = (kind: CraftKind, key: string) => STAT_KEYS[kind].find(([k]) => k === key)?.[1] ?? key.replace(/_/g, " ");
/**
 * What the made item gets by craftsmanship: for each value, what each tier gives — a number (set to it, or added to
 * what the crafting gave: a forged weapon's damage comes from how well its blade was hammered; "add" builds on that),
 * or dice, a choice or words (set). The made item's own values are offered first, so a Fine potion can roll more dice
 * or heal a worse wound.
 */
function StatsEditor({ kind, effects, onChange, editable, note, outputId }: { kind: CraftKind; effects: CraftTierEffect[]; onChange: (e: CraftTierEffect[]) => void; editable: boolean; note: string; outputId?: string | null }) {
  const [adding, setAdding] = useState("");
  const own = useOutputStats(outputId);
  const label = (key: string) => own.find((o) => o.key === key)?.label ?? statLabel(kind, key);
  const cellOf = (e: CraftTierEffect): Cell => own.find((o) => o.key === e.key)?.cell ?? (Object.values(e.values).some((v) => typeof v === "string") ? { kind: "text" } : { kind: "num" });
  const offered = [...own.map((o) => ({ key: o.key, label: o.label, start: o.start })), ...STAT_KEYS[kind].filter(([k]) => !own.some((o) => o.key === k)).map(([k, l]) => ({ key: k, label: l, start: { key: k, mode: "add" as const, values: { fail: 0, weak: 0, default: 0, slight: 0, huge: 0 } } }))]
    .filter((o) => !effects.some((e) => e.key === o.key));
  const add = (key: string) => { const k = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"); if (!k || effects.some((e) => e.key === k)) return; onChange([...effects, { key: k, mode: "add", values: { fail: 0, weak: 0, default: 0, slight: 0, huge: 0 } }]); setAdding(""); };
  if (!editable && !effects.length) return null;
  return (
    <div className="space-y-1.5" data-testid="craft-def-stats">
      <Head>Output by craftsmanship <span className="text-[10px] text-stone-500 font-normal">— {note}</span></Head>
      {effects.map((e, i) => {
        const cell = cellOf(e);
        return (
          <div key={e.key} className="rounded-md border border-stone-800 bg-stone-900/60 p-1.5 space-y-1" data-testid={`craft-def-stat-${e.key}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-stone-100 flex-1 truncate">{label(e.key)}</span>
              {cell.kind === "num" ? (editable ? (
                <select value={e.mode ?? "add"} onChange={(ev) => onChange(effects.map((x, j) => (j === i ? { ...x, mode: ev.target.value as "set" | "add" } : x)))} className={inputCls} data-testid={`craft-def-stat-mode-${e.key}`}>
                  <option value="add">adds</option><option value="set">sets it to</option>
                </select>
              ) : <span className="text-[10px] text-stone-500">{e.mode === "set" ? "set to" : "adds"}</span>) : <span className="text-[10px] text-stone-500">{editable ? "becomes (blank: unchanged)" : "becomes"}</span>}
              {editable && <Icon title="Remove" onClick={() => onChange(effects.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Icon>}
            </div>
            <TierTable values={e.values} cell={cell} signed={cell.kind === "num" && e.mode !== "set"} editable={editable} onChange={(values) => onChange(effects.map((x, j) => (j === i ? { ...x, mode: cell.kind === "num" ? x.mode : "set", values } : x)))} testPrefix={`craft-def-stat-${e.key}`} />
          </div>
        );
      })}
      {editable && (
        <div className="flex flex-wrap items-center gap-1">
          {offered.map((o) => <button key={o.key} type="button" onClick={() => onChange([...effects, o.start])} className="h-7 px-2 rounded-md border border-stone-700 bg-stone-900 text-[11px] text-stone-300 hover:border-amber-700 inline-flex items-center gap-1" data-testid={`craft-def-stat-add-${o.key}`}><Plus className="h-3 w-3" />{o.label}</button>)}
          <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(adding); e.stopPropagation(); }} placeholder="other value…" className={`${inputCls} w-28 font-mono`} />
          {adding && <button type="button" onClick={() => add(adding)} className="h-7 px-2 rounded-md border border-stone-700 text-[11px] text-stone-200">Add</button>}
        </div>
      )}
    </div>
  );
}

/** What every brew does by grade when its recipe doesn't say. */
function BrewDefaults() {
  return (
    <div className="text-[11px] text-stone-400 rounded-md border border-stone-800 bg-stone-900/60 p-2" data-testid="craft-def-brew-defaults">
      Unless set above, a better brew is stronger: <span style={{ color: TIER_COLOR.weak }}>Weak</span> rolls one die fewer, <span style={{ color: TIER_COLOR.slight }}>Fine</span> one die more, <span style={{ color: TIER_COLOR.huge }}>Masterwork</span> two more — with potency {TIER_BONUS.weak} / +{TIER_BONUS.slight} / +{TIER_BONUS.huge} and worth ×{TIER_WORTH.weak} / ×{TIER_WORTH.slight} / ×{TIER_WORTH.huge}. A failed brew is inert.
    </div>
  );
}

// --------------------------------------------------------------------------- shared bits
const inputCls = "h-7 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs text-stone-100 min-w-0";
function Text({ value, onChange, disabled, className = "", placeholder, testId }: { value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; placeholder?: string; testId?: string }) {
  const [d, setD] = useState<string | null>(null);
  return <input data-testid={testId} inputMode={/font-mono/.test(className) ? "decimal" : undefined} value={d ?? value} disabled={disabled} placeholder={placeholder} onChange={(e) => setD(e.target.value)} onBlur={() => { if (d !== null && d !== value) onChange(d); setD(null); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} className={`${inputCls} ${className}`} />;
}
function Num({ value, onChange, disabled, min, max, className = "w-14", testId }: { value: number | undefined; onChange: (v: number) => void; disabled?: boolean; min?: number; max?: number; className?: string; testId?: string }) {
  return <Text value={value === undefined ? "" : String(value)} disabled={disabled} className={`${className} text-center font-mono`} testId={testId} onChange={(v) => { const n = Number(v); if (Number.isFinite(n)) onChange(Math.max(min ?? -1e6, Math.min(max ?? 1e6, n))); }} />;
}
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900/60 p-1.5">{children}</div>;
const Head = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => <div className="flex items-center gap-2"><div className="text-xs font-semibold text-stone-200 flex-1">{children}</div>{right}</div>;
const AddBtn = ({ onClick, label, testId }: { onClick: () => void; label: string; testId?: string }) => <button type="button" onClick={onClick} className="h-7 px-2 rounded border border-dashed border-stone-600 text-[11px] text-stone-300 hover:border-amber-600 inline-flex items-center gap-1" data-testid={testId}><Plus className="h-3 w-3" />{label}</button>;
const Icon = ({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title: string }) => <button type="button" onClick={onClick} title={title} className="h-7 w-7 grid place-items-center rounded text-stone-400 hover:text-stone-100 hover:bg-stone-800">{children}</button>;
const move = <T,>(a: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; };

/** Pick an item sheet (an original or a template) — what's needed, or what's made. */
function useItemPicker() {
  const { state } = useAg();
  const [pick, setPick] = useState<null | { title: string; onPick: (n: AgNote) => void }>(null);
  const items: SelItem[] = Array.from(state.notes.values()).filter((n) => n.type === "item" && !n.copyOf)
    .sort((a, b) => Number(b.isTemplate) - Number(a.isTemplate) || a.name.localeCompare(b.name))
    .map((n) => ({ id: n.id, name: n.name || "Untitled", image: n.portrait, group: n.isTemplate ? "Templates" : "Items", icon: <Package className="h-4 w-4" /> }));
  const ui = pick && <AgSelector title={pick.title} items={items} onPick={(id) => { const n = state.notes.get(id); if (n) pick.onPick(n); setPick(null); }} onClose={() => setPick(null)} testId="craft-def-picker" />;
  return { open: (title: string, onPick: (n: AgNote) => void) => setPick({ title, onPick }), ui, name: (id?: string | null) => (id ? state.notes.get(id)?.name ?? "(gone)" : "") };
}

function NeedsEditor({ label, list, onChange, editable, consumed }: { label: string; list: CraftNeed[]; onChange: (l: CraftNeed[]) => void; editable: boolean; consumed: boolean }) {
  const p = useItemPicker();
  return (
    <div className="space-y-1">
      <Head right={editable && <AddBtn label="Add" testId={`craft-def-add-${label}`} onClick={() => p.open(`Add to ${label.toLowerCase()}`, (n) => onChange([...list, { noteId: n.id, name: n.name, qty: 1, consumed }]))} />}>{label}</Head>
      {list.map((n, i) => (
        <Row key={i}>
          <Num value={n.qty} min={1} max={99} disabled={!editable} onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, qty: v } : x)))} className="w-10" />
          <span className="text-xs text-stone-500">×</span>
          <Text value={n.name} disabled={!editable} className="flex-1" onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
          {n.noteId && <span className="text-[10px] text-emerald-400" title="Also matches copies of that sheet">linked</span>}
          {editable && <Icon title="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Icon>}
        </Row>
      ))}
      {!list.length && <div className="text-[11px] text-stone-500">None.</div>}
      {p.ui}
    </div>
  );
}

function OutputEditor({ label, id, onChange, editable, hint }: { label: string; id: string | null | undefined; onChange: (id: string | null) => void; editable: boolean; hint: string }) {
  const p = useItemPicker();
  return (
    <div className="space-y-1">
      <Head>{label}</Head>
      <Row>
        <span className="text-xs text-stone-200 flex-1 truncate">{id ? p.name(id) : <span className="text-stone-500">{hint}</span>}</span>
        {editable && <button type="button" onClick={() => p.open(label, (n) => onChange(n.id))} className="h-7 px-2 rounded border border-stone-600 text-[11px] text-stone-200" data-testid={`craft-def-output-${label}`}>Choose…</button>}
        {editable && id && <Icon title="Clear" onClick={() => onChange(null)}><Trash2 className="h-3.5 w-3.5" /></Icon>}
      </Row>
      {p.ui}
    </div>
  );
}

function TierTable({ values, onChange, editable, tiers = CRAFT_TIERS, testPrefix, cell = { kind: "num" }, signed = true }: { values: Partial<Record<CraftTier, number | string>>; onChange: (v: Partial<Record<CraftTier, number | string>>) => void; editable: boolean; tiers?: CraftTier[]; testPrefix?: string; cell?: Cell; signed?: boolean }) {
  const put = (t: CraftTier, v: number | string | undefined) => { const next = { ...values }; if (v === undefined || v === "") delete next[t]; else next[t] = v; onChange(next); };
  const shown = (v: number | string | undefined) => (v === undefined ? "—" : typeof v === "number" ? `${signed && v > 0 ? "+" : ""}${v}` : v);
  return (
    <div className="grid grid-cols-5 gap-1 max-w-[26rem]">
      {tiers.map((t) => (
        <label key={t} className="flex flex-col items-center gap-0.5 min-w-0">
          <span className="text-[9px] uppercase tracking-wide truncate max-w-full" style={{ color: TIER_COLOR[t] }}>{TIER_LABEL[t]}</span>
          {!editable ? <span className="h-7 w-full px-1 grid place-items-center rounded border border-stone-800 text-xs font-mono text-stone-200 truncate" title={String(values[t] ?? "")}>{shown(values[t])}</span>
            : cell.kind === "num" ? <Num value={typeof values[t] === "number" ? (values[t] as number) : undefined} onChange={(v) => put(t, v)} className="w-full" testId={testPrefix ? `${testPrefix}-${t}` : undefined} />
            : cell.kind === "choice" ? (
              <select value={String(values[t] ?? "")} onChange={(e) => put(t, e.target.value)} className={`${inputCls} w-full appearance-none text-center !px-0.5`} data-testid={testPrefix ? `${testPrefix}-${t}` : undefined}>
                <option value="">—</option>{cell.choices.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : <Text value={values[t] === undefined ? "" : String(values[t])} onChange={(v) => put(t, v.trim())} className="w-full text-center font-mono" placeholder="—" testId={testPrefix ? `${testPrefix}-${t}` : undefined} />}
        </label>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- blueprint
function ForgeDef({ c, save, editable }: { c: ForgeConfig; save: (c: ForgeConfig) => void; editable: boolean }) {
  const preview = useMemo(() => { try { return weaponPortrait(c.parts.map((p) => ({ part: p, color: p.role === "handle" ? "#7c5a3a" : p.role === "extra" ? "#b45309" : "#cbd5e1" })), 220); } catch { return ""; } }, [c.parts]);
  const set = (p: Partial<ForgeConfig>) => save({ ...c, ...p });
  return (
    <div className="grid sm:grid-cols-[1fr_180px] gap-3">
      <div className="space-y-2">
        <Head right={editable && c.parts.length < 8 && <AddBtn label="Part" testId="craft-def-add-part" onClick={() => set({ parts: [...c.parts, { key: `part${c.parts.length + 1}`, label: "Guard", role: "extra", optional: true, shape: "guard" }] })} />}>Parts</Head>
        {c.parts.map((p, i) => (
          <Row key={i}>
            <Text value={p.label} disabled={!editable} className="w-24" onChange={(v) => set({ parts: c.parts.map((x, j) => (j === i ? { ...x, label: v, key: x.key || v.toLowerCase().replace(/[^a-z0-9]+/g, "_") } : x)) })} />
            <select value={p.role} disabled={!editable} onChange={(e) => set({ parts: c.parts.map((x, j) => (j === i ? { ...x, role: e.target.value as any } : x)) })} className={inputCls}>
              <option value="blade">Blade (damage)</option><option value="handle">Handle (accuracy)</option><option value="extra">Extra</option>
            </select>
            <select value={p.shape} disabled={!editable} onChange={(e) => set({ parts: c.parts.map((x, j) => (j === i ? { ...x, shape: e.target.value } : x)) })} className={inputCls} data-testid={`craft-def-shape-${i}`}>
              {Object.entries(FORGE_SHAPES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <svg viewBox="0 0 100 40" className="h-5 w-12"><polygon points={(FORGE_SHAPES[p.shape]?.points ?? []).map(([x, y]) => `${x},${y}`).join(" ")} fill="#94a3b8" /></svg>
            <label className="text-[11px] text-stone-400 inline-flex items-center gap-1"><input type="checkbox" checked={!!p.optional} disabled={!editable} onChange={(e) => set({ parts: c.parts.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)) })} />optional</label>
            {editable && <><Icon title="Up" onClick={() => set({ parts: move(c.parts, i, -1) })}><ArrowUp className="h-3.5 w-3.5" /></Icon><Icon title="Remove" onClick={() => set({ parts: c.parts.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Icon></>}
          </Row>
        ))}
        <Row>
          <span className="text-xs text-stone-400">Damage die</span>
          <select value={c.damageDie} disabled={!editable} onChange={(e) => set({ damageDie: Number(e.target.value) })} className={inputCls}>{[4, 6, 8, 10, 12, 20].map((d) => <option key={d} value={d}>d{d}</option>)}</select>
          <span className="text-[10px] text-stone-500">the blade's quality adds to it; handles add accuracy</span>
        </Row>
        <OutputEditor label="Makes" id={c.output} editable={editable} onChange={(output) => set({ output })} hint="a plain item — choose a weapon template (its Strike / Damage rolls follow the parts)" />
        <OutputEditor label="Parts are made as" id={c.partTemplate} editable={editable} onChange={(partTemplate) => set({ partTemplate })} hint="a plain item — choose a Part template" />
        <StatsEditor kind="forge" effects={c.effects ?? []} editable={editable} onChange={(effects) => set({ effects })} note="the weapon's numbers by how well it was made (without these, they come from the parts as forged)" />
      </div>
      {preview && <img src={preview} alt="" className="w-full rounded-lg border border-stone-800" />}
    </div>
  );
}

// --------------------------------------------------------------------------- alchemy
function AlchemyDef({ c, save, editable }: { c: AlchemyConfig; save: (c: AlchemyConfig) => void; editable: boolean }) {
  const set = (p: Partial<AlchemyConfig>) => save({ ...c, ...p });
  const amountLabel: Record<AlchemyStepType, string> = { mix: "seconds", dice: "cuts", heat: "°", add: "moment %", grind: "strokes", strain: "", rest: "seconds" };
  return (
    <div className="space-y-3">
      <NeedsEditor label="Ingredients" list={c.ingredients} onChange={(ingredients) => set({ ingredients })} editable={editable} consumed />
      <div className="space-y-1">
        <Head right={editable && c.steps.length < 20 && <AddBtn label="Step" testId="craft-def-add-step" onClick={() => set({ steps: [...c.steps, { id: `s${Date.now().toString(36)}`, type: "mix", amount: 6 }] })} />}>Steps (in order)</Head>
        {c.steps.map((st, i) => (
          <Row key={st.id}>
            <span className="text-xs text-emerald-400 font-mono w-4">{i + 1}</span>
            <select value={st.type} disabled={!editable} onChange={(e) => set({ steps: c.steps.map((x, j) => (j === i ? { ...x, type: e.target.value as AlchemyStepType } : x)) })} className={inputCls} data-testid={`craft-def-step-${i}`}>
              {Object.entries(ALCHEMY_STEP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {["dice", "add", "grind"].includes(st.type) && (
              <select value={st.ingredient ?? ""} disabled={!editable} onChange={(e) => set({ steps: c.steps.map((x, j) => (j === i ? { ...x, ingredient: e.target.value || undefined } : x)) })} className={`${inputCls} max-w-[140px]`}>
                <option value="">(ingredient)</option>{c.ingredients.map((n, k) => <option key={k} value={n.name}>{n.name}</option>)}
              </select>
            )}
            {amountLabel[st.type] && <><Num value={st.amount} disabled={!editable} min={0} max={600} onChange={(v) => set({ steps: c.steps.map((x, j) => (j === i ? { ...x, amount: v } : x)) })} /><span className="text-[10px] text-stone-500">{amountLabel[st.type]}</span></>}
            {editable && <span className="ml-auto inline-flex"><Icon title="Up" onClick={() => set({ steps: move(c.steps, i, -1) })}><ArrowUp className="h-3.5 w-3.5" /></Icon><Icon title="Down" onClick={() => set({ steps: move(c.steps, i, 1) })}><ArrowDown className="h-3.5 w-3.5" /></Icon><Icon title="Remove" onClick={() => set({ steps: c.steps.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Icon></span>}
          </Row>
        ))}
      </div>
      <OutputEditor label="Makes" id={c.output} editable={editable} onChange={(output) => set({ output })} hint="a plain item — choose a potion (its rolls can add “potency”)" />
      <StatsEditor kind="alchemy" outputId={c.output} effects={c.effects ?? []} editable={editable} onChange={(effects) => set({ effects })} note="set what each grade of brew gives; a failed brew is inert" />
      {!(c.effects ?? []).length && <BrewDefaults />}
    </div>
  );
}

// --------------------------------------------------------------------------- rune
function RuneDef({ c, save, editable }: { c: RuneConfig; save: (c: RuneConfig) => void; editable: boolean }) {
  const set = (p: Partial<RuneConfig>) => save({ ...c, ...p });
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-[200px_1fr] gap-3">
        <SigilPad strokes={c.sigil} editable={editable} onChange={(sigil) => set({ sigil })} />
        <div className="space-y-2">
          {editable && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(SIGILS).map(([k, s]) => <button key={k} type="button" onClick={() => set({ sigil: s.strokes })} className="h-7 px-2 rounded border border-violet-800 text-[11px] text-violet-200 hover:bg-violet-900/40" data-testid={`craft-def-sigil-${k}`}>{s.label}</button>)}
            </div>
          )}
          <div className="space-y-1">
            <Head>Effect on the item</Head>
            <Row>
              <span className="text-xs text-stone-400">Raises</span>
              <Text value={c.effect?.key ?? ""} disabled={!editable} placeholder="damage_bonus" className="w-32 font-mono" onChange={(v) => set({ effect: v.trim() ? { key: v.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"), values: c.effect?.values ?? {} } : null })} />
              <span className="text-[10px] text-stone-500">a value on the item it's set into</span>
            </Row>
            {c.effect && <TierTable values={c.effect.values} editable={editable} tiers={["default", "slight", "huge"]} testPrefix="craft-def-rune-effect" onChange={(values) => set({ effect: { ...c.effect!, values: Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "number")) as Partial<Record<CraftTier, number>> } })} />}
          </div>
          <label className="text-xs text-stone-300 inline-flex items-center gap-1.5"><input type="checkbox" checked={!!c.needsInk} disabled={!editable} onChange={(e) => set({ needsInk: e.target.checked })} /> Needs a liquid or ink</label>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <NeedsEditor label="Ingredients" list={c.ingredients} onChange={(ingredients) => set({ ingredients })} editable={editable} consumed />
        <NeedsEditor label="Tools" list={c.tools} onChange={(tools) => set({ tools })} editable={editable} consumed={false} />
      </div>
      <OutputEditor label="Makes" id={c.output} editable={editable} onChange={(output) => set({ output })} hint="a plain rune item — choose a Rune template" />
    </div>
  );
}

/** Draw the sigil (the GM), or see it. */
function SigilPad({ strokes, editable, onChange }: { strokes: number[][][]; editable: boolean; onChange: (s: number[][][]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cur = useRef<number[][] | null>(null);
  const [local, setLocal] = useState(strokes);
  useEffect(() => setLocal(strokes), [strokes]);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, 200, 200);
    ctx.strokeStyle = "rgba(167,139,250,0.15)"; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(k * 50, 0); ctx.lineTo(k * 50, 200); ctx.moveTo(0, k * 50); ctx.lineTo(200, k * 50); ctx.stroke(); }
    drawSigil(ctx, cur.current ? [...local, cur.current] : local, 100, 100, 180, { color: "#c4b5fd", glow: 40, style: "Drawn", width: 4 });
  });
  // The pad draws the sigil's 0–100 box at 180 px round its centre: undo that.
  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height].map((f) => Math.max(0, Math.min(100, Math.round(((f * 200 - 100) / 1.8 + 50) * 10) / 10))); };
  return (
    <div className="space-y-1">
      <canvas ref={ref} width={200} height={200} className={`w-full aspect-square rounded-lg border border-violet-900 bg-[radial-gradient(circle,#1e1b4b,#0c0a09_75%)] touch-none ${editable ? "cursor-crosshair" : ""}`} data-testid="craft-def-sigil-pad"
        onPointerDown={(e) => { if (!editable) return; e.currentTarget.setPointerCapture(e.pointerId); cur.current = [pt(e)]; setLocal([...local]); }}
        onPointerMove={(e) => { if (!cur.current) return; cur.current.push(pt(e)); setLocal([...local]); }}
        onPointerUp={() => { if (!cur.current) return; const st = cur.current; cur.current = null; if (st.length > 1) { const next = [...local, st.filter((_, k) => k % 2 === 0 || k === st.length - 1)]; setLocal(next); onChange(next); } }} />
      {editable && <button type="button" onClick={() => onChange([])} className="h-7 px-2 rounded border border-stone-700 text-[11px] text-stone-300 inline-flex items-center gap-1"><Eraser className="h-3 w-3" /> Clear and draw your own</button>}
    </div>
  );
}
