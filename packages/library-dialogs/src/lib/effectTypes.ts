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

// V3 mirrors V2 behavior for foundation; gate combined predicate.
export function isAAv2OrV3(campaignSystem?: string | null): boolean {
  return campaignSystem === "aa-v2" || campaignSystem === "aa-v3";
}

export function getEffectTypes(campaignSystem?: string | null): string[] {
  return isAAv2OrV3(campaignSystem) ? AAV2_EFFECT_TYPES : LEGACY_DAMAGE_TYPES;
}

export function getEffectTypeLabel(campaignSystem?: string | null): string {
  return isAAv2OrV3(campaignSystem) ? "Effect Type" : "Damage Type";
}
