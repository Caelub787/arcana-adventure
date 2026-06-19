import { describe, it, expect } from "vitest";
import {
  v3ManaCost,
  v3CraftDc,
  v3ElementCount,
  v3LevelDice,
  v3LevelDiceNotation,
  v3LevelExtraMana,
  V3_REACHES,
  V3_DURATIONS,
  type V3SpellComposition,
  type V3SpellSecondary,
} from "@shared/v3spells";

// Build a minimal valid-shaped composition. Only the fields read by the math
// (core, secondaries, reach, duration) matter for these tests.
function comp(overrides: Partial<V3SpellComposition> = {}): V3SpellComposition {
  return {
    core: "fire",
    secondaries: [],
    intent: "destroy",
    delivery: "projectile",
    reach: "self", // index 0
    duration: "instant", // index 0
    ...overrides,
  };
}

function secondaries(n: number): V3SpellSecondary[] {
  return Array.from({ length: n }, (_, i) => ({
    element: i % 2 === 0 ? "water" : "air",
    role: "catalyst",
  }));
}

describe("v3ElementCount", () => {
  it("counts core only when no secondaries", () => {
    expect(v3ElementCount(comp())).toBe(1);
  });

  it("counts core + secondaries", () => {
    expect(v3ElementCount(comp({ secondaries: secondaries(2) }))).toBe(3);
    expect(v3ElementCount(comp({ secondaries: secondaries(5) }))).toBe(6);
  });

  it("treats missing secondaries array as zero", () => {
    expect(v3ElementCount(comp({ secondaries: undefined as any }))).toBe(1);
  });
});

describe("v3ManaCost", () => {
  it("single element, Self reach, Instant duration => 1", () => {
    expect(v3ManaCost(comp())).toBe(1);
  });

  it("adds 1 mana per element", () => {
    expect(v3ManaCost(comp({ secondaries: secondaries(1) }))).toBe(2);
    expect(v3ManaCost(comp({ secondaries: secondaries(3) }))).toBe(4);
  });

  it("adds 1 mana per reach slot above Self", () => {
    // Self=0, touch=1, close=2, near=3, far=4, extreme=5, unlimited=6
    expect(v3ManaCost(comp({ reach: "touch" }))).toBe(1 + 1);
    expect(v3ManaCost(comp({ reach: "near" }))).toBe(1 + 3);
    expect(v3ManaCost(comp({ reach: "unlimited" }))).toBe(1 + 6);
  });

  it("adds 1 mana per duration slot above Instant", () => {
    // instant=0, brief=1, short=2, medium=3, long=4, permanent=5, concentration=6, until_triggered=7
    expect(v3ManaCost(comp({ duration: "brief" }))).toBe(1 + 1);
    expect(v3ManaCost(comp({ duration: "long" }))).toBe(1 + 4);
    expect(v3ManaCost(comp({ duration: "until_triggered" }))).toBe(1 + 7);
  });

  it("combines element count + reach slot + duration slot", () => {
    // 3 elements + near(3) + medium(3) = 3 + 3 + 3 = 9
    const c = comp({ secondaries: secondaries(2), reach: "near", duration: "medium" });
    expect(v3ManaCost(c)).toBe(9);
  });

  it("matches the maximal composition", () => {
    // 1 + secondaries 4 (=5 elements) + unlimited(6) + until_triggered(7) = 18
    const c = comp({ secondaries: secondaries(4), reach: "unlimited", duration: "until_triggered" });
    expect(v3ManaCost(c)).toBe(5 + 6 + 7);
  });

  it("reach/duration indices line up with their canonical option order", () => {
    V3_REACHES.forEach((r, idx) => {
      expect(v3ManaCost(comp({ reach: r.key }))).toBe(1 + idx);
    });
    V3_DURATIONS.forEach((d, idx) => {
      expect(v3ManaCost(comp({ duration: d.key }))).toBe(1 + idx);
    });
  });

  it("unknown reach/duration keys fall back to slot 0", () => {
    expect(v3ManaCost(comp({ reach: "bogus" }))).toBe(1);
    expect(v3ManaCost(comp({ duration: "bogus" }))).toBe(1);
  });
});

