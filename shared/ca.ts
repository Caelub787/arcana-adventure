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

// The internal key stays "serious" (matches already-stored character data);
// only the label changed to match the current wound rules' wording.
export const CA_WOUND_SEVERITY_LABELS: Record<CAWoundSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  serious: "Severe",
};

// How far over the target's DC a hit has to land to cause a wound of this
// severity (see caWoundSeverityForMargin below) — HP damage still applies
// below 5 over, it just doesn't also cause a wound.
export const CA_WOUND_SEVERITY_MARGIN: Record<CAWoundSeverity, number> = {
  minor: 5,
  moderate: 10,
  serious: 15,
};

/**
 * Which severity a hit causes, given how far the attack roll beat the
 * target's DC. Below 5 over, a hit still happens (HP loss) but doesn't also
 * wound. Nothing calls this automatically — the attacker and GM read the
 * margin and make the call themselves, same as every other wound judgment.
 */
export function caWoundSeverityForMargin(margin: number): CAWoundSeverity | null {
  if (margin >= CA_WOUND_SEVERITY_MARGIN.serious) return "serious";
  if (margin >= CA_WOUND_SEVERITY_MARGIN.moderate) return "moderate";
  if (margin >= CA_WOUND_SEVERITY_MARGIN.minor) return "minor";
  return null;
}

// Sort weight for "most severe first" — higher sorts first.
export const CA_WOUND_SEVERITY_RANK: Record<CAWoundSeverity, number> = {
  serious: 3,
  moderate: 2,
  minor: 1,
};

// Superseded by Health (see caMaxHp below) — kept only for caWoundTotalCost,
// which some older callers/tests still read. Nothing in the live UI spends
// Wound Capacity any more.
export const CA_WOUND_SEVERITY_COST: Record<CAWoundSeverity, number> = {
  minor: 1,
  moderate: 2,
  serious: 3,
};

