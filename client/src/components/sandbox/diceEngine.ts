export interface DiceRollResult {
  expression: string;
  total: number;
  breakdown: DiceGroupResult[];
  rawExpression: string;
  error?: string;
}

export interface DiceGroupResult {
  type: 'dice' | 'modifier' | 'operator';
  expression: string;
  rolls?: number[];
  kept?: number[];
  dropped?: number[];
  exploded?: number[];
  value: number;
}

const MAX_DICE = 100;
const MAX_SIDES = 1000;
const MAX_EXPLOSIONS = 100;
const MAX_EXPRESSION_LENGTH = 500;

const DICE_PATTERN = /^(\d*)d(\d+)(kh\d*|kl\d*|dh\d*|dl\d*)?(!)?$/i;

function rollSingleDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function resolvePropertyRef(key: string, context: Record<string, any>): number {
  if (key in context) {
    const val = context[key];
    if (val !== null && typeof val === 'object' && 'current' in val) {
      return typeof val.current === 'number' ? val.current : 0;
    }
    return typeof val === 'number' ? val : (parseFloat(String(val)) || 0);
  }

  if (key.includes('.')) {
    const [obj, prop] = key.split('.', 2);
    if (obj in context) {
      const val = context[obj];
      if (val !== null && typeof val === 'object' && prop in val) {
        const sub = val[prop];
        return typeof sub === 'number' ? sub : (parseFloat(String(sub)) || 0);
      }
    }
  }

  return 0;
}

function substituteProperties(expression: string, context: Record<string, any>): string {
  let result = expression.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    return String(resolvePropertyRef(key.trim(), context));
  });

  result = result.replace(/(?<=[+\-*/(%,]|^)\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?=[+\-*/)%,]|$)/g, (match, key) => {
    if (DICE_PATTERN.test(key)) return match;
    if (/^\d+$/.test(key)) return match;
    return String(resolvePropertyRef(key.trim(), context));
  });

  return result;
}

type DiceTokenType = 'dice' | 'number' | 'operator' | 'lparen' | 'rparen' | 'eof';

interface DiceToken {
  type: DiceTokenType;
  value: string;
  numValue?: number;
}

