import { gameWs, api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { triggerRollNotification } from "@/components/game/RollNotification";
import { v3LevelDice } from "@shared/v3spells";
import { v3WeaponBaseAttackEnergy } from "@shared/v3weapons";
import {
  V3_SKILLS,
  V3_ATTRIBUTE_KEYS,
  attrValueToDieSides,
  type V3AttributeKey,
} from "@shared/v3";

// The character context a V3 weapon surface needs in order to roll and pay for
// a base attack or a technique. Attribute values drive a skill check's die
// tier; v3Skills supplies the flat skill modifier.
export interface V3WeaponCastCharacter {
  id: string;
  name?: string;
  energy?: number | null;
  v3Skills?: Record<string, number> | null;
  // The six V3 attribute columns (might/finesse/.../intelligence).
  might?: number | null;
  finesse?: number | null;
  constitution?: number | null;
  will?: number | null;
  anemos?: number | null;
  intelligence?: number | null;
}

// A subset of api.V3Technique sufficient to roll one. Kept loose so callers can
// pass rows straight through.
export interface V3CastTechnique {
  name: string;
  energyCost?: number | null;
  rollMode?: "base_damage" | "skill_check" | null;
  skillKey?: string | null;
}

function rollLevelDice(level: number): { total: number; rolls: number[]; notation: string } {
  const { count, sides } = v3LevelDice(level);
  const rolls: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  return { total, rolls, notation: `${count}d${sides}` };
}

function attrValue(character: V3WeaponCastCharacter, key: V3AttributeKey): number {
  const v = (character as any)[key];
  return Math.floor(Number(v) || 0);
}

/**
 * Deduct energy reliably regardless of live-session state. When the player is
 * joined to a live battle session, the deduction flows through the combat
 * channel (so other clients see it and the server persists it). When NOT joined
 * — e.g. rolling a weapon attack straight from inventory outside an active
 * session — the WS message would be queued/dropped, so we persist the new
 * energy total directly via the character API as a fallback (mirroring the
 * no-roll branch of executeRoll).
 */
function deductEnergy(characterId: string, have: number, cost: number, charName: string): void {
  if (cost <= 0) return;
  if (gameWs.isJoinedToCampaign()) {
    gameWs.sendCombatEnergy(characterId, cost, charName, false);
    return;
  }
  api
    .updateCharacter(characterId, { energy: have - cost })
    .then(() => queryClient.invalidateQueries({ queryKey: ["character", characterId] }))
    .catch((err) => console.error("Failed to deduct weapon energy:", err));
}

function notEnoughEnergy(charName: string, label: string, need: number, have: number): void {
  triggerRollNotification({
    type: "system",
    label: "Not Enough Energy!",
    result: 0,
    total: 0,
    username: charName,
    characterName: charName,
    calculationBreakdown: `${label} requires ${need} energy but you only have ${have}.`,
  });
}

/**
 * Roll a V3 weapon's leveled base attack: roll the spell-style level dice and
 * spend energy (energy scales with level). Returns true if it fired, false if
 * blocked by insufficient energy. AA V3 only.
 */
export function castV3WeaponBaseAttack(
  character: V3WeaponCastCharacter,
  weaponName: string,
  level: number,
): boolean {
  const lv = Math.max(1, Math.floor(level || 1));
  const energyCost = v3WeaponBaseAttackEnergy(lv);
  const have = character.energy ?? 0;
  const charName = character.name || "Unknown";
  const label = `${weaponName || "Weapon"} · Lv ${lv}`;

  if (energyCost > 0 && have < energyCost) {
    notEnoughEnergy(charName, label, energyCost, have);
    return false;
  }

  const { total, rolls, notation } = rollLevelDice(lv);
  const rollsText = rolls.length > 1 ? ` (${rolls.join(", ")})` : "";
  triggerRollNotification({
    type: "custom",
    label,
    result: total,
    total,
    username: charName,
    characterName: charName,
    calculationBreakdown: `${notation}${rollsText} = ${total}`,
  });

  deductEnergy(character.id, have, energyCost, charName);
  return true;
}

/**
 * Roll a weapon technique. A "base_damage" technique rolls the weapon's
 * base-attack level dice at the given weapon level; a "skill_check" technique
 * rolls 1d{attrDie} + skillMod for its chosen V3 skill. Either way it spends
 * the technique's flat energy cost. Returns true if it fired, false if blocked.
 * AA V3 only.
 */
export function castV3Technique(
  character: V3WeaponCastCharacter,
  technique: V3CastTechnique,
  weaponLevel: number,
): boolean {
  const energyCost = Math.max(0, Math.floor(Number(technique.energyCost) || 0));
  const have = character.energy ?? 0;
  const charName = character.name || "Unknown";
  const techName = technique.name || "Technique";

  if (energyCost > 0 && have < energyCost) {
    notEnoughEnergy(charName, techName, energyCost, have);
    return false;
  }

  let total: number;
  let breakdown: string;

  if (technique.rollMode === "skill_check") {
    const skill = V3_SKILLS.find((s) => s.key === technique.skillKey);
    const parent = (skill?.parent ?? "might") as V3AttributeKey;
    const attr = V3_ATTRIBUTE_KEYS.includes(parent) ? parent : "might";
    const sides = attrValueToDieSides(attrValue(character, attr));
    const skillMod = Math.floor(Number(character.v3Skills?.[technique.skillKey ?? ""]) || 0);
    const die = Math.floor(Math.random() * sides) + 1;
    total = die + skillMod;
    const modText = skillMod !== 0 ? ` ${skillMod >= 0 ? "+" : "-"} ${Math.abs(skillMod)}` : "";
    breakdown = `1d${sides} (${die})${modText} = ${total}`;
  } else {
    const lv = Math.max(1, Math.floor(weaponLevel || 1));
    const { total: t, rolls, notation } = rollLevelDice(lv);
    total = t;
    const rollsText = rolls.length > 1 ? ` (${rolls.join(", ")})` : "";
    breakdown = `${notation}${rollsText} = ${total}`;
  }

  triggerRollNotification({
    type: "custom",
    label: techName,
    result: total,
    total,
    username: charName,
    characterName: charName,
    calculationBreakdown: breakdown,
  });

  deductEnergy(character.id, have, energyCost, charName);
  return true;
}
