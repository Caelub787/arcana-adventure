// @vitest-environment jsdom
/**
 * How many runes an item takes used to be a number on its sheet, set by its
 * rank: an Unranked knife took none at all. It is room now. An item of any rank
 * takes runes until there is nowhere left to cut one, two runes can't be cut
 * across one another, and a rune can be no finer than the tool cutting it.
 *
 * The tool has a say in the work as well, on every craft: its Skill points are
 * lent to whoever holds it, so the same crafter is steadier with better kit.
 */
import { describe, it, expect } from "vitest";
import { toolEffectsOn, craftHand, runeSpaceOn } from "./session";
import { RUNE_SIZE_MIN } from "@shared/agnostic/crafting";

type Thing = { id: string; values?: Record<string, unknown>; on?: string };

/** A scope with some sheets in it, enough for the rules above to be read off. */
function scopeOf(things: Thing[]) {
  const notes = new Map(things.map((t) => [t.id, { id: t.id, name: t.id, type: "item", isTemplate: false } as any]));
  const fields = new Map<string, any>();
  const links = new Map<string, any>();
  for (const t of things) {
    let order = 0;
    for (const [key, value] of Object.entries(t.values ?? {})) fields.set(`${t.id}:${key}`, { id: `${t.id}:${key}`, noteId: t.id, key, label: key, sortOrder: order++, value });
    // A rune hangs off the item it is cut into, reachable as its "runes".
    if (t.on) links.set(`l-${t.id}`, { id: `l-${t.id}`, fromNoteId: t.id, toNoteId: t.on, label: "socket", reverseLabel: "runes" });
  }
  return { notes, fields, links } as any;
}

const rune = (id: string, on: string, p: { x: number; y: number; s: number }): Thing =>
  ({ id, on, values: { sigil: "[]", placement: JSON.stringify(p) } });

describe("a tool's say in the work", () => {
  it("is nothing when the item says nothing", () => {
    const s = scopeOf([{ id: "stick" }]);
    expect(toolEffectsOn(s, "stick").skill).toBe(0);
    expect(toolEffectsOn(s, "stick").minRuneSize).toBe(RUNE_SIZE_MIN);
  });

  it("is nothing at all when no tool is in hand", () => {
    expect(toolEffectsOn(scopeOf([]), undefined).skill).toBe(0);
  });

  it("lends its points to the hand", () => {
    const s = scopeOf([{ id: "me", values: { rune_making: 1 } }, { id: "needles", values: { tool_skill: 2 } }]);
    expect(craftHand(s, "me", "rune_making", ["needles"])).toMatchObject({ own: 1, tool: 2, skill: 3 });
  });

  it("costs points when it is a poor tool", () => {
    const s = scopeOf([{ id: "me", values: { rune_making: 3 } }, { id: "nail", values: { tool_skill: -2 } }]);
    expect(craftHand(s, "me", "rune_making", ["nail"]).skill).toBe(1);
  });

  it("can't push a hand past what a master's is, or below a beginner's", () => {
    const s = scopeOf([{ id: "me", values: { rune_making: 4 } }, { id: "best", values: { tool_skill: 5 } }, { id: "worst", values: { tool_skill: -5 } }]);
    expect(craftHand(s, "me", "rune_making", ["best"]).skill).toBe(4);
    expect(craftHand(s, "me", "rune_making", ["worst"]).skill).toBe(0);
  });

  it("works the same for blacksmithing and alchemy as for runes", () => {
    const s = scopeOf([{ id: "me", values: { blacksmithing: 1, alchemy: 2 } }, { id: "hammer", values: { tool_skill: 1 } }]);
    expect(craftHand(s, "me", "blacksmithing", ["hammer"]).skill).toBe(2);
    expect(craftHand(s, "me", "alchemy", ["hammer"]).skill).toBe(3);
  });
});

describe("the room left on an item", () => {
  it("is all of it on something with no runes, whatever its rank", () => {
    const s = scopeOf([{ id: "knife", values: { rank_tag: "Unranked" } }]);
    const k = runeSpaceOn(s, "knife");
    expect(k.full).toBe(false);
    expect(k.taken).toHaveLength(0);
    expect(k.label).toBe("bare");
  });

  it("takes a rune on an Unranked item, which used to have no sockets at all", () => {
    const s = scopeOf([{ id: "knife", values: { rank_tag: "Unranked" } }]);
    expect(runeSpaceOn(s, "knife").full).toBe(false);
  });

  it("counts the runes already cut into it", () => {
    const s = scopeOf([{ id: "sword" }, rune("r1", "sword", { x: 30, y: 30, s: 20 })]);
    expect(runeSpaceOn(s, "sword").taken).toHaveLength(1);
    expect(runeSpaceOn(s, "sword").label).toContain("1 rune");
  });

  it("shrinks as runes are cut, and says how much is free", () => {
    const one = scopeOf([{ id: "sword" }, rune("r1", "sword", { x: 30, y: 30, s: 20 })]);
    const two = scopeOf([{ id: "sword" }, rune("r1", "sword", { x: 30, y: 30, s: 20 }), rune("r2", "sword", { x: 70, y: 70, s: 20 })]);
    expect(runeSpaceOn(two, "sword").used).toBeGreaterThan(runeSpaceOn(one, "sword").used);
    expect(runeSpaceOn(one, "sword").label).toMatch(/\d+% free/);
  });

  it("runs out when the face is covered", () => {
    const s = scopeOf([
      { id: "ring" },
      rune("r1", "ring", { x: 50, y: 50, s: 56 }),
      rune("r2", "ring", { x: 14, y: 14, s: 26 }), rune("r3", "ring", { x: 86, y: 14, s: 26 }),
      rune("r4", "ring", { x: 14, y: 86, s: 26 }), rune("r5", "ring", { x: 86, y: 86, s: 26 }),
    ]);
    // A needle still finds a gap; a chisel that can't cut under 30% does not.
    expect(runeSpaceOn(s, "ring", RUNE_SIZE_MIN).full).toBe(false);
    expect(runeSpaceOn(s, "ring", 30).full).toBe(true);
    expect(runeSpaceOn(s, "ring", 30).label).toContain("no room left");
  });

  it("reads a coarse tool as full sooner than a fine one on the same item", () => {
    const s = scopeOf([{ id: "ring" }, rune("r1", "ring", { x: 50, y: 50, s: 70 })]);
    expect(runeSpaceOn(s, "ring", RUNE_SIZE_MIN).full).toBe(false);
    expect(runeSpaceOn(s, "ring", 40).full).toBe(true);
  });

  it("ignores a rune with no placement written down rather than breaking", () => {
    const s = scopeOf([{ id: "sword" }, { id: "r1", on: "sword", values: { sigil: "[]" } }]);
    expect(runeSpaceOn(s, "sword").taken).toHaveLength(1);
    expect(runeSpaceOn(s, "sword").full).toBe(false);
  });

  it("ignores rubbish where a placement should be", () => {
    const s = scopeOf([{ id: "sword" }, { id: "r1", on: "sword", values: { sigil: "[]", placement: "{oops" } }]);
    expect(() => runeSpaceOn(s, "sword")).not.toThrow();
  });
});