function tokenizeDiceExpr(expr: string): DiceToken[] {
  const tokens: DiceToken[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t') { i++; continue; }

    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }

    const remaining = expr.slice(i);
    const diceMatch = remaining.match(/^(\d*)d(\d+)(kh\d*|kl\d*|dh\d*|dl\d*)?(!)?/i);
    if (diceMatch) {
      tokens.push({ type: 'dice', value: diceMatch[0] });
      i += diceMatch[0].length;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        num += expr[i]; i++;
      }
      tokens.push({ type: 'number', value: num, numValue: parseFloat(num) });
      continue;
    }

    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function rollDiceGroup(expr: string): DiceGroupResult {
  const match = expr.match(DICE_PATTERN);
  if (!match) {
    throw new Error(`Invalid dice expression: ${expr}`);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const keepDrop = match[3] || '';
  const exploding = !!match[4];

  if (count > MAX_DICE) throw new Error(`Too many dice: ${count} (max ${MAX_DICE})`);
  if (sides > MAX_SIDES) throw new Error(`Too many sides: ${sides} (max ${MAX_SIDES})`);
  if (sides < 1) throw new Error(`Dice must have at least 1 side`);

  const rolls: number[] = [];
  const exploded: number[] = [];
  const dieTotals: number[] = [];

  for (let i = 0; i < count; i++) {
    let roll = rollSingleDie(sides);
    rolls.push(roll);
    let dieTotal = roll;

    if (exploding) {
      let explosions = 0;
      while (roll === sides && explosions < MAX_EXPLOSIONS) {
        roll = rollSingleDie(sides);
        exploded.push(roll);
        dieTotal += roll;
        explosions++;
      }
    }

    dieTotals.push(dieTotal);
  }

  const poolValues = keepDrop ? dieTotals : [...rolls, ...exploded];

  let kept: number[] = poolValues;
  let dropped: number[] = [];

  if (keepDrop) {
    const kdType = keepDrop.slice(0, 2).toLowerCase();
    const kdNum = keepDrop.length > 2 ? parseInt(keepDrop.slice(2), 10) : 1;

    const indexed = poolValues.map((value, index) => ({ value, index }));

    if (kdType === 'kh') {
      indexed.sort((a, b) => b.value - a.value);
      const keptIndices = new Set(indexed.slice(0, kdNum).map(x => x.index));
      kept = poolValues.filter((_, i) => keptIndices.has(i));
      dropped = poolValues.filter((_, i) => !keptIndices.has(i));
    } else if (kdType === 'kl') {
      indexed.sort((a, b) => a.value - b.value);
      const keptIndices = new Set(indexed.slice(0, kdNum).map(x => x.index));
      kept = poolValues.filter((_, i) => keptIndices.has(i));
      dropped = poolValues.filter((_, i) => !keptIndices.has(i));
    } else if (kdType === 'dh') {
      indexed.sort((a, b) => b.value - a.value);
      const droppedIndices = new Set(indexed.slice(0, kdNum).map(x => x.index));
      kept = poolValues.filter((_, i) => !droppedIndices.has(i));
      dropped = poolValues.filter((_, i) => droppedIndices.has(i));
    } else if (kdType === 'dl') {
      indexed.sort((a, b) => a.value - b.value);
      const droppedIndices = new Set(indexed.slice(0, kdNum).map(x => x.index));
      kept = poolValues.filter((_, i) => !droppedIndices.has(i));
      dropped = poolValues.filter((_, i) => droppedIndices.has(i));
    }
  }

  const value = kept.reduce((s, v) => s + v, 0);

  return {
    type: 'dice',
    expression: expr,
    rolls,
    kept,
    dropped,
    exploded: exploded.length > 0 ? exploded : undefined,
    value,
  };
}

class DiceEvaluator {
  private tokens: DiceToken[];
  private pos: number;
  private breakdown: DiceGroupResult[];

  constructor(tokens: DiceToken[]) {
    this.tokens = tokens;
    this.pos = 0;
    this.breakdown = [];
  }

  private peek(): DiceToken { return this.tokens[this.pos]; }
  private advance(): DiceToken { return this.tokens[this.pos++]; }

  evaluate(): { total: number; breakdown: DiceGroupResult[] } {
    const total = this.parseAddSub();
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected token: '${this.peek().value}'`);
    }
    return { total, breakdown: this.breakdown };
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();

    while (this.peek().type === 'operator' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance().value;
      this.breakdown.push({ type: 'operator', expression: op, value: 0 });
      const right = this.parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }

    return left;
  }

  private parseMulDiv(): number {
    let left = this.parseUnary();

    while (this.peek().type === 'operator' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.advance().value;
      this.breakdown.push({ type: 'operator', expression: op, value: 0 });
      const right = this.parseUnary();
      if (op === '*') left = left * right;
      else left = right !== 0 ? left / right : 0;
    }

    return left;
  }

  private parseUnary(): number {
    if (this.peek().type === 'operator' && this.peek().value === '-') {
      this.advance();
      const val = this.parsePrimary();
      return -val;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.peek();

    if (token.type === 'lparen') {
      this.advance();
      const val = this.parseAddSub();
      if (this.peek().type !== 'rparen') {
        throw new Error("Expected ')'");
      }
      this.advance();
      return val;
    }

    if (token.type === 'dice') {
      this.advance();
      const group = rollDiceGroup(token.value);
      this.breakdown.push(group);
      return group.value;
    }

    if (token.type === 'number') {
      this.advance();
      const val = token.numValue!;
      this.breakdown.push({ type: 'modifier', expression: token.value, value: val });
      return val;
    }

    throw new Error(`Unexpected token: '${token.value}'`);
  }
}

export function rollDice(expression: string, context?: Record<string, any>): DiceRollResult {
  const rawExpression = expression;

  if (!expression || typeof expression !== 'string') {
    return { expression: '', total: 0, breakdown: [], rawExpression: '' };
  }

  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return { expression: '', total: 0, breakdown: [], rawExpression: '' };
  }

  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    return {
      expression: trimmed,
      total: 0,
      breakdown: [],
      rawExpression,
      error: `Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters`,
    };
  }

  try {
    let resolved = trimmed;
    if (context) {
      resolved = substituteProperties(trimmed, context);
    }

    const tokens = tokenizeDiceExpr(resolved);
    const evaluator = new DiceEvaluator(tokens);
    const { total, breakdown } = evaluator.evaluate();

    return {
      expression: resolved,
      total: Math.round(total * 1000) / 1000,
      breakdown,
      rawExpression,
    };
  } catch (e: any) {
    return {
      expression: trimmed,
      total: 0,
      breakdown: [],
      rawExpression,
      error: e.message || 'Invalid dice expression',
    };
  }
}

export function parseDiceExpression(expression: string): { valid: boolean; error?: string; groups: string[] } {
  if (!expression || typeof expression !== 'string') {
    return { valid: false, error: 'Empty expression', groups: [] };
  }

  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Empty expression', groups: [] };
  }

  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    return { valid: false, error: `Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters`, groups: [] };
  }

  try {
    const tokens = tokenizeDiceExpr(trimmed);
    const groups: string[] = [];

    for (const token of tokens) {
      if (token.type === 'dice') {
        const match = token.value.match(DICE_PATTERN);
        if (match) {
          const count = match[1] ? parseInt(match[1], 10) : 1;
          const sides = parseInt(match[2], 10);
          if (count > MAX_DICE) return { valid: false, error: `Too many dice: ${count} (max ${MAX_DICE})`, groups: [] };
          if (sides > MAX_SIDES) return { valid: false, error: `Too many sides: ${sides} (max ${MAX_SIDES})`, groups: [] };
          if (sides < 1) return { valid: false, error: 'Dice must have at least 1 side', groups: [] };
        }
        groups.push(token.value);
      }
    }

    let depth = 0;
    for (const token of tokens) {
      if (token.type === 'lparen') depth++;
      if (token.type === 'rparen') depth--;
      if (depth < 0) return { valid: false, error: 'Unmatched parenthesis', groups: [] };
    }
    if (depth !== 0) return { valid: false, error: 'Unmatched parenthesis', groups: [] };

    return { valid: true, groups };
  } catch (e: any) {
    return { valid: false, error: e.message || 'Parse error', groups: [] };
  }
}

export function formatRollResult(result: DiceRollResult): string {
  if (result.breakdown.length === 0) {
    return `${result.expression} = ${result.total}`;
  }

  let parts: string[] = [];
  let hasParenGroup = result.expression.includes('(');

  for (const group of result.breakdown) {
    if (group.type === 'operator') {
      parts.push(group.expression);
      continue;
    }

    if (group.type === 'dice') {
      const allRolls = [...(group.rolls || []), ...(group.exploded || [])];
      const keptArr = group.kept || allRolls;
      const droppedArr = group.dropped || [];

      const keptUsed = new Array(keptArr.length).fill(false);
      const droppedUsed = new Array(droppedArr.length).fill(false);

      const formatted = allRolls.map((v) => {
        const dIdx = droppedArr.findIndex((d, i) => d === v && !droppedUsed[i]);
        if (dIdx !== -1) {
          droppedUsed[dIdx] = true;
          return `~~${v}~~`;
        }
        const kIdx = keptArr.findIndex((k, i) => k === v && !keptUsed[i]);
        if (kIdx !== -1) keptUsed[kIdx] = true;
        return String(v);
      });

      parts.push(`[${formatted.join(', ')}]`);
      continue;
    }

    if (group.type === 'modifier') {
      parts.push(group.expression);
      continue;
    }
  }

  const breakdownStr = parts.join('');

  if (hasParenGroup) {
    return `${result.rawExpression || result.expression} → (${breakdownStr}) = ${result.total}`;
  }

  return `${result.rawExpression || result.expression} → ${breakdownStr} = ${result.total}`;
}

export function isDiceExpression(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return /\d*d\d+/i.test(trimmed);
}