// Where a wound lands on the body. Purely for the Focus cost reference below
// — nothing here is spent automatically; the attacker (or the GM, for a
// monster) reads the cost and adjusts their own Focus by hand.
export type CAWoundLocation = "body" | "arm" | "leg" | "head";
export const CA_WOUND_LOCATIONS: CAWoundLocation[] = ["body", "arm", "leg", "head"];
export const CA_WOUND_LOCATION_LABELS: Record<CAWoundLocation, string> = {
  body: "Body",
  arm: "Arm",
  leg: "Leg",
  head: "Head",
};
export const CA_WOUND_LOCATION_FOCUS_COST: Record<CAWoundLocation, number> = {
  body: 0,
  arm: 2,
  leg: 2,
  head: 4,
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
  location: CAWoundLocation;
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
    location: "body",
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
    const location: CAWoundLocation =
      (CA_WOUND_LOCATIONS as readonly string[]).includes(anyW.location) ? anyW.location : "body";
    out.push({
      id: typeof anyW.id === "string" && anyW.id ? anyW.id : makeCAWoundId(),
      x: Number.isFinite(Number(anyW.x)) ? Math.max(0, Math.min(100, Number(anyW.x))) : 50,
      y: Number.isFinite(Number(anyW.y)) ? Math.max(0, Math.min(100, Number(anyW.y))) : 50,
      name: typeof anyW.name === "string" ? anyW.name : "",
      severity,
      location,
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

// ---------------------------------------------------------------------------
// Consumable effects — a GM-authored menu of ways a CA consumable can touch
// a character when used. Two kinds share one list, since both are "the
// player picks one of these on use": "wound" heals (removes) or deals
// (adds) a number of wounds at a severity; "hp" heals a flat number or a
// rolled dice amount of HP, now that C.A. has HP again alongside wounds. An
// item can offer several of either kind at once ("Heal 1 Moderate Wound",
// "Heal 2d6 HP") - for a wound heal, the player also picks which of their
// own wounds of that severity it applies to.
// ---------------------------------------------------------------------------

export type CAWoundEffectMode = "heal" | "deal";
export type CAConsumableEffectKind = "wound" | "hp";
export type CAHealAmountMode = "flat" | "dice";

export interface CAConsumableWoundOption {
  id: string;
  /** Default "wound" so data from before this field existed still reads right. */
  kind: CAConsumableEffectKind;
  // kind "wound":
  mode: CAWoundEffectMode;
  severity: CAWoundSeverity;
  count: number; // how many wounds of that severity to heal or deal
  // kind "hp" — heal only; a consumable dealing HP damage is a weapon
  // wearing a different hat, and goes through Rolls instead.
  healAmountMode: CAHealAmountMode;
  healFlatAmount: number;
  healDiceFormula: string; // e.g. "2d6"
  label?: string; // optional override; auto-generated if blank
}

export function makeCAConsumableWoundOption(): CAConsumableWoundOption {
  return {
    id: makeCAWoundId(),
    kind: "wound",
    mode: "heal",
    severity: "minor",
    count: 1,
    healAmountMode: "flat",
    healFlatAmount: 5,
    healDiceFormula: "1d6",
  };
}

export function makeCAConsumableHpHealOption(): CAConsumableWoundOption {
  return { ...makeCAConsumableWoundOption(), kind: "hp" };
}

export function caConsumableWoundOptionLabel(opt: CAConsumableWoundOption): string {
  if (opt.label?.trim()) return opt.label.trim();
  if (opt.kind === "hp") {
    const amount = opt.healAmountMode === "dice" ? (opt.healDiceFormula?.trim() || "1d6") : Math.max(0, opt.healFlatAmount);
    return `Heal ${amount} HP`;
  }
  const verb = opt.mode === "heal" ? "Heal" : "Deal";
  const severityLabel = CA_WOUND_SEVERITY_LABELS[opt.severity];
  const count = Math.max(1, opt.count);
  const base = `${verb} ${count} ${severityLabel} Wound${count > 1 ? "s" : ""}`;
  // A heal option can also cure anything milder than its rated severity -
  // it just can't reach past it - so the label says so unless it's already
  // the mildest tier there is.
  return opt.mode === "heal" && opt.severity !== "minor" ? `${base} (or lesser)` : base;
}

// Tolerates missing/malformed data the same way normalizeCAWounds does.
export function normalizeCAConsumableWoundOptions(raw: unknown): CAConsumableWoundOption[] {
  if (!Array.isArray(raw)) return [];
  const out: CAConsumableWoundOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const anyO = o as any;
    const kind: CAConsumableEffectKind = anyO.kind === "hp" ? "hp" : "wound";
    const mode: CAWoundEffectMode = anyO.mode === "deal" ? "deal" : "heal";
    const severity: CAWoundSeverity =
      anyO.severity === "moderate" || anyO.severity === "serious" ? anyO.severity : "minor";
    const count = Number.isFinite(Number(anyO.count)) ? Math.max(1, Math.trunc(Number(anyO.count))) : 1;
    const healAmountMode: CAHealAmountMode = anyO.healAmountMode === "dice" ? "dice" : "flat";
    const healFlatAmount = Number.isFinite(Number(anyO.healFlatAmount)) ? Math.max(0, Math.trunc(Number(anyO.healFlatAmount))) : 5;
    const healDiceFormula = typeof anyO.healDiceFormula === "string" && anyO.healDiceFormula.trim() ? anyO.healDiceFormula.trim() : "1d6";
    out.push({
      id: typeof anyO.id === "string" && anyO.id ? anyO.id : makeCAWoundId(),
      kind,
      mode,
      severity,
      count,
      healAmountMode,
      healFlatAmount,
      healDiceFormula,
      label: typeof anyO.label === "string" && anyO.label.trim() ? anyO.label : undefined,
    });
  }
  return out;
}

// Superseded by caMaxHp below — kept only so old callers/tests that still
// read it don't break. Nothing in the live UI calls this any more: HP is the
// real vitality bar now, and a wound is a side effect, not a capacity spend.
export function caWoundCapacityMax(
  character: { caEnergyPool?: number | null } | null | undefined,
): number {
  return 10 + caRankForEnergyPool(character?.caEnergyPool).index;
}

// ---------------------------------------------------------------------------
// Health — replaces Wound Capacity as the real vitality bar. Everyone (player
// or monster) starts at 20 and climbs the same Rank ladder wounds already
// read rank off of: +5 for a star gained within a rank, +10 (not +5 as well)
// for the star that crosses into a new rank.
// ---------------------------------------------------------------------------

export const CA_STARTING_HP = 20;
export const CA_HP_PER_STAR = 5;
export const CA_HP_PER_RANK = 10;

/** How much the ladder rung at this index adds to Max HP, climbing from the rung before it. */
function caHpStepAt(ladderIndex: number): number {
  const rung = CA_RANK_LADDER[ladderIndex];
  return rung.star.star === 1 ? CA_HP_PER_RANK : CA_HP_PER_STAR;
}

export function caMaxHp(
  character: { caEnergyPool?: number | null } | null | undefined,
): number {
  const { index } = caRankForEnergyPool(character?.caEnergyPool);
  let hp = CA_STARTING_HP;
  for (let i = 1; i <= index; i++) hp += caHpStepAt(i);
  return hp;
}

// ---------------------------------------------------------------------------
// Focus — spent by the attacker (or the GM, for a monster) to choose where a
// wound lands (see CA_WOUND_LOCATION_FOCUS_COST above). Starts at 10, +2 per
// rung climbed — same ladder, same shape as the old Wound Capacity formula,
// just a different starting value and step. Resets on a long rest. Nothing
// deducts it automatically; it is a plain spendable number like Energy.
// ---------------------------------------------------------------------------

export const CA_STARTING_FOCUS = 10;
export const CA_FOCUS_PER_RANK = 2;

export function caMaxFocus(
  character: { caEnergyPool?: number | null } | null | undefined,
): number {
  return CA_STARTING_FOCUS + CA_FOCUS_PER_RANK * caRankForEnergyPool(character?.caEnergyPool).index;
}

// Which body diagram renders behind the wound markers. Defaults to male.
export type CABodySex = "male" | "female";

export function caBodySexOf(character: { caBodySex?: string | null } | null | undefined): CABodySex {
  return character?.caBodySex === "female" ? "female" : "male";
}

// ---------------------------------------------------------------------------
// Species — Size, Lifespan, Speed, Fly Speed, Swim Speed, and Carry Weight
// are the only things C.A. reads from a species; HP/Energy/Mana are Rank, not
// Race (see caWoundCapacityMax above and CA_STARTING_ENERGY below), and
// progression is set up per admin system rather than per species.
// ---------------------------------------------------------------------------

/**
 * Swim Speed defaults to half of Speed (rounded down) whenever a species
 * leaves it unset - a null/undefined swimSpeed column, not an explicit 0.
 */
export function caEffectiveSwimSpeed(
  species: { speed?: number | null; swimSpeed?: number | null } | null | undefined,
): number {
  if (species?.swimSpeed != null) return species.swimSpeed;
  return Math.floor((species?.speed ?? 30) / 2);
}

/**
 * Cultivation's Energy Type, shown on the Ability tab. A character's own
 * choice (once they've made one) always wins; otherwise it falls back to
 * their species' default, and finally to null if neither is set.
 */
export function caEffectiveEnergyType(
  character: { caEnergyType?: string | null } | null | undefined,
  species: { energyType?: string | null } | null | undefined,
): string | null {
  const own = character?.caEnergyType?.trim();
  if (own) return own;
  const speciesDefault = species?.energyType?.trim();
  return speciesDefault || null;
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

// ---------------------------------------------------------------------------
// Ranks — the Universal Rank ladder. A character's rank and star are read
// straight off their Energy Pool; they are never set by hand.
//
// Two things about the numbers, both deliberate:
//   * There is no Unranked. Bronze Star 1 sits at 0, so every character has a
//     rank from the moment they exist.
//   * Every threshold is the source table's figure with one zero taken off,
//     which is why Bronze runs 0/20/30/40/50 rather than 0/10/20/30/40 -
//     Star 1 took over Unranked's slot and the rest kept their own values, so
//     the 10 rung simply isn't part of the ladder.
//
// Usable Energy is exactly half the pool at every rung, so it is derived
// rather than stored - see caUsableEnergy.
//
// Health and Lifespan are in the source table too. Lifespan is carried here
// because it is flavour worth showing; Health is deliberately absent, since
// C.A. replaced HP with wounds.
// ---------------------------------------------------------------------------

export type CARankName = "Bronze" | "Silver" | "Gold" | "Obsidian" | "Terran";

export const CA_RANK_NAMES: CARankName[] = ["Bronze", "Silver", "Gold", "Obsidian", "Terran"];

export interface CARankStarDef {
  star: number;
  /** Energy Pool needed to reach this star. */
  energyPool: number;
}

export interface CARankDef {
  name: CARankName;
  /** Years, from the source table's Lifespan column. */
  lifespan: number;
  /** How much energy a character of this rank can absorb at once. */
  absorptionLimit: number;
  stars: CARankStarDef[];
}

function caStars(base: number): CARankStarDef[] {
  // Star 1 is `base`, and each star after it steps by `base` - except Bronze,
  // whose Star 1 is 0 and whose steps come off its own 10-point base.
  return [1, 2, 3, 4, 5].map((star) => ({ star, energyPool: base * star }));
}

export const CA_RANKS: CARankDef[] = [
  {
    name: "Bronze",
    lifespan: 100,
    absorptionLimit: 20,
    // Star 1 at 0 is the whole reason this rank is written out rather than
    // generated: it is the one rung that doesn't follow the pattern.
    stars: [
      { star: 1, energyPool: 0 },
      { star: 2, energyPool: 20 },
      { star: 3, energyPool: 30 },
      { star: 4, energyPool: 40 },
      { star: 5, energyPool: 50 },
    ],
  },
  { name: "Silver", lifespan: 150, absorptionLimit: 50, stars: caStars(100) },
  { name: "Gold", lifespan: 200, absorptionLimit: 500, stars: caStars(1_000) },
  { name: "Obsidian", lifespan: 250, absorptionLimit: 5_000, stars: caStars(10_000) },
  { name: "Terran", lifespan: 300, absorptionLimit: 50_000, stars: caStars(100_000) },
];

export interface CARankPosition {
  rank: CARankDef;
  star: number;
  /** Energy Pool this star begins at. */
  energyPool: number;
  /** Pool needed for the next star up, or null at the top of the ladder. */
  nextEnergyPool: number | null;
  /** 0-based position on the flattened ladder - Bronze 1 is 0, Terran 5 is 24. */
  index: number;
}

/** Every rung, lowest first - the ladder flattened for display and lookup. */
export const CA_RANK_LADDER: { rank: CARankDef; star: CARankStarDef }[] =
  CA_RANKS.flatMap((rank) => rank.stars.map((star) => ({ rank, star })));

/**
 * The rung a pool sits on. Never null: a pool of 0 (or a negative, which
 * shouldn't happen but shouldn't crash either) is Bronze 1, and anything past
 * the top of the ladder stays at Terran 5.
 */
export function caRankForEnergyPool(pool: number | null | undefined): CARankPosition {
  const value = Math.max(0, Math.floor(Number(pool) || 0));
  let index = 0;
  for (let i = 0; i < CA_RANK_LADDER.length; i++) {
    if (CA_RANK_LADDER[i].star.energyPool <= value) index = i;
    else break;
  }
  const here = CA_RANK_LADDER[index];
  const next = CA_RANK_LADDER[index + 1];
  return {
    rank: here.rank,
    star: here.star.star,
    energyPool: here.star.energyPool,
    nextEnergyPool: next ? next.star.energyPool : null,
    index,
  };
}

/** "Gold 3" - what goes on the sheet. */
export function caRankLabel(pool: number | null | undefined): string {
  const position = caRankForEnergyPool(pool);
  return `${position.rank.name} ${position.star}`;
}

/**
 * Usable Energy: half the pool, rounded down. This is what a character
 * actually spends on their abilities; the pool itself is the total they have
 * built up, and is what the rank is read from.
 */
export function caUsableEnergy(pool: number | null | undefined): number {
  return Math.floor(Math.max(0, Math.floor(Number(pool) || 0)) / 2);
}

// ---------------------------------------------------------------------------
// Physique — how much energy a body is built to carry.
//
// It does NOT stop the pool going higher. A character can hold more energy
// than their Physique; that is the interesting case, not an invalid one. What
// it does is put them in overload, and the GM hangs effects off that the same
// way they hang effects off a wound — same target list, same numbers, applied
// the same way. The difference is that a wound's effects are always live
// while the wound is, and overload effects are only live while the pool is
// actually over the Physique, so they come and go on their own as the pool
// moves.
//
// A Physique of 0 means "not set yet" rather than a Physique of zero, so a
// character created before the field existed isn't permanently in overload.
// ---------------------------------------------------------------------------

/** Overload effects reuse the wound effect shape - target plus an amount. */
export type CAPhysiqueEffect = CAWoundEffect;

export function makeCAPhysiqueEffect(): CAPhysiqueEffect {
  return makeCAWoundEffect();
}

export function normalizeCAPhysiqueEffects(value: unknown): CAPhysiqueEffect[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      id: typeof e.id === "string" ? e.id : makeCAWoundId(),
      target: typeof e.target === "string" ? e.target : CA_FIXED_STAT_TARGETS[0],
      amount: Number.isFinite(Number(e.amount)) ? Number(e.amount) : 0,
    }));
}

