// Swampy — a fresh, independent 5th game system.
// Nothing in this file is imported from or exported to shared/ca.ts,
// shared/v3.ts, or any other system's constants. Swampy starts life as a
// straight copy of C.A., but the two are fully independent from here on:
// editing this file never touches C.A., and editing shared/ca.ts never
// touches Swampy.

// ---------------------------------------------------------------------------
// Wounds — replaces HP entirely for Swampy. A freeform pin on a body diagram,
// not a fixed grid of slots: click "Add Wound", click a spot on the body,
// and that becomes a wound with its own name, severity, and description.
// A wound can carry multiple effects, each just a skill/stat target plus a
// numeric amount (no free text per effect) — applied automatically to that
// skill's rolls or that movement stat while the wound is active (untreated).
// ---------------------------------------------------------------------------

export type SwampyWoundSeverity = "minor" | "moderate" | "serious";

export const SWAMPY_WOUND_SEVERITIES: SwampyWoundSeverity[] = ["minor", "moderate", "serious"];

export const SWAMPY_WOUND_SEVERITY_LABELS: Record<SwampyWoundSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  serious: "Serious",
};

// How many points of Wound Capacity an active (untreated) wound of this
// severity costs.
export const SWAMPY_WOUND_SEVERITY_COST: Record<SwampyWoundSeverity, number> = {
  minor: 1,
  moderate: 2,
  serious: 3,
};

// Sort weight for "most severe first" — higher sorts first.
export const SWAMPY_WOUND_SEVERITY_RANK: Record<SwampyWoundSeverity, number> = {
  serious: 3,
  moderate: 2,
  minor: 1,
};

// Movement stats a wound's effect can target besides a skill.
export const SWAMPY_FIXED_STAT_TARGETS = ["speed", "flySpeed", "swimSpeed"] as const;
export type SwampyFixedStatTarget = typeof SWAMPY_FIXED_STAT_TARGETS[number];
export const SWAMPY_FIXED_STAT_LABELS: Record<SwampyFixedStatTarget, string> = {
  speed: "Speed",
  flySpeed: "Fly Speed",
  swimSpeed: "Swim Speed",
};

export function swampyWoundEffectTargetLabel(target: string): string {
  if ((SWAMPY_FIXED_STAT_TARGETS as readonly string[]).includes(target)) return SWAMPY_FIXED_STAT_LABELS[target as SwampyFixedStatTarget];
  const skill = SWAMPY_SKILLS.find(s => s.key === target);
  if (skill) return skill.name;
  return target;
}

export interface SwampyWoundEffect {
  id: string;
  target: string; // a SWAMPY_SKILLS key or a SwampyFixedStatTarget — always set, no free-text per effect
  amount: number;
}

export interface SwampyWound {
  id: string;
  x: number; // 0-100, percent position on the body diagram
  y: number; // 0-100
  name: string;
  severity: SwampyWoundSeverity;
  description: string;
  effects: SwampyWoundEffect[];
}

