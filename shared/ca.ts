// Cultivator's Adventure (C.A.) — a fresh, independent 4th game system.
// Nothing in this file is imported from or exported to shared/v3.ts (or any
// other system's constants) — C.A. starts as an editable copy of ideas from
// other systems where the user asked for that, but must stay fully
// independent so future edits to either system never affect the other.

// ---------------------------------------------------------------------------
// Wounds — replaces HP entirely for C.A. A freeform pin on a body diagram,
// not a fixed grid of slots: click "Add Wound", click a spot on the body,
// and that becomes a wound with its own name, severity, and description.
// A wound can carry multiple effects, each just a skill/stat target plus a
// numeric amount (no free text per effect) — applied automatically to that
// skill's rolls or that movement stat while the wound is active (untreated).
// ---------------------------------------------------------------------------

export type CAWoundSeverity = "minor" | "moderate" | "serious";

export const CA_WOUND_SEVERITIES: CAWoundSeverity[] = ["minor", "moderate", "serious"];

export const CA_WOUND_SEVERITY_LABELS: Record<CAWoundSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  serious: "Serious",
};

// How many points of Wound Capacity an active (untreated) wound of this
// severity costs.
export const CA_WOUND_SEVERITY_COST: Record<CAWoundSeverity, number> = {
  minor: 1,
  moderate: 2,
  serious: 3,
};

// Sort weight for "most severe first" — higher sorts first.
export const CA_WOUND_SEVERITY_RANK: Record<CAWoundSeverity, number> = {
  serious: 3,
  moderate: 2,
  minor: 1,
};

// Movement stats a wound's effect can target besides a skill.
export const CA_FIXED_STAT_TARGETS = ["speed", "flySpeed", "swimSpeed"] as const;
export type CAFixedStatTarget = typeof CA_FIXED_STAT_TARGETS[number];
export const CA_FIXED_STAT_LABELS: Record<CAFixedStatTarget, string> = {
  speed: "Speed",
  flySpeed: "Fly Speed",
  swimSpeed: "Swim Speed",
};

export function caWoundEffectTargetLabel(target: string): string {
  if ((CA_FIXED_STAT_TARGETS as readonly string[]).includes(target)) return CA_FIXED_STAT_LABELS[target as CAFixedStatTarget];
  const skill = CA_SKILLS.find(s => s.key === target);
  if (skill) return skill.name;
  return target;
}

export interface CAWoundEffect {
  id: string;
  target: string; // a CA_SKILLS key or a CAFixedStatTarget — always set, no free-text per effect
  amount: number;
}

export interface CAWound {
  id: string;
  x: number; // 0-100, percent position on the body diagram
  y: number; // 0-100
  name: string;
  severity: CAWoundSeverity;
  description: string;
  effects: CAWoundEffect[];
}

