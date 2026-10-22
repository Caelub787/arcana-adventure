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
/**
 * One of the made item's values by craftsmanship: a number per tier (set, or added to what crafting gave), or — set
 * only — text: dice ("3d6"), a choice ("Moderate") or words, so a Fine potion can heal more dice or more wounds.
 */
export interface CraftTierEffect { key: string; mode?: "set" | "add"; values: Partial<Record<CraftTier, number | string>> }

/** Dice a tier adds to (or takes off) an output's dice when its recipe says nothing about them. */
export const TIER_DICE: Record<CraftTier, number> = { fail: 0, weak: -1, default: 0, slight: 1, huge: 2 };
/** How a tier changes an output's worth when its recipe says nothing about it. */
export const TIER_WORTH: Record<CraftTier, number> = { fail: 0, weak: 0.6, default: 1, slight: 1.6, huge: 3 };
/** "2d6+1" with `more` dice more (never under one): the default step up or down for a better or worse brew. */
export function moreDice(formula: string, more: number): string {
  const m = /^\s*(\d*)d(\d+)(.*)$/i.exec(formula);
  if (!m || !more) return formula;
  const n = Math.max(1, (m[1] ? Number(m[1]) : 1) + more);
  return `${n}d${m[2]}${m[3]}`;
}

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
  return (Array.isArray(v) ? v : []).slice(0, 12).map((e: any) => {
    const o = (e?.values && typeof e.values === "object" ? e.values : {}) as Record<string, unknown>;
    const values: Partial<Record<CraftTier, number | string>> = {};
    for (const t of CRAFT_TIERS) {
      const x = o[t];
      if (typeof x === "number" && Number.isFinite(x)) values[t] = x;
      else if (typeof x === "string" && x.trim()) values[t] = x.trim().slice(0, 80);
    }
    return { key: key(e?.key), mode: e?.mode === "set" ? "set" as const : "add" as const, values };
  }).filter((e) => e.key);
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

/**
 * The forge's metal: a fine grid over the 100 × 40 box (FINE_COLS × FINE_ROWS), fine enough for the outlines'
 * points and curves. The hammer works in blocks (FORGE_COLS × FORGE_ROWS, FINE × FINE fine cells each) — a
 * fingertip on a phone; the grindstone takes off fine cells to shape the curves and points.
 */
export const FORGE_COLS = 40, FORGE_ROWS = 16, FINE = 4;
export const FINE_COLS = FORGE_COLS * FINE, FINE_ROWS = FORGE_ROWS * FINE;
const N = FINE_COLS * FINE_ROWS;
/** Metal as bits: 1 = still there. */
export type Metal = Uint8Array;

/** Which fine cells are inside the outline (to keep) — the rest are stock to remove. */
const maskCache = new Map<string, Metal>();
export function shapeMask(shape: string): Metal {
  const hit = maskCache.get(shape);
  if (hit) return hit;
  const pts = FORGE_SHAPES[shape]?.points ?? FORGE_SHAPES.long_blade.points;
  const out = new Uint8Array(N);
  for (let r = 0; r < FINE_ROWS; r++) for (let c = 0; c < FINE_COLS; c++) out[r * FINE_COLS + c] = pointInPolygon(((c + 0.5) * 100) / FINE_COLS, ((r + 0.5) * 40) / FINE_ROWS, pts) ? 1 : 0;
  maskCache.set(shape, out);
  return out;
}
/** The starting bar: whole hammer blocks round the outline, with stock all round to work away. */
const stockCache = new Map<string, Metal>();
export function startingStock(shape: string): Metal {
  return stockOf(shape).slice();
}
/** The cached starting bar itself (read only). */
function stockOf(shape: string): Metal {
  let st = stockCache.get(shape);
  if (!st) { st = makeStock(shape); stockCache.set(shape, st); }
  return st;
}
function makeStock(shape: string): Metal {
  const mask = shapeMask(shape);
  let r0 = FORGE_ROWS, r1 = -1, c0 = FORGE_COLS, c1 = -1;
  for (let i = 0; i < N; i++) if (mask[i]) { const R = Math.floor(Math.floor(i / FINE_COLS) / FINE), C = Math.floor((i % FINE_COLS) / FINE); r0 = Math.min(r0, R); r1 = Math.max(r1, R); c0 = Math.min(c0, C); c1 = Math.max(c1, C); }
  r0 = Math.max(0, r0 - 2); r1 = Math.min(FORGE_ROWS - 1, r1 + 2); c0 = Math.max(0, c0 - 1); c1 = Math.min(FORGE_COLS - 1, c1 + 1);
  const out = new Uint8Array(N);
  for (let r = r0 * FINE; r < (r1 + 1) * FINE; r++) for (let c = c0 * FINE; c < (c1 + 1) * FINE; c++) out[r * FINE_COLS + c] = 1;
  return out;
}

