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
  short_sword: { label: "Short sword blade", role: "blade", points: [[0, 15], [78, 13.5], [100, 20], [78, 26.5], [0, 25]] },
  curved_blade: { label: "Curved blade (sabre)", role: "blade", points: [[0, 17], [40, 15], [75, 11], [100, 4], [92, 14], [70, 22], [38, 25], [0, 25]] },
  axe_head: { label: "Axe head", role: "blade", points: [[20, 14], [55, 12], [70, 2], [88, 0], [100, 20], [88, 40], [70, 38], [55, 28], [20, 26]] },
  scythe_blade: { label: "Scythe blade", role: "blade", points: [[0, 6], [30, 3], [60, 5], [85, 12], [100, 26], [82, 19], [58, 14], [30, 13], [0, 14]] },
  spear_head: { label: "Spear head", role: "blade", points: [[0, 17], [30, 16], [45, 10], [100, 20], [45, 30], [30, 24], [0, 23]] },
  arrow_tip: { label: "Arrow tip", role: "blade", points: [[0, 17], [40, 17], [40, 8], [100, 20], [40, 32], [40, 23], [0, 23]] },
  hammer_head: { label: "Hammer head", role: "blade", points: [[25, 4], [75, 4], [78, 8], [78, 32], [75, 36], [25, 36], [22, 32], [22, 8]] },
  bow_stave: { label: "Bow stave", role: "blade", points: [...arc(50, 120, 110, -Math.PI * 0.72, -Math.PI * 0.28, 14), ...arc(50, 120, 104, -Math.PI * 0.28, -Math.PI * 0.72, 14)] },
  long_stave: { label: "Longbow stave", role: "blade", points: [...arc(50, 150, 140, -Math.PI * 0.68, -Math.PI * 0.32, 16), ...arc(50, 150, 134, -Math.PI * 0.32, -Math.PI * 0.68, 16)] },
  war_stave: { label: "Warbow stave (thick)", role: "blade", points: [...arc(50, 130, 122, -Math.PI * 0.7, -Math.PI * 0.3, 16), ...arc(50, 130, 111, -Math.PI * 0.3, -Math.PI * 0.7, 16)] },
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

/** Caches keyed by shape. A mold is a shape made up as it's drawn, so they can be forgotten again. */
const shapeCaches: Array<Map<string, unknown>> = [];
function forgetShape(key: string) { for (const c of shapeCaches) c.delete(key); }

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
shapeCaches.push(maskCache as Map<string, unknown>, stockCache as Map<string, unknown>);
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
/** How far (fine cells) from the outline the grindstone reaches: about a block. Stock farther out is the hammer's. */
export const GRIND_REACH = 5;
/** The most the grindstone may knock loose at once (fine cells): specks, not pieces. */
const GRIND_LOOSE = 16;
/** The outline's outermost layer of cells (the only part an unsteady wheel can bite). */
const rimCache = new Map<string, Metal>();
shapeCaches.push(rimCache as Map<string, unknown>);
function outlineRim(shape: string): Metal {
  let rim = rimCache.get(shape);
  if (rim) return rim;
  const mask = shapeMask(shape);
  rim = new Uint8Array(N);
  for (let r = 0; r < FINE_ROWS; r++) for (let c = 0; c < FINE_COLS; c++) {
    const i = r * FINE_COLS + c;
    if (mask[i] && [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => rr < 0 || cc < 0 || rr >= FINE_ROWS || cc >= FINE_COLS || !mask[rr * FINE_COLS + cc])) rim[i] = 1;
  }
  rimCache.set(shape, rim);
  return rim;
}
/** Each fine cell's distance to the outline (0 inside it), per shape. */
const distCache = new Map<string, Float32Array>();
shapeCaches.push(distCache as Map<string, unknown>);
export function outlineDistance(shape: string): Float32Array {
  let d = distCache.get(shape);
  if (d) return d;
  const mask = shapeMask(shape);
  const edge: number[] = [];
  for (let r = 0; r < FINE_ROWS; r++) for (let c = 0; c < FINE_COLS; c++) {
    const i = r * FINE_COLS + c;
    if (!mask[i]) continue;
    if ([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => rr < 0 || cc < 0 || rr >= FINE_ROWS || cc >= FINE_COLS || !mask[rr * FINE_COLS + cc])) edge.push(r, c);
  }
  d = new Float32Array(N);
  for (let r = 0; r < FINE_ROWS; r++) for (let c = 0; c < FINE_COLS; c++) {
    const i = r * FINE_COLS + c;
    if (mask[i]) continue;
    let best = 1e9;
    for (let k = 0; k < edge.length; k += 2) { const dr = edge[k] - r, dc = edge[k + 1] - c, q = dr * dr + dc * dc; if (q < best) best = q; }
    d[i] = Math.sqrt(best);
  }
  distCache.set(shape, d);
  return d;
}
/**
 * Whether the grindstone can take this cell: stock (not the part), on the surface, within reach of the outline — and
 * nothing farther out still beside it, so it wears the stock down from the outside in, following the line (and can't
 * cut a channel under stock the hammer should take).
 */