export interface CAPhysiqueState {
  physique: number;
  energyPool: number;
  /** Whether the pool is currently over what the body is built to carry. */
  over: boolean;
  /** How far over, or 0. */
  excess: number;
}

export function caPhysiqueState(
  character:
    | { caPhysique?: number | null; caEnergyPool?: number | null }
    | null
    | undefined,
): CAPhysiqueState {
  const physique = Math.max(0, Math.floor(Number(character?.caPhysique) || 0));
  const energyPool = Math.max(0, Math.floor(Number(character?.caEnergyPool) || 0));
  // An unset Physique is not an overload of the whole pool.
  const over = physique > 0 && energyPool > physique;
  return { physique, energyPool, over, excess: over ? energyPool - physique : 0 };
}

export function caIsOverPhysique(
  character: { caPhysique?: number | null; caEnergyPool?: number | null } | null | undefined,
): boolean {
  return caPhysiqueState(character).over;
}

/**
 * What overload is doing to one skill or movement stat right now — zero
 * whenever the character is inside their Physique, however many effects the
 * GM has set up.
 */
export function caPhysiqueStatEffectTotal(
  character:
    | {
        caPhysique?: number | null;
        caEnergyPool?: number | null;
        caPhysiqueEffects?: unknown;
      }
    | null
    | undefined,
  target: string,
): number {
  if (!target) return 0;
  if (!caIsOverPhysique(character)) return 0;
  let total = 0;
  for (const eff of normalizeCAPhysiqueEffects(character?.caPhysiqueEffects)) {
    if (eff.target === target) total += eff.amount;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Aura — C.A.'s replacement for the per-member beacon colour. An aura belongs
// to the CHARACTER, not the player, which is the point: it is what makes a
// character and their sheet recognisable at a glance, so two characters run by
// the same player look nothing alike.
//
// It is a colour plus an optional shape. The shape is drawn in the aura colour
// and animated, and shows up everywhere the colour does - the battlemap ping,
// the party tracker's outline and roll glow, the sheet's own border.
// ---------------------------------------------------------------------------

export const CA_AURA_SHAPES = [
  "none",
  "bubbles",
  "rings",
  "hexagons",
  "diamonds",
  "triangles",
  "squares",
  "shards",
  "sparks",
  "motes",
  "wisps",
  "spirals",
  "crescents",
  "ripples",
  "cracks",
  "runes",
  "eyes",
  "stars",
  "crosses",
  "arcs",
  "links",
  "cells",
  "webbing",
  "waves",
  "zigzags",
] as const;
export type CAAuraShape = typeof CA_AURA_SHAPES[number];

export const CA_AURA_SHAPE_LABELS: Record<CAAuraShape, string> = {
  none: "None",
  bubbles: "Bubbles",
  rings: "Rings",
  hexagons: "Hexagons",
  diamonds: "Diamonds",
  triangles: "Triangles",
  squares: "Squares",
  shards: "Shards",
  sparks: "Sparks",
  motes: "Motes",
  wisps: "Wisps",
  spirals: "Spirals",
  crescents: "Crescents",
  ripples: "Ripples",
  cracks: "Cracks",
  runes: "Runes",
  eyes: "Eyes",
  stars: "Stars",
  crosses: "Crosses",
  arcs: "Arcs",
  links: "Chains",
  cells: "Cells",
  webbing: "Webbing",
  waves: "Waves",
  zigzags: "Zigzags",
};

/**
 * Shapes the old, shorter list used, mapped onto their nearest replacement so
 * an aura chosen before the list changed still draws something rather than
 * silently falling back to none.
 */
const CA_AURA_SHAPE_ALIASES: Record<string, CAAuraShape> = {
  ring: "rings",
  star: "stars",
  diamond: "diamonds",
  hexagon: "hexagons",
  bolt: "zigzags",
  flame: "wisps",
};

/** The colour used when a character has no aura of their own yet. */
export const CA_AURA_DEFAULT_COLOR = "#FBB524";

export interface CAAura {
  color: string;
  /** The far end of the gradient, or null when the aura is a single colour. */
  color2: string | null;
  /** Which way the gradient runs, in degrees clockwise from "up". */
  angle: number;
  shape: CAAuraShape;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

export function caAuraShapeOf(value: unknown): CAAuraShape {
  const raw = typeof value === "string" ? value.trim() : "";
  if ((CA_AURA_SHAPES as readonly string[]).includes(raw)) return raw as CAAuraShape;
  return CA_AURA_SHAPE_ALIASES[raw] ?? "none";
}

/** Degrees, wrapped into 0..359. Anything unusable reads as straight down. */
export function caAuraAngleOf(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 180;
  return ((Math.round(n) % 360) + 360) % 360;
}

/**
 * The aura as a CSS gradient, for the surfaces that can paint one - the round
 * mark's field, an edge ring. A single-colour aura still returns a gradient,
 * from the colour to itself, so callers have one code path.
 */
export function caAuraGradient(aura: Pick<CAAura, "color" | "color2" | "angle">, opacityHex = ""): string {
  const from = `${aura.color}${opacityHex}`;
  const to = `${aura.color2 ?? aura.color}${opacityHex}`;
  return `linear-gradient(${aura.angle}deg, ${from} 0%, ${to} 100%)`;
}

/**
 * The colour a given fraction along the aura, for the things that can only
 * take one - a particle, a border, a bar. 0 is the gradient's start.
 */
export function caAuraColorAt(aura: Pick<CAAura, "color" | "color2">, t: number): string {
  if (!aura.color2) return aura.color;
  const a = hexToRgb(aura.color);
  const b = hexToRgb(aura.color2);
  if (!a || !b) return aura.color;
  const k = Math.max(0, Math.min(1, t));
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  return rgbToHex(mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2]));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A character's aura, with a fallback so callers never have to null-check.
 * `fallbackColor` lets the caller keep whatever colour that surface used
 * before - the member's beacon colour, or a stable per-entity colour for an
 * NPC - rather than dropping every auraless character onto the same amber.
 */
export function caAuraOf(
  character:
    | {
        caAuraColor?: string | null;
        caAuraColor2?: string | null;
        caAuraAngle?: number | null;
        caAuraShape?: string | null;
      }
    | null
    | undefined,
  fallbackColor?: string | null,
): CAAura {
  const raw = character?.caAuraColor;
  const color = isHexColor(raw)
    ? raw.trim()
    : (isHexColor(fallbackColor) ? fallbackColor.trim() : CA_AURA_DEFAULT_COLOR);
  // A second colour only counts when the first one is the character's own -
  // half a gradient over a fallback colour would be someone else's aura.
  const second = isHexColor(raw) && isHexColor(character?.caAuraColor2)
    ? character!.caAuraColor2!.trim()
    : null;
  return {
    color,
    color2: second && second.toLowerCase() !== color.toLowerCase() ? second : null,
    angle: caAuraAngleOf(character?.caAuraAngle),
    shape: caAuraShapeOf(character?.caAuraShape),
  };
}

// ---------------------------------------------------------------------------
// Starting values
// ---------------------------------------------------------------------------

/**
 * C.A. characters all start with the same Energy rather than their species',
 * because C.A.'s species lists carry the other systems' numbers.
 */
export const CA_STARTING_ENERGY = 10;

/**
 * A real starting Physique, not the 0 that means "not set". A character made
 * before Physique existed keeps their 0 and simply never overloads.
 */
export const CA_STARTING_PHYSIQUE = 100;

// ---------------------------------------------------------------------------
// Point budgets
//
// Attributes and skills are bought from per-level budgets. The sheet has no
// Save button to check a whole allocation against, so instead each value's
// editor is bounded by what is actually left — you cannot type a number that
// would put the total over, which means the total can never be over.
// ---------------------------------------------------------------------------

export interface CAPointBounds {
  current: number;
  min: number;
  max: number;
}

/**
 * How far one attribute can move. Up is what's left in the budget on top of
 * what this attribute already holds, capped at 5; down is 0.
 */
export function caAttributeBounds(
  values: Record<string, number> | null | undefined,
  key: string,
  level: number,
): CAPointBounds {
  const read = (k: string) => Math.max(0, Math.floor(Number(values?.[k]) || 0));
  const used = CA_ATTRIBUTE_KEYS.reduce((sum, k) => sum + read(k), 0);
  const left = caAttrPointBudget(level) - used;
  const current = read(key);
  return { current, min: 0, max: Math.min(5, current + Math.max(0, left)) };
}

/**
 * How far one skill can move. Up is what's left in the budget plus whatever
 * scroll bonus this skill carries; down is bounded both by the -2 floor and
 * by how much of the negative allowance the OTHER skills have already taken,
 * since reclaiming past the cap would be spending points that don't exist.
 */
export function caSkillBounds(
  skills: Record<string, number> | null | undefined,
  key: string,
  level: number,
  scrollBoost = 0,
): CAPointBounds {
  const read = (k: string) => Math.floor(Number(skills?.[k]) || 0);
  const all = CA_SKILL_KEYS.map(read);
  const positiveUsed = all.filter((v) => v > 0).reduce((a, v) => a + v, 0);
  const negativeUsed = Math.abs(all.filter((v) => v < 0).reduce((a, v) => a + v, 0));
  const reclaimed = Math.min(negativeUsed, CA_MAX_NEGATIVE_SKILL_POINTS);
  const budget = caSkillPointBudget(level) + reclaimed;
  const left = budget - positiveUsed;

  const current = read(key);
  const negativesElsewhere = negativeUsed - Math.max(0, -current);
  const negativeRoom = Math.max(0, CA_MAX_NEGATIVE_SKILL_POINTS - negativesElsewhere);

  // `|| 0` rather than plain negation: with no negative room left this would
  // otherwise be -0, which is a real value a NumberInput will happily show.
  const floor = -Math.min(2, negativeRoom) || 0;
  return {
    current,
    min: floor,
    max: Math.min(5 + Math.max(0, Math.floor(scrollBoost)), current + Math.max(0, left)),
  };
}

// ---------------------------------------------------------------------------
// Item effects
//
// An item can carry any number of modifiers, each one either live only while
// the item is equipped or live for as long as it is carried at all. Same
// {target, amount} shape wounds and Physique overload already use, so a GM
// only has to learn one idea of what an "effect" is, and every consumer that
// already totals one of those can total these the same way.
// ---------------------------------------------------------------------------

export const CA_ITEM_EFFECT_TRIGGERS = ["equipped", "carried"] as const;
export type CAItemEffectTrigger = typeof CA_ITEM_EFFECT_TRIGGERS[number];

export const CA_ITEM_EFFECT_TRIGGER_LABELS: Record<CAItemEffectTrigger, string> = {
  equipped: "While equipped",
  carried: "While carried",
};

export interface CAItemEffect extends CAWoundEffect {
  trigger: CAItemEffectTrigger;
}

export function makeCAItemEffect(trigger: CAItemEffectTrigger = "equipped"): CAItemEffect {
  return { ...makeCAWoundEffect(), trigger };
}

export function normalizeCAItemEffects(value: unknown): CAItemEffect[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      id: typeof e.id === "string" ? e.id : makeCAWoundId(),
      target: typeof e.target === "string" ? e.target : CA_FIXED_STAT_TARGETS[0],
      amount: Number.isFinite(Number(e.amount)) ? Number(e.amount) : 0,
      // An unrecognised trigger is treated as the narrower one: an effect that
      // should have needed equipping and silently applied from the backpack is
      // the worse way to be wrong.
      trigger: e.trigger === "carried" ? "carried" : "equipped",
    }));
}

