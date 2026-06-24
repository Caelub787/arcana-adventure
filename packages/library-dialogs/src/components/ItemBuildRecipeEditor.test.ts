import { describe, it, expect } from "vitest";
import {
  CURRENCY_RATE,
  denominate,
  recommendFromCopper,
  RARITY_SURCHARGE,
  raritySurcharge,
} from "./ItemBuildRecipeEditor";

// ---------------------------------------------------------------------------
// Unit coverage for the build-recipe pricing math: the currency conversion
// rates, denominate() (express an exact copper amount as the largest single
// denomination), and recommendFromCopper() (round UP to a clean denomination
// so the price always exceeds cost + markup). The canonical worked example is
// 8 silver of ingredients -> 96 copper after +20% markup -> recommend 1 gold.
// ---------------------------------------------------------------------------

describe("CURRENCY_RATE — copper-equivalent conversion", () => {
  it("uses base-10 currency tiers (10c=1s, 10s=1g, 10g=1pt)", () => {
    expect(CURRENCY_RATE.copper).toBe(1);
    expect(CURRENCY_RATE.silver).toBe(10);
    expect(CURRENCY_RATE.gold).toBe(100);
    expect(CURRENCY_RATE.platinum).toBe(1000);
  });

  it("converts a priced ingredient into copper via price * rate * quantity", () => {
    // 8 silver = 8 * 10 = 80 copper for one unit.
    expect(8 * CURRENCY_RATE.silver).toBe(80);
    // 2 gold x 3 = 600 copper.
    expect(2 * CURRENCY_RATE.gold * 3).toBe(600);
  });
});

describe("denominate — express exact copper as the largest single denomination", () => {
  it("returns 0 copper for non-positive amounts", () => {
    expect(denominate(0)).toEqual({ price: 0, currency: "copper" });
    expect(denominate(-50)).toEqual({ price: 0, currency: "copper" });
  });

  it("collapses to platinum when evenly divisible by 1000", () => {
    expect(denominate(1000)).toEqual({ price: 1, currency: "platinum" });
    expect(denominate(3000)).toEqual({ price: 3, currency: "platinum" });
  });

  it("collapses to gold when evenly divisible by 100 (but not 1000)", () => {
    expect(denominate(100)).toEqual({ price: 1, currency: "gold" });
    expect(denominate(500)).toEqual({ price: 5, currency: "gold" });
  });

  it("collapses to silver when evenly divisible by 10 (but not 100)", () => {
    expect(denominate(10)).toEqual({ price: 1, currency: "silver" });
    expect(denominate(70)).toEqual({ price: 7, currency: "silver" });
  });

  it("stays in copper when not evenly divisible by a higher tier", () => {
    expect(denominate(7)).toEqual({ price: 7, currency: "copper" });
    expect(denominate(96)).toEqual({ price: 96, currency: "copper" });
    expect(denominate(105)).toEqual({ price: 105, currency: "copper" });
  });
});

describe("recommendFromCopper — round UP to a clean denomination", () => {
  it("returns 0 copper for non-positive amounts", () => {
    expect(recommendFromCopper(0)).toEqual({ price: 0, currency: "copper" });
    expect(recommendFromCopper(-10)).toEqual({ price: 0, currency: "copper" });
  });

  it("rounds the canonical 96 copper up to 1 gold", () => {
    // 8 silver ingredients -> 80c -> *1.2 = 96c -> round up to 100c -> 1 gold.
    expect(recommendFromCopper(96)).toEqual({ price: 1, currency: "gold" });
  });

  it("rounds up to the next whole unit of the largest tier <= amount", () => {
    // Largest tier <= 105 is 100, so round up to 200c = 2 gold.
    expect(recommendFromCopper(105)).toEqual({ price: 2, currency: "gold" });
    // Largest tier <= 45 is 10, round up to 50c = 5 silver.
    expect(recommendFromCopper(45)).toEqual({ price: 5, currency: "silver" });
    // Largest tier <= 1500 is 1000, round up to 2000c = 2 platinum.
    expect(recommendFromCopper(1500)).toEqual({ price: 2, currency: "platinum" });
  });

  it("leaves an amount that is already a clean tier multiple unchanged", () => {
    expect(recommendFromCopper(100)).toEqual({ price: 1, currency: "gold" });
    expect(recommendFromCopper(1000)).toEqual({ price: 1, currency: "platinum" });
    expect(recommendFromCopper(30)).toEqual({ price: 3, currency: "silver" });
  });

  it("keeps sub-10 copper amounts in copper", () => {
    // Largest tier <= 7 is 1, round up stays 7c.
    expect(recommendFromCopper(7)).toEqual({ price: 7, currency: "copper" });
    expect(recommendFromCopper(1)).toEqual({ price: 1, currency: "copper" });
  });

  it("always recommends a price >= the input copper (round up never decreases)", () => {
    for (const c of [1, 7, 12, 45, 96, 105, 250, 999, 1500, 10001]) {
      const { price, currency } = recommendFromCopper(c);
      expect(price * CURRENCY_RATE[currency]).toBeGreaterThanOrEqual(c);
    }
  });
});

describe("RARITY_SURCHARGE — flat per-item rarity cost (in copper)", () => {
  it("matches the configured table (common 2s, uncommon 5s, rare 1g, epic 3g, legendary 5g)", () => {
    expect(RARITY_SURCHARGE.common).toBe(20);
    expect(RARITY_SURCHARGE.uncommon).toBe(50);
    expect(RARITY_SURCHARGE.rare).toBe(100);
    expect(RARITY_SURCHARGE.epic).toBe(300);
    expect(RARITY_SURCHARGE.legendary).toBe(500);
  });

  it("raritySurcharge() is case-insensitive and defaults missing/unknown to common/0", () => {
    expect(raritySurcharge("Legendary")).toBe(500);
    expect(raritySurcharge("RARE")).toBe(100);
    expect(raritySurcharge(undefined)).toBe(20); // defaults to common
    expect(raritySurcharge(null)).toBe(20);
    expect(raritySurcharge("bogus")).toBe(0);
  });

  it("worked example: 2 common iron @2s + 1 common bronze @4s, common output -> 2 gold", () => {
    // iron: (2s=20c + common 20c) * 2 = 80c; bronze: (4s=40c + common 20c) * 1 = 60c
    const ingredientsCopper = (2 * CURRENCY_RATE.silver + raritySurcharge("common")) * 2
      + (4 * CURRENCY_RATE.silver + raritySurcharge("common")) * 1;
    const madeRarity = raritySurcharge("common") * 1; // output qty 1
    const perUnit = Math.ceil(((ingredientsCopper + madeRarity) * 1.2) / 1);
    // 140 + 60 ... = 160 * 1.2 = 192 -> round up to 200c = 2 gold
    expect(recommendFromCopper(perUnit)).toEqual({ price: 2, currency: "gold" });
  });
});