// Packed for sharing live (and keeping on a part): base64 of the bits.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function packMetal(m: Metal): string {
  const bytes = new Uint8Array(Math.ceil(N / 8));
  for (let i = 0; i < N; i++) if (m[i]) bytes[i >> 3] |= 1 << (i & 7);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}
export function unpackMetal(s: string): Metal | null {
  if (typeof s !== "string" || s.length !== Math.ceil(Math.ceil(N / 8) / 3) * 4) return null;
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (s[i + k] === "=" ? 0 : B64.indexOf(s[i + k])));
    if (v.some((x) => x < 0)) return null;
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return out;
}
/** A forge session's metal from before the grid changed: start that part over. */
export const metalFits = (metal: unknown): metal is string => typeof metal === "string" && unpackMetal(metal) !== null;

/** How close the metal is to the outline: the stock removed, less the outline worked into. 0–100. */
export function shapeScore(shape: string, metal: Metal): number {
  const mask = shapeMask(shape);
  const start = stockOf(shape);
  let stock = 0, removed = 0, keep = 0, kept = 0;
  for (let i = 0; i < N; i++) {
    if (!start[i]) continue;
    if (mask[i]) { keep++; if (metal[i]) kept++; }
    else { stock++; if (!metal[i]) removed++; }
  }
  const clean = stock ? removed / stock : 1;
  const intact = keep ? kept / keep : 1;
  return Math.round(100 * clean * Math.pow(intact, 1.6));
}

const blockHas = (m: Metal, R: number, C: number) => {
  if (R < 0 || C < 0 || R >= FORGE_ROWS || C >= FORGE_COLS) return false;
  for (let r = R * FINE; r < (R + 1) * FINE; r++) for (let c = C * FINE; c < (C + 1) * FINE; c++) if (m[r * FINE_COLS + c]) return true;
  return false;
};
const clearBlock = (m: Metal, R: number, C: number, hit: number[]) => {
  for (let r = R * FINE; r < (R + 1) * FINE; r++) for (let c = C * FINE; c < (C + 1) * FINE; c++) { const i = r * FINE_COLS + c; if (m[i]) { m[i] = 0; hit.push(i); } }
};
/** How sure a smith's hammer is, by Blacksmithing (0–4): blocks knocked off beside the one aimed at, at most. */
export const hammerSlop = (skill: number) => Math.max(0, 3 - Math.max(0, Math.min(4, Math.floor(skill))));
/**
 * A hammer blow at fine cell (fx, fy). It has to land on metal; it knocks that block away — and a less skilled smith
 * knocks some of the blocks touching it off too (random, up to hammerSlop). Returns the new metal and the cells moved.
 */
