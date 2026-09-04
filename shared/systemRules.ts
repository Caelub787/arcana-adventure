// Runtime resolver for the wound-based systems.
//
// C.A. is the only one right now. Swampy briefly shared this model while it was
// a copy of C.A., then replaced it with Daggerheart's HP + damage thresholds +
// Strain (see shared/swampy.ts), so it is no longer resolved here.
//
// The seam is kept rather than inlined: the shared wound UI reads its
// constants AND its character column names from the pack, so a second wound
// system can be added by adding a pack, without hunting for `=== 'ca'` checks
// again. If a system needs UI another doesn't have, branch on `rules.slug` at
// that spot rather than widening this interface.

import * as CA from "./ca";

export type WoundSystemSlug = "ca";

/** True for the systems that replace HP with the pinned-wound model. */
export function isWoundSystem(slug?: string | null): boolean {
  return slug === "ca";
}

export interface WoundEffectShape {
  id: string;
  target: string;
  amount: number;
}

export interface WoundShape {
  id: string;
  x: number;
  y: number;
  name: string;
  // Deliberately `string`, not a union: the two systems own their own severity
  // lists and are free to drift apart without breaking this shared type.
  severity: string;
  description: string;
  effects: WoundEffectShape[];
}

export interface AttributeShape {
  key: string;
  name: string;
  abbr: string;
}

export interface SkillShape {
  key: string;
  name: string;
  parent: string;
  description: string;
}

export interface WoundSystemRules {
  slug: WoundSystemSlug;
  label: string;

  // --- character columns this system reads/writes -------------------------
  // Each system owns its own columns so one can never read or clobber the
  // other's data.
  woundsField: string;
  bodySexField: string;
  energyPoolField: string;

  // --- constants ----------------------------------------------------------
  ATTRIBUTES: readonly AttributeShape[];
  SKILLS: readonly SkillShape[];
  WOUND_MAX: number;
  WOUND_SEVERITIES: readonly string[];
  WOUND_SEVERITY_LABELS: Record<string, string>;
  WOUND_SEVERITY_COST: Record<string, number>;
  WOUND_SEVERITY_RANK: Record<string, number>;
  FIXED_STAT_TARGETS: readonly string[];
  FIXED_STAT_LABELS: Record<string, string>;
  MAX_NEGATIVE_SKILL_POINTS: number;

  // --- helpers ------------------------------------------------------------
  attrValueToDieSides(value: number): number;
  attrDieType(value: number): string;
  attrPointBudget(level: number): number;
  skillPointBudget(level: number): number;
  effectiveSkillMod(character: any, skillKey: string | null | undefined): number;
  makeEmptySkills(): Record<string, number>;
  makeWound(x: number, y: number): WoundShape;
  makeWoundEffect(): WoundEffectShape;
  normalizeWounds(raw: unknown): WoundShape[];
  woundStatEffectTotal(wounds: unknown, target: string): number;
  woundTotalCost(wounds: unknown): number;
  woundEffectTargetLabel(target: string): string;

  /** Reads this system's own wounds column off a character row. */
  woundsOf(character: any): unknown;
  /** Reads this system's own body-diagram column off a character row. */
  bodySexOf(character: any): "male" | "female";
  /** Reads this system's own standalone resource pool off a character row. */
  energyPoolOf(character: any): number;
}

const CA_RULES: WoundSystemRules = {
  slug: "ca",
  label: "C.A.",

  woundsField: "caWounds",
  bodySexField: "caBodySex",
  energyPoolField: "caEnergyPool",

  ATTRIBUTES: CA.CA_ATTRIBUTES,
  SKILLS: CA.CA_SKILLS,
  WOUND_MAX: CA.CA_WOUND_MAX,
  WOUND_SEVERITIES: CA.CA_WOUND_SEVERITIES,
  WOUND_SEVERITY_LABELS: CA.CA_WOUND_SEVERITY_LABELS,
  WOUND_SEVERITY_COST: CA.CA_WOUND_SEVERITY_COST,
  WOUND_SEVERITY_RANK: CA.CA_WOUND_SEVERITY_RANK,
  FIXED_STAT_TARGETS: CA.CA_FIXED_STAT_TARGETS,
  FIXED_STAT_LABELS: CA.CA_FIXED_STAT_LABELS,
  MAX_NEGATIVE_SKILL_POINTS: CA.CA_MAX_NEGATIVE_SKILL_POINTS,

  attrValueToDieSides: CA.caAttrValueToDieSides,
  attrDieType: CA.caAttrDieType,
  attrPointBudget: CA.caAttrPointBudget,
  skillPointBudget: CA.caSkillPointBudget,
  effectiveSkillMod: CA.caEffectiveSkillMod,
  makeEmptySkills: CA.makeEmptyCASkills,
  makeWound: CA.makeCAWound,
  makeWoundEffect: CA.makeCAWoundEffect,
  normalizeWounds: CA.normalizeCAWounds,
  woundStatEffectTotal: CA.caWoundStatEffectTotal,
  woundTotalCost: CA.caWoundTotalCost,
  woundEffectTargetLabel: CA.caWoundEffectTargetLabel,

  woundsOf: (c: any) => c?.caWounds,
  bodySexOf: (c: any) => CA.caBodySexOf(c),
  energyPoolOf: (c: any) => Number(c?.caEnergyPool) || 0,
};

/**
 * Rule pack for a campaign's system slug. C.A. is currently the only wound
 * system, so this always returns its pack; callers use `isWoundSystem()` to
 * decide whether to call at all. The indirection stays because the shared
 * wound UI reads its constants and character column names from here, and
 * because Swampy proved a second wound system can appear and then leave.
 */
export function woundSystemRules(_slug?: string | null): WoundSystemRules {
  return CA_RULES;
}
