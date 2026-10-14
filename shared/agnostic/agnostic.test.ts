import { describe, it, expect } from "vitest";
import { parseFormula, evaluate, FormulaError, parseCached, containsDice } from "./formula";
import { AgComputer } from "./compute";
import { canViewField, canEditField, canViewNote, canViewBody, canEditBody, canViewRegion, canRunAction } from "./acl";
import type { AgField, AgLink, AgModifier, AgNote, AgRegion } from "./types";

const ctx = (vals: Record<string, any>) => ({ ref: (p: string[]) => { const k = p.join("."); if (!(k in vals)) throw new FormulaError(`Unknown ${k}`); return vals[k]; } });

describe("formula", () => {
  it("does arithmetic with precedence", () => {
    expect(evaluate(parseFormula("2 + 3 * 4"), ctx({})).value).toBe(14);
    expect(evaluate(parseFormula("(2 + 3) * 4"), ctx({})).value).toBe(20);
    expect(evaluate(parseFormula("2 ^ 3 ^ 2"), ctx({})).value).toBe(512);
    expect(evaluate(parseFormula("-str + 10"), ctx({ str: 4 })).value).toBe(6);
  });
  it("resolves bare, @ and dotted refs", () => {
    expect(evaluate(parseFormula("str * 2 + @con"), ctx({ str: 3, con: 2 })).value).toBe(8);
    expect(evaluate(parseFormula("@owner.str"), ctx({ "owner.str": 5 })).value).toBe(5);
  });
  it("supports functions, logic and ternary", () => {
    expect(evaluate(parseFormula("max(1, 7, 3)"), ctx({})).value).toBe(7);
    expect(evaluate(parseFormula('if(hp <= 0, "Down", "Up")'), ctx({ hp: 0 })).value).toBe("Down");
    expect(evaluate(parseFormula("hp > 0 && !stunned ? 1 : 0"), ctx({ hp: 3, stunned: false })).value).toBe(1);
    expect(evaluate(parseFormula("sum(@items.weight)"), ctx({ "items.weight": [1, 2, 3.5] })).value).toBe(6.5);
    expect(evaluate(parseFormula("@items.weight + 1"), ctx({ "items.weight": [1, 2] })).value).toBe(4);
    expect(evaluate(parseFormula("floor(15 / 2)"), ctx({})).value).toBe(7);
  });
  it("rolls dice only when allowed", () => {
    expect(() => evaluate(parseFormula("1d20 + 2"), ctx({}))).toThrow(FormulaError);
    const seq = [14, 3, 5, 6, 1];
    const r = evaluate(parseFormula("1d20 + 2d6 + dex"), { ...ctx({ dex: 2 }), rollDie: () => seq.shift()! });
    expect(r.value).toBe(14 + 3 + 5 + 2);
    expect(r.breakdown).toContain("1d20[14]");
    const k = evaluate(parseFormula("4d6kh3"), { ...ctx({}), rollDie: (() => { const s = [1, 6, 4, 3]; return () => s.shift()!; })() });
    expect(k.value).toBe(13);
  });
  it("does not mistake fields starting with d for dice", () => {
    expect(evaluate(parseFormula("dex + defense"), ctx({ dex: 1, defense: 2 })).value).toBe(3);
  });
  it("reports syntax errors", () => {
    expect(() => parseFormula("2 +")).toThrow(FormulaError);
    expect(() => parseFormula("nope(1)")).toThrow(FormulaError);
    expect(() => parseCached("(1")).toThrow(FormulaError);
  });
});

