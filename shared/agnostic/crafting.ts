// Crafting, for every Agnostic system: recipes are sheets, ingredients and
// tools are ordinary items, and a crafting tool turns a recipe plus a
// character's inventory into new items.
//
//   forge    a blueprint (sword, axe, bow stave…) in parts; each part is
//            hammered from a material item, then the parts become a weapon.
//   alchemy  a recipe of steps (mix, dice, heat, add, grind, strain, rest),
//            scored step by step; or an experiment the GM rules on.
//   rune     a sigil traced onto an item, with the inks, tools and other
//            items the rune needs.
//
// A definition sheet (blueprint / recipe / rune recipe) keeps its setup as
// JSON in its "craft" value; the editor block on its page writes it. Items
// say what they are for crafting through plain values on them:
//   heat_min, heat_max, hardness, weight, value, metal_color   a material
//   ink_color, ink_glow                                         a liquid or ink
//   mark_style ("Carved" / "Drawn")                             a carving tool or pen
// Every result lands in a tier, and the tier decides the output's numbers.

import type { AgNote, AgValue } from "./types";

// --------------------------------------------------------------------------- tiers
export type CraftTier = "fail" | "weak" | "default" | "slight" | "huge";
export const CRAFT_TIERS: CraftTier[] = ["fail", "weak", "default", "slight", "huge"];
export const TIER_LABEL: Record<CraftTier, string> = { fail: "Failed", weak: "Weak", default: "Standard", slight: "Fine", huge: "Masterwork" };
export const TIER_COLOR: Record<CraftTier, string> = { fail: "#78716c", weak: "#f97316", default: "#e7e5e4", slight: "#22d3ee", huge: "#facc15" };

/**
 * Quick Craft: d20 + the craft's skill.
 *   natural 1 → failed (always) · 2–11 weak · 12–19 standard · 20–24 fine · 25+ masterwork
 *   a natural 20 is at least fine.
 */
export function quickCraftTier(natural: number, total: number): CraftTier {
  if (natural === 1) return "fail";
  let t: CraftTier = total >= 25 ? "huge" : total >= 20 ? "slight" : total >= 12 ? "default" : "weak";
  if (natural === 20 && (t === "weak" || t === "default")) t = "slight";
  return t;
}

/** Rune tracing: with the guide showing, accuracy has to be high for a bonus; without it, lower. */
export function runeTier(accuracy: number, guide: boolean): CraftTier {
  const a = Math.max(0, Math.min(100, accuracy));
  if (guide) return a >= 95 ? "huge" : a >= 80 ? "slight" : a >= 60 ? "default" : "fail";
  return a >= 85 ? "huge" : a >= 65 ? "slight" : a >= 40 ? "default" : "fail";
}

/** Alchemy and forging: how close to the recipe, overall. */
export function accuracyTier(accuracy: number): CraftTier {
  const a = Math.max(0, Math.min(100, accuracy));
  return a >= 94 ? "huge" : a >= 80 ? "slight" : a >= 60 ? "default" : a >= 35 ? "weak" : "fail";
}

/** What a tier adds to an output's effect roll (a potion's dice, a weapon's damage). */
export const TIER_BONUS: Record<CraftTier, number> = { fail: 0, weak: -2, default: 0, slight: 2, huge: 5 };

// --------------------------------------------------------------------------- definitions
export type CraftKind = "forge" | "alchemy" | "rune";
export const CRAFT_KIND_LABEL: Record<CraftKind, string> = { forge: "Blacksmithing", alchemy: "Alchemy", rune: "Rune Making" };
/** A station item's craft: its "station_for" value is one of these labels. */
export const CRAFT_KIND_OF_STATION: Record<string, CraftKind> = { Blacksmithing: "forge", Alchemy: "alchemy", "Rune Making": "rune" };
/**
 * Which recipes a station can make: its "station_recipes" value — a JSON list of
 * recipe (blueprint / recipe / rune recipe) sheet ids, or empty for all of its craft.
 */
