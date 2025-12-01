import crypto from 'crypto';

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd30';

export type AdvantageType = 'none' | 'advantage' | 'disadvantage';

export interface DiceRollResult {
  id: string;
  dieType: DieType;
  result: number;
  modifier: number;
  total: number;
  timestamp: number;
  seed: string;
  userId: string;
  username: string;
  characterId?: string;
  purpose?: string;
  advantage?: AdvantageType;
  rolls?: number[]; // Individual dice results when rolling with advantage/disadvantage
}

export interface RollRequest {
  dieType: DieType;
  modifier?: number;
  purpose?: string;
  characterId?: string;
  advantage?: AdvantageType;
}

const DIE_MAX_VALUES: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d30: 30,
};

export function rollDie(dieType: DieType): { result: number; seed: string } {
  const maxValue = DIE_MAX_VALUES[dieType];
  if (!maxValue) {
    throw new Error(`Invalid die type: ${dieType}`);
  }
  
  const result = crypto.randomInt(1, maxValue + 1);
  const seed = crypto.randomBytes(16).toString('hex');
  
  return { result, seed };
}

export function createRollResult(
  request: RollRequest,
  userId: string,
  username: string
): DiceRollResult {
  const modifier = request.modifier || 0;
  const advantage = request.advantage || 'none';
  
  let result: number;
  let seed: string;
  let rolls: number[] | undefined;
  
  if (advantage === 'advantage' || advantage === 'disadvantage') {
    // Roll 2 dice, keep highest (advantage) or lowest (disadvantage)
    const roll1 = rollDie(request.dieType);
    const roll2 = rollDie(request.dieType);
    rolls = [roll1.result, roll2.result];
    
    if (advantage === 'advantage') {
      result = Math.max(roll1.result, roll2.result);
    } else {
      result = Math.min(roll1.result, roll2.result);
    }
    seed = roll1.seed + roll2.seed.slice(0, 8); // Combine seeds
  } else {
    // Normal single die roll
    const roll = rollDie(request.dieType);
    result = roll.result;
    seed = roll.seed;
  }
  
  return {
    id: crypto.randomUUID(),
    dieType: request.dieType,
    result,
    modifier,
    total: result + modifier,
    timestamp: Date.now(),
    seed,
    userId,
    username,
    characterId: request.characterId,
    purpose: request.purpose,
    advantage: advantage !== 'none' ? advantage : undefined,
    rolls,
  };
}

export function createWebSocketDiceRollMessage(rollResult: DiceRollResult) {
  return {
    type: 'dice_roll',
    roll: rollResult,
  };
}