const note = (id: string, extra: Partial<AgNote> = {}): AgNote => ({
  id, scope: "campaign", scopeId: "c", type: "character", isTemplate: false, templateMeta: null, templateId: null, templateVersion: null,
  name: id, portrait: null, ownerIds: [], acl: { view: "everyone", edit: "gm" }, bodyAcl: { view: "inherit", edit: "inherit" },
  tokenBars: null, folder: null, sortOrder: 0, docEpoch: 0, createdAt: 0, updatedAt: 0, ...extra,
});
let fid = 0;
const field = (noteId: string, key: string, extra: Partial<AgField> = {}): AgField => ({
  id: `f${++fid}`, noteId, key, label: key, type: "number", value: 0, formula: null, options: {}, acl: { view: "inherit", edit: "inherit" },
  sortOrder: 0, templateFieldId: null, ...extra,
});
function data(notes: AgNote[], fields: AgField[], links: AgLink[] = [], modifiers: AgModifier[] = []) {
  const fieldsByNote = new Map<string, Map<string, AgField>>();
  for (const f of fields) { if (!fieldsByNote.has(f.noteId)) fieldsByNote.set(f.noteId, new Map()); fieldsByNote.get(f.noteId)!.set(f.key, f); }
  return new AgComputer({ notes: new Map(notes.map((n) => [n.id, n])), fieldsByNote, links, modifiers });
}

describe("compute", () => {
  it("computes formulas across connections and applies modifiers", () => {
    const hero = note("hero"), sword = note("sword", { type: "item" });
    const str = field("hero", "str", { value: 3 });
    const hpMax = field("hero", "hp_max", { type: "formula", formula: "10 + str * 2" });
    const dmg = field("sword", "damage", { type: "formula", formula: "@owner.str + 2" });
    const equipped = field("sword", "equipped", { type: "boolean", value: true });
    const link: AgLink = { id: "l", fromNoteId: "sword", toNoteId: "hero", label: "owner", reverseLabel: "items", acl: { view: "inherit", edit: "inherit" }, createdAt: 0 };
    const mod: AgModifier = { id: "m", noteId: "sword", via: "owner", targetKey: "str", op: "add", amount: "1", condition: "equipped", label: null };
    const c = data([hero, sword], [str, hpMax, dmg, equipped], [link], [mod]);
    const all = c.computeAll();
    expect(all.get(str.id)!.eff).toBe(4); // 3 + sword's +1
    expect(all.get(hpMax.id)!.eff).toBe(18);
    expect(all.get(dmg.id)!.eff).toBe(6);
    equipped.value = false;
    const c2 = data([hero, sword], [str, hpMax, dmg, equipped], [link], [mod]);
    expect(c2.computeAll().get(str.id)!.eff).toBe(3);
  });
  it("detects cycles without throwing", () => {
    const n = note("n");
    const a = field("n", "a", { type: "formula", formula: "b + 1" });
    const b = field("n", "b", { type: "formula", formula: "a + 1" });
    const all = data([n], [a, b]).computeAll();
    expect(all.get(a.id)!.err).toMatch(/Circular/);
  });
  it("lists many connected sheets", () => {
    const hero = note("hero"), i1 = note("i1"), i2 = note("i2");
    const w1 = field("i1", "weight", { value: 2 }), w2 = field("i2", "weight", { value: 5 });
    const load = field("hero", "load", { type: "formula", formula: "sum(@items.weight)" });
    const cnt = field("hero", "n", { type: "formula", formula: "count(@items)" });
    const links: AgLink[] = ["i1", "i2"].map((i) => ({ id: i, fromNoteId: i, toNoteId: "hero", label: "owner", reverseLabel: "items", acl: { view: "inherit", edit: "inherit" }, createdAt: 0 }));
    const all = data([hero, i1, i2], [w1, w2, load, cnt], links).computeAll();
    expect(all.get(load.id)!.eff).toBe(7);
    expect(all.get(cnt.id)!.eff).toBe(2);
  });
  it("rolls in a note's context with action locals", () => {
    const hero = note("hero");
    const c = data([hero], [field("hero", "dex", { value: 2 })]);
    const r = c.evalIn("hero", "1d20 + dex + $bonus", { rollDie: () => 10, locals: { bonus: 1 } });
    expect(r.value).toBe(13);
  });
});

