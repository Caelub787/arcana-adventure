export interface ExpressionContext {
  values: Record<string, any>;
  properties?: Record<string, { type: string; defaultValue?: any }>;
}

export interface ExpressionResult {
  value: any;
  error?: string;
}

type TokenType =
  | 'number' | 'string' | 'identifier' | 'operator' | 'paren' | 'comma'
  | 'question' | 'colon' | 'dot' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  numValue?: number;
}

const MAX_EXPRESSION_LENGTH = 1000;
const MAX_DEPTH = 50;

const BUILT_IN_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  clamp: (val, lo, hi) => Math.min(Math.max(val, lo), hi),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  abs: (x) => Math.abs(x),
};

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i++;
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < expr.length) {
          i++;
          str += expr[i];
        } else {
          str += expr[i];
        }
        i++;
      }
      if (i < expr.length) i++;
      tokens.push({ type: 'string', value: str });
      continue;
    }

    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < expr.length && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      let num = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'number', value: num, numValue: parseFloat(num) });
      continue;
    }

    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let ident = '';
      while (i < expr.length && ((expr[i] >= 'a' && expr[i] <= 'z') || (expr[i] >= 'A' && expr[i] <= 'Z') || (expr[i] >= '0' && expr[i] <= '9') || expr[i] === '_')) {
        ident += expr[i];
        i++;
      }
      if (ident === 'true') {
        tokens.push({ type: 'number', value: 'true', numValue: 1 });
      } else if (ident === 'false') {
        tokens.push({ type: 'number', value: 'false', numValue: 0 });
      } else {
        tokens.push({ type: 'identifier', value: ident });
      }
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' });
      i++;
      continue;
    }

    if (ch === '?') {
      tokens.push({ type: 'question', value: '?' });
      i++;
      continue;
    }

    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':' });
      i++;
      continue;
    }

    if (ch === '.') {
      tokens.push({ type: 'dot', value: '.' });
      i++;
      continue;
    }

    const twoChar = expr.slice(i, i + 2);
    if (twoChar === '&&' || twoChar === '||' || twoChar === '==' || twoChar === '!=' || twoChar === '>=' || twoChar === '<=') {
      tokens.push({ type: 'operator', value: twoChar });
      i += 2;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '>' || ch === '<' || ch === '!') {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number;
  private depth: number;
  private context: ExpressionContext;

  constructor(tokens: Token[], context: ExpressionContext) {
    this.tokens = tokens;
    this.pos = 0;
    this.depth = 0;
    this.context = context;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private expect(type: TokenType, value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${value || type}, got '${t.value}'`);
    }
    return this.advance();
  }

  parse(): any {
    const result = this.parseTernary();
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected token: '${this.peek().value}'`);
    }
    return result;
  }

  private guardDepth(): void {
    this.depth++;
    if (this.depth > MAX_DEPTH) {
      throw new Error('Maximum expression depth exceeded');
    }
  }

  private parseTernary(): any {
    this.guardDepth();
    try {
      const condition = this.parseOr();
      if (this.peek().type === 'question') {
        this.advance();
        const trueVal = this.parseTernary();
        this.expect('colon');
        const falseVal = this.parseTernary();
        return isTruthy(condition) ? trueVal : falseVal;
      }
      return condition;
    } finally {
      this.depth--;
    }
  }

  private parseOr(): any {
    let left = this.parseAnd();
    while (this.peek().type === 'operator' && this.peek().value === '||') {
      this.advance();
      const right = this.parseAnd();
      left = isTruthy(left) || isTruthy(right);
    }
    return left;
  }

  private parseAnd(): any {
    let left = this.parseEquality();
    while (this.peek().type === 'operator' && this.peek().value === '&&') {
      this.advance();
      const right = this.parseEquality();
      left = isTruthy(left) && isTruthy(right);
    }
    return left;
  }

  private parseEquality(): any {
    let left = this.parseComparison();
    while (this.peek().type === 'operator' && (this.peek().value === '==' || this.peek().value === '!=')) {
      const op = this.advance().value;
      const right = this.parseComparison();
      if (op === '==') left = left == right;
      else left = left != right;
    }
    return left;
  }

  private parseComparison(): any {
    let left = this.parseAddition();
    while (this.peek().type === 'operator' && (this.peek().value === '>' || this.peek().value === '<' || this.peek().value === '>=' || this.peek().value === '<=')) {
      const op = this.advance().value;
      const right = this.parseAddition();
      const l = toNumber(left);
      const r = toNumber(right);
      if (op === '>') left = l > r;
      else if (op === '<') left = l < r;
      else if (op === '>=') left = l >= r;
      else left = l <= r;
    }
    return left;
  }

  private parseAddition(): any {
    let left = this.parseMultiplication();
    while (this.peek().type === 'operator' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      if (op === '+') {
        if (typeof left === 'string' || typeof right === 'string') {
          left = String(left) + String(right);
        } else {
          left = toNumber(left) + toNumber(right);
        }
      } else {
        left = toNumber(left) - toNumber(right);
      }
    }
    return left;
  }

  private parseMultiplication(): any {
    let left = this.parseUnary();
    while (this.peek().type === 'operator' && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
      const op = this.advance().value;
      const right = this.parseUnary();
      const l = toNumber(left);
      const r = toNumber(right);
      if (op === '*') left = l * r;
      else if (op === '/') left = r !== 0 ? l / r : 0;
      else left = r !== 0 ? l % r : 0;
    }
    return left;
  }

  private parseUnary(): any {
    if (this.peek().type === 'operator' && this.peek().value === '!') {
      this.advance();
      const val = this.parseUnary();
      return !isTruthy(val);
    }
    if (this.peek().type === 'operator' && this.peek().value === '-') {
      this.advance();
      const val = this.parseUnary();
      return -toNumber(val);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): any {
    const token = this.peek();

    if (token.type === 'number') {
      this.advance();
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      return token.numValue!;
    }

    if (token.type === 'string') {
      this.advance();
      return token.value;
    }

    if (token.type === 'paren' && token.value === '(') {
      this.advance();
      const val = this.parseTernary();
      this.expect('paren', ')');
      return val;
    }

    if (token.type === 'identifier') {
      const name = this.advance().value;

      if (this.peek().type === 'paren' && this.peek().value === '(') {
        return this.parseFunctionCall(name);
      }

      if (this.peek().type === 'dot') {
        this.advance();
        const prop = this.expect('identifier').value;
        return this.resolvePropertyAccess(name, prop);
      }

      return this.resolveIdentifier(name);
    }

    throw new Error(`Unexpected token: '${token.value}'`);
  }

  private parseFunctionCall(name: string): any {
    this.expect('paren', '(');
    const args: any[] = [];
    if (!(this.peek().type === 'paren' && this.peek().value === ')')) {
      args.push(this.parseTernary());
      while (this.peek().type === 'comma') {
        this.advance();
        args.push(this.parseTernary());
      }
    }
    this.expect('paren', ')');

    const fn = BUILT_IN_FUNCTIONS[name];
    if (!fn) {
      throw new Error(`Unknown function: '${name}'`);
    }
    return fn(...args.map(toNumber));
  }

  private resolvePropertyAccess(name: string, prop: string): any {
    const val = this.context.values[name];

    if (val !== undefined && typeof val === 'object' && val !== null && 'current' in val && 'max' in val) {
      if (prop === 'current') return val.current;
      if (prop === 'max') return val.max;
    }

    const compositeKey = `${name}.${prop}`;
    if (compositeKey in this.context.values) {
      return this.context.values[compositeKey];
    }

    return 0;
  }

  private resolveIdentifier(name: string): any {
    if (name in this.context.values) {
      const val = this.context.values[name];
      if (val !== null && typeof val === 'object' && 'current' in val && 'max' in val) {
        return val.current;
      }
      return val;
    }

    if (this.context.properties && name in this.context.properties) {
      const propDef = this.context.properties[name];
      if (propDef.defaultValue !== undefined) return propDef.defaultValue;
      switch (propDef.type) {
        case 'number': case 'resource': return 0;
        case 'boolean': return false;
        default: return '';
      }
    }

    return 0;
  }
}