describe("v3CraftDc", () => {
  it("1 element => DC 0 (auto-success)", () => {
    expect(v3CraftDc(comp())).toBe(0);
  });

  it("scales as (n - 1) * 6", () => {
    expect(v3CraftDc(comp({ secondaries: secondaries(1) }))).toBe(6); // 2 elements
    expect(v3CraftDc(comp({ secondaries: secondaries(2) }))).toBe(12); // 3 elements
    expect(v3CraftDc(comp({ secondaries: secondaries(3) }))).toBe(18); // 4 elements
    expect(v3CraftDc(comp({ secondaries: secondaries(9) }))).toBe(54); // 10 elements
  });

  it("never goes negative", () => {
    expect(v3CraftDc(comp({ secondaries: undefined as any }))).toBe(0);
  });
});

describe("v3LevelDice", () => {
  it("levels 1-4: single die, sides cycle d6/d8/d10/d12", () => {
    expect(v3LevelDice(1)).toEqual({ count: 1, sides: 6 });
    expect(v3LevelDice(2)).toEqual({ count: 1, sides: 8 });
    expect(v3LevelDice(3)).toEqual({ count: 1, sides: 10 });
    expect(v3LevelDice(4)).toEqual({ count: 1, sides: 12 });
  });

  it("die count grows by one every 4 levels", () => {
    expect(v3LevelDice(5)).toEqual({ count: 2, sides: 6 });
    expect(v3LevelDice(8)).toEqual({ count: 2, sides: 12 });
    expect(v3LevelDice(9)).toEqual({ count: 3, sides: 6 });
    expect(v3LevelDice(12)).toEqual({ count: 3, sides: 12 });
    expect(v3LevelDice(13)).toEqual({ count: 4, sides: 6 });
  });

  it("has no upper bound on level", () => {
    // level 101 -> count = 1 + floor(100/4) = 26, sides = (100 % 4)=0 -> d6
    expect(v3LevelDice(101)).toEqual({ count: 26, sides: 6 });
  });

  it("clamps non-positive / non-finite / fractional levels to level 1 floor", () => {
    expect(v3LevelDice(0)).toEqual({ count: 1, sides: 6 });
    expect(v3LevelDice(-5)).toEqual({ count: 1, sides: 6 });
    expect(v3LevelDice(NaN as any)).toEqual({ count: 1, sides: 6 });
    expect(v3LevelDice(2.9)).toEqual({ count: 1, sides: 8 }); // floors to 2
  });
});

describe("v3LevelDiceNotation", () => {
  it("renders count d sides", () => {
    expect(v3LevelDiceNotation(1)).toBe("1d6");
    expect(v3LevelDiceNotation(4)).toBe("1d12");
    expect(v3LevelDiceNotation(5)).toBe("2d6");
    expect(v3LevelDiceNotation(9)).toBe("3d6");
  });
});

describe("v3LevelExtraMana", () => {
  it("level 1 = 0 extra, then +1 per level", () => {
    expect(v3LevelExtraMana(1)).toBe(0);
    expect(v3LevelExtraMana(2)).toBe(1);
    expect(v3LevelExtraMana(5)).toBe(4);
    expect(v3LevelExtraMana(10)).toBe(9);
  });

  it("floors at 0 for non-positive / non-finite levels", () => {
    expect(v3LevelExtraMana(0)).toBe(0);
    expect(v3LevelExtraMana(-3)).toBe(0);
    expect(v3LevelExtraMana(NaN as any)).toBe(0);
  });

  it("floors fractional levels before subtracting", () => {
    expect(v3LevelExtraMana(3.9)).toBe(2);
  });
});