/** Whether an item's effects are live right now, given how it is being held. */
export function caItemEffectIsActive(effect: CAItemEffect, isEquipped: boolean): boolean {
  return effect.trigger === "carried" || isEquipped;
}

/**
 * What a character's items are doing to one skill or movement stat right now.
 * Items not equipped contribute only their "while carried" effects.
 */
export function caItemStatEffectTotal(
  items: Array<{ effects?: unknown; isEquipped?: boolean | null }> | null | undefined,
  target: string,
): number {
  if (!target || !Array.isArray(items)) return 0;
  let total = 0;
  for (const item of items) {
    if (!item) continue;
    const equipped = !!item.isEquipped;
    for (const eff of normalizeCAItemEffects(item.effects)) {
      if (eff.target === target && caItemEffectIsActive(eff, equipped)) total += eff.amount;
    }
  }
  return total;
}

/**
 * What a roll off the Ability tab is called when it lands in the roll feed.
 *
 * The sheet and the hotbar both fire these, and a roll that reads one way from
 * the sheet and another way from a hotbar slot is the same roll pretending to
 * be two.
 */
export function caAbilityRollLabel(
  character: { caAbilityName?: string | null } | null | undefined,
  rollEntry: { name?: string | null } | null | undefined,
): string {
  const ability = String(character?.caAbilityName || "").trim() || "Ability";
  const roll = String(rollEntry?.name || "").trim();
  return roll ? `${ability} - ${roll}` : ability;
}

