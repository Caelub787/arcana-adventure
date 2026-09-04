// Swampy — "The Lanterns Beyond the Veil".
//
// Daggerheart's mechanical base (Duality Dice, Hope/Fear, HP + damage
// thresholds, Armour Slots, Stress — renamed Strain here) with its fixed
// classes, Domain Cards and spellcasting removed. In their place: freeform
// actions for everyone, and magic ("Drawing") tied to living worlds called
// Warrens rather than to spell lists or mana pools.
//
// This file imports nothing from shared/ca.ts, shared/v3.ts, or any other
// system's constants, and nothing imports it back. Swampy began as a copy of
// C.A. and has since replaced that ruleset wholesale; the two stay fully
// independent, so editing either never touches the other.

// ---------------------------------------------------------------------------
// Traits
//
// A roll is Hope d12 + Fear d12 + the relevant trait (+ any Experience the
// player spends Hope on). There is no skill list: what a character is good at
// is expressed by traits plus their own freeform Experiences, which is what
// keeps physical, social, crafting and exploration expertise valuable without
// enumerating allowed actions.
// ---------------------------------------------------------------------------

export type SwampyTraitKey =
  | "agility"
  | "strength"
  | "finesse"
  | "instinct"
  | "presence"
  | "knowledge";

export interface SwampyTraitDef {
  key: SwampyTraitKey;
  name: string;
  abbr: string;
  description: string;
}

export const SWAMPY_TRAITS: SwampyTraitDef[] = [
  { key: "agility",   name: "Agility",   abbr: "AGI", description: "Sprinting, leaping, manoeuvring, and staying on your feet." },
  { key: "strength",  name: "Strength",  abbr: "STR", description: "Lifting, grappling, smashing, and holding ground." },
  { key: "finesse",   name: "Finesse",   abbr: "FIN", description: "Control, stealth, precision, and delicate work." },
  { key: "instinct",  name: "Instinct",  abbr: "INS", description: "Perceiving, sensing, navigating, and reacting." },
  { key: "presence",  name: "Presence",  abbr: "PRE", description: "Charming, performing, intimidating, and negotiating." },
  { key: "knowledge", name: "Knowledge", abbr: "KNO", description: "Recalling, deducing, and understanding how things work." },
];

export const SWAMPY_TRAIT_KEYS: SwampyTraitKey[] = SWAMPY_TRAITS.map(t => t.key);

export function isSwampyTraitKey(key: string | null | undefined): key is SwampyTraitKey {
  return !!key && (SWAMPY_TRAIT_KEYS as string[]).includes(key);
}

export function makeEmptySwampyTraits(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of SWAMPY_TRAITS) out[t.key] = 0;
  return out;
}

// ---------------------------------------------------------------------------
// Experiences
//
// Freeform phrases ("Grew up on the docks", "Owes a favour to the Ash House")
// rather than a fixed skill list. Spending a Hope adds the Experience's
// modifier to a roll it plausibly applies to — the GM adjudicates relevance,
// which is the same universal-action principle the rest of the system uses.
// ---------------------------------------------------------------------------

export const SWAMPY_EXPERIENCE_BONUS = 2;

export interface SwampyExperience {
  id: string;
  name: string;
  modifier: number;
}