function isTruthy(val: any): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val !== '';
  return true;
}

function toNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }
  if (val !== null && typeof val === 'object' && 'current' in val) {
    return val.current;
  }
  return 0;
}

export function evaluateExpression(expression: string, context: ExpressionContext): ExpressionResult {
  if (!expression || typeof expression !== 'string') {
    return { value: expression ?? 0 };
  }

  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return { value: 0 };
  }

  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    return { value: 0, error: `Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters` };
  }

  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens, context);
    const value = parser.parse();
    return { value };
  } catch (e: any) {
    return { value: 0, error: e.message || 'Parse error' };
  }
}

export function isExpression(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return false;
  if (/^(['"]).*\1$/.test(trimmed)) return false;

  const expressionPatterns = [
    /[+\-*/%]/, /[><=!]{1,2}/, /&&/, /\|\|/, /\?/, /\(/, /\)/,
  ];

  const functionPattern = /\b(min|max|clamp|floor|ceil|round|abs)\s*\(/;
  if (functionPattern.test(trimmed)) return true;

  for (const pattern of expressionPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

export function getExpressionDependencies(expression: string): string[] {
  if (!expression || typeof expression !== 'string') return [];

  const deps = new Set<string>();
  const functionNames = new Set(['min', 'max', 'clamp', 'floor', 'ceil', 'round', 'abs', 'true', 'false']);

  try {
    const tokens = tokenize(expression.trim());
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'identifier' && !functionNames.has(token.value)) {
        const next = tokens[i + 1];
        if (next && next.type === 'paren' && next.value === '(') {
          continue;
        }
        if (next && next.type === 'dot' && i + 2 < tokens.length && tokens[i + 2].type === 'identifier') {
          deps.add(token.value);
          i += 2;
        } else {
          deps.add(token.value);
        }
      }
    }
  } catch {
    const identRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let match;
    while ((match = identRegex.exec(expression)) !== null) {
      if (!functionNames.has(match[1])) {
        deps.add(match[1]);
      }
    }
  }

  return Array.from(deps);
}
