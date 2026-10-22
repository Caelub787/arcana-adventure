// Pieces the crafting tools share: who's crafting, what they carry, item
// tiles, the result banner, and the Quick Craft button.
import React from "react";
import { Dices, Loader2, Sparkles, Leaf, PenTool, Droplet } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { TIER_COLOR, TIER_LABEL, parseCraftConfig, CRAFT_DEF_TYPE, type CraftKind, type CraftTier, type CraftConfig } from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { Portrait } from "../widgets";
import { triggerRollNotification } from "@/components/game/RollNotification";
import { inventoryOf, qtyOf, valueOn } from "./session";

export const SKILL_KEY: Record<CraftKind, string> = { forge: "blacksmithing", alchemy: "alchemy", rune: "rune_making" };

export function useCrafter(characterId: string) {
  const { state } = useAg();
  const character = state.notes.get(characterId);
  const inventory = inventoryOf(state, characterId);
  return { character, inventory };
}

/** The recipes of a craft this viewer can see (the GM shares them; experiments discover them). */
export function useDefs(kind: CraftKind): Array<{ note: AgNote; config: CraftConfig }> {
  const { state } = useAg();
  const out: Array<{ note: AgNote; config: CraftConfig }> = [];
  for (const n of Array.from(state.notes.values())) {
    if (n.isTemplate || n.type !== CRAFT_DEF_TYPE[kind]) continue;
    const config = parseCraftConfig(valueOn(state, n.id, "craft"));
    if (config && config.kind === kind) out.push({ note: n, config });
  }
  return out.sort((a, b) => a.note.name.localeCompare(b.note.name));
}

export function ItemTile({ note, selected, onClick, sub, disabled, color, testId }: { note: AgNote; selected?: boolean; onClick?: () => void; sub?: React.ReactNode; disabled?: boolean; color?: string; testId?: string }) {
  const { state } = useAg();
  const q = qtyOf(state, note.id);
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`relative flex items-center gap-2 rounded-lg border p-1.5 pr-2 text-left transition-all min-w-0 disabled:opacity-40 ${selected ? "bg-amber-500/15 shadow-[0_0_14px_rgba(245,158,11,0.35)]" : "bg-stone-900/80 hover:bg-stone-800"}`}
      style={{ borderColor: selected ? "#f59e0b" : color ?? "#44403c" }} data-testid={testId ?? `craft-item-${note.name}`}>
      <span className="relative shrink-0">
        {note.portrait ? <Portrait note={note} size={34} radius={6} /> : <SupplyFace note={note} size={34} />}
        {color && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-stone-900" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-stone-100 truncate">{note.name || "Untitled"}</span>
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
    <div className="relative overflow-hidden rounded-xl border p-3 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300" style={{ borderColor: col, background: `radial-gradient(circle at 15% 50%, color-mix(in srgb, ${col} 22%, transparent), rgba(12,10,9,0.92) 70%)` }} data-testid="craft-result">
      <Sparkles className="h-6 w-6 shrink-0" style={{ color: col, filter: `drop-shadow(0 0 6px ${col})` }} />
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

export function QuickCraftButton({ kind, characterId, disabled, busy, onClick, title }: { kind: CraftKind; characterId: string; disabled?: boolean; busy?: boolean; onClick: () => void; title?: string }) {
  const { state } = useAg();
  const skill = Number(valueOn(state, characterId, SKILL_KEY[kind]) ?? 0) || 0;
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick}
      className="h-9 px-3 rounded-lg border border-amber-500/70 bg-gradient-to-b from-amber-600/30 to-amber-900/40 text-amber-100 text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-125 disabled:opacity-40 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
      title={title ?? `Roll d20 ${skill >= 0 ? "+" : "−"} ${Math.abs(skill)} and craft it straight away`} data-testid={`craft-quick-${kind}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />} Quick Craft <span className="font-mono text-amber-300/80">d20{skill ? `${skill >= 0 ? "+" : "−"}${Math.abs(skill)}` : ""}</span>
    </button>
  );
}

export function Panel({ title, children, right, className = "" }: { title: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-700/80 bg-stone-950/70 p-2.5 space-y-2 ${className}`}>
      <div className="flex items-center gap-2"><div className="text-[11px] uppercase tracking-[0.14em] text-amber-400/90 font-semibold flex-1 min-w-0">{title}</div>{right}</div>
      {children}
    </div>
  );
}

export const colorOf = (state: ReturnType<typeof useAg>["state"], id: string, key: string, d: string) => {
  const v = valueOn(state, id, key);
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d;
};
