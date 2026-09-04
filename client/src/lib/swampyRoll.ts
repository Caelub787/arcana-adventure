import { api } from "@/lib/api";
import { triggerRollNotification } from "@/components/game/RollNotification";
import {
  resolveSwampyDuality,
  clampSwampyHope,
  SWAMPY_OUTCOME_LABELS,
  SWAMPY_DUALITY_DIE_SIDES,
  SWAMPY_MAX_HOPE,
  type SwampyDualityResult,
} from "@shared/swampy";

export interface SwampyRollCharacter {
  id: string;
  name?: string;
  userId?: string | null;
  swampyHope?: number | null;
  swampyStrain?: number | null;
  swampyMaxStrain?: number | null;
}

/**
 * Roll the Duality Dice.
 *
 * Rolled client-side because the server's dice endpoint is single-die and this
 * is two dice whose *relationship* decides the outcome, not just their sum —
 * the same reason V3 spell level-dice roll here (see v3cast.ts).
 */
export function rollSwampyDuality(modifier = 0, difficulty: number | null = null): SwampyDualityResult {
  const d = () => Math.floor(Math.random() * SWAMPY_DUALITY_DIE_SIDES) + 1;
  return resolveSwampyDuality(d(), d(), modifier, difficulty);
}

/** "Hope 9, Fear 4" plus the modifier, for the roll feed's breakdown line. */
export function swampyBreakdown(result: SwampyDualityResult, modLabel?: string): string {
  const parts = [`Hope ${result.hopeDie}`, `Fear ${result.fearDie}`];
  if (result.modifier !== 0) {
    parts.push(`${modLabel || "Modifier"}: ${result.modifier > 0 ? "+" : ""}${result.modifier}`);
  }
  if (result.difficulty !== null) parts.push(`vs Difficulty ${result.difficulty}`);
  return `${parts.join(" | ")} = ${result.total}`;
}

/**
 * Roll the Duality Dice and settle what the outcome costs or grants.
 *
 * The consequences are part of the roll, not an afterthought the table has to
 * remember: a Hope-side result hands the player a Hope, a Fear-side result
 * hands the GM a Fear, and a critical does both a Hope and clears a Strain.
 * Hope is capped at 6 and Strain never goes below zero.
 *
 * Returns the resolved roll so callers can show it. The Fear side is applied by
 * the caller that owns the campaign (see `applySwampyFear`), because Fear lives
 * on the campaign rather than on any character.
 */
export async function castSwampyDuality(
  character: SwampyRollCharacter,
  label: string,
  modifier = 0,
  difficulty: number | null = null,
  opts: { modLabel?: string; username?: string } = {},
): Promise<SwampyDualityResult> {
  const result = rollSwampyDuality(modifier, difficulty);

  triggerRollNotification({
    type: result.isCritical ? "attack" : "dice",
    dieType: "d12",
    label: `${label} — ${SWAMPY_OUTCOME_LABELS[result.outcome]}`,
    result: result.hopeDie + result.fearDie,
    modifier: result.modifier,
    total: result.total,
    username: opts.username || character.name || "Unknown",
    characterName: character.name,
    calculationBreakdown: swampyBreakdown(result, opts.modLabel),
  });

  // Settle the character's side of it. Failing to persist must not swallow the
  // roll itself — the dice landed either way, so the result is still returned.
  const patch: Record<string, number> = {};
  if (result.gainsHope) {
    patch.swampyHope = clampSwampyHope((character.swampyHope ?? 0) + 1);
  }
  if (result.clearsStrain) {
    patch.swampyStrain = Math.max(0, (character.swampyStrain ?? 0) - 1);
  }
  if (Object.keys(patch).length > 0) {
    try {
      await api.updateCharacter(character.id, patch as any);
    } catch (err) {
      console.error("[swampy] Failed to apply the roll's Hope/Strain:", err);
    }
  }

  return result;
}

/** Whether this character can still take a Hope. */
export function swampyHopeIsFull(character: SwampyRollCharacter): boolean {
  return (character.swampyHope ?? 0) >= SWAMPY_MAX_HOPE;
}
