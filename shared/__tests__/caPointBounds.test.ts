import { describe, it, expect } from "vitest";
import {
  caAttributeBounds,
  caSkillBounds,
  caAttrPointBudget,
  caSkillPointBudget,
  CA_ATTRIBUTE_KEYS,
  CA_SKILL_KEYS,
  CA_MAX_NEGATIVE_SKILL_POINTS,
} from "../ca";

/**
 * The C.A. sheet has no Save button to validate a whole allocation against,
 * so the budget is enforced at the edge of each value's editor instead: you
 * cannot type a number that would put the total over. These are the bounds
 * that do it.
 */

const noAttrs = () => Object.fromEntries(CA_ATTRIBUTE_KEYS.map((k) => [k, 0]));
const noSkills = () => Object.fromEntries(CA_SKILL_KEYS.map((k) => [k, 0]));

describe("attribute bounds", () => {
  it("offers the whole budget when nothing is spent", () => {
    const level = 1;
    const b = caAttributeBounds(noAttrs(), CA_ATTRIBUTE_KEYS[0], level);
    expect(b).toMatchObject({ current: 0, min: 0 });
    expect(b.max).toBe(Math.min(5, caAttrPointBudget(level)));
  });

  it("shrinks as other attributes take points", () => {
    const level = 9; // a budget big enough that the 5 cap isn't what's biting
    const budget = caAttrPointBudget(level);
    const attrs = { ...noAttrs(), [CA_ATTRIBUTE_KEYS[1]]: budget - 2 };
    expect(caAttributeBounds(attrs, CA_ATTRIBUTE_KEYS[0], level).max).toBe(2);
  });

  it("still lets a maxed attribute keep what it already holds", () => {
    const level = 1;
    const budget = caAttrPointBudget(level);
    const attrs = { ...noAttrs(), [CA_ATTRIBUTE_KEYS[0]]: Math.min(5, budget) };
    const b = caAttributeBounds(attrs, CA_ATTRIBUTE_KEYS[0], level);
    // Nothing left to spend, so it can't go up - but it isn't forced down.
    expect(b.max).toBe(b.current);
    expect(b.min).toBe(0);
  });

  it("never goes above 5 however big the budget is", () => {
    expect(caAttributeBounds(noAttrs(), CA_ATTRIBUTE_KEYS[0], 60).max).toBe(5);
  });

  it("never lets an attribute go negative", () => {
    expect(caAttributeBounds(noAttrs(), CA_ATTRIBUTE_KEYS[0], 1).min).toBe(0);
  });

  it("does not go over the budget when the stored values already have", () => {
    // A character edited before the bounds existed, or by an admin.
    const attrs = { ...noAttrs(), [CA_ATTRIBUTE_KEYS[0]]: 5, [CA_ATTRIBUTE_KEYS[1]]: 5, [CA_ATTRIBUTE_KEYS[2]]: 5 };
    const b = caAttributeBounds(attrs, CA_ATTRIBUTE_KEYS[3], 1);
    expect(b.max).toBe(0);
  });
});

describe("skill bounds", () => {
  it("offers what's left of the budget", () => {
    const level = 1;
    const b = caSkillBounds(noSkills(), CA_SKILL_KEYS[0], level);
    expect(b.max).toBe(Math.min(5, caSkillPointBudget(level)));
  });

  it("counts the scroll bonus on top of the 5 cap", () => {
    expect(caSkillBounds(noSkills(), CA_SKILL_KEYS[0], 40, 2).max).toBe(7);
    expect(caSkillBounds(noSkills(), CA_SKILL_KEYS[0], 40, 0).max).toBe(5);
  });

  it("shrinks as other skills take points", () => {
    const level = 1;
    const budget = caSkillPointBudget(level);
    const skills = { ...noSkills(), [CA_SKILL_KEYS[1]]: budget - 1 };
    expect(caSkillBounds(skills, CA_SKILL_KEYS[0], level).max).toBe(1);
  });

  // Going negative buys points back, which is why the floor moves.
  it("lets a skill go to -2 while there is negative allowance left", () => {
    expect(caSkillBounds(noSkills(), CA_SKILL_KEYS[0], 1).min).toBe(-2);
  });

  it("stops reclaiming once other skills have used the whole allowance", () => {
    const skills = { ...noSkills() };
    let spent = 0;
    for (let i = 1; spent < CA_MAX_NEGATIVE_SKILL_POINTS; i++) {
      skills[CA_SKILL_KEYS[i]] = -2;
      spent += 2;
    }
    expect(caSkillBounds(skills, CA_SKILL_KEYS[0], 1).min).toBe(0);
  });

  it("counts a skill's own negative against itself, not against its floor", () => {
    // This skill holds -2 of the allowance; it must still be allowed to stay
    // there rather than being told its floor is 0.
    const skills = { ...noSkills(), [CA_SKILL_KEYS[0]]: -2, [CA_SKILL_KEYS[1]]: -4 };
    const b = caSkillBounds(skills, CA_SKILL_KEYS[0], 1);
    expect(b.current).toBe(-2);
    expect(b.min).toBe(-2);
  });

  it("adds the reclaimed points to what can be spent", () => {
    const level = 1;
    const base = caSkillPointBudget(level);
    const skills = { ...noSkills(), [CA_SKILL_KEYS[1]]: -2 };
    // -2 elsewhere buys 2 more points to spend here, capped by the 5 ceiling.
    expect(caSkillBounds(skills, CA_SKILL_KEYS[0], level).max).toBe(Math.min(5, base + 2));
  });

  it("survives a missing or junk skill map", () => {
    expect(caSkillBounds(null, CA_SKILL_KEYS[0], 1).current).toBe(0);
    expect(caSkillBounds(undefined, CA_SKILL_KEYS[0], 1).max).toBeGreaterThan(0);
    expect(caSkillBounds({ [CA_SKILL_KEYS[0]]: "3" } as any, CA_SKILL_KEYS[0], 1).current).toBe(3);
  });
});
