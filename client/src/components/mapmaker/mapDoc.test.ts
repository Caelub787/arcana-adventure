/**
 * The two pieces of the map document that are pure logic, and that everything
 * else in the editor leans on: the undo stack, and z-ordering.
 *
 * Both are the kind of thing that looks right and is subtly wrong - an undo
 * that restores the middle of a drag rather than its start, or a "bring
 * forward" that scrambles a multi-selection's own order.
 */
import { describe, it, expect } from "vitest";
import { MapHistory } from "./history";
import { reorderZ } from "@shared/mapDoc";

describe("the editor's undo stack", () => {
  it("runs a command when it is pushed", async () => {
    const h = new MapHistory();
    let value = 0;
    await h.push({ label: "Set to 1", redo: () => { value = 1; }, undo: () => { value = 0; } });
    expect(value).toBe(1);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("walks back and forward through several edits", async () => {
    const h = new MapHistory();
    const log: string[] = [];
    const step = (n: number) => h.push({
      label: `Step ${n}`,
      redo: () => { log.push(`do${n}`); },
      undo: () => { log.push(`undo${n}`); },
    });
    await step(1); await step(2); await step(3);

    await h.undo();
    await h.undo();
    expect(log).toEqual(["do1", "do2", "do3", "undo3", "undo2"]);

    await h.redo();
    expect(log[log.length - 1]).toBe("do2");
    expect(h.canRedo).toBe(true);
  });

  it("collapses a drag into one undo step", async () => {
    const h = new MapHistory();
    let x = 0;
    // A drag is a hundred pointer moves. Each is a command; together they are
    // one edit, and undo should put the object back where it started.
    for (const to of [5, 10, 15, 20]) {
      const from = x;
      await h.push({
        label: "Moved object",
        coalesceKey: "move:obj1",
        redo: () => { x = to; },
        undo: () => { x = from; },
      });
    }
    expect(x).toBe(20);
    expect(h.depth).toBe(1);
    await h.undo();
    expect(x).toBe(0);
  });

  it("keeps separate drags separate", async () => {
    const h = new MapHistory();
    await h.push({ label: "Moved A", coalesceKey: "move:a", redo: () => {}, undo: () => {} });
    await h.push({ label: "Moved B", coalesceKey: "move:b", redo: () => {}, undo: () => {} });
    expect(h.depth).toBe(2);
  });

  it("drops the redo stack once a new edit lands", async () => {
    const h = new MapHistory();
    await h.push({ label: "One", redo: () => {}, undo: () => {} });
    await h.undo();
    expect(h.canRedo).toBe(true);
    await h.push({ label: "Two", redo: () => {}, undo: () => {} });
    expect(h.canRedo).toBe(false);
  });

  it("names every step for the History panel, newest last", async () => {
    const h = new MapHistory();
    await h.push({ label: "Placed oak tree", redo: () => {}, undo: () => {} });
    await h.push({ label: "Painted grass", redo: () => {}, undo: () => {} });
    expect(h.entries().map((e) => e.label)).toEqual(["Placed oak tree", "Painted grass"]);
  });

  it("rolls back to a chosen point in the history", async () => {
    const h = new MapHistory();
    let value = 0;
    for (const n of [1, 2, 3, 4]) {
      const from = value;
      await h.push({ label: `Set ${n}`, redo: () => { value = n; }, undo: () => { value = from; } });
    }
    await h.revertTo(1); // keep the first two
    expect(value).toBe(2);
    expect(h.depth).toBe(2);
  });

  it("keeps only as many steps as it was told to", async () => {
    const h = new MapHistory(3);
    for (const n of [1, 2, 3, 4, 5]) {
      await h.push({ label: `Step ${n}`, redo: () => {}, undo: () => {} });
    }
    expect(h.depth).toBe(3);
    expect(h.entries()[0].label).toBe("Step 3");
  });
});

describe("z-ordering inside a layer", () => {
  const stack = () => [
    { id: "a", zIndex: 0 },
    { id: "b", zIndex: 1 },
    { id: "c", zIndex: 2 },
    { id: "d", zIndex: 3 },
  ];
  const applied = (rows: ReturnType<typeof stack>, changes: Array<{ id: string; zIndex: number }>) => {
    const byId = new Map(rows.map((r) => [r.id, { ...r }]));
    for (const c of changes) byId.get(c.id)!.zIndex = c.zIndex;
    return Array.from(byId.values()).sort((x, y) => x.zIndex - y.zIndex).map((r) => r.id);
  };

  it("brings one item forward by exactly one place", () => {
    expect(applied(stack(), reorderZ(stack(), ["b"], "forward"))).toEqual(["a", "c", "b", "d"]);
  });

  it("sends one item backward by exactly one place", () => {
    expect(applied(stack(), reorderZ(stack(), ["c"], "backward"))).toEqual(["a", "c", "b", "d"]);
  });

  it("puts an item on top and on the bottom", () => {
    expect(applied(stack(), reorderZ(stack(), ["a"], "front"))).toEqual(["b", "c", "d", "a"]);
    expect(applied(stack(), reorderZ(stack(), ["d"], "back"))).toEqual(["d", "a", "b", "c"]);
  });

  it("keeps a multi-selection's own order when it moves", () => {
    const changes = reorderZ(stack(), ["a", "b"], "forward");
    expect(applied(stack(), changes)).toEqual(["c", "a", "b", "d"]);
  });

  it("leaves an item already at the top alone", () => {
    expect(reorderZ(stack(), ["d"], "forward")).toEqual([]);
  });

  it("writes back only what actually moved", () => {
    const changes = reorderZ(stack(), ["a"], "forward");
    expect(changes.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });
});
