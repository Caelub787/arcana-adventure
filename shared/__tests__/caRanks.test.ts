import { describe, it, expect } from "vitest";
import {
  CA_RANKS,
  CA_RANK_LADDER,
  caRankForEnergyPool,
  caRankLabel,
  caUsableEnergy,
  caClampEnergyPoolToPhysique,
  caAuraOf,
  caAuraShapeOf,
  CA_AURA_DEFAULT_COLOR,
} from "../ca";

describe("the C.A. rank ladder", () => {
  it("has five ranks of five stars and no Unranked", () => {
    expect(CA_RANKS.map((r) => r.name)).toEqual(["Bronze", "Silver", "Gold", "Obsidian", "Terran"]);
    for (const rank of CA_RANKS) expect(rank.stars.map((s) => s.star)).toEqual([1, 2, 3, 4, 5]);
    expect(CA_RANK_LADDER).toHaveLength(25);
  });

  it("starts Bronze at 0 so every character has a rank", () => {
    expect(CA_RANKS[0].stars[0].energyPool).toBe(0);
    expect(caRankLabel(0)).toBe("Bronze 1");
  });

  // One zero off the source table's figures, all the way up.
  it("carries the thresholds from the source table", () => {
    expect(CA_RANKS[0].stars.map((s) => s.energyPool)).toEqual([0, 20, 30, 40, 50]);
    expect(CA_RANKS[1].stars.map((s) => s.energyPool)).toEqual([100, 200, 300, 400, 500]);
    expect(CA_RANKS[2].stars.map((s) => s.energyPool)).toEqual([1_000, 2_000, 3_000, 4_000, 5_000]);
    expect(CA_RANKS[3].stars.map((s) => s.energyPool)).toEqual([10_000, 20_000, 30_000, 40_000, 50_000]);
    expect(CA_RANKS[4].stars.map((s) => s.energyPool)).toEqual([100_000, 200_000, 300_000, 400_000, 500_000]);
  });

  it("rises through the ladder without gaps", () => {
    const pools = CA_RANK_LADDER.map((r) => r.star.energyPool);
    for (let i = 1; i < pools.length; i++) expect(pools[i]).toBeGreaterThan(pools[i - 1]);
  });

  it("keeps a pool on its rung until the next one is actually reached", () => {
    expect(caRankLabel(19)).toBe("Bronze 1");
    expect(caRankLabel(20)).toBe("Bronze 2");
    expect(caRankLabel(99)).toBe("Bronze 5");
    expect(caRankLabel(100)).toBe("Silver 1");
    expect(caRankLabel(999)).toBe("Silver 5");
    expect(caRankLabel(1_000)).toBe("Gold 1");
    expect(caRankLabel(4_288)).toBe("Gold 4");
    expect(caRankLabel(10_000)).toBe("Obsidian 1");
    expect(caRankLabel(100_000)).toBe("Terran 1");
  });

  it("stays at the top rung above the ladder, and at the bottom below it", () => {
    expect(caRankLabel(9_999_999)).toBe("Terran 5");
    expect(caRankLabel(-5)).toBe("Bronze 1");
    expect(caRankLabel(null)).toBe("Bronze 1");
    expect(caRankLabel(undefined)).toBe("Bronze 1");
  });

  it("reports the next rung, and nothing past the last one", () => {
    expect(caRankForEnergyPool(0).nextEnergyPool).toBe(20);
    expect(caRankForEnergyPool(50).nextEnergyPool).toBe(100);
    expect(caRankForEnergyPool(500_000).nextEnergyPool).toBeNull();
  });

  it("makes usable energy half the pool", () => {
    expect(caUsableEnergy(0)).toBe(0);
    expect(caUsableEnergy(4_288)).toBe(2_144);
    expect(caUsableEnergy(500_000)).toBe(250_000);
    // Odd pools round down rather than handing out half a point.
    expect(caUsableEnergy(7)).toBe(3);
    expect(caUsableEnergy(-10)).toBe(0);
    expect(caUsableEnergy(null)).toBe(0);
  });

  it("matches the source table's Usable Energy column at every rung", () => {
    for (const { star } of CA_RANK_LADDER) {
      expect(caUsableEnergy(star.energyPool)).toBe(star.energyPool / 2);
    }
  });
});

describe("Physique caps the Energy Pool", () => {
  it("holds the pool at the character's Physique", () => {
    expect(caClampEnergyPoolToPhysique(5_000, 3_733)).toBe(3_733);
    expect(caClampEnergyPoolToPhysique(1_000, 3_733)).toBe(1_000);
    expect(caClampEnergyPoolToPhysique(3_733, 3_733)).toBe(3_733);
  });

  // A character made before Physique existed has 0, and shouldn't lose the
  // pool they already had because of it.
  it("treats an unset Physique as no cap rather than a cap of zero", () => {
    expect(caClampEnergyPoolToPhysique(4_288, 0)).toBe(4_288);
    expect(caClampEnergyPoolToPhysique(4_288, null)).toBe(4_288);
    expect(caClampEnergyPoolToPhysique(4_288, undefined)).toBe(4_288);
  });

  it("never returns a negative pool", () => {
    expect(caClampEnergyPoolToPhysique(-50, 100)).toBe(0);
  });
});

describe("auras", () => {
  it("uses the character's own colour and shape", () => {
    expect(caAuraOf({ caAuraColor: "#FF5500", caAuraShape: "flame" }))
      .toEqual({ color: "#FF5500", shape: "flame" });
  });

  // The fallback is what keeps an auraless character looking the way it did
  // before auras existed, instead of every one of them turning amber.
  it("falls back to the colour the caller was already using", () => {
    expect(caAuraOf(null, "#3D77F0").color).toBe("#3D77F0");
    expect(caAuraOf({ caAuraColor: null }, "#3D77F0").color).toBe("#3D77F0");
    expect(caAuraOf(undefined, undefined).color).toBe(CA_AURA_DEFAULT_COLOR);
  });

  it("rejects anything that isn't a six-digit hex colour", () => {
    for (const bad of ["red", "#fff", "#12345g", "", "  ", "rgb(1,2,3)", 42 as any]) {
      expect(caAuraOf({ caAuraColor: bad as any }, "#3D77F0").color).toBe("#3D77F0");
    }
    expect(caAuraOf({ caAuraColor: "  #abcdef  " }).color).toBe("#abcdef");
  });

  it("falls back to no shape for anything unrecognised", () => {
    expect(caAuraShapeOf("star")).toBe("star");
    expect(caAuraShapeOf("triangle")).toBe("none");
    expect(caAuraShapeOf(null)).toBe("none");
    expect(caAuraOf({ caAuraShape: "wobble" }).shape).toBe("none");
  });
});
