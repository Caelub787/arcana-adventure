import { gameWs, type V3Spell } from "@/lib/api";
import { triggerRollNotification } from "@/components/game/RollNotification";
import { v3LevelDice, v3LevelExtraMana, v3ReachIndex, V3_REACH_MAP } from "@shared/v3spells";

export interface V3CastCharacter {
  id: string;
  name?: string;
  mana?: number | null;
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

/**
 * Extra mana for casting at a reach other than the spell's crafted reach. The
 * spell's base mana already includes its crafted reach slot, so the delta is
 * simply (chosen reach slot - crafted reach slot). Can be negative when casting
 * at a shorter range. Returns 0 when no override is given or reaches are unknown.
 */
export function v3ReachExtraMana(spell: V3Spell, chosenReach?: string | null): number {
  const craftedReach = spell.composition?.reach;
  if (!chosenReach || !craftedReach || chosenReach === craftedReach) return 0;
  if (!V3_REACH_MAP[chosenReach] || !V3_REACH_MAP[craftedReach]) return 0;
  return v3ReachIndex(chosenReach) - v3ReachIndex(craftedReach);
}

/**
 * Cast a crafted V3 spell at a chosen level: roll its level dice, post the
 * result to the roll feed, and deduct (base + level + range) mana via the
 * existing combat-mana path. Returns true if cast, false if blocked (not
 * enough mana). An optional `chosenReach` recomputes the range portion of the
 * mana cost so a player may cast the spell at a different range.
 *
 * AA V3 only — callers gate this behind the V3 spell surfaces.
 */
export function castV3Spell(
  character: V3CastCharacter,
  spell: V3Spell,
  level: number,
  chosenReach?: string | null,
): boolean {
  const lv = Math.max(1, Math.floor(level || 1));
  const baseMana = spell.manaCost ?? 0;
  const reachExtra = v3ReachExtraMana(spell, chosenReach);
  const totalMana = Math.max(0, baseMana + v3LevelExtraMana(lv) + reachExtra);
  const currentMana = character.mana ?? 0;
  const charName = character.name || "Unknown";
  const spellName = spell.name || "Spell";

  if (totalMana > 0 && currentMana < totalMana) {
    triggerRollNotification({
      type: "system",
      label: "Not Enough Mana!",
      result: 0,
      total: 0,
      username: charName,
      characterName: charName,
      calculationBreakdown: `${spellName} at level ${lv} requires ${totalMana} mana but you only have ${currentMana}.`,
    });
    return false;
  }

  const { total, rolls, notation } = rollLevelDice(lv);
  const rollsText = rolls.length > 1 ? ` (${rolls.join(", ")})` : "";
  const overrodeReach = reachExtra !== 0 && chosenReach && spell.composition?.reach && chosenReach !== spell.composition.reach;
  const reachText = overrodeReach ? ` · ${V3_REACH_MAP[chosenReach!]?.name ?? chosenReach}` : "";

  triggerRollNotification({
    type: "custom",
    label: `${spellName} · Lv ${lv}${reachText}`,
    result: total,
    total,
    username: charName,
    characterName: charName,
    calculationBreakdown: `${notation}${rollsText} = ${total}`,
  });

  if (totalMana > 0) {
    gameWs.sendCombatMana(character.id, totalMana, charName, false);
  }
  return true;
}
