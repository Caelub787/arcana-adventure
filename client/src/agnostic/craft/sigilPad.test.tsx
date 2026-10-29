// @vitest-environment jsdom
/**
 * The pad a GM builds a sigil on. What it draws is saved into the recipe's
 * setup, which goes to the server and comes back — so if the prop were the only
 * truth, every stroke drawn before the last one had landed would be thrown away.
 * A GM laying down a ring, a star and three lines in a few seconds would end up
 * with one of them, which is exactly what happened.
 */
import { describe, it, expect } from "vitest";
import { sigilRing, sigilLine, sigilStar, fitSigil, mirrorStroke, onMirrorLine } from "@shared/agnostic/crafting";

/** What the pad does to its own copy, with nothing coming back from the server yet. */
function pad(start: number[][][] = []) {
  let live = start;
  const saved: number[][][][] = [];
  let inFlight: string[] = [];
  const put = (next: number[][][]) => { inFlight.push(JSON.stringify(next)); live = next; saved.push(next); };
  return {
    get live() { return live; },
    get saved() { return saved; },
    add(st: number[][], mirror = false) { put([...live, st, ...(mirror && !onMirrorLine(st) ? [mirrorStroke(st)] : [])]); },
    undo() { put(live.slice(0, -1)); },
    fit() { put(fitSigil(live)); },
    clear() { put([]); },
    /** A sigil arriving as a prop: taken only when this pad did not send it. */
    fromProp(next: number[][][]) {
      const key = JSON.stringify(next);
      const at = inFlight.indexOf(key);
      if (at >= 0) { inFlight = inFlight.slice(at + 1); return; }
      if (inFlight.length) return;
      live = next;
    },
  };
}

describe("building a sigil faster than it saves", () => {
  it("keeps every stroke, not just the last one", () => {
    const p = pad();
    p.add(sigilRing(50, 50, 30));
    p.add(sigilStar(50, 50, 40, 7));
    p.add(sigilLine([50, 10], [50, 90]));
    expect(p.live).toHaveLength(3);
  });

  it("lays down both halves at once with the mirror on", () => {
    const p = pad();
    p.add(sigilLine([20, 30], [36, 62]), true);
    expect(p.live).toHaveLength(2);
    expect(p.live[1][0][0]).toBe(80);
  });

  it("does not double a stroke that is already on the mirror line", () => {
    const p = pad();
    p.add(sigilLine([50, 10], [50, 90]), true);
    expect(p.live).toHaveLength(1);
  });

  it("takes back one stroke, not the lot", () => {
    const p = pad();
    p.add(sigilRing(50, 50, 30));
    p.add(sigilLine([50, 10], [50, 90]));
    p.undo();
    expect(p.live).toHaveLength(1);
  });

  it("centres and fills on Fit, keeping every stroke", () => {
    const p = pad();
    p.add(sigilLine([10, 10], [20, 20]));
    p.add(sigilLine([12, 14], [18, 18]));
    p.fit();
    expect(p.live).toHaveLength(2);
    const xs = p.live.flat().map((q) => q[0]);
    expect(Math.max(...xs)).toBeGreaterThan(80);
  });

  it("clears to nothing when that is what was asked", () => {
    const p = pad([sigilRing(50, 50, 20)]);
    p.clear();
    expect(p.live).toEqual([]);
  });

  it("saves after every stroke, so nothing is left only on screen", () => {
    const p = pad();
    p.add(sigilRing(50, 50, 30));
    p.add(sigilLine([50, 10], [50, 90]));
    expect(p.saved).toHaveLength(2);
    expect(p.saved[1]).toHaveLength(2);
  });
});

describe("a sigil changed somewhere else", () => {
  it("is taken when it isn't what this pad sent (another GM, or a preset)", () => {
    const p = pad();
    p.add(sigilRing(50, 50, 30));
    p.fromProp(p.live);
    const theirs = [sigilStar(50, 50, 40, 5)];
    p.fromProp(theirs);
    expect(p.live).toEqual(theirs);
  });

  it("is ignored when it is only this pad's own work coming back", () => {
    const p = pad();
    p.add(sigilRing(50, 50, 30));
    const mine = p.live;
    p.add(sigilLine([50, 10], [50, 90]));
    // The server echoes the earlier save while a newer stroke is already down.
    p.fromProp(mine);
    expect(p.live).toHaveLength(2);
    // Then the newer one comes home, and the pad is still showing both.
    p.fromProp(p.live);
    expect(p.live).toHaveLength(2);
  });
});
