// Agnostic formula language — shared by computed fields, dice rolls and
// action buttons. GMs never have to type it (the formula builder inserts
// tokens), but it is readable when they do:
//
//   str * 2 + con                 fields on this sheet (bare keys or @key)
//   @owner.str                    a field on the sheet connected as "owner"
//   sum(@items.weight)            many connected sheets → a list
//   @{<noteId>}.hp                a specific sheet (the builder writes these)
//   1d20 + @dex   4d6kh3   d%     dice (roll buttons only, never in fields)
//   $r                            a value from an earlier action step / component parameter
//   if(hp <= 0, "Down", "Up")     functions: min max floor ceil round abs clamp
//                                 if sum count avg sqrt pow concat choose tier
//   roll(1, might_die) + athletics  dice whose size comes from a value (buttons only)
//   tier(pool, 0, 20, 30)         ladder position: thresholds reached − 1
//   hp > 0 && !stunned ? 1 : 0    comparisons, logic, ternary
//
// Lists (from multi-sheet refs) are summed automatically when used as numbers.

export type FValue = number | string | boolean | null | FValue[];

export type FNode =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; path: string[]; abs?: string }
  | { t: "local"; name: string }
  | { t: "dice"; count: number; sides: number; keep?: { hi: boolean; n: number } }
  | { t: "un"; op: "-" | "!" | "+"; a: FNode }
  | { t: "bin"; op: string; a: FNode; b: FNode }
  | { t: "tern"; c: FNode; a: FNode; b: FNode }
  | { t: "call"; name: string; args: FNode[] };

export class FormulaError extends Error {}

// --------------------------------------------------------------------------- tokens
type Tok =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "id"; v: string }
  | { k: "at" }
  | { k: "abs"; v: string }
  | { k: "local"; v: string }
  | { k: "dice"; count: number; sides: number; keep?: { hi: boolean; n: number } }
  | { k: "op"; v: string }
  | { k: "eof" };

const DICE_RE = /^(\d*)d(\d+|%)(?:(kh|kl|k)(\d+))?(?![a-z0-9_])/i;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    // Dice must be tried before numbers and identifiers ("2d6", "d20").
    const dm = DICE_RE.exec(rest);
    const prev = out[out.length - 1];
    if (dm && !(prev && (prev.k === "at" || (prev.k === "op" && prev.v === ".")))) {
      const sides = dm[2] === "%" ? 100 : Number(dm[2]);
      const count = dm[1] === "" ? 1 : Number(dm[1]);
      if (count < 1 || count > 200 || sides < 1 || sides > 1000) throw new FormulaError(`Dice out of range: ${dm[0]}`);
      const keep = dm[3] ? { hi: dm[3].toLowerCase() !== "kl", n: Number(dm[4]) } : undefined;
      out.push({ k: "dice", count, sides, keep });
      i += dm[0].length;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(rest);
      if (!m) throw new FormulaError(`Unexpected "${c}"`);
      out.push({ k: "num", v: Number(m[1]) });
      i += m[1].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)!;
      out.push({ k: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "@") {
      if (src[i + 1] === "{") {
        const end = src.indexOf("}", i);
        if (end < 0) throw new FormulaError("Unclosed @{");
        out.push({ k: "abs", v: src.slice(i + 2, end) });
        i = end + 1;
      } else {
        out.push({ k: "at" });
        i++;
      }
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
      if (!m) throw new FormulaError("Expected a name after $");
      out.push({ k: "local", v: m[1] });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) { if (src[j] === "\\" && j + 1 < src.length) j++; s += src[j]; j++; }
      if (j >= src.length) throw new FormulaError("Unclosed text");
      out.push({ k: "str", v: s });
      i = j + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { out.push({ k: "op", v: two }); i += 2; continue; }
    if ("+-*/%^()<>!,.?:".includes(c)) { out.push({ k: "op", v: c }); i++; continue; }
    throw new FormulaError(`Unexpected "${c}"`);
  }
  out.push({ k: "eof" });
  return out;
}