function grindableCell(metal: Metal, mask: Metal, dist: Float32Array, r: number, c: number): boolean {
  const i = r * FINE_COLS + c;
  if (!metal[i] || mask[i] || dist[i] > GRIND_REACH) return false;
  let open = false;
  for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
    if (rr < 0 || cc < 0 || rr >= FINE_ROWS || cc >= FINE_COLS) { open = true; continue; }
    const j = rr * FINE_COLS + cc;
    if (!metal[j]) { open = true; continue; }
    // Stock farther out that the stone could take goes first (so it follows the line); stock beyond its reach
    // doesn't hold it up — and grinding can't cut that loose either (see grindMetal).
    if (!mask[j] && dist[j] <= GRIND_REACH && dist[j] > dist[i] + 0.5) return false;
  }
  return open;
}
/** Whether the grindstone has anything to take within `radius` of (fx, fy) — for telling the smith why it skates. */
export function grindableNear(metal: Metal, shape: string, fx: number, fy: number, radius: number): boolean {
  const mask = shapeMask(shape), dist = outlineDistance(shape);
  for (let r = Math.floor(fy - radius); r <= Math.ceil(fy + radius); r++) for (let c = Math.floor(fx - radius); c <= Math.ceil(fx + radius); c++) {
    if (r < 0 || c < 0 || r >= FINE_ROWS || c >= FINE_COLS || (c + 0.5 - fx) ** 2 + (r + 0.5 - fy) ** 2 > radius * radius) continue;
    if (grindableCell(metal, mask, dist, r, c)) return true;
  }
  return false;
}
/** How often a smith's wheel bites into the outline itself as it works an edge, by Blacksmithing (0–4), per cell per pass. */
export const grindNick = (skill: number) => [0.05, 0.03, 0.015, 0.005, 0][Math.max(0, Math.min(4, Math.floor(skill)))];
/**
 * The grindstone: the wheel wears away the stock it touches, a layer at a time from the outside in, down to the
 * outline — within about a block of it (GRIND_REACH), hammered or not. Only stock comes off: a steady hand stops at the
 * line, a less skilled one sometimes bites past it (grindNick).
 */
