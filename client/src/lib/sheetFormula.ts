// Small formula engine for the "Sheet" note type: cell references (A1),
// ranges (A1:A5), and a handful of aggregate functions layered on top of
// plain arithmetic. Not a general spreadsheet language - just enough for
// "basic formulas" over a grid of text/number cells.

export interface SheetData {
  rowCount: number;
  colCount: number;
  // Keyed by cell address ("A1"). Missing key = empty cell. Value is the
  // raw text the user typed - a formula starts with "=".
  cells: Record<string, string>;
}

export function makeEmptySheet(rowCount = 8, colCount = 5): SheetData {
  return { rowCount, colCount, cells: {} };
}

export function colIndexToLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function labelToColIndex(label: string): number {
  let n = 0;
  for (let i = 0; i < label.length; i++) {
    n = n * 26 + (label.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function cellAddress(row: number, col: number): string {
  return `${colIndexToLabel(col)}${row + 1}`;
}

const CELL_REF_RE = /^([A-Za-z]+)([0-9]+)$/;

export function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = CELL_REF_RE.exec(ref.trim());
  if (!m) return null;
  const row = parseInt(m[2], 10) - 1;
  if (row < 0) return null;
  return { row, col: labelToColIndex(m[1].toUpperCase()) };
}

export function cellsInRange(startRef: string, endRef: string): string[] {
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);
  if (!start || !end) return [];
  const rowLo = Math.min(start.row, end.row);
  const rowHi = Math.max(start.row, end.row);
  const colLo = Math.min(start.col, end.col);
  const colHi = Math.max(start.col, end.col);
  const refs: string[] = [];
  for (let r = rowLo; r <= rowHi; r++) {
    for (let c = colLo; c <= colHi; c++) {
      refs.push(cellAddress(r, c));
    }
  }
  return refs;
}

class FormulaError extends Error {}

// Recursive-descent parser/evaluator over a formula string (without the
// leading "="). `resolve` looks up another cell's numeric value, and is
// responsible for cycle detection across the whole sheet.
class FormulaParser {
  private pos = 0;
  constructor(private src: string, private resolve: (ref: string) => number) {}

  private skipSpace() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  private peek(): string {
    this.skipSpace();
    return this.src[this.pos] ?? "";
  }

  private matchRegex(re: RegExp): string | null {
    this.skipSpace();
    const rest = this.src.slice(this.pos);
    const m = re.exec(rest);
    if (!m || m.index !== 0) return null;
    this.pos += m[0].length;
    return m[0];
  }

  parse(): number {
    const value = this.parseExpr();
    this.skipSpace();
    if (this.pos < this.src.length) {
      throw new FormulaError(`Unexpected input at ${this.pos}`);
    }
    return value;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const op = this.peek();
      if (op === "+" || op === "-") {
        this.pos++;
        const rhs = this.parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      const op = this.peek();
      if (op === "*" || op === "/") {
        this.pos++;
        const rhs = this.parseFactor();
        value = op === "*" ? value * rhs : value / rhs;
      } else {
        break;
      }
    }
    return value;
  }

  private parseFactor(): number {
    const ch = this.peek();
    if (ch === "-") {
      this.pos++;
      return -this.parseFactor();
    }
    if (ch === "(") {
      this.pos++;
      const value = this.parseExpr();
      this.skipSpace();
      if (this.peek() !== ")") throw new FormulaError("Missing closing parenthesis");
      this.pos++;
      return value;
    }

    const funcName = this.matchRegex(/^[A-Za-z]+(?=\s*\()/);
    if (funcName) {
      this.skipSpace();
      this.pos++; // consume '('
      const args = this.parseArgs();
      this.skipSpace();
      if (this.peek() !== ")") throw new FormulaError("Missing closing parenthesis");
      this.pos++;
      return this.applyFunction(funcName.toUpperCase(), args);
    }

    const range = this.matchRegex(/^[A-Za-z]+[0-9]+\s*:\s*[A-Za-z]+[0-9]+/);
    if (range) {
      const [startRef, endRef] = range.split(":").map((s) => s.trim());
      const values = cellsInRange(startRef, endRef).map((ref) => this.resolve(ref));
      // A bare range outside a function sums itself - matches how most
      // spreadsheets treat "=A1:A3" typed on its own.
      return values.reduce((a, b) => a + b, 0);
    }

    const cellRef = this.matchRegex(/^[A-Za-z]+[0-9]+/);
    if (cellRef) {
      return this.resolve(cellRef);
    }

    const num = this.matchRegex(/^[0-9]+(\.[0-9]+)?/);
    if (num) {
      return parseFloat(num);
    }

    throw new FormulaError(`Unexpected token at ${this.pos}`);
  }

  private parseArgs(): (number | number[])[] {
    const args: (number | number[])[] = [];
    this.skipSpace();
    if (this.peek() === ")") return args;
    for (;;) {
      const range = this.matchRegex(/^[A-Za-z]+[0-9]+\s*:\s*[A-Za-z]+[0-9]+/);
      if (range) {
        const [startRef, endRef] = range.split(":").map((s) => s.trim());
        args.push(cellsInRange(startRef, endRef).map((ref) => this.resolve(ref)));
      } else {
        args.push(this.parseExpr());
      }
      this.skipSpace();
      if (this.peek() === ",") {
        this.pos++;
        continue;
      }
      break;
    }
    return args;
  }

  private applyFunction(name: string, args: (number | number[])[]): number {
    const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    switch (name) {
      case "SUM":
        return flat.reduce((a, b) => a + b, 0);
      case "AVERAGE":
        return flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : 0;
      case "MIN":
        return flat.length ? Math.min(...flat) : 0;
      case "MAX":
        return flat.length ? Math.max(...flat) : 0;
      case "COUNT":
        return flat.length;
      default:
        throw new FormulaError(`Unknown function ${name}`);
    }
  }
}

/**
 * Resolves every cell in `sheet` to its display value, evaluating formulas
 * (cells whose raw text starts with "="). Circular references resolve to
 * "#REF!" for the cells in the cycle rather than looping forever.
 */
export function evaluateSheet(sheet: SheetData): Record<string, string> {
  const results: Record<string, string> = {};
  const resolving = new Set<string>();
  const done = new Set<string>();

  function resolveNumeric(ref: string): number {
    const display = resolveCell(ref);
    const num = parseFloat(display);
    return isNaN(num) ? 0 : num;
  }

  function resolveCell(ref: string): string {
    if (done.has(ref)) return results[ref] ?? "";
    if (resolving.has(ref)) {
      results[ref] = "#REF!";
      done.add(ref);
      return results[ref];
    }
    const raw = sheet.cells[ref];
    if (raw === undefined || raw === "") {
      results[ref] = "";
      done.add(ref);
      return "";
    }
    if (!raw.startsWith("=")) {
      results[ref] = raw;
      done.add(ref);
      return raw;
    }

    resolving.add(ref);
    try {
      const parser = new FormulaParser(raw.slice(1), resolveNumeric);
      const value = parser.parse();
      results[ref] = Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
    } catch {
      results[ref] = "#ERR!";
    }
    resolving.delete(ref);
    done.add(ref);
    return results[ref];
  }

  for (let r = 0; r < sheet.rowCount; r++) {
    for (let c = 0; c < sheet.colCount; c++) {
      const ref = cellAddress(r, c);
      resolveCell(ref);
    }
  }
  // Cells addressed by a formula but outside the visible grid still need a
  // resolved value (e.g. a formula referencing a since-deleted row/column).
  for (const ref of Object.keys(sheet.cells)) {
    if (!(ref in results)) resolveCell(ref);
  }

  return results;
}