export function stationRecipes(v: unknown): string[] | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : null; } catch { return null; }
}
export const stationAllows = (v: unknown, defId: string) => { const l = stationRecipes(v); return !l || l.includes(defId); };
/** The sheet kind each craft's definitions are. */
export const CRAFT_DEF_TYPE: Record<CraftKind, string> = { forge: "blueprint", alchemy: "recipe", rune: "rune_recipe" };

/** Something a craft needs from the inventory: a sheet (or anything copied from it / made from it), or by name. */
export interface CraftNeed { noteId?: string | null; name: string; qty: number; /** Used up (default) or only needed (a tool). */ consumed?: boolean }

/** A value set on the output, by tier: { key: "potency", values: { weak: -2, … } }. */
export interface CraftTierEffect { key: string; mode?: "set" | "add"; values: Partial<Record<CraftTier, number>> }

export type ForgeRole = "blade" | "handle" | "extra";
export interface ForgePart { key: string; label: string; role: ForgeRole; optional?: boolean; shape: string }
export interface ForgeConfig {
  kind: "forge";
  parts: ForgePart[];
  /** The weapon's damage die (sides) — the blade's quality adds to its damage. */
  damageDie: number;
  /** What's made: the template (or item) the finished weapon is copied from. */
  output?: string | null;
  /** What a saved part is made from (a "Part" item template); a plain item otherwise. */
  partTemplate?: string | null;
  effects?: CraftTierEffect[];
}

export type AlchemyStepType = "mix" | "dice" | "heat" | "add" | "grind" | "strain" | "rest";
export const ALCHEMY_STEP_LABEL: Record<AlchemyStepType, string> = { mix: "Mix", dice: "Dice", heat: "Heat", add: "Add", grind: "Grind", strain: "Strain", rest: "Rest" };
export interface AlchemyStep {
  id: string;
  type: AlchemyStepType;
  /** The ingredient this step works on (dice / add / grind), by name. */
  ingredient?: string;
  /** mix / rest: seconds. heat: target temperature (0–100). dice: number of cuts. grind: strokes. add: the moment (0–100 of a sweep). */
  amount?: number;
  note?: string;
}
export interface AlchemyConfig {
  kind: "alchemy";
  ingredients: CraftNeed[];
  steps: AlchemyStep[];
  output?: string | null;
  /** Tier → change on the output (default: potency by TIER_BONUS; a failed brew is inert). */
  effects?: CraftTierEffect[];
}

export interface RuneConfig {
  kind: "rune";
  /** Strokes of the sigil, points in 0–100. */
  sigil: number[][][];
  ingredients: CraftNeed[];
  /** Tools it needs (not used up): a specific one by sheet, or any item with a mark style. */
  tools: CraftNeed[];
  /** Must be drawn with a liquid or ink (an item with ink_color). */
  needsInk?: boolean;
  /** The rune made and set into the item (a template or item to copy). */
  output?: string | null;
  /** What it does to the item it's on, by tier (e.g. damage_bonus +1 / +2 / +3). */
  effect: { key: string; values: Partial<Record<CraftTier, number>> } | null;
}

export type CraftConfig = ForgeConfig | AlchemyConfig | RuneConfig;

const num = (v: unknown, d: number, lo = -1e6, hi = 1e6) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
const key = (v: unknown) => (typeof v === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(v) ? v : "");
function tierValues(v: unknown): Partial<Record<CraftTier, number>> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Partial<Record<CraftTier, number>> = {};
  for (const t of CRAFT_TIERS) if (typeof o[t] === "number" && Number.isFinite(o[t] as number)) out[t] = o[t] as number;
  return out;
}
function needs(v: unknown, consumed: boolean): CraftNeed[] {
  return (Array.isArray(v) ? v : []).slice(0, 30).map((n: any) => ({ noteId: id(n?.noteId), name: str(n?.name, 80), qty: Math.max(1, Math.round(num(n?.qty, 1, 1, 99))), consumed: typeof n?.consumed === "boolean" ? n.consumed : consumed }))
    .filter((n) => n.name || n.noteId);
}
function effects(v: unknown): CraftTierEffect[] {
  return (Array.isArray(v) ? v : []).slice(0, 12).map((e: any) => ({ key: key(e?.key), mode: e?.mode === "set" ? "set" as const : "add" as const, values: tierValues(e?.values) })).filter((e) => e.key);
}