// ---------------------------------------------------------------------------
// Item types — C.A.'s own list. Alphabetical, since nothing about display
// order should matter more than "can I find it in the dropdown." Scroll,
// spellbook and miscellaneous-as-"utility" are AA-V3 holdovers C.A. never
// used; "utility" is folded into Miscellaneous here (see caNormalizeItemType)
// rather than kept as a second name for the same idea.
// ---------------------------------------------------------------------------

export const CA_ITEM_TYPES = [
  "ammunition",
  "armor",
  "beast_orb",
  "consumable",
  "container",
  "crafter",
  "currency",
  "miscellaneous",
  "rune",
  "weapon",
] as const;
export type CAItemType = typeof CA_ITEM_TYPES[number];

export const CA_ITEM_TYPE_LABELS: Record<CAItemType, string> = {
  ammunition: "Ammunition",
  armor: "Armor",
  beast_orb: "Beast Orb",
  consumable: "Consumable",
  container: "Container",
  crafter: "Crafter",
  currency: "Currency",
  miscellaneous: "Miscellaneous",
  rune: "Rune",
  weapon: "Weapon",
};

/**
 * An item's stored itemType, corrected for the handful of values a C.A. item
 * could have picked up before this list existed: "utility" is folded into
 * Miscellaneous, and anything else C.A. never actually offers (scroll,
 * spellbook — AA-V3 only) falls back to Miscellaneous too, rather than
 * rendering as a type the item-type dropdown can't represent.
 */
