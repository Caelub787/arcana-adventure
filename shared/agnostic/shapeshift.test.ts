/**
 * Shapeshifting: one creature wearing several sheets. What ties them together
 * is an ability with a number on it, and what crosses a shift is the share of
 * each pool rather than the number in it.
 */
import { describe, it, expect } from "vitest";
import {
  abilitiesOf, abilityGroup, carryPool, formsOf, groupOf, groupOfSheet, sameCreature, type ShiftWorld,
} from "./shapeshift";

/** A little table: sheets, their values, and what's connected to what. */
function world(
  sheets: Record<string, { type: string; isTemplate?: boolean; values?: Record<string, unknown> }>,
  links: Array<[from: string, to: string, label: string, reverse: string]>,
): ShiftWorld {
  return {
    ids: () => Object.keys(sheets),
    type: (id) => sheets[id]?.type,
    isTemplate: (id) => !!sheets[id]?.isTemplate,
    value: (id, key) => sheets[id]?.values?.[key],
    linked: (id, label) => links.flatMap(([f, t, l, r]) => (f === id && l === label ? [t] : t === id && r === label ? [f] : [])),
  };
}

const shifter = (group: number, on = true) => ({ type: "ability", values: { shapeshift: on, shift_group: group } });
/** A character holding an ability: the character's list is "abilities", the ability's way back is "holder". */
const holds = (sheet: string, ability: string): [string, string, string, string] => [sheet, ability, "abilities", "holder"];

describe("what makes a form", () => {
  it("ties two sheets together by the number on their abilities", () => {
    const w = world(
      { druid: { type: "character" }, bear: { type: "beast" }, a1: shifter(7), a2: shifter(7) },
      [holds("druid", "a1"), holds("bear", "a2")],
    );
    expect(groupOfSheet(w, "druid")).toBe(7);
    expect(sameCreature(w, "druid", "bear")).toBe(true);
    expect(formsOf(w, 7).sort()).toEqual(["bear", "druid"]);
  });

  it("leaves out a sheet whose number doesn't match", () => {
    const w = world(
      { druid: { type: "character" }, bear: { type: "beast" }, wolf: { type: "beast" }, a1: shifter(7), a2: shifter(7), a3: shifter(9) },
      [holds("druid", "a1"), holds("bear", "a2"), holds("wolf", "a3")],
    );
    expect(formsOf(w, 7).sort()).toEqual(["bear", "druid"]);
    expect(sameCreature(w, "druid", "wolf")).toBe(false);
  });

  it("leaves out a sheet whose ability isn't a shapeshifting one", () => {
    const w = world(
      { druid: { type: "character" }, bear: { type: "beast" }, a1: shifter(7), a2: shifter(7, false) },
      [holds("druid", "a1"), holds("bear", "a2")],
    );
    expect(formsOf(w, 7)).toEqual(["druid"]);
  });

  it("counts no number at all as no creature — nobody is linked by leaving it blank", () => {
    const w = world(
      { druid: { type: "character" }, bear: { type: "beast" }, a1: shifter(0), a2: shifter(0) },
      [holds("druid", "a1"), holds("bear", "a2")],
    );
    expect(groupOfSheet(w, "druid")).toBe(0);
    expect(sameCreature(w, "druid", "bear")).toBe(false);
    expect(formsOf(w, 0)).toEqual([]);
  });

  it("never counts a template as a form", () => {
    const w = world(
      { tpl: { type: "character", isTemplate: true }, bear: { type: "beast" }, a1: shifter(3), a2: shifter(3) },
      [holds("tpl", "a1"), holds("bear", "a2")],
    );
    expect(formsOf(w, 3)).toEqual(["bear"]);
  });

  it("doesn't make a sword or a wound into a form", () => {
    const w = world(
      { druid: { type: "character" }, sword: { type: "item" }, a1: shifter(2), a2: shifter(2) },
      [holds("druid", "a1"), holds("sword", "a2")],
    );
    expect(formsOf(w, 2)).toEqual(["druid"]);
  });

  it("finds an ability held inside another ability", () => {
    const w = world(
      { druid: { type: "character" }, outer: { type: "ability" }, inner: shifter(5), bear: { type: "beast" }, a2: shifter(5) },
      [holds("druid", "outer"), holds("outer", "inner"), holds("bear", "a2")],
    );
    expect(abilitiesOf(w, "druid").sort()).toEqual(["inner", "outer"]);
    expect(groupOfSheet(w, "druid")).toBe(5);
    expect(formsOf(w, 5).sort()).toEqual(["bear", "druid"]);
  });
});

describe("asking from wherever you happen to be", () => {
  const w = world(
    { druid: { type: "character" }, bear: { type: "beast" }, a1: shifter(7), a2: shifter(7), asp: { type: "aspect" }, plain: { type: "ability" } },
    [holds("druid", "a1"), holds("bear", "a2"), ["asp", "a1", "ability", "aspects"], holds("druid", "plain")],
  );

  it("answers from the ability itself", () => expect(groupOf(w, "a1")).toBe(7));
  it("answers from one of its aspects", () => expect(groupOf(w, "asp")).toBe(7));
  it("answers from the character holding it", () => expect(groupOf(w, "druid")).toBe(7));
  it("answers from another ability that character holds", () => expect(groupOf(w, "plain")).toBe(7));
  it("says nothing for a sheet with no shapeshifting anywhere near it", () => {
    const lone = world({ guard: { type: "npc" } }, []);
    expect(groupOf(lone, "guard")).toBe(0);
  });
  it("only counts an ability that is switched on", () => {
    expect(abilityGroup(w, "plain")).toBe(0);
    expect(abilityGroup(w, "a1")).toBe(7);
  });
});

describe("what a shift carries over", () => {
  it("keeps the share of the pool, not the number (1 of 10 → 10 of 100)", () => {
    expect(carryPool(1, 10, 100)).toBe(10);
  });

  it("keeps it the other way too (10 of 100 → 1 of 10)", () => {
    expect(carryPool(10, 100, 10)).toBe(1);
  });

  it("comes out of a shift untouched when nothing was spent", () => {
    expect(carryPool(10, 10, 100)).toBe(100);
    expect(carryPool(100, 100, 10)).toBe(10);
  });

  it("leaves the dead dead", () => {
    expect(carryPool(0, 10, 100)).toBe(0);
    expect(carryPool(-5, 10, 100)).toBe(0);
  });

  it("never rounds a living creature down to nothing", () => {
    expect(carryPool(1, 100, 10)).toBe(1);
  });

  it("never comes out over the new maximum", () => {
    expect(carryPool(999, 10, 50)).toBe(50);
  });

  it("copes with a form that has no maximum to speak of", () => {
    expect(carryPool(7, 0, 0)).toBe(7);
    expect(carryPool(7, 0, 5)).toBe(5);
  });
});
