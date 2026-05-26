// AA V3 canonical attribute + skill model.
// Shared between client and server so there is exactly one source of truth.

export type V3AttributeKey =
  | "might"
  | "finesse"
  | "constitution"
  | "will"
  | "anemos"
  | "intelligence";

export interface V3AttributeDef {
  key: V3AttributeKey;
  name: string;
  abbr: string;
}

export const V3_ATTRIBUTES: V3AttributeDef[] = [
  { key: "might",        name: "Might",        abbr: "MIG" },
  { key: "finesse",      name: "Finesse",      abbr: "FIN" },
  { key: "constitution", name: "Constitution", abbr: "CON" },
  { key: "will",         name: "Will",         abbr: "WIL" },
  { key: "anemos",       name: "Anemos",       abbr: "ANE" },
  { key: "intelligence", name: "Intelligence", abbr: "INT" },
];

export const V3_ATTRIBUTE_KEYS: V3AttributeKey[] = V3_ATTRIBUTES.map(a => a.key);

export interface V3SkillDef {
  key: string;
  name: string;
  parent: V3AttributeKey;
  description: string;
}

// Fixed canonical V3 skill list. The `key` is what we use in the
// per-character `v3Skills` JSON map and as a stable identifier.
export const V3_SKILLS: V3SkillDef[] = [
  // Might
  { key: "athletics",     name: "Athletics",     parent: "might",        description: "Climbing, jumping, swimming, and pure physical exertion." },
  // Finesse
  { key: "acrobatics",    name: "Acrobatics",    parent: "finesse",      description: "Balance, tumbling, and graceful body control." },
  { key: "stealth",       name: "Stealth",       parent: "finesse",      description: "Moving unseen and unheard." },
  { key: "sleightOfHand", name: "Sleight of Hand", parent: "finesse",    description: "Picking pockets, palming items, and fine manual trickery." },
  // Constitution
  { key: "endurance",     name: "Endurance",     parent: "constitution", description: "Resisting fatigue, holding your breath, marching for hours." },
  { key: "fortitude",     name: "Fortitude",     parent: "constitution", description: "Resisting poison, disease, and bodily afflictions." },
  { key: "perception",    name: "Perception",    parent: "constitution", description: "Noticing details with your physical senses." },
  // Will
  { key: "resolve",       name: "Resolve",       parent: "will",         description: "Resisting fear, charm, and mental coercion." },
  { key: "focus",         name: "Focus",         parent: "will",         description: "Maintaining concentration under pressure." },
  { key: "insight",       name: "Insight",       parent: "will",         description: "Reading intentions, lies, and subtle social cues." },
  // Anemos
  { key: "sense",         name: "Sense",         parent: "anemos",       description: "Sensing magic, spirits, and currents of the Anemos." },
  // Intelligence
  { key: "investigation", name: "Investigation", parent: "intelligence", description: "Deductive reasoning, sifting clues, recognizing patterns." },
  { key: "naturecraft",   name: "Naturecraft",   parent: "intelligence", description: "Knowledge of plants, beasts, weather, and the wild." },
  { key: "survival",      name: "Survival",      parent: "intelligence", description: "Tracking, foraging, and surviving in hostile terrain." },
];

export const V3_SKILL_KEYS: string[] = V3_SKILLS.map(s => s.key);

// Default empty v3Skills map keyed by skill key, all zeros.
export function makeEmptyV3Skills(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of V3_SKILLS) out[s.key] = 0;
  return out;
}

// Attribute value -> die sides. Used for skill checks in V3:
// roll 1d{sides} + skillMod, instead of V2's flat d20 + skillMod + attrMod.
// 0 -> d6, 1 -> d8, 2 -> d10, 3 -> d12, 4+ -> d20.
export function attrValueToDieSides(value: number): number {
  const v = Math.max(0, Math.floor(value || 0));
  if (v <= 0) return 6;
  if (v === 1) return 8;
  if (v === 2) return 10;
  if (v === 3) return 12;
  return 20;
}

export function attrDieType(value: number): string {
  return `d${attrValueToDieSides(value)}`;
}

// Default species jsonb shapes -------------------------------------------------

export type V3AttributeBonuses = Partial<Record<V3AttributeKey, number>>;

export interface V3SpeciesDefaultSkill {
  name: string;
  description?: string;
  parentAttribute: string;
  value: number;
}

export interface V3SpeciesDefaultTrait {
  name: string;
  description?: string;
  parentAttribute: string;
  usesPerLongRest: number;
}