// --------------------------------------------------------------------------- parser
const PREC: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "^": 7 };

export function parseFormula(src: string): FNode {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return t.k === "op" && t.v === v; };
  const expect = (v: string) => { if (!isOp(v)) throw new FormulaError(`Expected "${v}"`); p++; };

  function parseTernary(): FNode {
    const c = parseBin(1);
    if (isOp("?")) {
      p++;
      const a = parseTernary();
      expect(":");
      const b = parseTernary();
      return { t: "tern", c, a, b };
    }
    return c;
  }
  function parseBin(minPrec: number): FNode {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t.k !== "op" || !(t.v in PREC) || PREC[t.v] < minPrec) return left;
      const op = t.v;
      p++;
      // ^ is right-associative
      const right = parseBin(op === "^" ? PREC[op] : PREC[op] + 1);
      left = { t: "bin", op, a: left, b: right };
    }
  }
  function parseUnary(): FNode {
    if (isOp("-") || isOp("!") || isOp("+")) {
      const op = (peek() as any).v;
      p++;
      return { t: "un", op, a: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePath(first: string): string[] {
    const path = [first];
    while (isOp(".")) {
      p++;
      const t = peek();
      if (t.k !== "id") throw new FormulaError("Expected a name after .");
      path.push(t.v.toLowerCase());
      p++;
    }
    return path;
  }
  function parsePrimary(): FNode {
    const t = peek();
    if (t.k === "num") { p++; return { t: "num", v: t.v }; }
    if (t.k === "str") { p++; return { t: "str", v: t.v }; }
    if (t.k === "dice") { p++; return { t: "dice", count: t.count, sides: t.sides, keep: t.keep }; }
    if (t.k === "local") { p++; return { t: "local", name: t.v.toLowerCase() }; }
    if (t.k === "abs") {
      p++;
      if (!isOp(".")) throw new FormulaError("Expected .field after a sheet reference");
      p++;
      const f = peek();
      if (f.k !== "id") throw new FormulaError("Expected a field name");
      p++;
      return { t: "ref", abs: t.v, path: parsePath(f.v.toLowerCase()) };
    }
    if (t.k === "at") {
      p++;
      const f = peek();
      if (f.k !== "id") throw new FormulaError("Expected a name after @");
      p++;
      return { t: "ref", path: parsePath(f.v.toLowerCase()) };
    }
    if (t.k === "id") {
      p++;
      const lower = t.v.toLowerCase();
      if (isOp("(")) {
        p++;
        const args: FNode[] = [];
        if (!isOp(")")) {
          for (;;) {
            args.push(parseTernary());
            if (isOp(",")) { p++; continue; }
            break;
          }
        }
        expect(")");
        if (!(lower in FUNCS)) throw new FormulaError(`Unknown function ${t.v}()`);
        return { t: "call", name: lower, args };
      }
      if (lower === "true" || lower === "false") return { t: "bool", v: lower === "true" };
      return { t: "ref", path: parsePath(lower) };
    }
    if (isOp("(")) {
      p++;
      const e = parseTernary();
      expect(")");
      return e;
    }
    throw new FormulaError(t.k === "eof" ? "Formula ends too early" : `Unexpected ${(t as any).v ?? t.k}`);
  }

  const node = parseTernary();
  if (peek().k !== "eof") throw new FormulaError(`Unexpected ${(peek() as any).v ?? "input"}`);
  return node;
}

// --------------------------------------------------------------------------- evaluation
export interface EvalContext {
  /** Resolve a field reference. Multi-sheet paths return lists. Throw FormulaError if unknown. */
  ref(path: string[], abs?: string, opts?: { base?: boolean }): FValue;
  local?(name: string): FValue | undefined;
  /** Supplying this enables dice; omitted → dice are an error (fields must be deterministic). */
  rollDie?(sides: number): number;
}

export interface EvalResult {
  value: FValue;
  /** Human-readable working, e.g. "1d20[14] + 3 = 17". */
  breakdown: string;
}

const num = (v: FValue): number => {
  if (Array.isArray(v)) return v.reduce<number>((s, x) => s + num(x), 0);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};
const truthy = (v: FValue): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.length > 0 : !!num(v) || v === true);
const flat = (args: FValue[]): FValue[] => args.flatMap((a) => (Array.isArray(a) ? flat(a) : [a]));
const fmt = (v: FValue): string => {
  if (Array.isArray(v)) return `[${v.map(fmt).join(", ")}]`;
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (typeof v === "string") return `"${v}"`;
  return String(v);
};

const FUNCS: Record<string, (args: FValue[]) => FValue> = {
  min: (a) => Math.min(...flat(a).map(num)),
  max: (a) => Math.max(...flat(a).map(num)),
  floor: (a) => Math.floor(num(a[0])),
  ceil: (a) => Math.ceil(num(a[0])),
  round: (a) => { const d = Math.max(0, Math.min(6, num(a[1] ?? 0))); const m = 10 ** d; return Math.round(num(a[0]) * m) / m; },
  abs: (a) => Math.abs(num(a[0])),
  sqrt: (a) => Math.sqrt(Math.max(0, num(a[0]))),
  pow: (a) => num(a[0]) ** num(a[1]),
  clamp: (a) => Math.min(num(a[2]), Math.max(num(a[1]), num(a[0]))),
  sum: (a) => flat(a).reduce<number>((s, x) => s + num(x), 0),
  count: (a) => flat(a).filter((x) => x !== null && x !== false && x !== "").length,
  avg: (a) => { const f = flat(a); return f.length ? f.reduce<number>((s, x) => s + num(x), 0) / f.length : 0; },
  concat: (a) => flat(a).map((x) => (x === null ? "" : typeof x === "number" ? fmt(x) : String(x))).join(""),
  // if() is special-cased in evaluate() so only the taken branch runs.
  if: (a) => (truthy(a[0]) ? a[1] : a[2] ?? null),
  /** choose(i, a, b, c…): the i-th (0-based) of the options; past the end → the last one. */
  choose: (a) => { const opts = a.slice(1); if (!opts.length) return null; const i = Math.max(0, Math.min(opts.length - 1, Math.floor(num(a[0])))); return opts[i]; },
  /** tier(x, t0, t1, …): how many thresholds x has reached, minus one (a ladder position). */
  tier: (a) => { const x = num(a[0]); let i = 0; for (let k = 1; k < a.length; k++) if (x >= num(a[k])) i = k - 1; return i; },
  // roll() is special-cased in evaluate(): it needs the dice roller.
  roll: () => { throw new FormulaError("Dice can only be used in roll buttons"); },
  // base() is special-cased in evaluate(): it reads a value before modifiers.
  base: () => { throw new FormulaError("base() takes a value name, e.g. base(athletics)"); },
};

export function evaluate(node: FNode, ctx: EvalContext): EvalResult {
  const ev = (n: FNode): { v: FValue; s: string } => {
    switch (n.t) {
      case "num": return { v: n.v, s: fmt(n.v) };
      case "str": return { v: n.v, s: fmt(n.v) };
      case "bool": return { v: n.v, s: String(n.v) };
      case "local": {
        const v = ctx.local?.(n.name);
        if (v === undefined) throw new FormulaError(`Unknown $${n.name}`);
        return { v, s: fmt(v) };
      }
      case "ref": {
        const v = ctx.ref(n.path, n.abs);
        return { v, s: fmt(v) };
      }
      case "dice": {
        if (!ctx.rollDie) throw new FormulaError("Dice can only be used in roll buttons");
        const rolls = Array.from({ length: n.count }, () => ctx.rollDie!(n.sides));
        let kept = rolls;
        if (n.keep) {
          const sorted = [...rolls].sort((x, y) => (n.keep!.hi ? y - x : x - y));
          kept = sorted.slice(0, Math.max(0, Math.min(rolls.length, n.keep.n)));
        }
        const total = kept.reduce((s, x) => s + x, 0);
        const label = `${n.count}d${n.sides}${n.keep ? (n.keep.hi ? "kh" : "kl") + n.keep.n : ""}`;
        return { v: total, s: `${label}[${rolls.join(",")}]` };
      }
      case "un": {
        const a = ev(n.a);
        if (n.op === "!") return { v: !truthy(a.v), s: `!${a.s}` };
        if (n.op === "-") return { v: -num(a.v), s: `-${a.s}` };
        return { v: num(a.v), s: a.s };
      }
      case "tern": {
        const c = ev(n.c);
        const r = truthy(c.v) ? ev(n.a) : ev(n.b);
        return { v: r.v, s: r.s };
      }
      case "call": {
        if (n.name === "if") {
          const c = ev(n.args[0] ?? { t: "bool", v: false });
          const r = truthy(c.v) ? (n.args[1] ? ev(n.args[1]) : { v: null, s: "null" }) : (n.args[2] ? ev(n.args[2]) : { v: null, s: "null" });
          return r;
        }
        if (n.name === "roll") {
          // roll(count, sides[, keepHighest]): dice whose size comes from the sheet, e.g. roll(1, might_die).
          if (!ctx.rollDie) throw new FormulaError("Dice can only be used in roll buttons");
          const ra = n.args.map(ev);
          const count = Math.max(1, Math.min(200, Math.floor(num(ra[0]?.v ?? 1))));
          const sides = Math.max(1, Math.min(1000, Math.floor(num(ra[1]?.v ?? 6))));
          const rolls = Array.from({ length: count }, () => ctx.rollDie!(sides));
          const keepN = ra[2] ? Math.floor(num(ra[2].v)) : 0;
          const kept = keepN > 0 ? [...rolls].sort((x, y) => y - x).slice(0, keepN) : rolls;
          return { v: kept.reduce((s2, x) => s2 + x, 0), s: `${count}d${sides}${keepN > 0 ? `kh${keepN}` : ""}[${rolls.join(",")}]` };
        }
        if (n.name === "base") {
          // base(x): x as written on the sheet, before any changes from connected sheets.
          const a = n.args[0];
          if (n.args.length !== 1 || a.t !== "ref") throw new FormulaError("base() takes a value name, e.g. base(athletics)");
          const v = ctx.ref(a.path, a.abs, { base: true });
          return { v, s: `base(${fmt(v)})` };
        }
        const args = n.args.map(ev);
        const v = FUNCS[n.name](args.map((a) => a.v));
        return { v, s: `${n.name}(${args.map((a) => a.s).join(", ")})` };
      }
      case "bin": {
        if (n.op === "&&") { const a = ev(n.a); if (!truthy(a.v)) return { v: false, s: `${a.s} && …` }; const b = ev(n.b); return { v: truthy(b.v), s: `${a.s} && ${b.s}` }; }
        if (n.op === "||") { const a = ev(n.a); if (truthy(a.v)) return { v: true, s: `${a.s} || …` }; const b = ev(n.b); return { v: truthy(b.v), s: `${a.s} || ${b.s}` }; }
        const a = ev(n.a), b = ev(n.b);
        const s = `${a.s} ${n.op} ${b.s}`;
        const bothText = typeof a.v === "string" && typeof b.v === "string";
        switch (n.op) {
          case "+":
            if (typeof a.v === "string" || typeof b.v === "string") {
              const an = typeof a.v === "string" ? Number(a.v) : num(a.v), bn = typeof b.v === "string" ? Number(b.v) : num(b.v);
              if (Number.isFinite(an) && Number.isFinite(bn) && !bothText) return { v: an + bn, s };
              return { v: `${a.v ?? ""}${b.v ?? ""}`, s };
            }
            return { v: num(a.v) + num(b.v), s };
          case "-": return { v: num(a.v) - num(b.v), s };
          case "*": return { v: num(a.v) * num(b.v), s };
          case "/": { const d = num(b.v); return { v: d === 0 ? 0 : num(a.v) / d, s }; }
          case "%": { const d = num(b.v); return { v: d === 0 ? 0 : num(a.v) % d, s }; }
          case "^": return { v: num(a.v) ** num(b.v), s };
          case "==": return { v: bothText ? a.v === b.v : num(a.v) === num(b.v), s };
          case "!=": return { v: bothText ? a.v !== b.v : num(a.v) !== num(b.v), s };
          case "<": return { v: num(a.v) < num(b.v), s };
          case "<=": return { v: num(a.v) <= num(b.v), s };
          case ">": return { v: num(a.v) > num(b.v), s };
          case ">=": return { v: num(a.v) >= num(b.v), s };
        }
        throw new FormulaError(`Unknown operator ${n.op}`);
      }
    }
  };
  const r = ev(node);
  return { value: r.v, breakdown: r.s };
}

/** Collapse a result to what a field can store. Lists sum; NaN → 0. */
export function toFieldValue(v: FValue, resultType: "number" | "text" = "number"): number | string | boolean | null {
  if (resultType === "text") return v === null ? "" : Array.isArray(v) ? flat(v).map((x) => String(x ?? "")).join(", ") : String(v);
  if (typeof v === "string" || typeof v === "boolean" || v === null) return typeof v === "string" ? v : v;
  return num(v);
}

export const asNumber = num;
export const isTruthy = truthy;

/** Every reference a formula makes (for the builder's "uses" list and dependency hints). */
export function collectRefs(node: FNode, out: { path: string[]; abs?: string }[] = []): { path: string[]; abs?: string }[] {
  switch (node.t) {
    case "ref": out.push({ path: node.path, abs: node.abs }); break;
    case "un": collectRefs(node.a, out); break;
    case "bin": collectRefs(node.a, out); collectRefs(node.b, out); break;
    case "tern": collectRefs(node.c, out); collectRefs(node.a, out); collectRefs(node.b, out); break;
    case "call": node.args.forEach((a) => collectRefs(a, out)); break;
  }
  return out;
}

export function containsDice(node: FNode): boolean {
  switch (node.t) {
    case "dice": return true;
    case "un": return containsDice(node.a);
    case "bin": return containsDice(node.a) || containsDice(node.b);
    case "tern": return containsDice(node.c) || containsDice(node.a) || containsDice(node.b);
    case "call": return node.name === "roll" || node.args.some(containsDice);
    default: return false;
  }
}

/** Parse once, cache — formulas are re-evaluated far more often than edited. */
const cache = new Map<string, FNode | FormulaError>();
export function parseCached(src: string): FNode {
  let hit = cache.get(src);
  if (!hit) {
    try { hit = parseFormula(src); } catch (e) { hit = e instanceof FormulaError ? e : new FormulaError(String(e)); }
    if (cache.size > 5000) cache.clear();
    cache.set(src, hit);
  }
  if (hit instanceof FormulaError) throw hit;
  return hit;
}

/** Substitute {expr} placeholders in action messages. */
export function interpolate(text: string, evalExpr: (expr: string) => FValue): string {
  return text.replace(/\{([^{}]+)\}/g, (_, expr) => {
    try { const v = evalExpr(expr); return typeof v === "number" ? fmt(v) : Array.isArray(v) ? fmt(v) : String(v ?? ""); }
    catch { return `{${expr}}`; }
  });
}

export function formatValue(v: unknown, decimals?: number): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    const d = decimals ?? (Number.isInteger(v) ? 0 : 2);
    return String(Number(v.toFixed(d)));
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
