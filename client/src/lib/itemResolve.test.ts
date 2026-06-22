import { describe, it, expect } from "vitest";
import { resolveLiveOwnedItemId, dedupeLibraryTemplates, runeSignature } from "./itemResolve";

// ---------------------------------------------------------------------------
// Regression tests for the AA V3 item-resolution + library-dedup helpers
// (Task #241). These cover the two reported failure modes:
//   - duplicate library entries after re-adding an item
//   - "Host item not found" / "Weapon not found" from a stale/stacked id
// ---------------------------------------------------------------------------

describe("runeSignature", () => {
  it("is empty for an item with no runes", () => {
    expect(runeSignature({})).toBe("");
    expect(runeSignature({ socketedRunes: [] })).toBe("");
    expect(runeSignature({ socketedRunes: null })).toBe("");
  });

  it("is order-independent (sorts slots)", () => {
    const a = { socketedRunes: [{ slotIndex: 1, runeItemId: "r2" }, { slotIndex: 0, runeItemId: "r1" }] };
    const b = { socketedRunes: [{ slotIndex: 0, runeItemId: "r1" }, { slotIndex: 1, runeItemId: "r2" }] };
    expect(runeSignature(a)).toBe(runeSignature(b));
  });

  it("differs between a runed and a plain copy", () => {
    const runed = { socketedRunes: [{ slotIndex: 0, runeItemId: "r1" }] };
    expect(runeSignature(runed)).not.toBe(runeSignature({}));
  });
});

describe("resolveLiveOwnedItemId", () => {
  it("returns the exact id when the prop id is still a live owned row", () => {
    const items = [{ id: "a" }, { id: "b" }];
    expect(resolveLiveOwnedItemId({ id: "b" }, items)).toBe("b");
  });

  it("resolves a stale id by templateItemId + rune signature", () => {
    // The prop carries an old id that no longer exists (e.g. item was re-added
    // and got a fresh id). The live owned row shares the template link + runes.
    const stale = {
      id: "old-id",
      templateItemId: "tmpl-1",
      name: "Iron Sword",
      itemType: "weapon",
      socketedRunes: [{ slotIndex: 0, runeItemId: "r1" }],
    };
    const items = [
      { id: "new-id", templateItemId: "tmpl-1", name: "Iron Sword", itemType: "weapon", socketedRunes: [{ slotIndex: 0, runeItemId: "r1" }] },
    ];
    expect(resolveLiveOwnedItemId(stale, items)).toBe("new-id");
  });

  it("resolves a stale id by name + type + rune signature when no template link", () => {
    const stale = { id: "old", name: "Iron Sword", itemType: "weapon" };
    const items = [{ id: "live", name: "Iron Sword", itemType: "weapon" }];
    expect(resolveLiveOwnedItemId(stale, items)).toBe("live");
  });

  it("does NOT match a plain copy when the prop is runed (and vice versa)", () => {
    const runed = { id: "old", name: "Iron Sword", itemType: "weapon", socketedRunes: [{ slotIndex: 0, runeItemId: "r1" }] };
    const onlyPlain = [{ id: "plain", name: "Iron Sword", itemType: "weapon" }];
    expect(resolveLiveOwnedItemId(runed, onlyPlain)).toBeUndefined();
  });

  it("picks the correctly-runed copy among multiple identical-named weapons", () => {
    const propRuned = { id: "stale", name: "Iron Sword", itemType: "weapon", socketedRunes: [{ slotIndex: 0, runeItemId: "fire" }] };
    const items = [
      { id: "plain-copy", name: "Iron Sword", itemType: "weapon" },
      { id: "fire-copy", name: "Iron Sword", itemType: "weapon", socketedRunes: [{ slotIndex: 0, runeItemId: "fire" }] },
    ];
    expect(resolveLiveOwnedItemId(propRuned, items)).toBe("fire-copy");
  });

  it("returns undefined (blocks the action) when no live owned row matches", () => {
    expect(resolveLiveOwnedItemId({ id: "gone", name: "Ghost", itemType: "weapon" }, [{ id: "x", name: "Other", itemType: "armor" }])).toBeUndefined();
  });

  it("never falls back to the stale prop id", () => {
    // The deleted item's id must not be returned when it isn't in the list.
    const result = resolveLiveOwnedItemId({ id: "deleted", name: "Gone", itemType: "weapon" }, []);
    expect(result).toBeUndefined();
    expect(result).not.toBe("deleted");
  });

  it("handles null/undefined inputs safely", () => {
    expect(resolveLiveOwnedItemId(null, [{ id: "a" }])).toBeUndefined();
    expect(resolveLiveOwnedItemId({ id: "a" }, null)).toBeUndefined();
    expect(resolveLiveOwnedItemId(undefined, undefined)).toBeUndefined();
  });
});

describe("dedupeLibraryTemplates", () => {
  it("suppresses a system item re-published as a campaign template (same name+system)", () => {
    const system = [{ id: "sys-1", name: "Health Potion", system: "aa-v3" }];
    const campaign = [{ id: "camp-1", name: "Health Potion", system: "aa-v3" }];
    const result = dedupeLibraryTemplates(system, campaign);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("camp-1"); // campaign entry wins
  });

  it("removes an exact-id duplicate present in both lists", () => {
    const shared = { id: "dup", name: "Rune of Fire", system: "aa-v3" };
    const result = dedupeLibraryTemplates([shared], [shared]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("dup");
  });

  it("keeps distinct items across the two lists", () => {
    const system = [{ id: "s1", name: "Sword", system: "aa-v3" }];
    const campaign = [{ id: "c1", name: "Shield", system: "aa-v3" }];
    const result = dedupeLibraryTemplates(system, campaign);
    expect(result.map((i) => i.id).sort()).toEqual(["c1", "s1"]);
  });

  it("does not collapse same-name items from different systems", () => {
    const system = [{ id: "s1", name: "Dagger", system: "aa-v2" }];
    const campaign = [{ id: "c1", name: "Dagger", system: "aa-v3" }];
    const result = dedupeLibraryTemplates(system, campaign);
    expect(result).toHaveLength(2);
  });

  it("is case-insensitive on name", () => {
    const system = [{ id: "s1", name: "health potion", system: "aa-v3" }];
    const campaign = [{ id: "c1", name: "Health Potion", system: "aa-v3" }];
    const result = dedupeLibraryTemplates(system, campaign);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("handles empty/null inputs", () => {
    expect(dedupeLibraryTemplates(null, null)).toEqual([]);
    expect(dedupeLibraryTemplates([{ id: "s1", name: "X", system: "aa-v3" }], null)).toHaveLength(1);
  });
});