export function hammerMetal(metal: Metal, fx: number, fy: number, skill: number, rand: () => number = Math.random): { metal: Metal; hit: number[] } {
  const c = Math.floor(fx), r = Math.floor(fy);
  const R = Math.floor(r / FINE), C = Math.floor(c / FINE);
  // It has to land on the bar: a block with metal in it.
  if (c < 0 || r < 0 || c >= FINE_COLS || r >= FINE_ROWS || !blockHas(metal, R, C)) return { metal, hit: [] };
  const m = metal.slice();
  const hit: number[] = [];
  clearBlock(m, R, C, hit);
  const slop = hammerSlop(skill);
  if (slop) {
    const around = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => [R + dr, C + dc]).filter(([rr, cc]) => blockHas(m, rr, cc));
    let extra = Math.floor(rand() * (slop + 1));
    while (extra-- > 0 && around.length) { const [rr, cc] = around.splice(Math.floor(rand() * around.length), 1)[0]; clearBlock(m, rr, cc, hit); }
  }
  return { metal: m, hit };
}
/** A block the hammer has cleared: part of the starting bar, and empty now. */
const blockOpened = (metal: Metal, stock: Metal, R: number, C: number) => {
  if (R < 0 || C < 0 || R >= FORGE_ROWS || C >= FORGE_COLS || !blockHas(stock, R, C)) return false;
  return !blockHas(metal, R, C);
};
/** Blocks the outline runs through: some of the part and some stock (fixed by the shape, whatever's been done since). */
const edgeCache = new Map<string, Uint8Array>();
function edgeBlocks(shape: string): Uint8Array {
  let e = edgeCache.get(shape);
  if (e) return e;
  const mask = shapeMask(shape), stock = stockOf(shape);
  e = new Uint8Array(FORGE_ROWS * FORGE_COLS);
  for (let R = 0; R < FORGE_ROWS; R++) for (let C = 0; C < FORGE_COLS; C++) {
    let part = false, extra = false;
    for (let r = R * FINE; r < (R + 1) * FINE; r++) for (let c = C * FINE; c < (C + 1) * FINE; c++) { const i = r * FINE_COLS + c; if (mask[i]) part = true; else if (stock[i]) extra = true; }
    e[R * FORGE_COLS + C] = part && extra ? 1 : 0;
  }
  edgeCache.set(shape, e);
  return e;
}
/**
 * Where the grindstone can work: a block the outline runs through, right beside one the hammer has cleared. Blocks of
 * pure stock are the hammer's alone — the stone can't wear them down, however slowly it's worked — so grinding never
 * opens up more for itself.
 */
export function grindable(metal: Metal, shape: string, R: number, C: number): boolean {
  if (R < 0 || C < 0 || R >= FORGE_ROWS || C >= FORGE_COLS || !edgeBlocks(shape)[R * FORGE_COLS + C]) return false;
  const stock = stockOf(shape);
  return blockOpened(metal, stock, R - 1, C) || blockOpened(metal, stock, R + 1, C) || blockOpened(metal, stock, R, C - 1) || blockOpened(metal, stock, R, C + 1);
}
/** How often a smith's wheel bites into the outline itself as it works an edge, by Blacksmithing (0–4), per cell per pass. */
export const grindNick = (skill: number) => [0.05, 0.03, 0.015, 0.005, 0][Math.max(0, Math.min(4, Math.floor(skill)))];
/**
 * The grindstone: the wheel takes the stock it touches (surface cells, next to air) off within its reach — only in
 * blocks the outline runs through beside blocks the hammer has cleared, and never a block's last bit. Only stock comes
 * off: a steady hand stops at the line, a less skilled one sometimes bites past it (grindNick).
 */
