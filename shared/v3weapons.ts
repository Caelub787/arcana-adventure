// AA V3 Weapon combat — single source of truth shared by client and server.
// V3-only: a weapon has a leveled "base attack" that uses the spell-style level
// dice (bigger dice + more energy at higher level), plus "Techniques" granted
// through one or more Technique Groups assigned to the weapon item.
//
// Damage dice reuse the spell level-dice ladder (see v3LevelDice in v3spells.ts).
// Energy for the base attack scales with level. Techniques have their own flat
// energy cost and one of two roll modes.

import { v3LevelDice, v3LevelDiceNotation } from "./v3spells";

// Re-export so weapon surfaces can import the dice math from one place.
export { v3LevelDice, v3LevelDiceNotation };

/**
 * Energy a weapon's base attack costs at a given level (>= 1). Scales linearly:
 * level 1 = 1 energy, level 2 = 2, ... There is no upper bound on level.
 */
export function v3WeaponBaseAttackEnergy(level: number): number {
  return Math.max(1, Math.floor(level || 1));
}

// ---------------------------------------------------------------------------
// Techniques
// ---------------------------------------------------------------------------
// A technique rolls one of two ways:
//   - "base_damage": rolls the weapon's base-attack level dice at the chosen
//     level (same ladder as the base attack).
//   - "skill_check": rolls 1d{parentAttrDie} + skillMod for an admin-chosen V3
//     skill (independent of the weapon's level).
export type V3TechniqueRollMode = "base_damage" | "skill_check";

export const V3_TECHNIQUE_ROLL_MODES: { value: V3TechniqueRollMode; label: string }[] = [
  { value: "base_damage", label: "Base damage level roll" },
  { value: "skill_check", label: "Skill check" },
];