export function grindMetal(metal: Metal, shape: string, fx: number, fy: number, radius: number, skill = 4, rand: () => number = Math.random): { metal: Metal; hit: number[]; /** Why nothing came off, when it's because it would knock a piece loose. */ loose?: boolean } {
  const mask = shapeMask(shape), dist = outlineDistance(shape), rim = outlineRim(shape);
  const nick = grindNick(skill);
  const r0 = Math.max(0, Math.floor(fy - radius)), r1 = Math.min(FINE_ROWS - 1, Math.ceil(fy + radius));
  const c0 = Math.max(0, Math.floor(fx - radius)), c1 = Math.min(FINE_COLS - 1, Math.ceil(fx + radius));
  const inside = (r: number, c: number) => (c + 0.5 - fx) ** 2 + (r + 0.5 - fy) ** 2 <= radius * radius;
  const hit: number[] = [];
  const take = new Set<number>();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!inside(r, c)) continue;
    const i = r * FINE_COLS + c;
    if (grindableCell(metal, mask, dist, r, c)) take.add(i);
    // The line itself: only an unsteady hand bites into it.
    // (only its outermost layer, so it never eats deeper the longer it's held there).
    else if (nick > 0 && metal[i] && rim[i] && rand() < nick && [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => rr >= 0 && cc >= 0 && rr < FINE_ROWS && cc < FINE_COLS && !metal[rr * FINE_COLS + cc])) take.add(i);
  }
  if (!take.size) return { metal, hit };
  const m = metal.slice();
  take.forEach((i) => { m[i] = 0; });
  // The stone may knock off specks, but never cut a whole piece of stock loose — that's the hammer's work.
  if (breakLoose(m).fell.length > GRIND_LOOSE) return { metal, hit, loose: true };
  take.forEach((i) => hit.push(i));
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
  long_blade: 1, short_blade: 0.6, short_sword: 0.8, long_stave: 1.7, war_stave: 1.8, curved_blade: 0.95, axe_head: 0.8, scythe_blade: 0.8, spear_head: 0.45, arrow_tip: 0.25, hammer_head: 0.55,
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

// --------------------------------------------------------------------------- tools
// What the tool in your hand does to the work. Every craft reads the same two
// values off whatever tool is being used, so a jeweller's loupe-and-needle set
// helps a rune the way a good hammer helps a blade.
//
//   tool_skill      temporary points on the craft's skill, + or −. A crude
//                   improvised tool is a penalty; a masterwork set is a bonus.
//   tool_min_rune   rune making only: the smallest mark this tool can cut, as
//                   a percentage of the item it is cut into. A chisel cannot
//                   do fine work; a needle can.

/** The smallest rune any tool can manage, and the largest any rune may be. */
export const RUNE_SIZE_MIN = 4;
export const RUNE_SIZE_MAX = 80;

export interface ToolEffects {
  /** Temporary points on the craft's skill, from the tool. */
  skill: number;
  /** Rune making: the smallest size this tool can cut (percent of the item). */
  minRuneSize: number;
}

/**
 * A tool's effect on the work, from its own values. A tool that says nothing
 * is simply a tool: no bonus, no penalty, and no limit on how fine it can cut.
 */
export function toolEffects(
  read: (key: string) => AgValue | undefined,
): ToolEffects {
  const skill = Math.round(numOf(read("tool_skill"), 0));
  const min = numOf(read("tool_min_rune"), 0);
  return {
    // Bounded so a mistyped value can't make a craft impossible or certain.
    skill: Math.max(-10, Math.min(10, skill)),
    minRuneSize: Math.max(RUNE_SIZE_MIN, Math.min(RUNE_SIZE_MAX, min || RUNE_SIZE_MIN)),
  };
}

/** How a tool's effect reads on screen: "+2 Rune Making", "can't cut under 12%". */
export function toolEffectWords(t: ToolEffects, craftLabel: string): string[] {
  const out: string[] = [];
  if (t.skill) out.push(`${t.skill > 0 ? "+" : "−"}${Math.abs(t.skill)} ${craftLabel}`);
  if (t.minRuneSize > RUNE_SIZE_MIN) out.push(`nothing finer than ${t.minRuneSize}%`);
  return out;
}

// --------------------------------------------------------------------------- rune space
// How many runes an item takes is not a number on the item - it is how much
// room is left on it. Runes are marks cut into a surface: they cannot be cut
// through one another, and a big one leaves less space than a small one.

/** A rune's place on an item: centre, size and turn, all as percentages of the picture. */
export interface RunePlacement { x: number; y: number; s: number; r?: number }

