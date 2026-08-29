// Cultivator's Adventure (C.A.) — a fresh, independent 4th game system.
// Nothing in this file is imported from or exported to shared/v3.ts (or any
// other system's constants) — C.A. starts as an editable copy of ideas from
// other systems where the user asked for that, but must stay fully
// independent so future edits to either system never affect the other.

// ---------------------------------------------------------------------------
// Wounds — replaces HP entirely for C.A. 6 slots, each with 1 "major" wound
// and 3 "minor" wounds. Purely narrative/GM-discretion tracking, no
// mechanical HP derivation.
// ---------------------------------------------------------------------------

// A wound's optional mechanical effect: a flat delta applied to a skill, an
// attribute, or one of the fixed movement stats while this box is checked.
// `target` is a CA_SKILLS key, a CAAttributeKey, or a CAFixedStatTarget.
export interface CAWoundStatEffect {
  target: string;
  amount: number;
}

export interface CAWoundEntry {
  checked: boolean;
  injury: string;
  effect: string;
  statEffect?: CAWoundStatEffect | null;
}

export interface CAWoundSlot {
  label: string;
  major: CAWoundEntry;
  minor: CAWoundEntry[]; // always length 3
}

export const CA_WOUND_SLOT_COUNT = 6;
export const CA_WOUND_MINOR_PER_SLOT = 3;
export const CA_WOUND_TOTAL_BOXES = CA_WOUND_SLOT_COUNT * (1 + CA_WOUND_MINOR_PER_SLOT);

// Each of the 6 slots is a fixed body region, in display order. The label is
// always derived from this array by index — never trusted from stored data —
// so ordering/naming is guaranteed consistent across every character.
export const CA_BODY_PARTS = ["Head", "Torso", "R Arm", "L Arm", "R Leg", "L Leg"] as const;
export type CABodyPart = typeof CA_BODY_PARTS[number];

function emptyWoundEntry(): CAWoundEntry {
  return { checked: false, injury: "", effect: "" };
}

export function makeEmptyCAWounds(): CAWoundSlot[] {
  return CA_BODY_PARTS.map((label) => ({
    label,
    major: emptyWoundEntry(),
    minor: Array.from({ length: CA_WOUND_MINOR_PER_SLOT }, () => emptyWoundEntry()),
  }));
}

// Tolerates missing/malformed data (e.g. a character predating this column,
// or a slot count that doesn't match if this ever changes) by falling back
// to a fresh empty set rather than throwing. Labels are always the canonical
// CA_BODY_PARTS name for that index, regardless of what (if anything) was
// stored, so a stale/legacy label can never surface in the UI.
export function normalizeCAWounds(raw: unknown): CAWoundSlot[] {
  if (!Array.isArray(raw) || raw.length !== CA_WOUND_SLOT_COUNT) {
    return makeEmptyCAWounds();
  }
  return raw.map((slot: any, i: number) => ({
    label: CA_BODY_PARTS[i],
    major: normalizeWoundEntry(slot?.major),
    minor: Array.from({ length: CA_WOUND_MINOR_PER_SLOT }, (_, j) =>
      normalizeWoundEntry(slot?.minor?.[j])
    ),
  }));
}

function normalizeWoundEntry(raw: any): CAWoundEntry {
  const rawEffect = raw?.statEffect;
  const statEffect: CAWoundStatEffect | null =
    rawEffect && typeof rawEffect.target === "string" && rawEffect.target && Number.isFinite(Number(rawEffect.amount))
      ? { target: rawEffect.target, amount: Math.trunc(Number(rawEffect.amount)) }
      : null;
  return {
    checked: !!raw?.checked,
    injury: typeof raw?.injury === "string" ? raw.injury : "",
    effect: typeof raw?.effect === "string" ? raw.effect : "",
    statEffect,
  };
}

export function caWoundCount(wounds: unknown): number {
  const normalized = normalizeCAWounds(wounds);
  let count = 0;
  for (const slot of normalized) {
    if (slot.major.checked) count++;
    for (const m of slot.minor) if (m.checked) count++;
  }
  return count;
}

// A limb's Major wound is "in effect" either because it was checked
// directly, or because all 3 of its Minor wounds are checked — three minors
// add up to as dangerous as a major injury. This is purely computed, never
// stored: checking/unchecking a single minor immediately changes the
// answer, and the player's own major.checked flag (if they set it
// themselves) is preserved independently underneath it either way.
export function caEffectiveMajorActive(slot: CAWoundSlot): boolean {
  return slot.major.checked || slot.minor.every(m => m.checked);
}

// HP for C.A. is driven by Major wounds only (direct or minor-covered) —
// Minor wounds short of covering a whole limb don't affect it. Returns how
// many of the 6 limbs currently have an effective Major wound, 0-6.
export function caMajorWoundCount(wounds: unknown): number {
  const normalized = normalizeCAWounds(wounds);
  return normalized.filter(caEffectiveMajorActive).length;
}

// Movement stats a wound's effect can target besides a skill/attribute key.
export const CA_FIXED_STAT_TARGETS = ["speed", "flySpeed", "swimSpeed"] as const;
export type CAFixedStatTarget = typeof CA_FIXED_STAT_TARGETS[number];
export const CA_FIXED_STAT_LABELS: Record<CAFixedStatTarget, string> = {
  speed: "Speed",
  flySpeed: "Fly Speed",
  swimSpeed: "Swim Speed",
};

// Sums every CHECKED wound's statEffect that targets `target` (a skill key,
// an attribute key, or a CAFixedStatTarget), across all 6 limbs. Unchecking
// or clearing a wound removes its contribution immediately — this is always
// computed fresh from the wounds array, never a separately stored total.
export function caWoundStatEffectTotal(wounds: unknown, target: string): number {
  if (!target) return 0;
  const normalized = normalizeCAWounds(wounds);
  let total = 0;
  for (const slot of normalized) {
    const entries = [slot.major, ...slot.minor];
    for (const entry of entries) {
      if (entry.checked && entry.statEffect && entry.statEffect.target === target) {
        total += entry.statEffect.amount;
      }
    }
  }
  return total;
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
