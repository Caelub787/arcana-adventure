import { describe, it, expect } from "vitest";
import {
  recommendPrice,
  RARITY_SURCHARGE,
  raritySurcharge,
} from "./ItemBuildRecipeEditor";

// ---------------------------------------------------------------------------
// Unit coverage for the build-recipe pricing math: recommendPrice() (round UP
// to a clean whole number so the recommended value always exceeds cost +
// markup) and the flat per-rarity surcharge table. There is no currency
// system anymore - item worth is a single flat number.
// ---------------------------------------------------------------------------

describe("recommendPrice — round UP to a clean whole number", () => {
  it("returns 0 for non-positive amounts", () => {
    expect(recommendPrice(0)).toBe(0);
    expect(recommendPrice(-10)).toBe(0);
  });

  it("rounds up to the nearest 5 in the 10-99 range", () => {
    expect(recommendPrice(23)).toBe(25);
    expect(recommendPrice(96)).toBe(100);
  });

  it("rounds up to the nearest 10 in the 100-999 range", () => {
    expect(recommendPrice(105)).toBe(110);
    expect(recommendPrice(340)).toBe(340);
  });

  it("rounds up to the nearest 50 at 1000+", () => {
    expect(recommendPrice(1001)).toBe(1050);
    expect(recommendPrice(1500)).toBe(1500);
  });

  it("leaves an amount that is already a clean multiple unchanged", () => {
    expect(recommendPrice(25)).toBe(25);
    expect(recommendPrice(100)).toBe(100);
    expect(recommendPrice(30)).toBe(30);
  });

  it("keeps sub-10 amounts as whole numbers", () => {
    expect(recommendPrice(7)).toBe(7);
    expect(recommendPrice(1)).toBe(1);
  });

  it("always recommends a value >= the input (round up never decreases)", () => {
    for (const v of [1, 7, 12, 45, 96, 105, 250, 999, 1500, 10001]) {
      expect(recommendPrice(v)).toBeGreaterThanOrEqual(v);
    }
  });
});

describe("RARITY_SURCHARGE — flat per-item rarity value", () => {
  it("matches the configured table (common 2, uncommon 5, rare 10, epic 30, legendary 50)", () => {
    expect(RARITY_SURCHARGE.common).toBe(2);
    expect(RARITY_SURCHARGE.uncommon).toBe(5);
    expect(RARITY_SURCHARGE.rare).toBe(10);
    expect(RARITY_SURCHARGE.epic).toBe(30);
    expect(RARITY_SURCHARGE.legendary).toBe(50);
  });

  it("raritySurcharge() is case-insensitive and defaults missing/unknown to common/0", () => {
    expect(raritySurcharge("Legendary")).toBe(50);
    expect(raritySurcharge("RARE")).toBe(10);
    expect(raritySurcharge(undefined)).toBe(2); // defaults to common
    expect(raritySurcharge(null)).toBe(2);
    expect(raritySurcharge("bogus")).toBe(0);
  });

  it("worked example: 2 common iron @2 + 1 common bronze @4, common output -> 20", () => {
    // iron: (2 + common 2) * 2 = 8; bronze: (4 + common 2) * 1 = 6
    const ingredientsValue = (2 + raritySurcharge("common")) * 2
      + (4 + raritySurcharge("common")) * 1;
    const madeRarity = raritySurcharge("common") * 1; // output qty 1
    const perUnit = Math.ceil((ingredientsValue + madeRarity) * 1.2);
    // (8 + 6 + 2) * 1.2 = 19.2 -> ceil 20 -> already clean
    expect(recommendPrice(perUnit)).toBe(20);
  });
});