/** A definition's setup from its stored text — checked and bounded; null if it isn't one. */
export function parseCraftConfig(raw: unknown): CraftConfig | null {
  let o: any = raw;
  if (typeof raw === "string") { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== "object") return null;
  if (o.kind === "forge") {
    const parts = (Array.isArray(o.parts) ? o.parts : []).slice(0, 8).map((p: any, i: number) => ({
      key: key(p?.key) || `part${i + 1}`, label: str(p?.label, 40) || `Part ${i + 1}`,
      role: (["blade", "handle", "extra"].includes(p?.role) ? p.role : "extra") as ForgeRole,
      optional: !!p?.optional, shape: FORGE_SHAPES[p?.shape] ? p.shape : "long_blade",
    }));
    return { kind: "forge", parts, damageDie: Math.round(num(o.damageDie, 8, 2, 20)), output: id(o.output), partTemplate: id(o.partTemplate), effects: effects(o.effects) };
  }
  if (o.kind === "alchemy") {
    const steps = (Array.isArray(o.steps) ? o.steps : []).slice(0, 20).map((s: any, i: number) => ({
      id: str(s?.id, 24) || `s${i}`, type: (Object.keys(ALCHEMY_STEP_LABEL).includes(s?.type) ? s.type : "mix") as AlchemyStepType,
      ingredient: str(s?.ingredient, 80) || undefined, amount: typeof s?.amount === "number" ? num(s.amount, 0, 0, 600) : undefined, note: str(s?.note, 200) || undefined,
    }));
    return { kind: "alchemy", ingredients: needs(o.ingredients, true), steps, output: id(o.output), effects: effects(o.effects) };
  }
  if (o.kind === "rune") {
    const sigil = (Array.isArray(o.sigil) ? o.sigil : []).slice(0, 12).map((st: any) => (Array.isArray(st) ? st : []).slice(0, 200)
      .map((pt: any) => [num(pt?.[0], 50, 0, 100), num(pt?.[1], 50, 0, 100)])).filter((st: number[][]) => st.length > 1);
    const eff = o.effect && key(o.effect.key) ? { key: key(o.effect.key), values: tierValues(o.effect.values) } : null;
    return { kind: "rune", sigil, ingredients: needs(o.ingredients, true), tools: needs(o.tools, false), needsInk: !!o.needsInk, output: id(o.output), effect: eff };
  }
  return null;
}

export function emptyCraftConfig(kind: CraftKind): CraftConfig {
  if (kind === "forge") return { kind, parts: [{ key: "blade", label: "Blade", role: "blade", shape: "long_blade" }, { key: "handle", label: "Handle", role: "handle", shape: "grip" }], damageDie: 8, output: null, partTemplate: null, effects: [] };
  if (kind === "alchemy") return { kind, ingredients: [], steps: [{ id: "s0", type: "mix", amount: 8 }], output: null, effects: [] };
  return { kind, sigil: SIGILS.flame.strokes, ingredients: [], tools: [], needsInk: false, output: null, effect: { key: "damage_bonus", values: { default: 1, slight: 2, huge: 3 } } };
}

