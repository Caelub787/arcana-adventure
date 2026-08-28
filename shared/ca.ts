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

export interface CAWoundEntry {
  checked: boolean;
  injury: string;
  effect: string;
}

export interface CAWoundSlot {
  label: string;
  major: CAWoundEntry;
  minor: CAWoundEntry[]; // always length 3
}

export const CA_WOUND_SLOT_COUNT = 6;
export const CA_WOUND_MINOR_PER_SLOT = 3;
export const CA_WOUND_TOTAL_BOXES = CA_WOUND_SLOT_COUNT * (1 + CA_WOUND_MINOR_PER_SLOT);

function emptyWoundEntry(): CAWoundEntry {
  return { checked: false, injury: "", effect: "" };
}

export function makeEmptyCAWounds(): CAWoundSlot[] {
  return Array.from({ length: CA_WOUND_SLOT_COUNT }, (_, i) => ({
    label: `Wound ${i + 1}`,
    major: emptyWoundEntry(),
    minor: Array.from({ length: CA_WOUND_MINOR_PER_SLOT }, () => emptyWoundEntry()),
  }));
}

// Tolerates missing/malformed data (e.g. a character predating this column,
// or a slot count that doesn't match if this ever changes) by falling back
// to a fresh empty set rather than throwing.
export function normalizeCAWounds(raw: unknown): CAWoundSlot[] {
  if (!Array.isArray(raw) || raw.length !== CA_WOUND_SLOT_COUNT) {
    return makeEmptyCAWounds();
  }
  return raw.map((slot: any, i: number) => ({
    label: typeof slot?.label === "string" ? slot.label : `Wound ${i + 1}`,
    major: normalizeWoundEntry(slot?.major),
    minor: Array.from({ length: CA_WOUND_MINOR_PER_SLOT }, (_, j) =>
      normalizeWoundEntry(slot?.minor?.[j])
    ),
  }));
}

function normalizeWoundEntry(raw: any): CAWoundEntry {
  return {
    checked: !!raw?.checked,
    injury: typeof raw?.injury === "string" ? raw.injury : "",
    effect: typeof raw?.effect === "string" ? raw.effect : "",
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