describe("acl", () => {
  const gm = { userId: "gm", isGM: true }, p1 = { userId: "p1", isGM: false }, p2 = { userId: "p2", isGM: false };
  it("follows the curse / current-vs-max HP example", () => {
    const n = note("hero", { ownerIds: ["p1"], acl: { view: "everyone", edit: "gm" }, bodyAcl: { view: "owners", edit: "gm" } });
    const hp = field("hero", "hp", { acl: { view: "inherit", edit: "owners" } });
    const hpMax = field("hero", "hp_max", { acl: { view: "inherit", edit: "inherit" } });
    const curse: AgRegion = { id: "r", noteId: "hero", acl: { view: "gm", edit: "gm" }, inline: false, label: null, templateRegionId: null };
    expect(canViewNote(n, p2)).toBe(true); // name + portrait public
    expect(canViewBody(n, p2)).toBe(false);
    expect(canViewField(hp, n, p2)).toBe(false); // inventory/body owner-only
    expect(canViewField(hp, n, p1)).toBe(true);
    expect(canEditField(hp, n, p1)).toBe(true);
    expect(canEditField(hpMax, n, p1)).toBe(false);
    expect(canViewRegion(curse, n, p1)).toBe(false);
    expect(canViewRegion(curse, n, gm)).toBe(true);
    expect(canEditBody(n, p1)).toBe(false);
  });
  it("hides templates from players", () => {
    expect(canViewNote(note("t", { isTemplate: true }), p1)).toBe(false);
  });
  it("supports specific players", () => {
    const n = note("x", { acl: { view: { users: ["p2"] }, edit: "gm" } });
    expect(canViewNote(n, p1)).toBe(false);
    expect(canViewNote(n, p2)).toBe(true);
  });
});

describe("formula: roll / choose / tier", () => {
  const run = (src: string, roll = false) => evaluate(parseFormula(src), { ref: () => 0, ...(roll ? { rollDie: (s: number) => s } : {}) });
  it("choose picks by index and clamps", () => {
    expect(run('choose(1, "a", "b", "c")').value).toBe("b");
    expect(run('choose(9, "a", "b")').value).toBe("b");
  });
  it("tier finds the ladder position", () => {
    expect(run("tier(0, 0, 20, 30)").value).toBe(0);
    expect(run("tier(25, 0, 20, 30)").value).toBe(1);
    expect(run("tier(999, 0, 20, 30)").value).toBe(2);
  });
  it("roll uses computed dice sizes and only in buttons", () => {
    expect(run("roll(2, 3 + 3)", true).value).toBe(12);
    expect(() => run("roll(1, 6)")).toThrow();
    expect(containsDice(parseFormula("roll(1, 8) + 2"))).toBe(true);
  });
});

describe("dice values roll in buttons", () => {
  it("a roll step referencing a dice value rolls it", () => {
    const notes = new Map([["w", { id: "w" } as any]]);
    const dmg = { id: "d", noteId: "w", key: "damage", label: "Damage", type: "dice", value: null, formula: "2d6 + 1", options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: 0, templateFieldId: null } as any;
    const comp = new AgComputer({ notes, fieldsByNote: new Map([["w", new Map([["damage", dmg]])]]), links: [], modifiers: [] });
    expect(comp.evalIn("w", "damage + 1", { rollDie: (s) => s }).value).toBe(14);
  });
});

describe("base()", () => {
  it("reads a value before modifiers", () => {
    const hero = note("hero"), wound = note("wound");
    const ath = field("hero", "athletics", { value: 2 });
    const spent = field("hero", "spent", { type: "formula", formula: "base(athletics)" });
    const eff = field("hero", "now", { type: "formula", formula: "athletics" });
    const link: AgLink = { id: "l", fromNoteId: "wound", toNoteId: "hero", label: "bearer", reverseLabel: "wounds", acl: { view: "inherit", edit: "inherit" }, createdAt: 0 };
    const mod: AgModifier = { id: "m", noteId: "wound", via: "bearer", targetKey: "athletics", op: "add", amount: "-2", condition: null, label: null };
    const all = data([hero, wound], [ath, spent, eff], [link], [mod]).computeAll();
    expect(all.get(eff.id)!.eff).toBe(0);
    expect(all.get(spent.id)!.eff).toBe(2);
    expect(() => evaluate(parseFormula("base(1 + 2)"), ctx({}))).toThrow(FormulaError);
  });
});