// --------------------------------------------------------------------------- forge shapes
// A part's outline, in a 100 × 40 box (the weapon lying left to right).
export interface ForgeShape { label: string; role: ForgeRole; points: number[][] }
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
export const FORGE_SHAPES: Record<string, ForgeShape> = {
  long_blade: { label: "Long blade", role: "blade", points: [[0, 16], [82, 14.5], [100, 20], [82, 25.5], [0, 24]] },
  short_blade: { label: "Short blade (dagger)", role: "blade", points: [[0, 14], [55, 12.5], [100, 20], [55, 27.5], [0, 26]] },
  curved_blade: { label: "Curved blade (sabre)", role: "blade", points: [[0, 17], [40, 15], [75, 11], [100, 4], [92, 14], [70, 22], [38, 25], [0, 25]] },
  axe_head: { label: "Axe head", role: "blade", points: [[20, 14], [55, 12], [70, 2], [88, 0], [100, 20], [88, 40], [70, 38], [55, 28], [20, 26]] },
  scythe_blade: { label: "Scythe blade", role: "blade", points: [[0, 6], [30, 3], [60, 5], [85, 12], [100, 26], [82, 19], [58, 14], [30, 13], [0, 14]] },
  spear_head: { label: "Spear head", role: "blade", points: [[0, 17], [30, 16], [45, 10], [100, 20], [45, 30], [30, 24], [0, 23]] },
  arrow_tip: { label: "Arrow tip", role: "blade", points: [[0, 17], [40, 17], [40, 8], [100, 20], [40, 32], [40, 23], [0, 23]] },
  hammer_head: { label: "Hammer head", role: "blade", points: [[25, 4], [75, 4], [78, 8], [78, 32], [75, 36], [25, 36], [22, 32], [22, 8]] },
  bow_stave: { label: "Bow stave", role: "blade", points: [...arc(50, 120, 110, -Math.PI * 0.72, -Math.PI * 0.28, 14), ...arc(50, 120, 104, -Math.PI * 0.28, -Math.PI * 0.72, 14)] },
  grip: { label: "Grip / handle", role: "handle", points: [[0, 15], [6, 13], [94, 13], [100, 15], [100, 25], [94, 27], [6, 27], [0, 25]] },
  long_haft: { label: "Long haft (pole)", role: "handle", points: [[0, 17], [100, 17], [100, 23], [0, 23]] },
  guard: { label: "Cross guard", role: "extra", points: [[40, 0], [60, 0], [60, 12], [64, 16], [64, 24], [60, 28], [60, 40], [40, 40], [40, 28], [36, 24], [36, 16], [40, 12]] },
  pommel: { label: "Pommel", role: "extra", points: arc(50, 20, 18, 0, Math.PI * 2, 16) },
  fletching: { label: "Fletching", role: "extra", points: [[0, 6], [70, 14], [100, 20], [70, 26], [0, 34], [15, 20]] },
};

/** How the parts of a finished weapon sit together, left to right (handle, extras, blade). */
export function assemblyOrder(parts: ForgePart[]): ForgePart[] {
  const rank = (p: ForgePart) => (p.role === "handle" ? 0 : p.shape === "pommel" ? -1 : p.role === "extra" ? 1 : 2);
  return [...parts].sort((a, b) => rank(a) - rank(b));
}