export function caNormalizeItemType(itemType: string | null | undefined): CAItemType {
  const raw = String(itemType || "");
  if ((CA_ITEM_TYPES as readonly string[]).includes(raw)) return raw as CAItemType;
  if (raw === "utility") return "miscellaneous";
  return "miscellaneous";
}

export type CAWeaponHandedness = "one_handed" | "two_handed" | "ranged";
export const CA_WEAPON_HANDEDNESS: CAWeaponHandedness[] = ["one_handed", "two_handed", "ranged"];
export const CA_WEAPON_HANDEDNESS_LABELS: Record<CAWeaponHandedness, string> = {
  one_handed: "Melee (one-handed)",
  two_handed: "Melee (two-handed)",
  ranged: "Ranged",
};

export type CAContainerKind = "backpack" | "storage_ring";
export const CA_CONTAINER_KINDS: CAContainerKind[] = ["backpack", "storage_ring"];
export const CA_CONTAINER_KIND_LABELS: Record<CAContainerKind, string> = {
  backpack: "Backpack",
  storage_ring: "Storage Ring",
};
export const CA_CONTAINER_KIND_DESCRIPTIONS: Record<CAContainerKind, string> = {
  backpack: "Raises the wearer's own carry weight limit by its capacity while equipped.",
  storage_ring: "Its own separate weight limit — items move in and out of the character's own inventory.",
};

