// Computes every field's effective value from the data layer: base values,
// formulas (which may reach across connections), and modifiers that connected
// notes apply. Pure and synchronous: the server runs it over a whole scope
// after each change (it's fast — a few µs per field) and broadcasts the diff.
import type { AgField, AgLink, AgModifier, AgNote, AgValue } from "./types";
import { evaluate, FormulaError, parseCached, toFieldValue, asNumber, isTruthy, type FValue } from "./formula";

export interface ComputeData {
  notes: Map<string, AgNote>;
  /** noteId → key → field */
  fieldsByNote: Map<string, Map<string, AgField>>;
  links: Iterable<AgLink>;
  modifiers: Iterable<AgModifier>;
}

export interface Computed {
  eff: AgValue;
  err: string | null;
}

/**
 * Follow `label` from each sheet, then again from where it led, as far as it
 * goes (at least once); the ends of the chains. Loops and very long chains stop.
 */
export function climb(start: string[], label: string, step: (ids: string[], label: string) => string[]): string[] {
  const out = new Set<string>();
  for (const id of start) {
    let cur = step([id], label);
    const seen = new Set<string>([id]);
    for (let hop = 0; cur.length && hop < 12; hop++) {
      const ends: string[] = [], more: string[] = [];
      for (const c of cur) {
        if (seen.has(c)) continue;
        seen.add(c);
        const n = step([c], label).filter((x) => !seen.has(x));
        if (n.length) more.push(...n); else ends.push(c);
      }
      ends.forEach((e) => out.add(e));
      cur = more;
    }
  }
  return Array.from(out);
}

/** Every sheet reached by following `label` again and again (at least once), with the sheet it was reached from. */
export function reachAll(start: string[], label: string, step: (ids: string[], label: string) => string[]): Map<string, string> {
  const out = new Map<string, string>();
  let frontier = start.map((id) => id);
  const seen = new Set(start);
  for (let hop = 0; frontier.length && hop < 12; hop++) {
    const next: string[] = [];
    for (const from of frontier) for (const to of step([from], label)) {
      if (seen.has(to)) continue;
      seen.add(to); out.set(to, from); next.push(to);
    }
    frontier = next;
  }
  return out;
}

export class AgComputer {
  private out = new Map<string, Map<string, string[]>>();
  private incomingMods = new Map<string, AgModifier[]>();
  private memo = new Map<string, Computed>();
  private visiting = new Set<string>();

  constructor(private data: ComputeData) {
    for (const l of Array.from(data.links)) {
      this.addEdge(l.fromNoteId, l.label, l.toNoteId);
      this.addEdge(l.toNoteId, l.reverseLabel, l.fromNoteId);
    }
    for (const m of Array.from(data.modifiers)) {
      for (const target of this.follow(m.noteId, m.via)) {
        const list = this.incomingMods.get(target) ?? [];
        list.push(m);
        this.incomingMods.set(target, list);
      }
    }
  }

  private addEdge(from: string, label: string, to: string) {
    if (!label) return;
    const key = label.toLowerCase();
    let m = this.out.get(from);
    if (!m) { m = new Map(); this.out.set(from, m); }
    const arr = m.get(key) ?? [];
    if (!arr.includes(to)) arr.push(to);
    m.set(key, arr);
  }

  /**
   * Notes reached from `noteId` via a connection label ("self" = itself), or a
   * path of them: "ability.holder" = the holder of this sheet's ability.
   * A label ending in * is followed as far as it goes: "holder*" = the holder's
   * holder's … holder (an ability inside an ability inside a character → the character).
   * A label ending in + is every sheet along the way: "abilities+" = its abilities and
   * the abilities inside those, at any depth.
   */
  follow(noteId: string, label: string): string[] {
    const l = label.toLowerCase();
    if (l === "self" || l === "") return [noteId];
    let set = [noteId];
    for (const seg of l.split(".").filter(Boolean)) {
      if (seg === "self") continue;
      const step = (ids: string[], name: string) => {
        const next = new Set<string>();
        for (const id of ids) for (const to of this.out.get(id)?.get(name) ?? []) if (this.data.notes.has(to)) next.add(to);
        return Array.from(next);
      };
      if (seg.endsWith("*")) set = climb(set, seg.slice(0, -1), (ids, name) => step(ids, name));
      else if (seg.endsWith("+")) set = Array.from(reachAll(set, seg.slice(0, -1), (ids, name) => step(ids, name)).keys());
      else set = step(set, seg);
    }
    return set;
  }