describe("connection paths: * (as far as it goes) and + (everything along the way)", () => {
  const ln = (id: string, from: string, to: string, label: string, reverseLabel: string): AgLink =>
    ({ id, fromNoteId: from, toNoteId: to, label, reverseLabel, acl: { view: "inherit", edit: "inherit" }, createdAt: 0 });
  // hero ← holder ← prison ← holder ← shaman ← ability ← hex;   hero ← holder ← embers ← ability ← lance
  const c = data(
    [note("hero"), note("prison", { type: "ability" }), note("shaman", { type: "ability" }), note("hex", { type: "aspect" }), note("embers", { type: "ability" }), note("lance", { type: "aspect" })],
    [field("hero", "anemos_die", { value: 8 }), field("hero", "energy", { value: 100 })],
    [
      ln("l1", "prison", "hero", "holder", "abilities"), ln("l2", "shaman", "prison", "holder", "abilities"), ln("l3", "hex", "shaman", "ability", "aspects"),
      ln("l4", "embers", "hero", "holder", "abilities"), ln("l5", "lance", "embers", "ability", "aspects"),
    ],
  );
  it("holder* climbs to the top of the chain", () => {
    expect(c.follow("hex", "ability.holder*")).toEqual(["hero"]);
    expect(c.follow("lance", "ability.holder*")).toEqual(["hero"]);
    expect(c.follow("hex", "ability.holder")).toEqual(["prison"]);
  });
  it("abilities+ reaches the abilities inside abilities", () => {
    expect(c.follow("hero", "abilities+").sort()).toEqual(["embers", "prison", "shaman"]);
    expect(c.follow("hero", "abilities+.aspects").sort()).toEqual(["hex", "lance"]);
    expect(c.follow("hero", "abilities.aspects")).toEqual(["lance"]);
  });
  it("formulas read through * paths, and * is still multiplication elsewhere", () => {
    expect(c.evalIn("hex", "sum(@ability.holder*.anemos_die)").value).toBe(8);
    expect(c.evalIn("hex", "sum(@ability.holder*.anemos_die) * 2").value).toBe(16);
    expect(c.evalIn("hero", "energy*2").value).toBe(200);
    expect(c.evalIn("hero", "count(@abilities+.aspects.name)").value).toBe(2);
  });
});

describe("users: see and use a sheet, but don't change it", () => {
  const sword = note("sword", { type: "item", ownerIds: [], userIds: ["p1"], acl: { view: "owners", edit: "owners" } });
  const qty = field("sword", "qty", { value: 1 });
  const strike = { id: "a1", noteId: "sword", name: "Strike", steps: [], acl: { view: "inherit", edit: "owners" }, color: null } as any;
  const p1 = { userId: "p1", isGM: false }, p2 = { userId: "p2", isGM: false }, gm = { userId: "g", isGM: true };
  it("a user sees it and can press its buttons", () => {
    expect(canViewNote(sword, p1)).toBe(true);
    expect(canViewField(qty, sword, p1)).toBe(true);
    expect(canRunAction(strike, sword, p1)).toBe(true);
  });
  it("…but can't change anything", () => {
    expect(canEditField(qty, sword, p1)).toBe(false);
    expect(canEditBody(sword, p1)).toBe(false);
  });
  it("someone else can't even see it; the GM can do anything; an owner can edit", () => {
    expect(canViewNote(sword, p2)).toBe(false);
    expect(canEditField(qty, sword, gm)).toBe(true);
    expect(canEditField(qty, { ...sword, ownerIds: ["p1"] }, p1)).toBe(true);
  });
});