export function pointInPolygon(x: number, y: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** The forge's metal: a grid over the 100 × 40 box; "1" = metal still there. */
// Coarse enough to hammer with a fingertip on a phone; the outline follows the cells, so it can be matched exactly.
export const FORGE_COLS = 40, FORGE_ROWS = 16;
/** Which cells are inside the outline (to keep) — the rest are stock to hammer away. */
export function shapeMask(shape: string): boolean[] {
  const pts = FORGE_SHAPES[shape]?.points ?? FORGE_SHAPES.long_blade.points;
  const out: boolean[] = [];
  for (let r = 0; r < FORGE_ROWS; r++) for (let c = 0; c < FORGE_COLS; c++) {
    out.push(pointInPolygon(((c + 0.5) * 100) / FORGE_COLS, ((r + 0.5) * 40) / FORGE_ROWS, pts));
  }
  return out;
}
/** The starting bar: the outline's bounding box, with stock all round to hammer away. */
export function startingStock(shape: string): string {
  const mask = shapeMask(shape);
  let r0 = FORGE_ROWS, r1 = -1, c0 = FORGE_COLS, c1 = -1;
  mask.forEach((m, i) => { if (!m) return; const r = Math.floor(i / FORGE_COLS), c = i % FORGE_COLS; r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); });
  r0 = Math.max(0, r0 - 3); r1 = Math.min(FORGE_ROWS - 1, r1 + 3); c0 = Math.max(0, c0 - 2); c1 = Math.min(FORGE_COLS - 1, c1 + 2);
  let s = "";
  for (let r = 0; r < FORGE_ROWS; r++) for (let c = 0; c < FORGE_COLS; c++) s += r >= r0 && r <= r1 && c >= c0 && c <= c1 ? "1" : "0";
  return s;
}
/**
 * A hammer blow at (cx, cy) (in cells): it moves the metal's surface — the cells within reach that touch open air —
 * one layer at a time, so working down to the outline takes care, not pixel-perfect aim (and over-working a spot
 * eats into the outline). Returns the new metal and the cells moved.
 */
export function strikeMetal(metal: string, cx: number, cy: number, radius: number): { metal: string; hit: number[] } {
  const at = (r: number, c: number) => r >= 0 && c >= 0 && r < FORGE_ROWS && c < FORGE_COLS && metal[r * FORGE_COLS + c] === "1";
  const arr = metal.split("");
  const hit: number[] = [];
  for (let r = Math.floor(cy - radius); r <= Math.ceil(cy + radius); r++) for (let c = Math.floor(cx - radius); c <= Math.ceil(cx + radius); c++) {
    if (!at(r, c) || (c + 0.5 - cx) ** 2 + (r + 0.5 - cy) ** 2 > radius * radius) continue;
    if (at(r - 1, c) && at(r + 1, c) && at(r, c - 1) && at(r, c + 1)) continue;
    hit.push(r * FORGE_COLS + c);
  }
  for (const i of hit) arr[i] = "0";
  return { metal: arr.join(""), hit };
}
/** A forge session's metal from before the grid changed size: start that part over. */
export const metalFits = (metal: unknown): metal is string => typeof metal === "string" && metal.length === FORGE_COLS * FORGE_ROWS;

/** How close the metal is to the outline: the stock removed, less the outline hammered into. 0–100. */
export function shapeScore(shape: string, metal: string): number {
  const mask = shapeMask(shape);
  const start = startingStock(shape);
  let stock = 0, removed = 0, keep = 0, kept = 0;
  for (let i = 0; i < mask.length; i++) {
    if (start[i] !== "1") continue;
    if (mask[i]) { keep++; if (metal[i] === "1") kept++; }
    else { stock++; if (metal[i] !== "1") removed++; }
  }
  const clean = stock ? removed / stock : 1;
  const intact = keep ? kept / keep : 1;
  return Math.round(100 * clean * Math.pow(intact, 1.6));
}

// --------------------------------------------------------------------------- forge results
/** A part's numbers from its scores: shape (hammer accuracy) and heat (time in the material's range). */
export function partStats(role: ForgeRole, shape: number, heat: number, material: { hardness: number; value: number; weight: number }) {
  const quality = Math.round(shape);
  const baseDur = 10 + Math.max(0, material.hardness) * 6;
  const durability = Math.max(1, Math.round(baseDur * (0.25 + 0.75 * Math.max(0, Math.min(100, heat)) / 100)));
  const tier = accuracyTier(quality * 0.6 + heat * 0.4);
  return {
    quality, durability, tier,
    damageBonus: role === "blade" ? Math.max(-2, Math.min(5, Math.round((quality - 60) / 8))) : 0,
    accuracy: role === "handle" ? Math.max(-1, Math.min(4, Math.round((quality - 50) / 12))) : 0,
    weight: Math.round(material.weight * 10) / 10,
    value: material.value,
  };
}
/** The finished weapon: durability is the parts' average; worth is materials plus durability. */
export function weaponStats(parts: Array<{ role: ForgeRole; durability: number; damageBonus: number; accuracy: number; weight: number; value: number }>) {
  const n = parts.length || 1;
  const durability = Math.round(parts.reduce((s, p) => s + p.durability, 0) / n);
  return {
    durability,
    damageBonus: parts.filter((p) => p.role === "blade").reduce((s, p) => s + p.damageBonus, 0),
    accuracy: parts.filter((p) => p.role === "handle").reduce((s, p) => s + p.accuracy, 0),
    weight: Math.round(parts.reduce((s, p) => s + p.weight, 0) * 10) / 10,
    value: Math.round(parts.reduce((s, p) => s + p.value, 0) + durability),
  };
}