let swampyIdCounter = 0;
function makeSwampyId(prefix: string): string {
  swampyIdCounter += 1;
  return `${prefix}${Date.now().toString(36)}${swampyIdCounter}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeSwampyExperience(): SwampyExperience {
  return { id: makeSwampyId("x"), name: "", modifier: SWAMPY_EXPERIENCE_BONUS };
}

export function normalizeSwampyExperiences(raw: unknown): SwampyExperience[] {
  if (!Array.isArray(raw)) return [];
  const out: SwampyExperience[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const anyE = e as any;
    out.push({
      id: typeof anyE.id === "string" && anyE.id ? anyE.id : makeSwampyId("x"),
      name: typeof anyE.name === "string" ? anyE.name : "",
      modifier: Number.isFinite(Number(anyE.modifier)) ? Math.trunc(Number(anyE.modifier)) : SWAMPY_EXPERIENCE_BONUS,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Duality Dice
//
// Two d12 rolled together — one Hope, one Fear. Their sum plus modifiers is
// compared to a GM-set Difficulty, and which die came up higher decides who
// gains the meta-currency. Matching dice are a critical success: the best
// plausible result, not a reality-breaking one.
// ---------------------------------------------------------------------------

export const SWAMPY_DUALITY_DIE_SIDES = 12;

export type SwampyRollOutcome =
  | "critical"
  | "success-hope"
  | "success-fear"
  | "failure-hope"
  | "failure-fear";

export const SWAMPY_OUTCOME_LABELS: Record<SwampyRollOutcome, string> = {
  critical: "Critical Success",
  "success-hope": "Success with Hope",
  "success-fear": "Success with Fear",
  "failure-hope": "Failure with Hope",
  "failure-fear": "Failure with Fear",
};

export const SWAMPY_OUTCOME_DESCRIPTIONS: Record<SwampyRollOutcome, string> = {
  critical: "The best plausible result. Gain a Hope and clear a Strain.",
  "success-hope": "You succeed cleanly and gain a Hope.",
  "success-fear": "You succeed, but a consequence occurs and the GM gains a Fear.",
  "failure-hope": "You fail or get a reduced result, but gain a Hope and avoid the worst of it.",
  "failure-fear": "You fail and the situation worsens. The GM gains a Fear.",
};

export interface SwampyDualityResult {
  hopeDie: number;
  fearDie: number;
  modifier: number;
  total: number;
  difficulty: number | null;
  outcome: SwampyRollOutcome;
  /** Matching dice — a critical succeeds regardless of Difficulty. */
  isCritical: boolean;
  /** True when the roll leaves the player with a Hope. */
  gainsHope: boolean;
  /** True when the roll hands the GM a Fear. */
  gainsFear: boolean;
  /** A critical also clears a Strain. */
  clearsStrain: boolean;
}

/**
 * Resolve an already-rolled pair of dice.
 *
 * Kept separate from the rolling itself so the server can roll the dice and
 * both sides can agree on what the result means.
 */
export function resolveSwampyDuality(
  hopeDie: number,
  fearDie: number,
  modifier = 0,
  difficulty: number | null = null,
): SwampyDualityResult {
  const hope = Math.max(1, Math.min(SWAMPY_DUALITY_DIE_SIDES, Math.trunc(hopeDie) || 1));
  const fear = Math.max(1, Math.min(SWAMPY_DUALITY_DIE_SIDES, Math.trunc(fearDie) || 1));
  const mod = Math.trunc(modifier) || 0;
  const total = hope + fear + mod;
  const isCritical = hope === fear;
  // With no Difficulty set the GM is calling it; treat the roll as unresolved
  // for success purposes and report only which die won.
  const succeeded = isCritical || (difficulty !== null && total >= difficulty);

  let outcome: SwampyRollOutcome;
  if (isCritical) outcome = "critical";
  else if (succeeded) outcome = hope > fear ? "success-hope" : "success-fear";
  else outcome = hope > fear ? "failure-hope" : "failure-fear";

  return {
    hopeDie: hope,
    fearDie: fear,
    modifier: mod,
    total,
    difficulty,
    outcome,
    isCritical,
    gainsHope: isCritical || hope > fear,
    gainsFear: !isCritical && fear > hope,
    clearsStrain: isCritical,
  };
}

// ---------------------------------------------------------------------------
// Hope and Fear
// ---------------------------------------------------------------------------

export const SWAMPY_MAX_HOPE = 6;
export const SWAMPY_MAX_FEAR = 12;

export function clampSwampyHope(value: unknown): number {
  return Math.max(0, Math.min(SWAMPY_MAX_HOPE, Math.trunc(Number(value)) || 0));
}

export function clampSwampyFear(value: unknown): number {
  return Math.max(0, Math.min(SWAMPY_MAX_FEAR, Math.trunc(Number(value)) || 0));
}

// ---------------------------------------------------------------------------
// Damage, thresholds and Armour Slots
//
// Damage is compared to the character's two thresholds rather than subtracted
// from a pool: under Major costs 1 HP, at or over Major costs 2, at or over
// Severe costs 3. Armour is limited — marking an Armour Slot pulls the damage
// down one tier, which is how "armour reduces HP damage but is limited" works.
// ---------------------------------------------------------------------------

export interface SwampyThresholds {
  major: number;
  severe: number;
}

export const SWAMPY_DEFAULT_THRESHOLDS: SwampyThresholds = { major: 8, severe: 16 };

export function swampyHpCostForDamage(
  damage: number,
  thresholds: SwampyThresholds = SWAMPY_DEFAULT_THRESHOLDS,
  armourSlotsUsed = 0,
): number {
  const dmg = Math.max(0, Math.trunc(Number(damage)) || 0);
  if (dmg <= 0) return 0;
  const severe = Math.max(1, Math.trunc(thresholds.severe) || SWAMPY_DEFAULT_THRESHOLDS.severe);
  const major = Math.max(1, Math.min(severe, Math.trunc(thresholds.major) || SWAMPY_DEFAULT_THRESHOLDS.major));
  let tier = dmg >= severe ? 3 : dmg >= major ? 2 : 1;
  // Each Armour Slot marked steps the hit down one tier, never below 1 HP.
  tier -= Math.max(0, Math.trunc(armourSlotsUsed) || 0);
  return Math.max(1, tier);
}

export function swampyThresholdLabel(
  damage: number,
  thresholds: SwampyThresholds = SWAMPY_DEFAULT_THRESHOLDS,
): "Minor" | "Major" | "Severe" {
  const dmg = Math.max(0, Math.trunc(Number(damage)) || 0);
  if (dmg >= thresholds.severe) return "Severe";
  if (dmg >= thresholds.major) return "Major";
  return "Minor";
}

// ---------------------------------------------------------------------------
// Strain
//
// Physical, mental, emotional and magical pressure in one track. At full
// Strain a character is Vulnerable; forcing more Strain on them past that
// point becomes HP damage instead.
// ---------------------------------------------------------------------------

export const SWAMPY_DEFAULT_MAX_STRAIN = 6;

export function isSwampyVulnerable(strain: unknown, maxStrain: unknown): boolean {
  const cur = Math.max(0, Math.trunc(Number(strain)) || 0);
  const max = Math.max(1, Math.trunc(Number(maxStrain)) || SWAMPY_DEFAULT_MAX_STRAIN);
  return cur >= max;
}

/**
 * Apply Strain, spilling anything past the track into HP damage.
 *
 * Returns what actually landed so a caller can report "2 Strain, 1 HP" rather
 * than silently dropping the overflow.
 */
export function applySwampyStrain(
  current: unknown,
  maxStrain: unknown,
  amount: number,
): { strain: number; hpDamage: number; becameVulnerable: boolean } {
  const max = Math.max(1, Math.trunc(Number(maxStrain)) || SWAMPY_DEFAULT_MAX_STRAIN);
  const before = Math.max(0, Math.min(max, Math.trunc(Number(current)) || 0));
  const add = Math.max(0, Math.trunc(Number(amount)) || 0);
  const strain = Math.min(max, before + add);
  const hpDamage = Math.max(0, before + add - max);
  return {
    strain,
    hpDamage,
    becameVulnerable: strain >= max && before < max,
  };
}

// ---------------------------------------------------------------------------
// Warrens
//
// Real, living worlds beyond the Veil. A Warren's condition is the single
// biggest lever on magic drawn from it, so it lives on the Warren rather than
// on any spell.
// ---------------------------------------------------------------------------

export type SwampyWarrenCondition =
  | "flourishing"
  | "wounded"
  | "poisoned"
  | "starved"
  | "bound"
  | "sleeping"
  | "dying"
  | "shattered"
  | "returning";

export interface SwampyWarrenConditionDef {
  key: SwampyWarrenCondition;
  name: string;
  /** What drawing from a Warren in this condition does to the magic. */
  effect: string;
  /** Tailwind text colour used wherever a condition is shown as a badge. */
  color: string;
}

export const SWAMPY_WARREN_CONDITIONS: SwampyWarrenConditionDef[] = [
  { key: "flourishing", name: "Flourishing", color: "text-emerald-400", effect: "Stable, normal magic." },
  { key: "wounded",     name: "Wounded",     color: "text-orange-400", effect: "Magic is weaker, shorter, narrower, slower, or harder to control." },
  { key: "poisoned",    name: "Poisoned",    color: "text-lime-400",   effect: "Magic works but carries sickness, corruption, marks, urges, or complications." },
  { key: "starved",     name: "Starved",     color: "text-amber-400",  effect: "Magic demands more Strain, a bargain, reduced scope, or worsens the Warren." },
  { key: "bound",       name: "Bound",       color: "text-sky-400",    effect: "Magic must obey an oath, rule, toll, taboo, or permission." },
  { key: "sleeping",    name: "Sleeping",    color: "text-indigo-400", effect: "Magic needs ritual time, dreams, a specific place, or forceful exertion." },
  { key: "dying",       name: "Dying",       color: "text-rose-400",   effect: "Magic is weak unless a serious personal or world cost is accepted." },
  { key: "shattered",   name: "Shattered",   color: "text-stone-400",  effect: "The Warren is dead or broken; magic is fragmented and unstable." },
  { key: "returning",   name: "Returning",   color: "text-teal-400",   effect: "The Warren is beginning to live again; magic can nurture it or exploit it." },
];

export const SWAMPY_WARREN_CONDITION_KEYS: SwampyWarrenCondition[] =
  SWAMPY_WARREN_CONDITIONS.map(c => c.key);

export function swampyWarrenCondition(key: string | null | undefined): SwampyWarrenConditionDef {
  return SWAMPY_WARREN_CONDITIONS.find(c => c.key === key) ?? SWAMPY_WARREN_CONDITIONS[0];
}

// ---------------------------------------------------------------------------
// Drawing: what the player declares, and what the GM answers before anyone
// commits. Kept as data so the Working form can render them in order and
// nothing gets skipped — "players always know the likely cost and main risk
// before committing" is a stated design goal, not a suggestion.
// ---------------------------------------------------------------------------

export const SWAMPY_DRAW_DECLARATION = [
  { key: "intent", name: "Intent", description: "What they want to achieve." },
  { key: "warren", name: "Warren", description: "Where the power comes from." },
  { key: "method", name: "Method", description: "How they open and shape the connection." },
  { key: "limit",  name: "Limit",  description: "Target, area, duration, range, and scale requested." },
] as const;

export const SWAMPY_GM_RESPONSE = [
  { key: "possible",  name: "Possible?",       description: "Whether it can be done at all." },
  { key: "effect",    name: "Effect & Limits", description: "The actual effect, and its real limits." },
  { key: "roll",      name: "Roll / Resistance", description: "Whether a roll or resistance is needed." },
  { key: "cost",      name: "Cost",            description: "Usually Strain — perhaps time, materials, a bargain, attention, or a sacrifice." },
  { key: "condition", name: "Condition Effect", description: "What the Warren's condition does to it." },
  { key: "risk",      name: "Main Risk",       description: "The main risk on failure or Success with Fear." },
] as const;

/** The four checks the GM runs on every Status (magical effect). */
export const SWAMPY_STATUS_CHECKS = [
  { key: "access", name: "Access", description: "Can the character reach and open this Warren now?" },
  { key: "nature", name: "Nature", description: "Does the effect fit the Warren's character, land, life, and history?" },
  { key: "scale",  name: "Scale",  description: "How large, long, far-reaching, reliable, or permanent is it?" },
  { key: "cost",   name: "Cost",   description: "What does it cost the caster, Warren, House, Path, place, or story?" },
] as const;

/** Routes forward the GM should offer when an effect can't happen right now. */
export const SWAMPY_ROUTES_FORWARD = [
  "Reduce the scope",
  "Take more time",
  "Perform a ritual",
  "Find a threshold, relic, or Path",
  "Gain another Warren",
  "Seek a House",
  "Bring allies",
  "Accept a serious cost",
];

// ---------------------------------------------------------------------------
// Overdrawing
//
// Forcing magic through at full Strain. The player must accept a serious cost
// BEFORE the roll, which is why these are a fixed list to choose from rather
// than something improvised after the fact.
// ---------------------------------------------------------------------------

export const SWAMPY_OVERDRAW_COSTS = [
  "Direct HP damage",
  "A lasting Warren Scar",
  "The GM gains Fear",
  "Worsen a Warren's condition",
  "A House gains a claim on you",
  "An open breach is left behind",
  "Lose a memory, oath, item, or relationship",
  "Unstable collateral magic",
];

// ---------------------------------------------------------------------------
// Working Ledger
//
// A log of precedents created during play, not a prewritten spell list. These
// are the fields every entry records, so a technique established in one
// session can be relied on, learned, copied, countered, altered, or improved
// in the next.
// ---------------------------------------------------------------------------

export const SWAMPY_WORKING_FIELDS = [
  { key: "name",                 name: "Name",                  hint: "What this Working is called at the table." },
  { key: "warrenName",           name: "Warren",                hint: "Which Warren the power is drawn from." },
  { key: "method",               name: "Method",                hint: "How the connection is opened and shaped." },
  { key: "effect",               name: "Effect",                hint: "What it actually does." },
  { key: "cost",                 name: "Cost",                  hint: "Strain, time, materials, a bargain, a sacrifice." },
  { key: "limits",               name: "Limits",                hint: "Target, area, duration, range, scale." },
  { key: "conditionInteraction", name: "Condition Interaction", hint: "How the Warren's condition changes it." },
  { key: "risk",                 name: "Risk",                  hint: "What goes wrong on a failure or Success with Fear." },
] as const;

// ---------------------------------------------------------------------------
// Deck of Houses
//
// A feared divination system. It does not set the future; it reveals movement
// and pressure among Houses, gods, Seats, Ascendants, Paths, Warrens, debts,
// and important people. A reading can make the reader visible to powerful
// forces interested in the role they are beginning to fulfil.
// ---------------------------------------------------------------------------

export type SwampyReadingOrientation = "upright" | "reversed";

export interface SwampyDrawnCard {
  cardId: string;
  name: string;
  orientation: SwampyReadingOrientation;
}

/** Spreads a reading can be laid in. */
export const SWAMPY_READING_SPREADS = [
  { key: "single",   name: "Single Card",   count: 1, positions: ["The Pressure"] },
  { key: "three",    name: "Three Cards",   count: 3, positions: ["What Moves", "What Presses", "What Watches"] },
  { key: "house",    name: "House Spread",  count: 5, positions: ["The Seat", "The Ascendant", "The Path", "The Debt", "The Witness"] },
] as const;

export type SwampyReadingSpreadKey = typeof SWAMPY_READING_SPREADS[number]["key"];

export function swampyReadingSpread(key: string | null | undefined) {
  return SWAMPY_READING_SPREADS.find(s => s.key === key) ?? SWAMPY_READING_SPREADS[0];
}