/**
 * Two runes clash when their marks would cross. Each is treated as the circle
 * that just contains its sigil box, which is forgiving at the corners - a
 * rune is strokes inside its box, not a filled square, so touching corners is
 * not two marks crossing.
 */
export function runesOverlap(a: RunePlacement, b: RunePlacement, gap = 1): boolean {
  const ra = a.s / 2, rb = b.s / 2;
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy) < ra + rb + gap;
}

/** Whether a rune sits fully on the item rather than hanging off its edge. */
export function runeOnItem(p: RunePlacement): boolean {
  const r = p.s / 2;
  return p.x - r >= -1 && p.x + r <= 101 && p.y - r >= -1 && p.y + r <= 101;
}

export type RuneFitProblem = "overlap" | "offItem" | "tooSmall" | null;

/**
 * Whether a rune can go where it has been put: on the item, clear of every
 * rune already cut there, and no finer than the tool can cut.
 */
export function runeFit(p: RunePlacement, existing: RunePlacement[], minSize = RUNE_SIZE_MIN): RuneFitProblem {
  if (p.s < minSize - 0.001) return "tooSmall";
  if (!runeOnItem(p)) return "offItem";
  if (existing.some((e) => runesOverlap(p, e))) return "overlap";
  return null;
}

export const RUNE_FIT_WORDS: Record<Exclude<RuneFitProblem, null>, string> = {
  overlap: "That would cut across a rune already here",
  offItem: "That hangs off the edge of the item",
  tooSmall: "Too fine for this tool",
};

/**
 * Somewhere this rune will fit, searched outwards from where it was asked for,
 * or null when the item has no room left for one this size. Used to say "full"
 * honestly: an item is full when nothing more fits, not when a count runs out.
 */
export function findRuneSpot(p: RunePlacement, existing: RunePlacement[], minSize = RUNE_SIZE_MIN): RunePlacement | null {
  if (!runeFit(p, existing, minSize)) return p;
  if (p.s < minSize - 0.001) return null;
  const r = p.s / 2;
  // A coarse sweep is enough: this answers "is there room", not "where is
  // the prettiest spot", which is the crafter's call.
  for (let ring = 2; ring <= 100; ring += 2) {
    for (let a = 0; a < 360; a += 15) {
      const t = (a * Math.PI) / 180;
      const c = { ...p, x: p.x + ring * Math.cos(t), y: p.y + ring * Math.sin(t) };
      if (c.x - r < 0 || c.x + r > 100 || c.y - r < 0 || c.y + r > 100) continue;
      if (!runeFit(c, existing, minSize)) return c;
    }
  }
  return null;
}

/** Roughly how much of an item's face its runes already take up, 0–1. */
export function runeSpaceUsed(existing: RunePlacement[]): number {
  const area = existing.reduce((a, p) => a + Math.PI * (p.s / 2) ** 2, 0);
  return Math.max(0, Math.min(1, area / (100 * 100)));
}

// --------------------------------------------------------------------------- the mold
// Blacksmithing is not picking a shape off a list any more. You draw the mold:
// click points, and the line between any two can be pulled into a curve. The
// shape you draw IS the weapon, and what you make of it decides what it does.
//
// Nothing here knows the name of a single weapon. A long thin point reaches
// and pierces; a heavy head at the far end hits hard and swings slow; a long
// curved belly cuts. Draw a scythe and you get a scythe's trade-offs because
// of its shape, not because anyone listed "scythe".

/** A point on the mold outline, in a 100 × 100 box. `c` bends the line INTO this point. */
export interface MoldPoint { x: number; y: number; /** -100 … 100: how far the line bows, and which way. */ c?: number }

export interface Mold {
  /** The outline, in order. Closed: the last point joins the first. */
  points: MoldPoint[];
  /** Where the handle meets it, as a fraction along the outline's width (0 = left edge). */
  grip?: number;
}

export const MOLD_MAX_POINTS = 48;

/**
 * A new point goes into the outline between the two it landed nearest, rather
 * than on the end — otherwise clicking inside a shape folds it over itself and
 * the smith watches their blade turn into a knot.
 */
