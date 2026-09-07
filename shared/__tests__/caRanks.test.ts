import { describe, it, expect } from "vitest";
import {
  CA_RANKS,
  CA_RANK_LADDER,
  caRankForEnergyPool,
  caRankLabel,
  caUsableEnergy,
  caPhysiqueState,
  caIsOverPhysique,
  caPhysiqueStatEffectTotal,
  caAuraOf,
  caAuraShapeOf,
  caAuraColorAt,
  CA_AURA_DEFAULT_COLOR,
  CA_STARTING_ENERGY,
  CA_STARTING_PHYSIQUE,
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

describe("Physique and overload", () => {
  // Physique deliberately does NOT cap the pool. Carrying more energy than
  // your body is built for is the interesting case, not an invalid one.
  it("lets the pool go over Physique and reports by how much", () => {
    const over = caPhysiqueState({ caPhysique: 3_733, caEnergyPool: 5_000 });
    expect(over).toMatchObject({ over: true, excess: 1_267, energyPool: 5_000 });
    expect(caIsOverPhysique({ caPhysique: 3_733, caEnergyPool: 5_000 })).toBe(true);
  });

  it("is not overloaded at or under Physique", () => {
    expect(caIsOverPhysique({ caPhysique: 3_733, caEnergyPool: 3_733 })).toBe(false);
    expect(caIsOverPhysique({ caPhysique: 3_733, caEnergyPool: 100 })).toBe(false);
    expect(caPhysiqueState({ caPhysique: 3_733, caEnergyPool: 3_733 }).excess).toBe(0);
  });

  // A character made before Physique existed has 0, and must not read as
  // permanently overloaded because of it.
  it("treats an unset Physique as no limit rather than a limit of zero", () => {
    expect(caIsOverPhysique({ caPhysique: 0, caEnergyPool: 4_288 })).toBe(false);
    expect(caIsOverPhysique({ caPhysique: null, caEnergyPool: 4_288 })).toBe(false);
    expect(caIsOverPhysique(null)).toBe(false);
  });

  it("rank still follows the pool once it is over Physique", () => {
    // The pool is what the rank is read from, and nothing clamps it, so going
    // over Physique carries the rank up with it.
    expect(caRankLabel(caPhysiqueState({ caPhysique: 100, caEnergyPool: 5_000 }).energyPool))
      .toBe("Gold 5");
  });
});

describe("overload effects", () => {
  const character = {
    caPhysique: 1_000,
    caEnergyPool: 2_000,
    caPhysiqueEffects: [
      { id: "a", target: "speed", amount: -10 },
      { id: "b", target: "speed", amount: -5 },
      { id: "c", target: "skillStealth", amount: -2 },
    ],
  };

  it("totals every effect on one target", () => {
    expect(caPhysiqueStatEffectTotal(character, "speed")).toBe(-15);
    expect(caPhysiqueStatEffectTotal(character, "skillStealth")).toBe(-2);
  });

  it("is zero for a target nothing targets", () => {
    expect(caPhysiqueStatEffectTotal(character, "flySpeed")).toBe(0);
    expect(caPhysiqueStatEffectTotal(character, "")).toBe(0);
  });

  // This is the whole difference from a wound: a wound's effects are live
  // while the wound is, and these are live only while the pool is over.
  it("goes quiet the moment the pool is back inside Physique", () => {
    expect(caPhysiqueStatEffectTotal({ ...character, caEnergyPool: 1_000 }, "speed")).toBe(0);
    expect(caPhysiqueStatEffectTotal({ ...character, caPhysique: 5_000 }, "speed")).toBe(0);
  });

  it("does nothing with an unset Physique, however many effects are set", () => {
    expect(caPhysiqueStatEffectTotal({ ...character, caPhysique: 0 }, "speed")).toBe(0);
  });

  it("survives junk in the stored array", () => {
    expect(caPhysiqueStatEffectTotal({ ...character, caPhysiqueEffects: null }, "speed")).toBe(0);
    expect(caPhysiqueStatEffectTotal({ ...character, caPhysiqueEffects: "nope" as any }, "speed")).toBe(0);
    expect(caPhysiqueStatEffectTotal({
      ...character,
      caPhysiqueEffects: [null, { target: "speed", amount: "-4" }, { target: "speed" }],
    } as any, "speed")).toBe(-4);
  });
});

describe("auras", () => {
  it("uses the character's own colour and shape", () => {
    expect(caAuraOf({ caAuraColor: "#FF5500", caAuraShape: "wisps" }))
      .toEqual({ color: "#FF5500", color2: null, angle: 180, shape: "wisps" });
  });

  // The shape list was replaced wholesale. Anyone who had already picked an
  // aura would otherwise have found it silently blank.
  it("maps shapes from the old list onto the new one", () => {
    expect(caAuraShapeOf("flame")).toBe("wisps");
    expect(caAuraShapeOf("ring")).toBe("rings");
    expect(caAuraShapeOf("bolt")).toBe("zigzags");
  });

  it("takes a second colour only alongside the character's own first", () => {
    const both = caAuraOf({ caAuraColor: "#FF5500", caAuraColor2: "#00AAFF", caAuraAngle: 90 });
    expect(both.color2).toBe("#00AAFF");
    expect(both.angle).toBe(90);
    // Half a gradient painted over someone else's fallback colour would be
    // someone else's aura.
    expect(caAuraOf({ caAuraColor2: "#00AAFF" }, "#3D77F0").color2).toBeNull();
    // A "gradient" between one colour and itself is not a gradient.
    expect(caAuraOf({ caAuraColor: "#FF5500", caAuraColor2: "#ff5500" }).color2).toBeNull();
  });

  it("wraps the gradient angle and falls back to straight down", () => {
    expect(caAuraOf({ caAuraColor: "#FF5500", caAuraAngle: 400 }).angle).toBe(40);
    expect(caAuraOf({ caAuraColor: "#FF5500", caAuraAngle: -90 }).angle).toBe(270);
    expect(caAuraOf({ caAuraColor: "#FF5500" }).angle).toBe(180);
  });

  it("reads a colour off the gradient for surfaces that can only take one", () => {
    expect(caAuraColorAt({ color: "#000000", color2: "#ffffff" }, 0.5)).toBe("#808080");
    expect(caAuraColorAt({ color: "#123456", color2: null }, 0.9)).toBe("#123456");
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
    expect(caAuraShapeOf("stars")).toBe("stars");
    expect(caAuraShapeOf("triangle")).toBe("none");
    expect(caAuraShapeOf(null)).toBe("none");
    expect(caAuraOf({ caAuraShape: "wobble" }).shape).toBe("none");
  });
});

describe("starting values", () => {
  it("starts C.A. characters at 10 Energy and 100 Physique", () => {
    expect(CA_STARTING_ENERGY).toBe(10);
    expect(CA_STARTING_PHYSIQUE).toBe(100);
  });

  // 100 has to be a real Physique, not the 0 that means "not set", or a new
  // character could never overload.
  it("makes the starting Physique a real one that can be exceeded", () => {
    expect(caIsOverPhysique({ caPhysique: CA_STARTING_PHYSIQUE, caEnergyPool: 101 })).toBe(true);
    expect(caIsOverPhysique({ caPhysique: CA_STARTING_PHYSIQUE, caEnergyPool: 100 })).toBe(false);
  });

  it("puts a starting character at the bottom of the ladder", () => {
    expect(caRankLabel(0)).toBe("Bronze 1");
  });
});
