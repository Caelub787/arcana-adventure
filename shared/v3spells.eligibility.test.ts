import { describe, it, expect } from "vitest";
import {
  evaluateV3ElementEligibility,
  type V3ElementCondition,
  type V3CharacterEligibilityInput,
} from "@shared/v3spells";

const emptyChar: V3CharacterEligibilityInput = { knowledgeNames: [], items: [] };

describe("evaluateV3ElementEligibility", () => {
  it("no conditions => freely usable with empty summary", () => {
    const res = evaluateV3ElementEligibility([], emptyChar);
    expect(res.usable).toBe(true);
    expect(res.freeToUse).toBe(true);
    expect(res.requirements).toEqual([]);
    expect(res.requirementSummary).toBe("");
    expect(res.consumeOptions).toEqual([]);
    expect(res.consumeItem).toBeUndefined();
  });

  it("null/undefined conditions => freely usable", () => {
    const nullRes = evaluateV3ElementEligibility(null, emptyChar);
    const undefRes = evaluateV3ElementEligibility(undefined, emptyChar);
    for (const res of [nullRes, undefRes]) {
      expect(res.usable).toBe(true);
      expect(res.freeToUse).toBe(true);
      expect(res.requirementSummary).toBe("");
    }
  });

  describe("knowledge-only condition", () => {
    const conditions: V3ElementCondition[] = [
      { conditionType: "knowledge", knowledgeName: "Hydromancy" },
    ];

    it("summary reads exactly and is unusable when knowledge is missing", () => {
      const res = evaluateV3ElementEligibility(conditions, emptyChar);
      expect(res.usable).toBe(false);
      expect(res.freeToUse).toBe(false);
      expect(res.requirementSummary).toBe("Requires Knowledge: Hydromancy");
      expect(res.requirements).toEqual(["Requires Knowledge: Hydromancy"]);
      expect(res.consumeOptions).toEqual([]);
      expect(res.consumeItem).toBeNull();
    });

    it("usable and free when the character knows it (case-insensitive)", () => {
      const res = evaluateV3ElementEligibility(conditions, {
        knowledgeNames: ["hydromancy"],
        items: [],
      });
      expect(res.usable).toBe(true);
      expect(res.freeToUse).toBe(true);
      expect(res.requirementSummary).toBe("Requires Knowledge: Hydromancy");
      expect(res.consumeOptions).toEqual([]);
      expect(res.consumeItem).toBeNull();
    });
  });

  describe("item-only condition (non-consumed)", () => {
    const conditions: V3ElementCondition[] = [
      { conditionType: "item", itemId: "item-pearl", itemName: "Pearl", consumed: false },
    ];

    it("summary reads exactly and is unusable without the item", () => {
      const res = evaluateV3ElementEligibility(conditions, emptyChar);
      expect(res.usable).toBe(false);
      expect(res.freeToUse).toBe(false);
      expect(res.requirementSummary).toBe("Requires a Pearl");
      expect(res.requirements).toEqual(["Requires item: Pearl"]);
      expect(res.consumeOptions).toEqual([]);
    });

    it("usable and free when the (non-consumed) item is owned by id", () => {
      const res = evaluateV3ElementEligibility(conditions, {
        knowledgeNames: [],
        items: [{ templateItemId: "item-pearl", name: "Pearl" }],
      });
      expect(res.usable).toBe(true);
      expect(res.freeToUse).toBe(true);
      expect(res.consumeOptions).toEqual([]);
      expect(res.consumeItem).toBeNull();
    });

    it("matches the item by name when no id match exists", () => {
      const res = evaluateV3ElementEligibility(conditions, {
        knowledgeNames: [],
        items: [{ templateItemId: null, name: "pearl" }],
      });
      expect(res.usable).toBe(true);
      expect(res.freeToUse).toBe(true);
    });
  });

  describe("item-only condition (consumed)", () => {
    const conditions: V3ElementCondition[] = [
      { conditionType: "item", itemId: "item-pearl", itemName: "Pearl", consumed: true },
    ];

    it("summary marks the item as consumed and is unusable without it", () => {
      const res = evaluateV3ElementEligibility(conditions, emptyChar);
      expect(res.usable).toBe(false);
      expect(res.freeToUse).toBe(false);
      expect(res.requirementSummary).toBe("Requires a Pearl (consumed)");
      expect(res.requirements).toEqual(["Requires item: Pearl (consumed)"]);
      expect(res.consumeOptions).toEqual([]);
    });

    it("usable but not free when only a consumable path is satisfied", () => {
      const res = evaluateV3ElementEligibility(conditions, {
        knowledgeNames: [],
        items: [{ templateItemId: "item-pearl", name: "Pearl" }],
      });
      expect(res.usable).toBe(true);
      expect(res.freeToUse).toBe(false);
      expect(res.consumeOptions).toEqual([{ itemId: "item-pearl", name: "Pearl" }]);
      expect(res.consumeItem).toEqual({ itemId: "item-pearl", name: "Pearl" });
    });
  });

  describe("mixed OR'd conditions (knowledge OR consumed item)", () => {
    const conditions: V3ElementCondition[] = [
      { conditionType: "knowledge", knowledgeName: "Hydromancy" },
      { conditionType: "item", itemId: "item-pearl", itemName: "Pearl", consumed: true },
    ];

    it("combines both unlock paths into one OR'd summary", () => {
      const res = evaluateV3ElementEligibility(conditions, emptyChar);
      expect(res.usable).toBe(false);
      expect(res.requirementSummary).toBe(
        "Requires Knowledge: Hydromancy, OR a Pearl (consumed)",
      );
      expect(res.requirements).toEqual([
        "Requires Knowledge: Hydromancy",
        "Requires item: Pearl (consumed)",
      ]);
    });

    it("prefers the free Knowledge path over consuming the item", () => {
      const res = evaluateV3ElementEligibility(conditions, {
        knowledgeNames: ["Hydromancy"],
        items: [{ templateItemId: "item-pearl", name: "Pearl" }],
      });
      expect(res.usable).toBe(true);
      expect(res.freeToUse).toBe(true);
      expect(res.consumeOptions).toEqual([]);
      expect(res.consumeItem).toBeNull();
    });

    it("falls back to consuming the item when Knowledge is absent", () => {
      const res = evaluateV3ElementEligibility(conditions, {
        knowledgeNames: [],
        items: [{ templateItemId: "item-pearl", name: "Pearl" }],
      });
      expect(res.usable).toBe(true);
      expect(res.freeToUse).toBe(false);
      expect(res.consumeOptions).toEqual([{ itemId: "item-pearl", name: "Pearl" }]);
      expect(res.consumeItem).toEqual({ itemId: "item-pearl", name: "Pearl" });
    });
  });

  it("offers multiple consume options when several consumable paths match", () => {
    const conditions: V3ElementCondition[] = [
      { conditionType: "item", itemId: "item-pearl", itemName: "Pearl", consumed: true },
      { conditionType: "item", itemId: "item-coral", itemName: "Coral", consumed: true },
    ];
    const res = evaluateV3ElementEligibility(conditions, {
      knowledgeNames: [],
      items: [
        { templateItemId: "item-pearl", name: "Pearl" },
        { templateItemId: "item-coral", name: "Coral" },
      ],
    });
    expect(res.usable).toBe(true);
    expect(res.freeToUse).toBe(false);
    expect(res.requirementSummary).toBe("Requires a Pearl (consumed), OR a Coral (consumed)");
    expect(res.consumeOptions).toEqual([
      { itemId: "item-pearl", name: "Pearl" },
      { itemId: "item-coral", name: "Coral" },
    ]);
    expect(res.consumeItem).toEqual({ itemId: "item-pearl", name: "Pearl" });
  });
});