export function insertMoldPoint(points: MoldPoint[], at: { x: number; y: number }): { points: MoldPoint[]; index: number } {
  const p = { x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10 };
  if (points.length < 2) return { points: [...points, p], index: points.length };
  let best = 0, bd = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    if (d < bd) { bd = d; best = i + 1; }
  }
  return { points: [...points.slice(0, best), p, ...points.slice(best)], index: best };
}

/** Which point the finger landed on, or -1 for the empty canvas. */
export function moldPointAt(points: MoldPoint[], at: { x: number; y: number }, reach = 6): number {
  let best = -1, bd = reach;
  points.forEach((q, i) => { const d = Math.hypot(q.x - at.x, q.y - at.y); if (d < bd) { bd = d; best = i; } });
  return best;
}

/**
 * The control point of the curve running from a into b. The bow belongs to the
 * point the line runs INTO, so pulling on one point bends the two lines that
 * meet there and nothing else. Shared so the shape on screen and the shape
 * being measured are the same curve, down to the pixel.
 */
export function moldControl(a: MoldPoint, b: MoldPoint): [number, number] {
  const bow = (b.c ?? 0) / 100;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const nx = -(b.y - a.y), ny = b.x - a.x;
  const len = Math.hypot(nx, ny) || 1;
  return [mx + (nx / len) * bow * len * 0.5, my + (ny / len) * bow * len * 0.5];
}

/** A mold's outline with its curves drawn out into plain points, for measuring and filling. */
export function moldOutline(mold: Mold, perEdge = 12): number[][] {
  const p = mold.points;
  if (p.length < 2) return p.map((q) => [q.x, q.y]);
  const out: number[][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const [cx, cy] = moldControl(a, b);
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge, u = 1 - t;
      out.push([u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y]);
    }
  }
  return out;
}

/** The outline as an SVG path, the same curves moldOutline measures. */
export function moldPath(mold: Mold): string {
  const p = mold.points;
  if (p.length < 2) return "";
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const [cx, cy] = moldControl(a, b);
    d += ` Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x} ${b.y}`;
  }
  return `${d} Z`;
}

const polyArea = (poly: number[][]) => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
};

/** What a drawn mold is, measured: nothing here is a weapon name, only shape. */
export interface MoldMeasure {
  /** Filled area as a fraction of the box - how much metal the head is. */
  mass: number;
  /** Longest span across the shape, 0–1 of the box. */
  length: number;
  /** How far the metal sits from the grip end: 0 all at the hand, 1 all at the tip. */
  balance: number;
  /** How sharply the far end narrows: 1 is a needle, 0 is a flat face. */
  point: number;
  /** How much of the outline is a long smooth curve rather than straight runs. */
  curve: number;
  /** Widest measure across the swing, 0–1 - a broad head catches more. */
  breadth: number;
  /** How even the shape is about its own spine; 1 is symmetrical. */
  symmetry: number;
}