export function grindMetal(metal: Metal, shape: string, fx: number, fy: number, radius: number, skill = 4, rand: () => number = Math.random): { metal: Metal; hit: number[] } {
  const mask = shapeMask(shape);
  const nick = grindNick(skill);
  const at = (r: number, c: number) => r >= 0 && c >= 0 && r < FINE_ROWS && c < FINE_COLS && metal[r * FINE_COLS + c] === 1;
  const hit: number[] = [];
  const ok = new Map<number, boolean>();
  const left = new Map<number, number>();
  const cellsIn = (R: number, C: number) => { let n = 0; for (let r = R * FINE; r < (R + 1) * FINE; r++) for (let c = C * FINE; c < (C + 1) * FINE; c++) if (metal[r * FINE_COLS + c]) n++; return n; };
  for (let r = Math.floor(fy - radius); r <= Math.ceil(fy + radius); r++) for (let c = Math.floor(fx - radius); c <= Math.ceil(fx + radius); c++) {
    if (!at(r, c) || (c + 0.5 - fx) ** 2 + (r + 0.5 - fy) ** 2 > radius * radius) continue;
    if (at(r - 1, c) && at(r + 1, c) && at(r, c - 1) && at(r, c + 1)) continue;
    const i = r * FINE_COLS + c;
    if (mask[i] && !(nick > 0 && rand() < nick)) continue;
    const R = Math.floor(r / FINE), C = Math.floor(c / FINE), b = R * FORGE_COLS + C;
    if (!ok.has(b)) { ok.set(b, grindable(metal, shape, R, C)); left.set(b, cellsIn(R, C)); }
    if (!ok.get(b) || (left.get(b) ?? 0) <= 1) continue;
    left.set(b, (left.get(b) ?? 0) - 1);
    hit.push(i);
  }
  if (!hit.length) return { metal, hit };
  const m = metal.slice();
  for (const i of hit) m[i] = 0;
  return { metal: m, hit };
}
/** The cells' bounding box (fine cells), or null if there's no metal. */
export function metalBounds(metal: Metal): { c0: number; r0: number; c1: number; r1: number } | null {
  let r0 = FINE_ROWS, r1 = -1, c0 = FINE_COLS, c1 = -1;
  for (let i = 0; i < N; i++) if (metal[i]) { const r = Math.floor(i / FINE_COLS), c = i % FINE_COLS; if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; }
  return r1 < 0 ? null : { c0, r0, c1, r1 };
}
/** How big each part's 100 × 40 box is in a finished weapon (one scale for its whole box, so its shape isn't stretched). */
export const PART_SCALE: Record<string, number> = {
  long_blade: 1, short_blade: 0.6, curved_blade: 0.95, axe_head: 0.8, scythe_blade: 0.8, spear_head: 0.45, arrow_tip: 0.25, hammer_head: 0.55,
  bow_stave: 1.4, grip: 0.38, long_haft: 1.3, guard: 0.45, pommel: 0.25, fletching: 0.3,
};
/** Bits of metal no longer joined to the rest break off (all but the biggest piece). Returns the metal and what fell. */
export function breakLoose(metal: Metal): { metal: Metal; fell: number[] } {
  const seen = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!metal[i] || seen[i] >= 0) continue;
    const id = sizes.length; let size = 0;
    stack.push(i); seen[i] = id;
    while (stack.length) {
      const k = stack.pop()!; size++;
      const r = Math.floor(k / FINE_COLS), c = k % FINE_COLS;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || cc < 0 || rr >= FINE_ROWS || cc >= FINE_COLS) continue;
        const j = rr * FINE_COLS + cc;
        if (metal[j] && seen[j] < 0) { seen[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  if (sizes.length < 2) return { metal, fell: [] };
  const main = sizes.indexOf(Math.max(...sizes));
  const m = metal.slice();
  const fell: number[] = [];
  for (let i = 0; i < N; i++) if (m[i] && seen[i] !== main) { m[i] = 0; fell.push(i); }
  return { metal: m, fell };
}

/** A part's numbers from its scores: shape (hammer accuracy) and heat (time in the material's range). */
export function partStats(role: ForgeRole, shape: number, heat: number, material: { hardness: number; value: number; weight: number }) {
  const quality = Math.round(shape);
  // Durability is a percentage (0–100): how well it was shaped, how well the heat was kept, and how hard the material is.
  const durability = Math.max(1, Math.min(100, Math.round(0.45 * Math.max(0, Math.min(100, shape)) + 0.4 * Math.max(0, Math.min(100, heat)) + 1.5 * Math.max(0, material.hardness) + 6)));
  const tier = accuracyTier(quality * 0.6 + heat * 0.4);
  return {
    quality, durability, tier,
    damageBonus: role === "blade" ? Math.max(-2, Math.min(5, Math.round((quality - 60) / 8))) : 0,
    accuracy: role === "handle" ? Math.max(-1, Math.min(4, Math.round((quality - 50) / 12))) : 0,
    weight: Math.round(material.weight * 10) / 10,
    value: material.value,
  };
}
/** What an item sells for: its value at its durability (100 = full value) — nothing below 30. */
export const sellValue = (value: number, durability: number) => (durability < 30 ? 0 : Math.floor((value * Math.max(0, Math.min(100, durability))) / 100));
/** The same, as a formula on an item's own values. */
export const SELL_VALUE_FORMULA = "if(durability < 30, 0, floor(value * min(100, max(0, durability)) / 100))";
/** The finished weapon: durability is the parts' average; its worth is what went into it, twice over (it sells for that at its durability). */
export function weaponStats(parts: Array<{ role: ForgeRole; durability: number; damageBonus: number; accuracy: number; weight: number; value: number }>) {
  const n = parts.length || 1;
  const durability = Math.round(parts.reduce((s, p) => s + p.durability, 0) / n);
  return {
    durability,
    damageBonus: parts.filter((p) => p.role === "blade").reduce((s, p) => s + p.damageBonus, 0),
    accuracy: parts.filter((p) => p.role === "handle").reduce((s, p) => s + p.accuracy, 0),
    weight: Math.round(parts.reduce((s, p) => s + p.weight, 0) * 10) / 10,
    value: Math.round(parts.reduce((s, p) => s + p.value, 0) * 2 + 10),
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
