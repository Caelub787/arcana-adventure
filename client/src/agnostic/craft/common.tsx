// Pieces the crafting tools share: who's crafting, what they carry, item
// tiles, the result banner, and the Quick Craft button.
import React from "react";
import { Dices, Loader2, Sparkles, Leaf, PenTool, Droplet, FlaskRound, Anvil, CircleAlert, ScrollText, Lock } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { TIER_COLOR, TIER_LABEL, parseCraftConfig, stationAllows, CRAFT_DEF_TYPE, type CraftKind, type CraftTier, type CraftConfig } from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { Portrait } from "../widgets";
import { triggerRollNotification } from "@/components/game/RollNotification";
import { inventoryOf, qtyOf, valueOn, toolEffectsOn } from "./session";

export const SKILL_KEY: Record<CraftKind, string> = { forge: "blacksmithing", alchemy: "alchemy", rune: "rune_making" };

export function useCrafter(characterId: string) {
  const { state } = useAg();
  const character = state.notes.get(characterId);
  const inventory = inventoryOf(state, characterId);
  return { character, inventory };
}

export interface KnownDef<C extends CraftConfig = CraftConfig> { /** The scroll (what ops are sent with). */ id: string; /** The recipe sheet it teaches. */ defId: string; name: string; config: C; scroll: AgNote; /** This station can make it (a station can be limited to some recipes). */ here: boolean }
/** The recipes a character knows: one for each scroll in their inventory that teaches one of this craft (and whether the station makes it). */
export function useDefs<C extends CraftConfig = CraftConfig>(kind: CraftKind, characterId: string, stationId?: string): Array<KnownDef<C>> {
  const { state } = useAg();
  const allowed = stationId ? valueOn(state, stationId, "station_recipes") : undefined;
  const out = new Map<string, KnownDef<C>>();
  for (const n of inventoryOf(state, characterId)) {
    const defId = String(valueOn(state, n.id, "teaches") ?? "");
    if (!defId || out.has(defId)) continue;
    const def = state.notes.get(defId);
    // The recipe's own setup when it's visible here, else the copy the scroll carries (kept in step with it).
    const config = parseCraftConfig((def && valueOn(state, defId, "craft")) ?? valueOn(state, n.id, "craft"));
    if (!config || config.kind !== kind || (def && def.type !== CRAFT_DEF_TYPE[kind])) continue;
    out.set(defId, { id: n.id, defId, name: def?.name ?? String(valueOn(state, n.id, "teaches_name") ?? n.name), config: config as C, scroll: n, here: stationAllows(allowed, defId) });
  }
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Why something can't be done yet, said plainly (instead of a silently greyed-out button). */
export function Needs({ items, className = "" }: { items: Array<string | false | null | undefined>; className?: string }) {
  const list = items.filter(Boolean) as string[];
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 text-[11px] ${className}`} data-testid="craft-needs">
      {list.map((t, i) => <span key={i} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-amber-800/60 bg-amber-950/30 text-amber-200/90"><CircleAlert className="h-3 w-3" />{t}</span>)}
    </div>
  );
}

/** A recipe the character knows that this station can't make. */
export const NotHere = ({ station }: { station?: string }) => (
  <span className="inline-flex items-center gap-1 text-[10px] text-stone-400" data-testid="craft-not-here"><Lock className="h-3 w-3" />Not at {station ?? "this station"}</span>
);
export const stationNameOf = (state: ReturnType<typeof useAg>["state"], id?: string) => (id ? state.notes.get(id)?.name : undefined);

/** Nothing known yet: what to ask the GM for. */
export function NoneKnown({ what, extra }: { what: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-stone-700 p-3 text-xs text-stone-400 flex items-start gap-2" data-testid="craft-none-known">
      <ScrollText className="h-4 w-4 text-amber-400/80 shrink-0 mt-0.5" />
      <div>No {what} known yet. Each one is learned from a scroll in the inventory — the GM gives them out (a recipe sheet's “Make a scroll” button).{extra ? <> {extra}</> : null}</div>
    </div>
  );
}

export function ItemTile({ note, selected, onClick, sub, disabled, color, testId, compact }: { note: AgNote; selected?: boolean; onClick?: () => void; sub?: React.ReactNode; disabled?: boolean; color?: string; testId?: string; /** A small chip (lists that scroll sideways). */ compact?: boolean }) {
  const { state } = useAg();
  const q = qtyOf(state, note.id);
  const face = compact ? 26 : 34;
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`relative flex items-center rounded-md border text-left transition-colors min-w-0 shrink-0 disabled:opacity-40 ${compact ? "gap-1.5 p-1 pr-2 max-w-[11rem]" : "gap-2 p-1.5 pr-2"} ${selected ? "bg-amber-500/10" : "bg-stone-900 hover:bg-stone-800"}`}
      style={{ borderColor: selected ? "#f59e0b" : color ?? "#44403c" }} data-testid={testId ?? `craft-item-${note.name}`}>
      <span className="relative shrink-0">
        {note.portrait ? <Portrait note={note} size={face} radius={6} /> : <SupplyFace note={note} size={face} />}
        {color && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-stone-900" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />}
      </span>
      <span className="min-w-0">
        <span className={`block font-semibold text-stone-100 truncate ${compact ? "text-[11px]" : "text-xs"}`}>{note.name || "Untitled"}</span>
        <span className="block text-[10px] text-stone-400 truncate">{sub ?? (q !== 1 ? `× ${q}` : " ")}</span>
      </span>
    </button>
  );
}

/** A crafting supply without a picture, drawn from what it is: an ingot, an ink, a herb, a tool. */
export function SupplyFace({ note, size }: { note: AgNote; size: number }) {
  const { state } = useAg();
  const has = (k: string) => valueOn(state, note.id, k) !== undefined;
  const box = "grid place-items-center rounded-md border overflow-hidden shrink-0";
  if (has("heat_min") || has("hardness")) {
    const c = colorOf(state, note.id, "metal_color", "#9ca3af");
    return (
      <span className={box} style={{ width: size, height: size, borderColor: `${c}88`, background: "radial-gradient(circle at 50% 70%, #2a2320, #0c0a09)" }}>
        <span style={{ width: size * 0.72, height: size * 0.34, borderRadius: 3, transform: "perspective(40px) rotateX(35deg)", background: `linear-gradient(180deg, color-mix(in srgb, ${c} 40%, white), ${c} 45%, color-mix(in srgb, ${c} 50%, black))`, boxShadow: `0 0 8px ${c}66` }} />
      </span>
    );
  }
  if (has("ink_color")) {
    const c = colorOf(state, note.id, "ink_color", "#a78bfa");
    const g = Number(valueOn(state, note.id, "ink_glow") ?? 0) || 0;
    return <span className={box} style={{ width: size, height: size, borderColor: `${c}99`, background: `radial-gradient(circle, color-mix(in srgb, ${c} ${15 + g / 4}%, transparent), #0c0a09 70%)` }}><Droplet style={{ width: size * 0.6, height: size * 0.6, color: c, fill: c, filter: g ? `drop-shadow(0 0 ${2 + g / 12}px ${c})` : undefined }} /></span>;
  }
  if (has("station_for")) {
    const k = String(valueOn(state, note.id, "station_for") ?? "");
    const [c, I] = k === "Alchemy" ? ["#34d399", FlaskRound] as const : k === "Rune Making" ? ["#a78bfa", PenTool] as const : ["#f97316", Anvil] as const;
    return <span className={box} style={{ width: size, height: size, borderColor: `${c}99`, background: `radial-gradient(circle at 50% 80%, color-mix(in srgb, ${c} 40%, transparent), #0c0a09 70%)` }}><I style={{ width: size * 0.6, height: size * 0.6, color: c, filter: `drop-shadow(0 0 6px ${c})` }} /></span>;
  }
  if (has("teaches")) return <span className={box} style={{ width: size, height: size, borderColor: "#d9770666", background: "radial-gradient(circle, #2a1f12, #0c0a09 70%)" }}><ScrollText style={{ width: size * 0.58, height: size * 0.58, color: "#fbbf24" }} /></span>;
  if (has("mark_style")) return <span className={box} style={{ width: size, height: size, borderColor: "#fdba7466", background: "radial-gradient(circle, #2b1d12, #0c0a09 70%)" }}><PenTool style={{ width: size * 0.55, height: size * 0.55, color: "#fdba74" }} /></span>;
  if (valueOn(state, note.id, "item_type") === "Ingredient") return <span className={box} style={{ width: size, height: size, borderColor: "#86efac66", background: "radial-gradient(circle, #10251a, #0c0a09 70%)" }}><Leaf style={{ width: size * 0.58, height: size * 0.58, color: "#86efac", filter: "drop-shadow(0 0 4px #22c55e)" }} /></span>;
  return <Portrait note={note} size={size} radius={6} />;
}

export interface CraftOutcome { tier: CraftTier; tierLabel: string; message: string; name?: string; noteId?: string; pending?: boolean; roll?: { natural: number; skill: number; total: number; label: string; breakdown: string } }

/** What came out of the last craft, in its tier's colour. */
export function ResultBanner({ result, onOpen, onClose }: { result: CraftOutcome | null | undefined; onOpen?: (id: string) => void; onClose?: () => void }) {
  if (!result) return null;
  const col = result.pending ? "#f59e0b" : TIER_COLOR[result.tier];
  return (
    <div className="relative overflow-hidden rounded-lg border p-3 flex items-center gap-3 bg-stone-900 animate-in fade-in duration-200" style={{ borderColor: col }} data-testid="craft-result">
      <Sparkles className="h-5 w-5 shrink-0" style={{ color: col }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold" style={{ color: col }}>{result.pending ? "Brewing…" : TIER_LABEL[result.tier]}{result.roll ? <span className="ml-2 text-[11px] font-mono text-stone-400">{result.roll.breakdown}</span> : null}</div>
        <div className="text-xs text-stone-200">{result.message}</div>
      </div>
      {result.noteId && !result.pending && onOpen && <button type="button" onClick={() => onOpen(result.noteId!)} className="h-7 px-2 rounded border border-stone-600 text-[11px] text-stone-200 hover:border-amber-500 shrink-0">Open</button>}
      {onClose && <button type="button" onClick={onClose} className="h-7 w-7 rounded text-stone-400 hover:text-stone-100 shrink-0">✕</button>}
    </div>
  );
}

/** Rolls go to the dice tray and chat like any other roll. */
export function announceRoll(characterName: string, roll: CraftOutcome["roll"], broadcast: boolean) {
  if (!roll) return;
  triggerRollNotification({
    type: "custom", label: roll.label, result: roll.total, total: roll.total, username: characterName, characterName,
    calculationBreakdown: roll.breakdown, customColor: "#b45309", chatBreakdown: true, hideBreakdown: true,
  } as any, broadcast);
}

export function QuickCraftButton({ kind, characterId, disabled, busy, onClick, title, tools = [] }: { kind: CraftKind; characterId: string; disabled?: boolean; busy?: boolean; onClick: () => void; title?: string; /** The tools in hand: their points count on the roll. */ tools?: Array<string | null | undefined> }) {
  const { state } = useAg();
  // What the roll will actually be, tools and all, so the button doesn't promise
  // one number and the roll come back another.
  const own = Number(valueOn(state, characterId, SKILL_KEY[kind]) ?? 0) || 0;
  const skill = own + tools.reduce((a, id) => a + toolEffectsOn(state, id).skill, 0);
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick}
      className="h-9 px-3 rounded-md border border-stone-600 bg-stone-800 hover:bg-stone-700 text-stone-100 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
      title={title ?? `Roll d20 ${skill >= 0 ? "+" : "−"} ${Math.abs(skill)} and craft it straight away`} data-testid={`craft-quick-${kind}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />} Quick Craft <span className="font-mono text-amber-300/80">d20{skill ? `${skill >= 0 ? "+" : "−"}${Math.abs(skill)}` : ""}</span>
    </button>
  );
}

export function Panel({ title, children, right, className = "" }: { title: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-stone-700 bg-stone-900/60 p-2.5 space-y-2 ${className}`}>
      <div className="flex items-center gap-2"><div className="text-[10px] uppercase tracking-wide text-amber-400/80 flex-1 min-w-0">{title}</div>{right}</div>
      {children}
    </div>
  );
}