export function measureMold(mold: Mold): MoldMeasure {
  const poly = moldOutline(mold);
  if (poly.length < 3) return { mass: 0, length: 0, balance: 0.5, point: 0, curve: 0, breadth: 0, symmetry: 1 };
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const area = polyArea(poly);
  const mass = Math.max(0, Math.min(1, area / 10000));
  const length = Math.max(0, Math.min(1, Math.max(w, h) / 100));
  const breadth = Math.max(0, Math.min(1, Math.min(w, h) / 100));

  // Balance: where the metal sits along the long axis, measured in strips so a
  // heavy head at the end reads differently from the same metal spread out.
  const along = w >= h ? 0 : 1;
  const lo = along ? minY : minX, hi = along ? maxY : maxX;
  const strips = 10;
  let moment = 0, total = 0;
  for (let i = 0; i < strips; i++) {
    const a = lo + ((hi - lo) * i) / strips, b = lo + ((hi - lo) * (i + 1)) / strips;
    const inStrip = poly.filter((p) => p[along] >= a && p[along] < b).length;
    moment += inStrip * (i + 0.5) / strips;
    total += inStrip;
  }
  const balance = total ? Math.max(0, Math.min(1, moment / total)) : 0.5;

  // Point: how much narrower the last tenth is than the widest tenth.
  const across = along ? 0 : 1;
  const spanAt = (a: number, b: number) => {
    const band = poly.filter((p) => p[along] >= a && p[along] <= b).map((p) => p[across]);
    return band.length ? Math.max(...band) - Math.min(...band) : 0;
  };
  const tipSpan = spanAt(hi - (hi - lo) * 0.12, hi);
  let widest = 0;
  for (let i = 0; i < strips; i++) widest = Math.max(widest, spanAt(lo + ((hi - lo) * i) / strips, lo + ((hi - lo) * (i + 1)) / strips));
  const point = widest > 0 ? Math.max(0, Math.min(1, 1 - tipSpan / widest)) : 0;

  // Curve: how far the drawn outline runs beyond the straight lines between
  // its own corners - a bowed belly is long here, a boxy head is not.
  const straight = mold.points.reduce((a, p, i) => {
    const q = mold.points[(i + 1) % mold.points.length];
    return a + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
  const drawn = poly.reduce((a, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return a + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0);
  const curve = straight > 0 ? Math.max(0, Math.min(1, (drawn / straight - 1) * 4)) : 0;

  // Symmetry: the shape folded over its own long axis.
  const mid = along ? (minX + maxX) / 2 : (minY + maxY) / 2;
  const diffs = poly.map((p) => Math.abs(p[across] - mid));
  const mean = diffs.reduce((a, d) => a + d, 0) / diffs.length;
  const spread = Math.sqrt(diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / diffs.length);
  const symmetry = Math.max(0, Math.min(1, 1 - spread / Math.max(1, mean + spread)));

  return { mass, length, balance, point, curve, breadth, symmetry };
}

/** What a shape turns out to be good and bad at. Every number is a modifier. */
export interface MoldTraits {
  /** Extra damage dice sides, from how much metal lands on the blow. */
  damage: number;
  /** How far it reaches, in feet over a bare hand's reach. */
  reach: number;
  /** Attacks are quicker or slower: + is faster. */
  speed: number;
  /** How hard it is to use well - subtracted from attack rolls. */
  unwieldy: number;
  /** How well it holds an edge / resists bending. */
  durability: number;
  /** What it does best, for the item's own description. */
  notes: string[];
}

/**
 * The trade-offs a shape earns. There is no good shape here and no bad one:
 * every gain is paid for. A long reach is slow. A heavy head hits hard and
 * tires the arm. A needle point pierces and snaps.
 */
export function moldTraits(m: MoldMeasure): MoldTraits {
  const notes: string[] = [];
  // Metal on the blow. A heavy head that sits far out hits hardest of all.
  const heft = m.mass * (0.5 + m.balance);
  let damage = Math.round(heft * 8 - 1.5);
  // A real point concentrates the blow.
  if (m.point > 0.72) { damage += 1; notes.push("pierces armour"); }
  // A long curved belly slices rather than chops.
  if (m.curve > 0.4 && m.length > 0.55) { damage += 1; notes.push("cuts deep on the draw"); }

  const reach = Math.round(m.length * 10 - 2);

  // Weight out at the end is slow; metal near the hand is quick.
  let speed = Math.round((0.55 - m.balance) * 6 - m.mass * 4);
  if (m.mass < 0.18 && m.length < 0.5) { speed += 1; notes.push("quick in close"); }

  // Lopsided and far-weighted shapes fight the hand.
  let unwieldy = Math.max(0, Math.round((1 - m.symmetry) * 4 + Math.max(0, m.balance - 0.6) * 6 + Math.max(0, m.mass - 0.5) * 4));
  if (m.breadth > 0.55) { unwieldy += 1; notes.push("broad - hard to carry unseen"); }

  // A needle snaps; a thick even shape holds.
  let durability = Math.round(m.mass * 6 + m.symmetry * 2 - m.point * 4);
  if (m.point > 0.85 && m.mass < 0.22) { durability -= 2; notes.push("fine point - it will not take a parry"); }
  if (m.mass > 0.45 && m.point < 0.3) notes.push("blunt and solid");

  if (!notes.length) notes.push("honest and plain");
  return {
    damage: Math.max(-3, Math.min(6, damage)),
    reach: Math.max(0, Math.min(10, reach)),
    speed: Math.max(-4, Math.min(3, speed)),
    unwieldy: Math.max(0, Math.min(6, unwieldy)),
    durability: Math.max(-3, Math.min(8, durability)),
    notes: notes.slice(0, 3),
  };
}

/**
 * What a shape most resembles, for a suggested name only. The trade-offs come
 * from the shape itself; this is a courtesy so the crafter has somewhere to
 * start when naming what they made.
 */
export function moldResembles(m: MoldMeasure): string {
  if (m.mass > 0.4 && m.point < 0.35 && m.balance > 0.55) return "maul";
  if (m.point > 0.8 && m.breadth < 0.25) return "spike";
  if (m.curve > 0.45 && m.balance > 0.6 && m.length > 0.6) return "scythe";
  if (m.curve > 0.35 && m.length > 0.5) return "sabre";
  if (m.length > 0.7 && m.breadth < 0.3) return "longblade";
  if (m.breadth > 0.5 && m.balance > 0.55) return "axe";
  if (m.length < 0.45 && m.mass < 0.25) return "dagger";
  return "blade";
}

export const MOLD_NAME_HINT: Record<string, string> = {
  maul: "A heavy head that falls hard.",
  spike: "All point, no belly.",
  scythe: "A long curved reach.",
  sabre: "Curved, made for the draw.",
  longblade: "Long and straight.",
  axe: "Broad at the head.",
  dagger: "Small and quick.",
  blade: "A blade of your own making.",
};

/** A mold off the wire, trimmed to something safe to measure and store. */
export function parseMold(raw: unknown): Mold | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pts = Array.isArray(r.points) ? r.points : [];
  const points: MoldPoint[] = [];
  for (const p of pts.slice(0, MOLD_MAX_POINTS)) {
    if (!p || typeof p !== "object") continue;
    const q = p as Record<string, unknown>;
    if (typeof q.x !== "number" || typeof q.y !== "number") continue;
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    const point: MoldPoint = { x: num(q.x, 0, 0, 100), y: num(q.y, 0, 0, 100) };
    const c = num(q.c, 0, -100, 100);
    if (c) point.c = Math.round(c);
    points.push(point);
  }
  if (points.length < 3) return null;
  const mold: Mold = { points };
  const grip = num(r.grip, -1, 0, 1);
  if (grip >= 0) mold.grip = grip;
  return mold;
}

/** The values a finished mold writes onto the item it makes. */
export function moldItemValues(mold: Mold): Record<string, number | string> {
  const m = measureMold(mold);
  const t = moldTraits(m);
  return {
    mold_damage: t.damage,
    mold_reach: t.reach,
    mold_speed: t.speed,
    mold_unwieldy: t.unwieldy,
    mold_durability: t.durability,
    mold_notes: t.notes.join(", "),
    mold_shape: moldResembles(m),
  };
}

/**
 * A drawn mold as a forge outline, so the anvil can work metal to it. The shape
 * is fitted into the bar (laid on its side if it was drawn tall, since the bar
 * is wide) and registered under a key of its own, which means everything that
 * works by shape name — the mask, the starting bar, the grindstone, the target
 * drawn over the metal — takes a mold unchanged.
 */
export function moldBarPoints(mold: Mold): number[][] {
  const poly = moldOutline(mold);
  if (poly.length < 3) return FORGE_SHAPES.long_blade.points;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // Drawn taller than wide: turn it a quarter so it lies along the bar.
  const turn = maxY - minY > maxX - minX;
  const pts = turn ? poly.map(([x, y]) => [y, -x]) : poly;
  const qx = pts.map((p) => p[0]), qy = pts.map((p) => p[1]);
  const x0 = Math.min(...qx), x1 = Math.max(...qx), y0 = Math.min(...qy), y1 = Math.max(...qy);
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  // Inside the bar with a little room all round, the drawing's own proportions kept.
  const k = Math.min(92 / w, 34 / h);
  const ox = (100 - w * k) / 2, oy = (40 - h * k) / 2;
  return pts.map(([x, y]) => [ox + (x - x0) * k, oy + (y - y0) * k]);
}

const moldKeys: string[] = [];
export function moldKey(mold: Mold): string {
  let h = 5381;
  for (const p of mold.points) for (const n of [Math.round(p.x * 4), Math.round(p.y * 4), Math.round(p.c ?? 0)]) h = ((h * 33) ^ (n + 512)) >>> 0;
  return `mold:${h.toString(36)}`;
}
/** Registers a mold as a forge shape and gives back its key. Safe to call on every render. */
export function registerMold(mold: Mold, label = "Mold"): string {
  const key = moldKey(mold);
  if (FORGE_SHAPES[key]) return key;
  FORGE_SHAPES[key] = { label, role: "blade", points: moldBarPoints(mold) };
  moldKeys.push(key);
  // Every design drawn costs a mask, a starting bar and a distance map, so only
  // the recent ones are kept — a smith redraws a mold a hundred times.
  while (moldKeys.length > 12) { const old = moldKeys.shift()!; delete FORGE_SHAPES[old]; forgetShape(old); }
  return key;
}
export const isMoldShape = (shape: string) => shape.startsWith("mold:");

/**
 * What a mold is worth as a weapon, with the tier and the metal it was cast in.
 * The shape decides what it does; the tier is how well it was made, and good
 * work gets more of what the shape promised (bad work less).
 */
export function moldWeapon(mold: Mold, tier: CraftTier, material: { hardness: number; value: number; weight: number }) {
  const m = measureMold(mold);
  const t = moldTraits(m);
  const k = TIER_WORTH[tier];
  const failed = tier === "fail";
  // The die comes off how much metal lands on the blow, the shape's own doing.
  const die = [4, 6, 8, 10, 12][Math.max(0, Math.min(4, Math.round(2 + t.damage / 2)))];
  const hard = Math.max(0, Math.min(10, material.hardness));
  return {
    tier, failed, measure: m, traits: t, die: failed ? 4 : die,
    damageBonus: failed ? 0 : Math.round(t.damage * k) + TIER_BONUS[tier],
    // A shape that fights the hand costs accuracy; good work takes the edge off that.
    accuracy: failed ? 0 : Math.round(t.speed * k) - Math.round(t.unwieldy * (failed ? 1 : 1 / Math.max(1, k))),
    durability: failed ? 10 : Math.max(5, Math.min(100, Math.round((40 + t.durability * 5 + hard * 3) * Math.min(1.25, k)))),
    reach: failed ? 0 : t.reach,
    weight: Math.max(0.2, Math.round((0.5 + m.mass * 6) * Math.max(0.3, material.weight) * 10) / 10),
    value: failed ? 0 : Math.max(1, Math.round((8 + m.mass * 40 + Math.max(0, t.damage) * 6) * Math.max(0.3, material.value) * k)),
  };
}

/** What the trade-offs read as on screen and on the item's page. */
export function moldTraitWords(t: MoldTraits): string[] {
  const out: string[] = [];
  const sign = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
  if (t.damage) out.push(`${sign(t.damage)} damage`);
  if (t.reach) out.push(`${t.reach} ft reach`);
  if (t.speed) out.push(t.speed > 0 ? `${sign(t.speed)} quick` : `${sign(t.speed)} slow`);
  if (t.unwieldy) out.push(`−${t.unwieldy} to handle`);
  if (t.durability) out.push(`${sign(t.durability)} sound`);
  return out;
}