// ---------------------------------------------------------------------------
// Rank Scaling — how a stat that changes with an item's Rank tag is computed.
// "Steady increase" adds a flat amount per rung climbed off the item's base
// value; "Set value per rank" is a GM-typed table, one entry per rung on the
// same 25-rung ladder a character's Rank uses, falling back to the base value
// for any rung the GM hasn't filled in yet; "Percentage per rank" compounds a
// percentage onto the base value, but only for a rung that crosses into a
// NEW rank name (Bronze -> Silver -> Gold -> Obsidian -> Terran) - climbing
// a star within the same rank doesn't trigger it. "None" is an explicit,
// stored "off", distinct from no config having been saved at all (see
// CA_DEFAULT_PRICE_SCALING below, the one stat that reads unset as active).
// ---------------------------------------------------------------------------

export type CARankScalingMode = "steady" | "table" | "percent" | "none";

export interface CARankScaling {
  mode: CARankScalingMode;
  /** "steady" mode: added once per rung, on top of the item's base value. */
  perRank: number;
  /** "table" mode: one entry per CA_RANK_LADDER rung; null = use the base value. */
  table: (number | null)[];
  /** "percent" mode: compounded once per RANK crossed (not per star/rung). */
  percentPerRank: number;
}

export function makeDefaultCARankScaling(): CARankScaling {
  return { mode: "steady", perRank: 0, percentPerRank: 0, table: new Array(CA_RANK_LADDER.length).fill(null) };
}

/** An explicit, stored "off" — distinct from an unset (null) config. */
export function makeNoCARankScaling(): CARankScaling {
  return { mode: "none", perRank: 0, percentPerRank: 0, table: new Array(CA_RANK_LADDER.length).fill(null) };
}

/** Value's own default: every rank up (not star up) is worth 50% more. */
export function makeDefaultPriceCARankScaling(): CARankScaling {
  return { mode: "percent", perRank: 0, percentPerRank: 50, table: new Array(CA_RANK_LADDER.length).fill(null) };
}

export function normalizeCARankScaling(raw: unknown): CARankScaling | null {
  if (!raw || typeof raw !== "object") return null;
  const anyR = raw as any;
  const mode: CARankScalingMode =
    anyR.mode === "table" ? "table" : anyR.mode === "percent" ? "percent" : anyR.mode === "none" ? "none" : "steady";
  const table: (number | null)[] = new Array(CA_RANK_LADDER.length).fill(null);
  if (Array.isArray(anyR.table)) {
    for (let i = 0; i < table.length; i++) {
      const v = anyR.table[i];
      table[i] = Number.isFinite(Number(v)) ? Number(v) : null;
    }
  }
  return {
    mode,
    perRank: Number.isFinite(Number(anyR.perRank)) ? Number(anyR.perRank) : 0,
    percentPerRank: Number.isFinite(Number(anyR.percentPerRank)) ? Number(anyR.percentPerRank) : 0,
    table,
  };
}

/**
 * How many rungs between rung 0 and `rankIndex` cross into a new rank NAME
 * (Bronze -> Silver, etc.) — climbing a star within the same rank doesn't
 * count. Used by "percent" mode, which is meant to fire on rank-ups only.
 */
export function caRankCrossingCount(rankIndex: number): number {
  const index = Math.max(0, Math.min(CA_RANK_LADDER.length - 1, Math.trunc(rankIndex)));
  let count = 0;
  for (let i = 1; i <= index; i++) {
    if (CA_RANK_LADDER[i].star.star === 1) count++;
  }
  return count;
}