  labelsFrom(noteId: string): string[] {
    return Array.from(this.out.get(noteId)?.keys() ?? []);
  }

  field(noteId: string, key: string): AgField | undefined {
    return this.data.fieldsByNote.get(noteId)?.get(key);
  }

  /** Resolve a reference path starting at `noteId`. */
  resolve(noteId: string, path: string[], abs?: string, extraRoots?: Record<string, string[]>, rollDie?: (s: number) => number, base = false): FValue {
    let set: string[] = [abs ?? noteId];
    let multi = false;
    if (abs && !this.data.notes.has(abs)) throw new FormulaError("Linked sheet no longer exists");
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      const last = i === path.length - 1;
      if (last) {
        const values: FValue[] = [];
        let found = false;
        for (const id of set) {
          const f = this.field(id, seg);
          if (f && f.type === "dice" && rollDie) {
            // In a roll button, a dice value ("1d8 + 2") is rolled, against its own sheet.
            found = true;
            values.push(f.formula?.trim() ? evaluate(parseCached(f.formula), { ref: (p, a, o) => this.resolve(f.noteId, p, a, undefined, rollDie, o?.base), rollDie }).value : 0);
            continue;
          }
          if (f) {
            found = true;
            const c = base ? this.baseOf(f) : this.effOf(f);
            // Errors propagate, so a broken source never silently reads as 0.
            if (c.err) throw new FormulaError(c.err.startsWith("Circular") ? c.err : `"${seg}" has an error`);
            values.push(c.eff as FValue);
            continue;
          }
          if (seg === "name") { found = true; values.push(this.data.notes.get(id)?.name ?? ""); continue; }
          // Path ends at a connection: the list of connected sheets' names.
          const linked = this.follow(id, seg);
          if (linked.length || this.out.get(id)?.has(seg)) {
            found = true;
            for (const lid of linked) values.push(this.data.notes.get(lid)?.name ?? "");
            multi = true;
          }
        }
        if (!found && set.length > 0) throw new FormulaError(`Unknown field "${seg}"`);
        return multi || values.length !== 1 ? values : values[0];
      }
      // Intermediate segment: a connection (or an extra root like $target at the start).
      const next: string[] = [];
      for (const id of set) {
        if (i === 0 && !abs && extraRoots && seg in extraRoots) { next.push(...extraRoots[seg]); continue; }
        next.push(...this.follow(id, seg));
      }
      set = Array.from(new Set(next));
      multi = true;
    }
    return null;
  }

  /** A field's own value, before incoming modifiers (formula fields still compute). */
  baseOf(f: AgField): Computed {
    if (f.type !== "formula") return { eff: f.type === "dice" ? f.formula ?? "" : f.value, err: null };
    if (!this.incomingMods.get(f.noteId)?.some((m) => m.targetKey === f.key)) return this.effOf(f);
    if (!f.formula?.trim()) return { eff: null, err: null };
    try {
      const r = evaluate(parseCached(f.formula), { ref: (p, a, o) => this.resolve(f.noteId, p, a, undefined, undefined, o?.base) });
      return { eff: toFieldValue(r.value, f.options?.resultType ?? "number"), err: null };
    } catch (e) {
      return { eff: null, err: e instanceof Error ? e.message : String(e) };
    }
  }

  effOf(f: AgField): Computed {
    const hit = this.memo.get(f.id);
    if (hit) return hit;
    if (this.visiting.has(f.id)) throw new FormulaError(`Circular formula through "${f.key}"`);
    this.visiting.add(f.id);
    let result: Computed;
    try {
      let base: AgValue;
      if (f.type === "formula") {
        if (!f.formula?.trim()) base = null;
        else {
          const r = evaluate(parseCached(f.formula), { ref: (p, a, o) => this.resolve(f.noteId, p, a, undefined, undefined, o?.base) });
          base = toFieldValue(r.value, f.options?.resultType ?? "number");
        }
      } else if (f.type === "dice") {
        base = f.formula ?? "";
      } else {
        base = f.value;
      }
      // Incoming modifiers only touch numbers.
      const mods = (this.incomingMods.get(f.noteId) ?? []).filter((m) => m.targetKey === f.key);
      if (mods.length && (f.type === "number" || f.type === "formula")) {
        let v = asNumber(base as FValue);
        const active = mods.filter((m) => {
          if (!m.condition?.trim()) return true;
          return isTruthy(evaluate(parseCached(m.condition), { ref: (p, a, o) => this.resolve(m.noteId, p, a, undefined, undefined, o?.base) }).value);
        });
        for (const m of active.filter((m) => m.op === "add")) v += asNumber(evaluate(parseCached(m.amount), { ref: (p, a, o) => this.resolve(m.noteId, p, a, undefined, undefined, o?.base) }).value);
        for (const m of active.filter((m) => m.op === "multiply")) v *= asNumber(evaluate(parseCached(m.amount), { ref: (p, a, o) => this.resolve(m.noteId, p, a, undefined, undefined, o?.base) }).value);
        base = v;
      }
      if (typeof base === "number") base = clampField(base, f);
      result = { eff: base, err: null };
    } catch (e) {
      result = { eff: f.type === "formula" ? null : f.value, err: e instanceof Error ? e.message : String(e) };
    } finally {
      this.visiting.delete(f.id);
    }
    this.memo.set(f.id, result);
    return result;
  }

  computeAll(): Map<string, Computed> {
    const all = new Map<string, Computed>();
    for (const fields of Array.from(this.data.fieldsByNote.values())) for (const f of Array.from(fields.values())) all.set(f.id, this.effOf(f));
    return all;
  }

  /** Evaluate an arbitrary expression in a note's context (action steps, previews). */
  evalIn(noteId: string, expr: string, opts: { rollDie?: (s: number) => number; locals?: Record<string, FValue>; roots?: Record<string, string[]> } = {}) {
    return evaluate(parseCached(expr), {
      ref: (p, a, o) => this.resolve(noteId, p, a, opts.roots, opts.rollDie, o?.base),
      local: (n) => opts.locals?.[n],
      rollDie: opts.rollDie,
      // In a roll, values are named in the working ("1d8[5] + 2 Athletics").
      name: opts.rollDie ? (p, a) => this.labelOf(noteId, p, a, opts.roots) : undefined,
    });
  }

  /** The label of the value a path ends at (one sheet only), for roll workings. */
  labelOf(noteId: string, path: string[], abs?: string, roots?: Record<string, string[]>): string | undefined {
    try {
      const { noteIds, key } = this.targetsOf(noteId, path, abs, roots);
      if (noteIds.length !== 1) return undefined;
      const f = this.field(noteIds[0], key);
      return f?.label || undefined;
    } catch { return undefined; }
  }

  /** Which notes a FieldRef path (without the final key) points to — for action "modify" targets. */
  targetsOf(noteId: string, path: string[], abs?: string, roots?: Record<string, string[]>): { noteIds: string[]; key: string } {
    const key = path[path.length - 1];
    let set = [abs ?? noteId];
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const next: string[] = [];
      for (const id of set) {
        if (i === 0 && !abs && roots && seg in roots) next.push(...roots[seg]);
        else next.push(...this.follow(id, seg));
      }
      set = Array.from(new Set(next));
    }
    return { noteIds: set, key };
  }
}

function clampField(v: number, f: AgField): number {
  if (f.type !== "number") return v;
  const { min, max } = f.options ?? {};
  if (typeof min === "number" && v < min) return min;
  if (typeof max === "number" && v > max) return max;
  return v;
}

/** Cryptographically-unbiased die roll (works in Node and browsers). */
export function rollDie(sides: number): number {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / sides) * sides;
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return (buf[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}