/** A labelled row of choices that scrolls sideways (one line on a phone, never a wall of tiles). */
export function ChoiceRow({ label, children, empty, testId }: { label: React.ReactNode; children: React.ReactNode; empty?: React.ReactNode; testId?: string }) {
  const has = React.Children.toArray(children).some(Boolean);
  return (
    <div className="flex items-center gap-2 min-w-0" data-testid={testId}>
      <span className="text-[10px] uppercase tracking-wide text-stone-500 w-16 shrink-0">{label}</span>
      {has ? <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-w-0 py-0.5">{children}</div> : <span className="text-[11px] text-amber-300/90 min-w-0">{empty}</span>}
    </div>
  );
}

/** A sideways strip of recipe cards (blueprints, recipes, runes). */
export function DefStrip({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 snap-x">{children}</div>;
}
export function DefCard({ selected, locked, disabled, onClick, art, name, sub, testId }: { selected: boolean; locked?: boolean; disabled?: boolean; onClick: () => void; art: React.ReactNode; name: string; sub: React.ReactNode; testId?: string }) {
  return (
    <button type="button" disabled={disabled || locked} onClick={onClick} data-testid={testId}
      className={`snap-start shrink-0 w-[6.5rem] rounded-md border p-1.5 text-left transition-colors disabled:cursor-default ${locked ? "border-stone-800 bg-stone-950 opacity-50" : selected ? "border-amber-500 bg-amber-500/10" : "border-stone-700 bg-stone-900 hover:border-amber-700"}`}>
      <div className="h-16 grid place-items-center overflow-hidden rounded bg-stone-950">{art}</div>
      <div className="text-[11px] font-semibold text-stone-100 truncate mt-1">{name}</div>
      <div className="text-[10px] text-stone-400 truncate">{sub}</div>
    </button>
  );
}

export const colorOf = (state: ReturnType<typeof useAg>["state"], id: string, key: string, d: string) => {
  const v = valueOn(state, id, key);
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d;
};
