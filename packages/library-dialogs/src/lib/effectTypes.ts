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

// The host app's wound-based systems (C.A. and Swampy). Their items are blank
// customizable sheets, so this package hides most fixed mechanical fields for
// them. Duplicated from the host's shared/systemRules.ts rather than imported:
// this package is standalone and deliberately has no dependency on @shared.
export function isWoundSystem(campaignSystem?: string | null): boolean {
  return campaignSystem === "ca" || campaignSystem === "swampy";
}

export function getEffectTypes(campaignSystem?: string | null): string[] {
  return isAAv2OrV3(campaignSystem) ? AAV2_EFFECT_TYPES : LEGACY_DAMAGE_TYPES;
}

export function getEffectTypeLabel(campaignSystem?: string | null): string {
  return isAAv2OrV3(campaignSystem) ? "Effect Type" : "Damage Type";
}
