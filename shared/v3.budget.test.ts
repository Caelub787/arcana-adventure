import { describe, it, expect } from "vitest";
import {
  v3AttrPointBudget,
  v3SkillPointBudget,
  V3_MAX_NEGATIVE_SKILL_POINTS,
} from "./v3";

describe("v3AttrPointBudget", () => {
  it("gives 4 points at level 1", () => {
    expect(v3AttrPointBudget(1)).toBe(4);
  });

  it("does not add a bonus before level 3", () => {
    expect(v3AttrPointBudget(2)).toBe(4);
  });

  it("adds +1 every level divisible by 3", () => {
    expect(v3AttrPointBudget(3)).toBe(5);
    expect(v3AttrPointBudget(5)).toBe(5);
    expect(v3AttrPointBudget(6)).toBe(6);
    expect(v3AttrPointBudget(9)).toBe(7);
    expect(v3AttrPointBudget(12)).toBe(8);
  });

  it("clamps invalid/low levels to level 1", () => {
    expect(v3AttrPointBudget(0)).toBe(4);
    expect(v3AttrPointBudget(-5)).toBe(4);
    expect(v3AttrPointBudget(NaN as unknown as number)).toBe(4);
  });

  it("floors fractional levels", () => {
    expect(v3AttrPointBudget(3.9)).toBe(5);
  });
});

describe("v3SkillPointBudget", () => {
  it("gives 8 points at level 1", () => {
    expect(v3SkillPointBudget(1)).toBe(8);
  });

  it("adds +1 per level up", () => {
    expect(v3SkillPointBudget(2)).toBe(9);
    expect(v3SkillPointBudget(5)).toBe(12);
    expect(v3SkillPointBudget(10)).toBe(17);
  });

  it("clamps invalid/low levels to level 1", () => {
    expect(v3SkillPointBudget(0)).toBe(8);
    expect(v3SkillPointBudget(-3)).toBe(8);
    expect(v3SkillPointBudget(NaN as unknown as number)).toBe(8);
  });
});

describe("V3_MAX_NEGATIVE_SKILL_POINTS", () => {
  it("caps reclaimable negative skill points at 6", () => {
    expect(V3_MAX_NEGATIVE_SKILL_POINTS).toBe(6);
  });
});
