// Runtime resolver for the wound-based systems (C.A. and Swampy).
//
// C.A. and Swampy are deliberately separate rulesets living in shared/ca.ts and
// shared/swampy.ts — neither file imports the other, so either can be edited
// without touching the other. They currently share a UI (Swampy started as a
// copy of C.A.), and this module is the seam that lets that one UI serve both:
// hand it a campaign's system slug and it hands back that system's constants,
// helpers, and character column names.
//
// When the two rulesets diverge, nothing here changes — the pack just starts
// returning different values. If a system needs UI that the other doesn't have,
// branch on `rules.slug` at that spot rather than widening this interface.

import * as CA from "./ca";
import * as SW from "./swampy";

export type WoundSystemSlug = "ca" | "swampy";

/** True for the systems that replace HP with the pinned-wound model. */
export function isWoundSystem(slug?: string | null): boolean {
  return slug === "ca" || slug === "swampy";
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

const SWAMPY_RULES: WoundSystemRules = {
  slug: "swampy",
  label: "Swampy",

  woundsField: "swampyWounds",
  bodySexField: "swampyBodySex",
  energyPoolField: "swampyEnergyPool",

  ATTRIBUTES: SW.SWAMPY_ATTRIBUTES,
  SKILLS: SW.SWAMPY_SKILLS,
  WOUND_MAX: SW.SWAMPY_WOUND_MAX,
  WOUND_SEVERITIES: SW.SWAMPY_WOUND_SEVERITIES,
  WOUND_SEVERITY_LABELS: SW.SWAMPY_WOUND_SEVERITY_LABELS,
  WOUND_SEVERITY_COST: SW.SWAMPY_WOUND_SEVERITY_COST,
  WOUND_SEVERITY_RANK: SW.SWAMPY_WOUND_SEVERITY_RANK,
  FIXED_STAT_TARGETS: SW.SWAMPY_FIXED_STAT_TARGETS,
  FIXED_STAT_LABELS: SW.SWAMPY_FIXED_STAT_LABELS,
  MAX_NEGATIVE_SKILL_POINTS: SW.SWAMPY_MAX_NEGATIVE_SKILL_POINTS,

  attrValueToDieSides: SW.swampyAttrValueToDieSides,
  attrDieType: SW.swampyAttrDieType,
  attrPointBudget: SW.swampyAttrPointBudget,
  skillPointBudget: SW.swampySkillPointBudget,
  effectiveSkillMod: SW.swampyEffectiveSkillMod,
  makeEmptySkills: SW.makeEmptySwampySkills,
  makeWound: SW.makeSwampyWound,
  makeWoundEffect: SW.makeSwampyWoundEffect,
  normalizeWounds: SW.normalizeSwampyWounds,
  woundStatEffectTotal: SW.swampyWoundStatEffectTotal,
  woundTotalCost: SW.swampyWoundTotalCost,
  woundEffectTargetLabel: SW.swampyWoundEffectTargetLabel,

  woundsOf: (c: any) => c?.swampyWounds,
  bodySexOf: (c: any) => SW.swampyBodySexOf(c),
  energyPoolOf: (c: any) => Number(c?.swampyEnergyPool) || 0,
};

/**
 * Rule pack for a campaign's system slug. Falls back to C.A. for any
 * non-wound system so callers that only run inside a wound campaign don't
 * have to null-check; use `isWoundSystem()` to decide whether to call at all.
 */
export function woundSystemRules(slug?: string | null): WoundSystemRules {
  return slug === "swampy" ? SWAMPY_RULES : CA_RULES;
}
