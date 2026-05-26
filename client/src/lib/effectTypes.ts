export const AAV2_EFFECT_TYPES = [
  "Sharp",
  "Blunt",
  "Piercing",
  "Flame",
  "Frost",
  "Tide",
  "Storm",
  "Sound",
  "Mind",
  "Decay",
  "Light",
  "Shadow",
  "Flux",
  "Health",
  "Energy",
  "Mana",
];

export const LEGACY_DAMAGE_TYPES = [
  "Sharp",
  "Blunt",
  "Piercing",
  "Flame",
  "Frost",
  "Storm",
  "Mind",
  "Poison",
  "Tide",
  "Stone",
  "Flux",
  "Light",
  "Dark",
  "Sound",
];

export function isAAv2(campaignSystem?: string | null): boolean {
  return campaignSystem === "aa-v2";
}

export function isAAv3(campaignSystem?: string | null): boolean {
  return campaignSystem === "aa-v3";
}

// AA V3 currently mirrors V2 behavior wholesale (effect types, mana, skill
// trees, class points, etc). Tasks #72/#74/#75 will diverge V3 from V2.
// Until then, gate any V2-specific UI/logic on this combined predicate so
// V3 campaigns inherit V2 behavior without touching V2 code paths.
export function isAAv2OrV3(campaignSystem?: string | null): boolean {
  return campaignSystem === "aa-v2" || campaignSystem === "aa-v3";
}

export function getEffectTypes(campaignSystem?: string | null): string[] {
  return isAAv2OrV3(campaignSystem) ? AAV2_EFFECT_TYPES : LEGACY_DAMAGE_TYPES;
}

export function getEffectTypeLabel(campaignSystem?: string | null): string {
  return isAAv2OrV3(campaignSystem) ? "Effect Type" : "Damage Type";
}