let caWoundIdCounter = 0;
function makeCAWoundId(): string {
  caWoundIdCounter += 1;
  return `w${Date.now().toString(36)}${caWoundIdCounter}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeCAWoundEffect(): CAWoundEffect {
  return { id: makeCAWoundId(), target: CA_FIXED_STAT_TARGETS[0], amount: 0 };
}

// A fresh wound pinned at (x, y) — percent coordinates on the body diagram,
// clamped 0-100 so a click just outside the image can't store a marker
// that renders off it.
export function makeCAWound(x: number, y: number): CAWound {
  return {
    id: makeCAWoundId(),
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
function normalizeCAWoundEffect(raw: unknown): CAWoundEffect | null {
  if (!raw || typeof raw !== "object") return null;
  const anyE = raw as any;
  if (typeof anyE.target !== "string" || !anyE.target) return null;
  return {
    id: typeof anyE.id === "string" && anyE.id ? anyE.id : makeCAWoundId(),
    target: anyE.target,
    amount: Number.isFinite(Number(anyE.amount)) ? Math.trunc(Number(anyE.amount)) : 0,
  };
}

// Tolerates missing/malformed data (a character predating this shape, an
// old fixed-slot-era wounds array, or a plain corrupt value) by dropping
// anything that doesn't look like a real wound rather than throwing.
export function normalizeCAWounds(raw: unknown): CAWound[] {
  if (!Array.isArray(raw)) return [];
  const out: CAWound[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const anyW = w as any;
    if (typeof anyW.x !== "number" && typeof anyW.y !== "number") continue; // old fixed-slot shape, drop it
    const severity: CAWoundSeverity =
      anyW.severity === "moderate" || anyW.severity === "serious" ? anyW.severity : "minor";
    out.push({
      id: typeof anyW.id === "string" && anyW.id ? anyW.id : makeCAWoundId(),
      x: Number.isFinite(Number(anyW.x)) ? Math.max(0, Math.min(100, Number(anyW.x))) : 50,
      y: Number.isFinite(Number(anyW.y)) ? Math.max(0, Math.min(100, Number(anyW.y))) : 50,
      name: typeof anyW.name === "string" ? anyW.name : "",
      severity,
      description: typeof anyW.description === "string" ? anyW.description : "",
      effects: Array.isArray(anyW.effects)
        ? anyW.effects.map(normalizeCAWoundEffect).filter((e: CAWoundEffect | null): e is CAWoundEffect => e !== null)
        : [],
    });
  }
  return out;
}

// Sums every wound's effects targeting `target` (a CA_SKILLS key or a
// CAFixedStatTarget). Treating a wound removes it (and its effects)
// entirely — see caWoundEffectTargetLabel's callers — so every wound in
// the array is by definition active; this is always computed fresh from
// the wounds array, never a separately stored total.
export function caWoundStatEffectTotal(wounds: unknown, target: string): number {
  if (!target) return 0;
  const normalized = normalizeCAWounds(wounds);
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
export function caWoundTotalCost(wounds: unknown): number {
  const normalized = normalizeCAWounds(wounds);
  let total = 0;
  for (const w of normalized) {
    total += CA_WOUND_SEVERITY_COST[w.severity];
  }
  return total;
}

// Every C.A. character has the same flat Wound Capacity — a full "HP" bar
// of 20, drained by the point cost of each active (untreated) wound.
export const CA_WOUND_MAX = 20;

// Which body diagram renders behind the wound markers. Defaults to male.
export type CABodySex = "male" | "female";

export function caBodySexOf(character: { caBodySex?: string | null } | null | undefined): CABodySex {
  return character?.caBodySex === "female" ? "female" : "male";
}

// ---------------------------------------------------------------------------
// Attributes + skills — starts as an editable copy of V3's 6 attributes and
// 19 attribute-linked skills (same names, same die-tier scaling), but is its
// own independent list: editing this file never touches shared/v3.ts, and
// vice versa. Characters store their values in the same `might`/`finesse`/
// `will`/`constitution`/`anemos`/`intelligence` columns and `v3Skills`/
// `v3SkillBoosts` JSON columns that V3 characters use — those are per-
// character storage, not shared library content, so reusing them creates no
// cross-system leakage; only the admin-authored constant lists here need to
// be forked.
// ---------------------------------------------------------------------------

export type CAAttributeKey =
  | "might"
  | "finesse"
  | "constitution"
  | "will"
  | "anemos"
  | "intelligence";

export interface CAAttributeDef {
  key: CAAttributeKey;
  name: string;
  abbr: string;
}

export const CA_ATTRIBUTES: CAAttributeDef[] = [
  { key: "might",        name: "Might",        abbr: "MIG" },
  { key: "finesse",      name: "Finesse",      abbr: "FIN" },
  { key: "constitution", name: "Constitution", abbr: "CON" },
  { key: "will",         name: "Will",         abbr: "WIL" },
  { key: "anemos",       name: "Anemos",       abbr: "ANE" },
  { key: "intelligence", name: "Intelligence", abbr: "INT" },
];

export const CA_ATTRIBUTE_KEYS: CAAttributeKey[] = CA_ATTRIBUTES.map(a => a.key);

export interface CASkillDef {
  key: string;
  name: string;
  parent: CAAttributeKey;
  description: string;
}

export const CA_SKILLS: CASkillDef[] = [
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

export const CA_SKILL_KEYS: string[] = CA_SKILLS.map(s => s.key);

export function isCAAttributeKey(key: string | null | undefined): key is CAAttributeKey {
  return !!key && (CA_ATTRIBUTE_KEYS as string[]).includes(key);
}

export function isCASkillKey(key: string | null | undefined): key is string {
  return !!key && CA_SKILL_KEYS.includes(key);
}

export function makeEmptyCASkills(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of CA_SKILLS) out[s.key] = 0;
  return out;
}

// Attribute value -> die sides: roll 1d{sides} + skillMod.
// 0 -> d6, 1 -> d8, 2 -> d10, 3 -> d12, 4+ -> d20.
export function caAttrValueToDieSides(value: number): number {
  const v = Math.max(0, Math.floor(value || 0));
  if (v <= 0) return 6;
  if (v === 1) return 8;
  if (v === 2) return 10;
  if (v === 3) return 12;
  return 20;
}

export function caAttrDieType(value: number): string {
  return `d${caAttrValueToDieSides(value)}`;
}

// Effective C.A. skill modifier: base allocated skill value plus any
// permanent boost, mirroring V3's boost mechanic but read from the same
// underlying columns (see file header for why that's safe to share).
export function caEffectiveSkillMod(
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
export function caAttrPointBudget(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return 4 + Math.floor(lv / 3);
}

export function caSkillPointBudget(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return 8 + (lv - 1);
}

export const CA_MAX_NEGATIVE_SKILL_POINTS = 6;
