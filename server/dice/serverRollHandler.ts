import crypto from 'crypto';

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

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
}

export interface RollRequest {
  dieType: DieType;
  modifier?: number;
  purpose?: string;
  characterId?: string;
}

const DIE_MAX_VALUES: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
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
  const { result, seed } = rollDie(request.dieType);
  const modifier = request.modifier || 0;
  
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
  };
}

export function createWebSocketDiceRollMessage(rollResult: DiceRollResult) {
  return {
    type: 'dice_roll',
    roll: rollResult,
  };
}