// --------------------------------------------------------------------------- runes
export interface SigilPreset { label: string; strokes: number[][][] }
const line = (a: number[], b: number[], n = 8) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
export const SIGILS: Record<string, SigilPreset> = {
  flame: { label: "Flame", strokes: [[[50, 8], [62, 30], [72, 52], [66, 76], [50, 90], [34, 76], [28, 52], [38, 30], [50, 8]], [[50, 46], [57, 62], [50, 76], [43, 62], [50, 46]]] },
  frost: { label: "Frost", strokes: [line([50, 6], [50, 94]), line([12, 28], [88, 72]), line([12, 72], [88, 28]), [[38, 14], [50, 24], [62, 14]], [[38, 86], [50, 76], [62, 86]]] },
  storm: { label: "Storm", strokes: [[[58, 4], [30, 50], [54, 50], [38, 96], [74, 40], [50, 40], [66, 4]]] },
  ward: { label: "Ward", strokes: [[[50, 6], [86, 20], [80, 64], [50, 94], [20, 64], [14, 20], [50, 6]], line([50, 24], [50, 74]), line([32, 46], [68, 46])] },
  vigor: { label: "Vigor", strokes: [arc(50, 50, 38, 0, Math.PI * 2, 24), line([50, 22], [50, 78]), line([22, 50], [78, 50])] },
};

/** Evenly spaced points along strokes (so long and short strokes count fairly). */
export function resample(strokes: number[][][], step = 2): number[][] {
  const out: number[][] = [];
  for (const st of strokes) {
    for (let i = 1; i < st.length; i++) {
      const [x0, y0] = st[i - 1], [x1, y1] = st[i];
      const d = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    if (st.length) out.push(st[st.length - 1]);
  }
  return out;
}
/**
 * How well a tracing matches a sigil, 0–100: how much of the sigil it covers
 * and how much of it stays on the sigil (both within a few points).
 */
export function traceAccuracy(guide: number[][][], drawn: number[][][], tolerance = 4.5): number {
  const g = resample(guide), d = resample(drawn);
  if (!g.length || !d.length) return 0;
  const near = (p: number[], set: number[][]) => { let best = Infinity; for (const q of set) { const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (dd < best) best = dd; } return Math.sqrt(best); };
  const covered = g.filter((p) => near(p, d) <= tolerance).length / g.length;
  const onLine = d.filter((p) => near(p, g) <= tolerance * 1.4).length / d.length;
  return Math.round(100 * Math.pow(covered, 0.7) * Math.pow(onLine, 0.6));
}

// --------------------------------------------------------------------------- inventory
/** Whether an inventory item is (a copy of / made from / named like) what a recipe asks for. */
export function itemMatches(item: AgNote, need: Pick<CraftNeed, "noteId" | "name">): boolean {
  if (need.noteId && (item.id === need.noteId || item.copyOf === need.noteId || item.templateId === need.noteId)) return true;
  return !!need.name && item.name.trim().toLowerCase() === need.name.trim().toLowerCase();
}

/** A value as a number (for item settings read off fields). */
export const numOf = (v: AgValue | undefined, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
