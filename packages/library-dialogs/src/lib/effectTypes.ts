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

// The host app's wound-based system. Duplicated from the host's
// shared/systemRules.ts rather than imported: this package is standalone and
// deliberately has no dependency on @shared. Swampy was one of these while it
// was a copy of C.A. and no longer is, so keep the two predicates below apart -
// they answer different questions and now have different answers.
export function isWoundSystem(campaignSystem?: string | null): boolean {
  return campaignSystem === "ca";
}

// Systems whose items are blank customizable sheets rather than a fixed set of
// V1/V2 mechanical fields. C.A. and Swampy both are: neither has a fixed
// damage/effect model for gear to plug into.
export function isBlankItemSheetSystem(campaignSystem?: string | null): boolean {
  return campaignSystem === "ca" || campaignSystem === "swampy";
}

export function getEffectTypes(campaignSystem?: string | null): string[] {
  return isAAv2OrV3(campaignSystem) ? AAV2_EFFECT_TYPES : LEGACY_DAMAGE_TYPES;
}

export function getEffectTypeLabel(campaignSystem?: string | null): string {
  return isAAv2OrV3(campaignSystem) ? "Effect Type" : "Damage Type";
}