/**
 * The effective value of a rank-scalable stat at a given rung. `rankIndex`
 * null/undefined (item has no Rank tag) always returns the base value
 * unscaled, same as a `scaling` of null or `{mode: "none"}`.
 */
export function caRankScaledValue(
  base: number,
  scaling: CARankScaling | null | undefined,
  rankIndex: number | null | undefined,
): number {
  if (!scaling || scaling.mode === "none" || rankIndex == null) return base;
  const index = Math.max(0, Math.min(CA_RANK_LADDER.length - 1, Math.trunc(rankIndex)));
  if (scaling.mode === "table") {
    const tableValue = scaling.table?.[index];
    return tableValue != null ? tableValue : base;
  }
  if (scaling.mode === "percent") {
    const crossings = caRankCrossingCount(index);
    return Math.round(base * Math.pow(1 + (scaling.percentPerRank || 0) / 100, crossings));
  }
  return base + scaling.perRank * index;
}

/**
 * Value's rank scaling specifically: unlike every other stat, an unset
 * (null) config reads as the 50%-per-rank-up default rather than "off" — a
 * GM has to actively set it to {mode: "none"} to turn it off. Pass whatever
 * is stored in the item's own `priceScaling` field.
 */
export function caEffectivePriceScaling(stored: unknown): CARankScaling {
  const normalized = normalizeCARankScaling(stored);
  return normalized ?? makeDefaultPriceCARankScaling();
}

/** "Gold 3" for an item's own Rank tag, same ladder a character's Rank reads. */
export function caItemRankLabel(rankIndex: number | null | undefined): string {
  if (rankIndex == null) return "Unranked";
  const index = Math.max(0, Math.min(CA_RANK_LADDER.length - 1, Math.trunc(rankIndex)));
  const rung = CA_RANK_LADDER[index];
  return `${rung.rank.name} ${rung.star.star}`;
}

// ---------------------------------------------------------------------------
// Runes — C.A.'s own socketing mechanic, independent of AA-V3's (which bakes
// stat deltas onto the host item's real columns automatically). A C.A. rune
// instead carries a free-form list of labeled boosts: the GM types whatever
// the rune does ("Damage", "Carry Capacity", "Speed", anything) and a number,
// and a player reads that off the item when they use it — nothing here is
// applied to the host's stats automatically, matching the rest of C.A.'s
// "players and the GM make the calls" wounds philosophy.
// ---------------------------------------------------------------------------

export interface CARuneBoost {
  id: string;
  /** Free text — "Damage", "Carry Capacity", "Fire Resistance", anything. */
  label: string;
  amount: number;
}

export function makeCARuneBoost(): CARuneBoost {
  return { id: makeCAWoundId(), label: "", amount: 0 };
}

export function normalizeCARuneBoosts(raw: unknown): CARuneBoost[] {
  if (!Array.isArray(raw)) return [];
  const out: CARuneBoost[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") continue;
    const anyB = b as any;
    out.push({
      id: typeof anyB.id === "string" && anyB.id ? anyB.id : makeCAWoundId(),
      label: typeof anyB.label === "string" ? anyB.label : "",
      amount: Number.isFinite(Number(anyB.amount)) ? Number(anyB.amount) : 0,
    });
  }
  return out;
}

/**
 * A rune attached to a host item — a snapshot taken when it was attached, so
 * the host still shows what the rune does even if the rune item is later
 * edited or deleted from the library. There is no slot/capacity limit: an
 * item can carry as many of these as a GM or player attaches.
 */
export interface CASocketedRune {
  id: string;
  /** The rune item it came from, if it still exists — for detaching it back. */
  runeItemId: string | null;
  name: string;
  image: string | null;
  description: string;
  boosts: CARuneBoost[];
}

export function normalizeCASocketedRunes(raw: unknown): CASocketedRune[] {
  if (!Array.isArray(raw)) return [];
  const out: CASocketedRune[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const anyR = r as any;
    out.push({
      id: typeof anyR.id === "string" && anyR.id ? anyR.id : makeCAWoundId(),
      runeItemId: typeof anyR.runeItemId === "string" ? anyR.runeItemId : null,
      name: typeof anyR.name === "string" ? anyR.name : "Unnamed Rune",
      image: typeof anyR.image === "string" ? anyR.image : null,
      description: typeof anyR.description === "string" ? anyR.description : "",
      boosts: normalizeCARuneBoosts(anyR.boosts),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Description GM notes — "#text#" anywhere in an item's (or anything else's)
// description is visible to GMs/admins only. Works like a note embedded in
// the description rather than a separate field, so a GM can drop a private
// aside right next to the public sentence it's about.
// ---------------------------------------------------------------------------

export interface CADescriptionParts {
  /** The description with every #...# span removed — what a player sees. */
  player: string;
  /** Every #...# span's inner text, joined by a blank line. Empty if none. */
  gm: string;
  hasGmNotes: boolean;
}

export function caSplitDescriptionGmNotes(description: string | null | undefined): CADescriptionParts {
  const text = String(description ?? "");
  const gmParts: string[] = [];
  const player = text
    .replace(/#([^#]*)#/g, (_match, inner) => {
      const trimmed = String(inner).trim();
      if (trimmed) gmParts.push(trimmed);
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { player, gm: gmParts.join("\n\n"), hasGmNotes: gmParts.length > 0 };
}