let swampyWoundIdCounter = 0;
function makeSwampyWoundId(): string {
  swampyWoundIdCounter += 1;
  return `w${Date.now().toString(36)}${swampyWoundIdCounter}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeSwampyWoundEffect(): SwampyWoundEffect {
  return { id: makeSwampyWoundId(), target: SWAMPY_FIXED_STAT_TARGETS[0], amount: 0 };
}

// A fresh wound pinned at (x, y) — percent coordinates on the body diagram,
// clamped 0-100 so a click just outside the image can't store a marker
// that renders off it.
export function makeSwampyWound(x: number, y: number): SwampyWound {
  return {
    id: makeSwampyWoundId(),
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
    name: "",
    severity: "minor",
    description: "",
    effects: [],
  };
}

// A target is required now — an effect with no target (an old free-text
// effect line, or an old optional-target shape) can't be represented in
// this model, so it's dropped rather than kept as a meaningless bullet.
function normalizeSwampyWoundEffect(raw: unknown): SwampyWoundEffect | null {
  if (!raw || typeof raw !== "object") return null;
  const anyE = raw as any;
  if (typeof anyE.target !== "string" || !anyE.target) return null;
  return {
    id: typeof anyE.id === "string" && anyE.id ? anyE.id : makeSwampyWoundId(),
    target: anyE.target,
    amount: Number.isFinite(Number(anyE.amount)) ? Math.trunc(Number(anyE.amount)) : 0,
  };
}

// Tolerates missing/malformed data (a character predating this shape, an
// old fixed-slot-era wounds array, or a plain corrupt value) by dropping
// anything that doesn't look like a real wound rather than throwing.
export function normalizeSwampyWounds(raw: unknown): SwampyWound[] {
  if (!Array.isArray(raw)) return [];
  const out: SwampyWound[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const anyW = w as any;
    if (typeof anyW.x !== "number" && typeof anyW.y !== "number") continue; // old fixed-slot shape, drop it
    const severity: SwampyWoundSeverity =
      anyW.severity === "moderate" || anyW.severity === "serious" ? anyW.severity : "minor";
    out.push({
      id: typeof anyW.id === "string" && anyW.id ? anyW.id : makeSwampyWoundId(),
      x: Number.isFinite(Number(anyW.x)) ? Math.max(0, Math.min(100, Number(anyW.x))) : 50,
      y: Number.isFinite(Number(anyW.y)) ? Math.max(0, Math.min(100, Number(anyW.y))) : 50,
      name: typeof anyW.name === "string" ? anyW.name : "",
      severity,
      description: typeof anyW.description === "string" ? anyW.description : "",
      effects: Array.isArray(anyW.effects)
        ? anyW.effects.map(normalizeSwampyWoundEffect).filter((e: SwampyWoundEffect | null): e is SwampyWoundEffect => e !== null)
        : [],
    });
  }
  return out;
}

// Sums every wound's effects targeting `target` (a SWAMPY_SKILLS key or a
// SwampyFixedStatTarget). Treating a wound removes it (and its effects)
// entirely — see swampyWoundEffectTargetLabel's callers — so every wound in
// the array is by definition active; this is always computed fresh from
// the wounds array, never a separately stored total.
export function swampyWoundStatEffectTotal(wounds: unknown, target: string): number {
  if (!target) return 0;
  const normalized = normalizeSwampyWounds(wounds);
  let total = 0;
  for (const w of normalized) {
    for (const eff of w.effects) {
      if (eff.target === target) total += eff.amount;
    }
  }
  return total;
}

// Total Wound Capacity spent by every wound currently on the character —
// treating a wound removes it from this array entirely, so there's no
// separate "treated but still present" state to exclude.
export function swampyWoundTotalCost(wounds: unknown): number {
  const normalized = normalizeSwampyWounds(wounds);
  let total = 0;
  for (const w of normalized) {
    total += SWAMPY_WOUND_SEVERITY_COST[w.severity];
  }
  return total;
}

// Every Swampy character has the same flat Wound Capacity — a full "HP" bar
// of 20, drained by the point cost of each active (untreated) wound.
export const SWAMPY_WOUND_MAX = 20;

// Which body diagram renders behind the wound markers. Defaults to male.
export type SwampyBodySex = "male" | "female";

export function swampyBodySexOf(character: { swampyBodySex?: string | null } | null | undefined): SwampyBodySex {
  return character?.swampyBodySex === "female" ? "female" : "male";
}

// ---------------------------------------------------------------------------
// Attributes + skills — starts as a copy of C.A.'s 6 attributes and 19
// attribute-linked skills, but is its own independent list: editing this
// file never touches shared/ca.ts or shared/v3.ts, and vice versa.
// Characters store their values in the same `might`/`finesse`/`will`/
// `constitution`/`anemos`/`intelligence` columns and `v3Skills`/
// `v3SkillBoosts` JSON columns that V3 and C.A. characters use — those are
// per-character storage, and a character only ever belongs to one campaign
// (and therefore one system), so reusing them creates no cross-system
// leakage. Only the admin-authored constant lists here need to be forked.
// The Swampy-only wound/body/pool state does get its own columns
// (`swampy_wounds`, `swampy_body_sex`, `swampy_energy_pool`) so those
// mechanics can diverge from C.A.'s freely.
// ---------------------------------------------------------------------------

export type SwampyAttributeKey =
  | "might"
  | "finesse"
  | "constitution"
  | "will"
  | "anemos"
  | "intelligence";

export interface SwampyAttributeDef {
  key: SwampyAttributeKey;
  name: string;
  abbr: string;
}

export const SWAMPY_ATTRIBUTES: SwampyAttributeDef[] = [
  { key: "might",        name: "Might",        abbr: "MIG" },
  { key: "finesse",      name: "Finesse",      abbr: "FIN" },
  { key: "constitution", name: "Constitution", abbr: "CON" },
  { key: "will",         name: "Will",         abbr: "WIL" },
  { key: "anemos",       name: "Anemos",       abbr: "ANE" },
  { key: "intelligence", name: "Intelligence", abbr: "INT" },
];

export const SWAMPY_ATTRIBUTE_KEYS: SwampyAttributeKey[] = SWAMPY_ATTRIBUTES.map(a => a.key);

export interface SwampySkillDef {
  key: string;
  name: string;
  parent: SwampyAttributeKey;
  description: string;
}

export const SWAMPY_SKILLS: SwampySkillDef[] = [
  // Might
  { key: "athletics",     name: "Athletics",     parent: "might",        description: "Climbing, jumping, swimming, lifting, and physical exertion." },
  { key: "intimidation",  name: "Intimidation",  parent: "might",        description: "Threatening, dominating, and forcing compliance." },
  // Finesse
  { key: "acrobatics",    name: "Acrobatics",    parent: "finesse",      description: "Balance, tumbling, climbing, and agile movement." },
  { key: "stealth",       name: "Stealth",       parent: "finesse",      description: "Moving unseen, unheard, and unnoticed." },
  { key: "sleightOfHand", name: "Sleight of Hand", parent: "finesse",    description: "Picking pockets, palming items, and delicate manipulation." },
  // Constitution
  { key: "endurance",     name: "Endurance",     parent: "constitution", description: "Resisting fatigue, harsh conditions, and exhaustion." },
  { key: "fortitude",     name: "Fortitude",     parent: "constitution", description: "Resisting poison, disease, and bodily afflictions." },
  { key: "perception",    name: "Perception",    parent: "constitution", description: "Noticing sights, sounds, and other physical details." },
  // Will
  { key: "focus",         name: "Focus",         parent: "will",         description: "Maintaining concentration under pressure." },
  { key: "influence",     name: "Influence",     parent: "will",         description: "Persuading, deceiving, negotiating, and inspiring others." },
  { key: "insight",       name: "Insight",       parent: "will",         description: "Reading intentions, lies, and emotional cues." },
  // Anemos
  { key: "arcana",        name: "Arcana",        parent: "anemos",       description: "Understanding spells, enchantments, and magical theory." },
  { key: "sense",         name: "Sense",         parent: "anemos",       description: "Detecting magic, spirits, and Anemos currents." },
  // Intelligence
  { key: "animalHandling", name: "Animal Handling", parent: "intelligence", description: "Taming, calming, and handling animals and beasts." },
  { key: "investigation", name: "Investigation", parent: "intelligence", description: "Finding clues, solving problems, and recognizing patterns." },
  { key: "knowledge",     name: "Knowledge",     parent: "intelligence", description: "Recalling history, cultures, religions, and academic lore." },
  { key: "medicine",      name: "Medicine",      parent: "intelligence", description: "Treating injuries, diagnosing illnesses, and providing care." },
  { key: "naturecraft",   name: "Nature",        parent: "intelligence", description: "Understanding plants, wildlife, weather, and terrain." },
  { key: "survival",      name: "Survival",      parent: "intelligence", description: "Tracking, foraging, navigating, and living off the land." },
];

export const SWAMPY_SKILL_KEYS: string[] = SWAMPY_SKILLS.map(s => s.key);

export function isSwampyAttributeKey(key: string | null | undefined): key is SwampyAttributeKey {
  return !!key && (SWAMPY_ATTRIBUTE_KEYS as string[]).includes(key);
}

export function isSwampySkillKey(key: string | null | undefined): key is string {
  return !!key && SWAMPY_SKILL_KEYS.includes(key);
}

export function makeEmptySwampySkills(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of SWAMPY_SKILLS) out[s.key] = 0;
  return out;
}

// Attribute value -> die sides: roll 1d{sides} + skillMod.
// 0 -> d6, 1 -> d8, 2 -> d10, 3 -> d12, 4+ -> d20.
export function swampyAttrValueToDieSides(value: number): number {
  const v = Math.max(0, Math.floor(value || 0));
  if (v <= 0) return 6;
  if (v === 1) return 8;
  if (v === 2) return 10;
  if (v === 3) return 12;
  return 20;
}

export function swampyAttrDieType(value: number): string {
  return `d${swampyAttrValueToDieSides(value)}`;
}

// Effective Swampy skill modifier: base allocated skill value plus any
// permanent boost, mirroring V3's boost mechanic but read from the same
// underlying columns (see file header for why that's safe to share).
export function swampyEffectiveSkillMod(
  character: { v3Skills?: Record<string, number> | null; v3SkillBoosts?: Record<string, number> | null } | null | undefined,
  skillKey: string | null | undefined,
): number {
  if (!skillKey) return 0;
  const base = Math.floor(Number(character?.v3Skills?.[skillKey]) || 0);
  const boost = Math.floor(Number(character?.v3SkillBoosts?.[skillKey]) || 0);
  return base + boost;
}

// Level-up point budgets — same shape as V3's: attributes 4 + floor(level/3),
// skills 8 + (level - 1), skills can go to -2 reclaiming up to 6 points.
export function swampyAttrPointBudget(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return 4 + Math.floor(lv / 3);
}

export function swampySkillPointBudget(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return 8 + (lv - 1);
}

export const SWAMPY_MAX_NEGATIVE_SKILL_POINTS = 6;
