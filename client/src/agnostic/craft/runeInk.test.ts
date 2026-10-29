// @vitest-environment jsdom
/**
 * A rune can ask for more than one ink and say which of its strokes wants
 * which, so the crafter changes pens part-way through drawing it. The rule that
 * makes that work is simple and easy to get wrong: a stroke is inked as it is
 * finished, and changing pens afterwards must not reach back and recolour what
 * is already on the item — the way real ink behaves.
 */
import { describe, it, expect } from "vitest";
import { traceAccuracyInk, sigilRing, sigilLine, itemMatches } from "@shared/agnostic/crafting";

/** What the trace screen does as strokes arrive and the pen in hand changes. */
function pad() {
  let strokes: number[][][] = [];
  let inks: Array<string | null> = [];
  let pen: string | null = null;
  return {
    get strokes() { return strokes; },
    get inks() { return inks; },
    pickUp(id: string | null) { pen = id; },
    /** The canvas hands back every stroke each time; new ones take the pen in hand. */
    onStrokes(next: number[][][]) {
      const kept = inks.slice(0, next.length);
      while (kept.length < next.length) kept.push(pen);
      strokes = next; inks = kept;
    },
    undo() { strokes = strokes.slice(0, -1); inks = inks.slice(0, -1); },
    clear() { strokes = []; inks = []; },
  };
}

const a = sigilRing(50, 50, 30), b = sigilLine([50, 10], [50, 90]), c = sigilLine([10, 50], [90, 50]);

describe("changing pens part-way through a rune", () => {
  it("inks each stroke with the pen that was in hand when it was drawn", () => {
    const p = pad();
    p.pickUp("ember");
    p.onStrokes([a]);
    p.pickUp("moon");
    p.onStrokes([a, b]);
    expect(p.inks).toEqual(["ember", "moon"]);
  });

  it("leaves what is already drawn alone when the pen changes", () => {
    const p = pad();
    p.pickUp("ember");
    p.onStrokes([a]);
    p.pickUp("moon");
    // The pen changed, but nothing new was drawn yet.
    expect(p.inks).toEqual(["ember"]);
    p.onStrokes([a, b, c]);
    expect(p.inks).toEqual(["ember", "moon", "moon"]);
  });

  it("keeps the inks in step while a stroke is still being drawn", () => {
    const p = pad();
    p.pickUp("ember");
    // The canvas sends the in-progress stroke on every frame.
    p.onStrokes([a]);
    p.onStrokes([a]);
    p.onStrokes([a]);
    expect(p.inks).toEqual(["ember"]);
  });

  it("takes back the stroke and its ink together on undo", () => {
    const p = pad();
    p.pickUp("ember"); p.onStrokes([a]);
    p.pickUp("moon"); p.onStrokes([a, b]);
    p.undo();
    expect(p.strokes).toHaveLength(1);
    expect(p.inks).toEqual(["ember"]);
    // Drawing again takes the pen in hand now, not the one the old stroke had.
    p.onStrokes([a, c]);
    expect(p.inks).toEqual(["ember", "moon"]);
  });

  it("forgets every ink when the whole thing is cleared", () => {
    const p = pad();
    p.pickUp("ember"); p.onStrokes([a, b]);
    p.clear();
    expect(p.inks).toEqual([]);
  });

  it("leaves a stroke uninked when no pen was in hand", () => {
    const p = pad();
    p.onStrokes([a]);
    expect(p.inks).toEqual([null]);
  });
});

describe("what the inks are worth at the end", () => {
  const sigil = [a, b, c];
  const wants = [0, 1, 1];
  /** Which of the recipe's inks an item in hand counts as. */
  const slotOf = (inks: Array<{ name: string }>, name: string | null) =>
    name === null ? null : (inks.findIndex((need) => itemMatches({ name } as any, need as any)) ?? -1);
  const inks = [{ name: "Emberblood Ink", qty: 1 }, { name: "Moonsilver Ink", qty: 1 }];

  it("scores a rune whose pens changed in the right places as a clean trace", () => {
    const p = pad();
    p.pickUp("Emberblood Ink"); p.onStrokes([a]);
    p.pickUp("Moonsilver Ink"); p.onStrokes([a, b, c]);
    const slots = p.inks.map((n) => { const i = slotOf(inks, n); return i === -1 ? null : i; });
    expect(slots).toEqual([0, 1, 1]);
    expect(traceAccuracyInk(sigil, wants, p.strokes, slots).accuracy).toBeGreaterThan(95);
  });

  it("scores one that never changed pens well below it", () => {
    const p = pad();
    p.pickUp("Emberblood Ink"); p.onStrokes([a, b, c]);
    const slots = p.inks.map((n) => { const i = slotOf(inks, n); return i === -1 ? null : i; });
    const got = traceAccuracyInk(sigil, wants, p.strokes, slots);
    expect(got.parts.find((x) => x.slot === 1)!.score).toBe(0);
    expect(got.accuracy).toBeLessThan(70);
  });

  it("scores one whose pens changed in the wrong places below it too", () => {
    const p = pad();
    p.pickUp("Moonsilver Ink"); p.onStrokes([a]);
    p.pickUp("Emberblood Ink"); p.onStrokes([a, b, c]);
    const slots = p.inks.map((n) => { const i = slotOf(inks, n); return i === -1 ? null : i; });
    expect(slots).toEqual([1, 0, 0]);
    expect(traceAccuracyInk(sigil, wants, p.strokes, slots).accuracy).toBeLessThan(40);
  });
});

/**
 * A rune is a mark cut into a surface. Whatever comes of the attempt — a clean
 * trace, a shaky one, or one where the pens never changed — the mark is on the
 * item afterwards, taking its room, and only the GM takes it off again.
 */
describe("a rune that went wrong", () => {
  /** What the server does with a trace, in the order it decides it. */
  const outcome = ({ accuracy = 90, guide = true, inkMissed = [] as string[], quick = null as null | string }) => {
    const tier = inkMissed.length ? "fail" : quick ? quick : accuracy >= 95 ? "huge" : accuracy >= 80 ? "slight" : accuracy >= 60 ? "default" : "fail";
    return { tier, cut: true, takesRoom: true, worksOnTheItem: tier !== "fail" };
  };

  it("is still cut into the item when the shape was too far off", () => {
    const o = outcome({ accuracy: 31 });
    expect(o.tier).toBe("fail");
    expect(o.cut).toBe(true);
    expect(o.takesRoom).toBe(true);
    expect(o.worksOnTheItem).toBe(false);
  });

  it("is still cut into the item when a part was never drawn in the ink it wanted", () => {
    const o = outcome({ accuracy: 97, inkMissed: ["Moonsilver Ink"] });
    expect(o.tier).toBe("fail");
    expect(o.cut).toBe(true);
    expect(o.worksOnTheItem).toBe(false);
  });

  it("is spoiled by a missed ink however well the rest of it was traced", () => {
    expect(outcome({ accuracy: 100, inkMissed: ["Moonsilver Ink"] }).tier).toBe("fail");
    expect(outcome({ accuracy: 100 }).tier).toBe("huge");
  });

  it("is spoiled by a missed ink on a Quick Craft too, whatever the roll said", () => {
    expect(outcome({ quick: "huge", inkMissed: ["Moonsilver Ink"] }).tier).toBe("fail");
    expect(outcome({ quick: "huge" }).tier).toBe("huge");
  });

  it("works when every part was cut in the ink it asked for", () => {
    const o = outcome({ accuracy: 87 });
    expect(o.tier).toBe("slight");
    expect(o.worksOnTheItem).toBe(true);
  });
});
