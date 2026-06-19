import { describe, it, expect, beforeEach, vi } from "vitest";
import type { V3ElementCondition } from "@shared/v3spells";

// ---------------------------------------------------------------------------
// consumeV3TechniqueItems pulls in the live WebSocket client, the query client
// and the roll-notification feed at module load. None of those exist outside
// the browser, and consumption itself only talks to api.updateItem /
// api.deleteItem, so we replace the whole module surface with spies and assert
// exactly which inventory mutation fired.
// ---------------------------------------------------------------------------
const updateItem = vi.fn().mockResolvedValue(undefined);
const deleteItem = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
  gameWs: {
    isJoinedToCampaign: () => false,
    sendCombatEnergy: vi.fn(),
  },
  api: {
    updateItem: (...args: any[]) => updateItem(...args),
    deleteItem: (...args: any[]) => deleteItem(...args),
    updateCharacter: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("@/components/game/RollNotification", () => ({
  triggerRollNotification: vi.fn(),
}));

import {
  consumeV3TechniqueItems,
  type V3CastTechnique,
  type V3WeaponInventoryItem,
} from "./v3weaponcast";

function technique(requirements: V3ElementCondition[] | null): V3CastTechnique {
  return { name: "Cleave", requirements };
}

const KNOWLEDGE: V3ElementCondition = {
  conditionType: "knowledge",
  knowledgeName: "Swordsmanship",
};
const CONSUMABLE_PEARL: V3ElementCondition = {
  conditionType: "item",
  itemId: "tpl-pearl",
  itemName: "Pearl",
  consumed: true,
};
const NONCONSUMABLE_WAND: V3ElementCondition = {
  conditionType: "item",
  itemId: "tpl-wand",
  itemName: "Wand",
  consumed: false,
};

function pearl(overrides: Partial<V3WeaponInventoryItem> = {}): V3WeaponInventoryItem {
  return { id: "inv-pearl", templateItemId: "tpl-pearl", name: "Pearl", quantity: 3, ...overrides };
}

describe("consumeV3TechniqueItems", () => {
  beforeEach(() => {
    updateItem.mockClear();
    deleteItem.mockClear();
  });

  it("no-ops when the technique has no requirements", async () => {
    await consumeV3TechniqueItems(technique(null), [pearl()], []);
    await consumeV3TechniqueItems(technique([]), [pearl()], []);
    expect(updateItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("does not consume when a Knowledge path satisfies the requirement", async () => {
    // Even though a consumable Pearl is also present, the known Knowledge is a
    // free path, so nothing is charged.
    await consumeV3TechniqueItems(
      technique([KNOWLEDGE, CONSUMABLE_PEARL]),
      [pearl()],
      ["Swordsmanship"],
    );
    expect(updateItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("does not consume when a non-consumable item satisfies the requirement", async () => {
    // A non-consumable Wand is a free path; the Pearl (consumed) is never touched.
    await consumeV3TechniqueItems(
      technique([NONCONSUMABLE_WAND, CONSUMABLE_PEARL]),
      [
        { id: "inv-wand", templateItemId: "tpl-wand", name: "Wand", quantity: 1 },
        pearl(),
      ],
      [],
    );
    expect(updateItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("decrements quantity when a consumable is the sole satisfying path (qty > 1)", async () => {
    await consumeV3TechniqueItems(technique([CONSUMABLE_PEARL]), [pearl({ quantity: 3 })], []);
    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem).toHaveBeenCalledWith("inv-pearl", { quantity: 2 });
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("deletes the item when the sole consumable path is at quantity 1", async () => {
    await consumeV3TechniqueItems(technique([CONSUMABLE_PEARL]), [pearl({ quantity: 1 })], []);
    expect(deleteItem).toHaveBeenCalledTimes(1);
    expect(deleteItem).toHaveBeenCalledWith("inv-pearl");
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("treats a missing quantity as 1 and deletes", async () => {
    await consumeV3TechniqueItems(
      technique([CONSUMABLE_PEARL]),
      [{ id: "inv-pearl", templateItemId: "tpl-pearl", name: "Pearl" }],
      [],
    );
    expect(deleteItem).toHaveBeenCalledWith("inv-pearl");
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("matches the owned item by templateItemId", async () => {
    // The inventory item's name differs, but the templateItemId matches the
    // condition's itemId, so it is still consumed.
    await consumeV3TechniqueItems(
      technique([CONSUMABLE_PEARL]),
      [{ id: "inv-x", templateItemId: "tpl-pearl", name: "Renamed Pearl", quantity: 2 }],
      [],
    );
    expect(updateItem).toHaveBeenCalledWith("inv-x", { quantity: 1 });
  });

  it("falls back to a case-insensitive name match when there is no template id", async () => {
    await consumeV3TechniqueItems(
      technique([CONSUMABLE_PEARL]),
      [{ id: "inv-y", templateItemId: null, name: "  pearl  ", quantity: 4 }],
      [],
    );
    expect(updateItem).toHaveBeenCalledWith("inv-y", { quantity: 3 });
  });

  it("does not consume when the consumable requirement is unmet (no matching item)", async () => {
    // The condition needs a Pearl but the bag holds only an unrelated item, so
    // the technique is not usable via any path and nothing is charged.
    await consumeV3TechniqueItems(
      technique([CONSUMABLE_PEARL]),
      [{ id: "inv-z", templateItemId: "tpl-rock", name: "Rock", quantity: 5 }],
      [],
    );
    expect(updateItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });
});
