// Tests for the multi-open item-detail panel bookkeeping (Campaign.tsx) and the
// shared query-cache mutations used by DetachedItemDetailPanel — verifying that
// concurrently open panels can't corrupt each other's data.
import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  itemPanelKey,
  openItemPanel,
  closeItemPanel,
  itemPanelStaggerPosition,
  applyOptimisticItemUpdate,
  applyOptimisticItemDelete,
  resolveLivePanelItem,
  PANEL_STAGGER_PX,
  type DetachedItemPanel,
} from "./detachedPanels";

const character = { id: "char-1", name: "Kael" };
const swordA = { id: "item-a", name: "Sword A", quantity: 1, description: "sharp" };
const shieldB = { id: "item-b", name: "Shield B", quantity: 2, description: "sturdy" };
const potionC = { id: "item-c", name: "Potion C", quantity: 5, description: "red" };

function openAll(): DetachedItemPanel[] {
  let panels: DetachedItemPanel[] = [];
  panels = openItemPanel(panels, character, swordA);
  panels = openItemPanel(panels, character, shieldB);
  panels = openItemPanel(panels, character, potionC);
  return panels;
}

describe("cross-panel data isolation (shared ['items', charId] cache)", () => {
  // Simulates two panels open at once for the same character. Both read the
  // same query cache; a mutation from panel A must leave panel B's live data
  // untouched.
  it("optimistically updating item A does not clear or replace item B's live data", () => {
    const qc = new QueryClient();
    const key = ["items", character.id];
    qc.setQueryData(key, [swordA, shieldB, potionC]);

    // Panel A fires an update (exactly what updateItemMutation.onMutate does).
    qc.setQueryData(key, (old: any[] = []) =>
      applyOptimisticItemUpdate(old, swordA.id, { name: "Sword A+1", quantity: 3 }),
    );

    const items = qc.getQueryData<any[]>(key)!;
    // Panel B resolves its live item from the same cache — must be unchanged.
    const liveB = resolveLivePanelItem(shieldB, items);
    expect(liveB).toEqual(shieldB);
    // Panel A sees its own update.
    const liveA = resolveLivePanelItem(swordA, items);
    expect(liveA).toMatchObject({ id: "item-a", name: "Sword A+1", quantity: 3, description: "sharp" });
    // No rows were dropped or duplicated.
    expect(items).toHaveLength(3);
  });

  it("update preserves object identity of untouched rows (no spurious rerenders/refetch churn)", () => {
    const before = [swordA, shieldB, potionC];
    const after = applyOptimisticItemUpdate(before, swordA.id, { quantity: 9 });
    expect(after[1]).toBe(shieldB);
    expect(after[2]).toBe(potionC);
    expect(after[0]).not.toBe(swordA);
    // Original array untouched (no in-place mutation of cache snapshots).
    expect(swordA.quantity).toBe(1);
  });

  it("optimistically deleting item A leaves item B's row and live data intact", () => {
    const qc = new QueryClient();
    const key = ["items", character.id];
    qc.setQueryData(key, [swordA, shieldB, potionC]);

    qc.setQueryData(key, (old: any[]) => applyOptimisticItemDelete(old, swordA.id));

    const items = qc.getQueryData<any[]>(key)!;
    expect(items.map((i) => i.id)).toEqual(["item-b", "item-c"]);
    expect(resolveLivePanelItem(shieldB, items)).toEqual(shieldB);
  });

  it("delete cascades only into the deleted container's children, not siblings", () => {
    const bag = { id: "bag", name: "Bag" };
    const inBag = { id: "in-bag", name: "Gem", containerId: "bag" };
    const nested = { id: "nested", name: "Dust", containerId: "in-bag" };
    const after = applyOptimisticItemDelete([bag, inBag, nested, shieldB], "bag");
    expect(after.map((i: any) => i.id)).toEqual(["item-b"]);
  });

  it("a panel whose row is missing mid-refetch falls back to its snapshot instead of blanking", () => {
    // e.g. cache momentarily holds only the other panel's rows
    const live = resolveLivePanelItem(shieldB, [swordA]);
    expect(live).toEqual(shieldB);
    // and it never merges a DIFFERENT item's row
    expect((live as any).name).toBe("Shield B");
  });
});

describe("panel open/close bookkeeping", () => {
  it("closing one panel does not close other open panels for the same character", () => {
    let panels = openAll();
    expect(panels).toHaveLength(3);

    panels = closeItemPanel(panels, itemPanelKey(character.id, shieldB.id));

    expect(panels).toHaveLength(2);
    expect(panels.map((p) => p.item.id)).toEqual(["item-a", "item-c"]);
    // Remaining panels keep their own character+item bindings untouched.
    expect(panels[0].panelKey).toBe(itemPanelKey(character.id, swordA.id));
    expect(panels[1].panelKey).toBe(itemPanelKey(character.id, potionC.id));
    expect(panels[0].item).toBe(swordA);
    expect(panels[1].item).toBe(potionC);
  });

  it("re-opening an already-open item is a no-op (no duplicate panels)", () => {
    let panels = openAll();
    const same = openItemPanel(panels, character, shieldB);
    expect(same).toBe(panels);
    expect(same).toHaveLength(3);
  });

  it("panels for the same item on different characters get distinct keys", () => {
    const otherChar = { id: "char-2", name: "Mira" };
    let panels = openItemPanel([], character, swordA);
    panels = openItemPanel(panels, otherChar, swordA);
    expect(panels).toHaveLength(2);
    expect(new Set(panels.map((p) => p.panelKey)).size).toBe(2);
  });
});

describe("offsetIndex stagger positions", () => {
  const W = 1920;
  const H = 1080;

  it("first panel gets no explicit position (FloatingPanel centers it)", () => {
    expect(itemPanelStaggerPosition(0, W, H)).toBeUndefined();
  });

  it("first several panels get non-overlapping, strictly increasing positions", () => {
    const positions = [1, 2, 3, 4, 5, 6].map((i) => itemPanelStaggerPosition(i, W, H)!);
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i]).toBeDefined();
      for (let j = i + 1; j < positions.length; j++) {
        // no two panels share a top-left corner
        expect(
          positions[i].x !== positions[j].x || positions[i].y !== positions[j].y,
        ).toBe(true);
      }
    }
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].x - positions[i - 1].x).toBe(PANEL_STAGGER_PX);
      expect(positions[i].y - positions[i - 1].y).toBe(PANEL_STAGGER_PX);
    }
  });

  it("positions stay on-screen (clamped to >= 20px) even on small viewports", () => {
    const pos = itemPanelStaggerPosition(1, 600, 500)!;
    expect(pos.x).toBeGreaterThanOrEqual(20);
    expect(pos.y).toBeGreaterThanOrEqual(20);
  });

  it("offsetIndex assignment increments per open, so each new panel is staggered", () => {
    const panels = openAll();
    expect(panels.map((p) => p.offsetIndex)).toEqual([0, 1, 2]);
  });

  it("opening after closing an earlier panel never reuses a live panel's offsetIndex", () => {
    let panels = openAll(); // indexes 0,1,2
    panels = closeItemPanel(panels, itemPanelKey(character.id, swordA.id)); // closes index 0
    const dagger = { id: "item-d", name: "Dagger D" };
    panels = openItemPanel(panels, character, dagger);
    const indexes = panels.map((p) => p.offsetIndex);
    // New panel must NOT collide with the still-open indexes 1 and 2.
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(indexes).toEqual([1, 2, 3]);
  });
});
