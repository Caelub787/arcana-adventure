/**
 * Two changes to how crafting works, pinned here.
 *
 * Runes: an item's room for runes is its surface, not a number on its sheet.
 * A rank 1 item with a bare face takes a rune; a rank 5 item already covered
 * in them does not. And two runes cannot be cut across one another, however
 * much space the item has left overall.
 *
 * Molds: a drawn shape decides what the weapon does. Nothing in here knows the
 * word "scythe" - a long curved far-weighted blade earns a scythe's reach and
 * a scythe's slowness because that is what the shape is.
 */
import { describe, it, expect } from "vitest";
import {
  RUNE_SIZE_MIN,
  toolEffects,
  toolEffectWords,
  runesOverlap,
  runeOnItem,
  runeFit,
  findRuneSpot,
  runeSpaceUsed,
  moldOutline,
  measureMold,
  moldTraits,
  moldResembles,
  parseMold,
  moldItemValues,
  moldBarPoints,
  moldKey,
  registerMold,
  isMoldShape,
  moldWeapon,
  moldTraitWords,
  insertMoldPoint,
  moldPointAt,
  moldPath,
  moldControl,
  shapeMask,
  startingStock,
  shapeScore,
  FORGE_SHAPES,
  type RunePlacement,
  type Mold,
  type MoldPoint,
} from "./crafting";

const vals = (o: Record<string, number | string>) => (k: string) => o[k];

describe("what a tool does to the work", () => {
  it("is nothing at all for a plain tool", () => {
    const t = toolEffects(vals({}));
    expect(t.skill).toBe(0);
    expect(t.minRuneSize).toBe(RUNE_SIZE_MIN);
  });

  it("lends its points to the crafter", () => {
    expect(toolEffects(vals({ tool_skill: 2 })).skill).toBe(2);
  });

  it("takes points away when it is a poor tool", () => {
    expect(toolEffects(vals({ tool_skill: -2 })).skill).toBe(-2);
  });

  it("reads a number written as text, since sheet values often are", () => {
    expect(toolEffects(vals({ tool_skill: "3" })).skill).toBe(3);
  });

  it("can't swing the roll wildly however the value was typed", () => {
    expect(toolEffects(vals({ tool_skill: 9999 })).skill).toBe(10);
    expect(toolEffects(vals({ tool_skill: -9999 })).skill).toBe(-10);
  });

  it("sets how fine a mark it can cut", () => {
    expect(toolEffects(vals({ tool_min_rune: 20 })).minRuneSize).toBe(20);
  });

  it("never claims to cut finer than anything can", () => {
    expect(toolEffects(vals({ tool_min_rune: 0.1 })).minRuneSize).toBe(RUNE_SIZE_MIN);
  });

  it("says in words what it is doing", () => {
    expect(toolEffectWords(toolEffects(vals({ tool_skill: 2, tool_min_rune: 12 })), "Rune Making"))
      .toEqual(["+2 Rune Making", "nothing finer than 12%"]);
  });

  it("stays quiet when it changes nothing", () => {
    expect(toolEffectWords(toolEffects(vals({})), "Alchemy")).toEqual([]);
  });
});

describe("two runes on one item", () => {
  const at = (x: number, y: number, s = 20): RunePlacement => ({ x, y, s });

  it("clash when they sit on the same spot", () => {
    expect(runesOverlap(at(50, 50), at(50, 50))).toBe(true);
  });

  it("clash when one is cut across the other", () => {
    expect(runesOverlap(at(50, 50), at(58, 50))).toBe(true);
  });

  it("are fine side by side with room between", () => {
    expect(runesOverlap(at(30, 50), at(70, 50))).toBe(false);
  });

  it("are judged on their own sizes, not a fixed distance", () => {
    expect(runesOverlap(at(40, 50, 10), at(60, 50, 10))).toBe(false);
    expect(runesOverlap(at(40, 50, 60), at(60, 50, 60))).toBe(true);
  });
});

describe("where a rune may go", () => {
  it("is anywhere on a bare item", () => {
    expect(runeFit({ x: 50, y: 50, s: 30 }, [])).toBeNull();
  });

  it("is not hanging off the edge", () => {
    expect(runeFit({ x: 5, y: 50, s: 40 }, [])).toBe("offItem");
    expect(runeOnItem({ x: 5, y: 50, s: 40 })).toBe(false);
  });

  it("is not across a rune already cut there", () => {
    expect(runeFit({ x: 50, y: 50, s: 30 }, [{ x: 55, y: 50, s: 30 }])).toBe("overlap");
  });

  it("is not finer than the tool can manage", () => {
    expect(runeFit({ x: 50, y: 50, s: 6 }, [], 12)).toBe("tooSmall");
  });

  it("minds the tool before anything else, so the message names the real problem", () => {
    expect(runeFit({ x: 2, y: 2, s: 6 }, [], 12)).toBe("tooSmall");
  });

  it("does not care how many runes are already on it, only whether they are in the way", () => {
    // Eight small runes in a row: a ninth still fits, with no rank anywhere.
    const many = Array.from({ length: 8 }, (_, i) => ({ x: 8 + i * 11, y: 10, s: 8 }));
    expect(runeFit({ x: 50, y: 60, s: 8 }, many)).toBeNull();
  });
});

describe("an item with no room left", () => {
  // A big rune in the middle and four in the corners: the face is taken.
  const packed: RunePlacement[] = [
    { x: 50, y: 50, s: 56 },
    { x: 14, y: 14, s: 26 }, { x: 86, y: 14, s: 26 },
    { x: 14, y: 86, s: 26 }, { x: 86, y: 86, s: 26 },
  ];

  it("has nowhere to put another big rune", () => {
    expect(findRuneSpot({ x: 50, y: 50, s: 40 }, packed)).toBeNull();
  });

  it("still takes a small one if there is a gap for it", () => {
    const spot = findRuneSpot({ x: 50, y: 50, s: 6 }, packed);
    expect(spot).not.toBeNull();
    expect(runeFit(spot!, packed)).toBeNull();
  });

  it("gives back the asked-for spot untouched when it already fits", () => {
    const want = { x: 50, y: 50, s: 20 };
    expect(findRuneSpot(want, [])).toBe(want);
  });

  it("finds a nearby spot when the asked-for one is taken", () => {
    const spot = findRuneSpot({ x: 50, y: 50, s: 16 }, [{ x: 50, y: 50, s: 16 }]);
    expect(spot).not.toBeNull();
    expect(runeFit(spot!, [{ x: 50, y: 50, s: 16 }])).toBeNull();
  });

  it("refuses outright a rune finer than the tool, rather than hunting for a spot", () => {
    expect(findRuneSpot({ x: 50, y: 50, s: 5 }, [], 20)).toBeNull();
  });

  it("reads as full when it is covered, and empty when it is bare", () => {
    expect(runeSpaceUsed([])).toBe(0);
    expect(runeSpaceUsed(packed)).toBeGreaterThan(0.3);
  });
});

describe("the mold you draw", () => {
  const box = (w: number, h: number, c?: number): Mold => ({
    points: [{ x: 50 - w / 2, y: 50 - h / 2 }, { x: 50 + w / 2, y: 50 - h / 2, c }, { x: 50 + w / 2, y: 50 + h / 2 }, { x: 50 - w / 2, y: 50 + h / 2 }],
  });

  it("becomes an outline that can be measured", () => {
    expect(moldOutline(box(40, 20)).length).toBeGreaterThan(8);
  });

  it("is longer drawn than straight once a line is pulled into a curve", () => {
    const straight = moldOutline(box(40, 20));
    const bowed = moldOutline(box(40, 20, 60));
    const len = (p: number[][]) => p.reduce((a, q, i) => a + Math.hypot(q[0] - p[(i + 1) % p.length][0], q[1] - p[(i + 1) % p.length][1]), 0);
    expect(len(bowed)).toBeGreaterThan(len(straight));
  });

  it("measures a scrap as a scrap and a slab as a slab", () => {
    expect(measureMold(box(10, 10)).mass).toBeLessThan(measureMold(box(80, 80)).mass);
  });

  it("measures how long it is, not how much of it there is", () => {
    expect(measureMold(box(90, 8)).length).toBeGreaterThan(measureMold(box(30, 30)).length);
  });

  it("gives nothing away on a shape too thin to be a shape", () => {
    const m = measureMold({ points: [{ x: 1, y: 1 }] });
    expect(m.mass).toBe(0);
    expect(m.balance).toBe(0.5);
  });
});

describe("what a shape costs and what it buys", () => {
  // A needle: long, thin, almost no metal, drawn to a point.
  const needle: Mold = { points: [{ x: 6, y: 48 }, { x: 94, y: 50 }, { x: 6, y: 52 }] };
  // A maul head: a lump of metal out at the far end.
  const maul: Mold = { points: [{ x: 10, y: 46 }, { x: 60, y: 46 }, { x: 60, y: 8 }, { x: 96, y: 8 }, { x: 96, y: 92 }, { x: 60, y: 92 }, { x: 60, y: 54 }, { x: 10, y: 54 }] };
  // A dagger: small, close to the hand.
  const dagger: Mold = { points: [{ x: 20, y: 42 }, { x: 52, y: 44 }, { x: 52, y: 56 }, { x: 20, y: 58 }] };

  it("pays for a heavy head with speed", () => {
    expect(moldTraits(measureMold(maul)).speed).toBeLessThan(moldTraits(measureMold(dagger)).speed);
  });

  it("pays for reach with length, and a short blade gets none", () => {
    expect(moldTraits(measureMold(needle)).reach).toBeGreaterThan(moldTraits(measureMold(dagger)).reach);
  });

  it("makes a heavy head hit harder than a thin one", () => {
    expect(moldTraits(measureMold(maul)).damage).toBeGreaterThan(moldTraits(measureMold(needle)).damage);
  });

  it("makes a fine point fragile", () => {
    expect(moldTraits(measureMold(needle)).durability).toBeLessThan(moldTraits(measureMold(maul)).durability);
  });

  it("never hands out a trait with no ceiling, however wild the drawing", () => {
    const monster: Mold = { points: [{ x: 0, y: 0 }, { x: 100, y: 0, c: 100 }, { x: 100, y: 100, c: 100 }, { x: 0, y: 100, c: 100 }] };
    const t = moldTraits(measureMold(monster));
    expect(t.damage).toBeLessThanOrEqual(6);
    expect(t.reach).toBeLessThanOrEqual(10);
    expect(t.unwieldy).toBeLessThanOrEqual(6);
  });

  it("always has something to say about the thing you made", () => {
    expect(moldTraits(measureMold(dagger)).notes.length).toBeGreaterThan(0);
  });

  it("suggests a name without deciding anything by it", () => {
    expect(typeof moldResembles(measureMold(maul))).toBe("string");
    expect(moldResembles(measureMold(dagger))).not.toBe("");
  });
});

describe("a mold off the wire", () => {
  it("is taken when it is a real shape", () => {
    const m = parseMold({ points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 50, y: 90 }] });
    expect(m?.points).toHaveLength(3);
  });

  it("is refused when there is not enough of it to be a shape", () => {
    expect(parseMold({ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })).toBeNull();
    expect(parseMold(null)).toBeNull();
    expect(parseMold("sword")).toBeNull();
  });

  it("drops points that are not points", () => {
    const m = parseMold({ points: [{ x: 10, y: 10 }, { x: "far", y: 2 }, null, { x: 90, y: 10 }, { x: 50, y: 90 }] });
    expect(m?.points).toHaveLength(3);
  });

  it("pulls a point drawn outside the box back into it", () => {
    const m = parseMold({ points: [{ x: -500, y: 9e9 }, { x: 90, y: 10 }, { x: 50, y: 90 }] });
    expect(m!.points[0]).toEqual({ x: 0, y: 100 });
  });

  it("refuses a drawing with more points than anyone needs", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ x: i % 100, y: (i * 7) % 100 }));
    expect(parseMold({ points: many })!.points.length).toBeLessThanOrEqual(48);
  });

  it("keeps a curve but not an impossible one", () => {
    const m = parseMold({ points: [{ x: 10, y: 10, c: 9999 }, { x: 90, y: 10 }, { x: 50, y: 90 }] });
    expect(m!.points[0].c).toBe(100);
  });

  it("turns into values the finished item can carry", () => {
    const v = moldItemValues({ points: [{ x: 10, y: 40 }, { x: 90, y: 50 }, { x: 10, y: 60 }] });
    expect(typeof v.mold_damage).toBe("number");
    expect(typeof v.mold_notes).toBe("string");
    expect(v.mold_shape).toBeTruthy();
  });
});

describe("a mold at the anvil", () => {
  const blade: Mold = { points: [{ x: 10, y: 44 }, { x: 90, y: 48 }, { x: 90, y: 52 }, { x: 10, y: 56 }] };
  const tall: Mold = { points: [{ x: 44, y: 10 }, { x: 56, y: 10 }, { x: 52, y: 90 }, { x: 48, y: 90 }] };

  it("becomes an outline that fits inside the bar", () => {
    for (const [x, y] of moldBarPoints(blade)) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(40);
    }
  });

  it("is laid on its side when it was drawn tall, since the bar is wide", () => {
    const pts = moldBarPoints(tall);
    const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    expect(w).toBeGreaterThan(h);
  });

  it("keeps its own proportions rather than being stretched to fill the bar", () => {
    const pts = moldBarPoints({ points: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }] });
    const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    expect(Math.abs(w - h)).toBeLessThan(1);
  });

  it("gets a key of its own, the same one every time it's the same drawing", () => {
    expect(moldKey(blade)).toBe(moldKey({ points: [...blade.points] }));
    expect(moldKey(blade)).not.toBe(moldKey(tall));
  });

  it("notices a line pulled into a curve as a different drawing", () => {
    expect(moldKey(blade)).not.toBe(moldKey({ points: blade.points.map((p, i) => (i ? p : { ...p, c: 40 })) }));
  });

  it("registers as a shape the forge already knows how to work", () => {
    const key = registerMold(blade);
    expect(isMoldShape(key)).toBe(true);
    expect(FORGE_SHAPES[key].points.length).toBeGreaterThan(3);
    // Asking twice is the same shape, not two.
    expect(registerMold(blade)).toBe(key);
  });

  it("gives the anvil a mask and a bar to work, like any other shape", () => {
    const key = registerMold(blade);
    const mask = shapeMask(key), stock = startingStock(key);
    expect(mask.some((v) => v === 1)).toBe(true);
    // The bar has stock round the outline to work away.
    expect(stock.reduce((a, v) => a + v, 0)).toBeGreaterThan(mask.reduce((a, v) => a + v, 0));
  });

  it("scores worked metal against the mold: the bar is nowhere near, the mold itself is perfect", () => {
    const key = registerMold(blade);
    expect(shapeScore(key, startingStock(key))).toBeLessThan(40);
    expect(shapeScore(key, shapeMask(key))).toBe(100);
  });

  it("forgets old drawings so a hundred redraws don't pile up", () => {
    const keys = Array.from({ length: 20 }, (_, i) => registerMold({ points: [{ x: 10 + i, y: 40 }, { x: 90, y: 50 }, { x: 10, y: 60 }] }));
    expect(FORGE_SHAPES[keys[0]]).toBeUndefined();
    expect(FORGE_SHAPES[keys[19]]).toBeDefined();
  });
});

describe("the weapon a mold makes", () => {
  const maul: Mold = { points: [{ x: 10, y: 46 }, { x: 60, y: 46 }, { x: 60, y: 8 }, { x: 96, y: 8 }, { x: 96, y: 92 }, { x: 60, y: 92 }, { x: 60, y: 54 }, { x: 10, y: 54 }] };
  const iron = { hardness: 4, value: 2, weight: 1 };

  it("is better made at a better tier, from the same drawing", () => {
    const fine = moldWeapon(maul, "huge", iron), plain = moldWeapon(maul, "default", iron);
    expect(fine.damageBonus).toBeGreaterThan(plain.damageBonus);
    expect(fine.value).toBeGreaterThan(plain.value);
    expect(fine.durability).toBeGreaterThanOrEqual(plain.durability);
  });

  it("is a ruin when the work failed, whatever was drawn", () => {
    const bad = moldWeapon(maul, "fail", iron);
    expect(bad.failed).toBe(true);
    expect(bad.damageBonus).toBe(0);
    expect(bad.value).toBe(0);
    expect(bad.durability).toBeLessThan(20);
  });

  it("rolls a bigger die for a shape that puts more metal on the blow", () => {
    const needle: Mold = { points: [{ x: 6, y: 49 }, { x: 94, y: 50 }, { x: 6, y: 51 }] };
    expect(moldWeapon(maul, "default", iron).die).toBeGreaterThan(moldWeapon(needle, "default", iron).die);
  });

  it("is sounder and worth more in a harder, costlier metal", () => {
    const steel = moldWeapon(maul, "default", { hardness: 8, value: 6, weight: 1 });
    const tin = moldWeapon(maul, "default", { hardness: 1, value: 1, weight: 1 });
    expect(steel.durability).toBeGreaterThan(tin.durability);
    expect(steel.value).toBeGreaterThan(tin.value);
  });

  it("says what it is good and bad at, in words", () => {
    const words = moldTraitWords(moldWeapon(maul, "default", iron).traits);
    expect(words.length).toBeGreaterThan(0);
    expect(words.join(" ")).toMatch(/damage|reach|slow|quick|handle|sound/);
  });
});

describe("drawing with the pen", () => {
  // A plain bar, which is what the forge opens with.
  const bar: MoldPoint[] = [{ x: 14, y: 44 }, { x: 86, y: 44 }, { x: 86, y: 56 }, { x: 14, y: 56 }];

  it("puts a new point into the outline, not on the end of it", () => {
    // Tapped on the top edge, between the first two points.
    const { points, index } = insertMoldPoint(bar, { x: 50, y: 44 });
    expect(index).toBe(1);
    expect(points[1]).toEqual({ x: 50, y: 44 });
    expect(points).toHaveLength(5);
  });

  it("puts one tapped on the far edge between the points that edge joins", () => {
    const { index } = insertMoldPoint(bar, { x: 86, y: 50 });
    expect(index).toBe(2);
  });

  it("never folds the shape over itself, however the points are tapped", () => {
    // Tap all four edges in a daft order: the outline still runs round once.
    let pts = bar;
    for (const tap of [{ x: 50, y: 56 }, { x: 14, y: 50 }, { x: 50, y: 44 }, { x: 86, y: 50 }]) pts = insertMoldPoint(pts, tap).points;
    const poly = moldOutline({ points: pts });
    // A shape that folds over itself crosses its own edge; a single loop doesn't.
    let crossings = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      for (let j = i + 2; j < poly.length; j++) {
        if (i === 0 && j === poly.length - 1) continue;
        const c = poly[j], d = poly[(j + 1) % poly.length];
        const s1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const s2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
        const s3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
        const s4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
        if (s1 * s2 < 0 && s3 * s4 < 0) crossings++;
      }
    }
    expect(crossings).toBe(0);
  });

  it("just adds the point when there isn't an outline yet", () => {
    expect(insertMoldPoint([{ x: 10, y: 10 }], { x: 50, y: 50 }).points).toHaveLength(2);
  });

  it("finds the point under a finger, and nothing on the empty canvas", () => {
    expect(moldPointAt(bar, { x: 14.5, y: 44.5 })).toBe(0);
    expect(moldPointAt(bar, { x: 86, y: 56 })).toBe(2);
    expect(moldPointAt(bar, { x: 50, y: 20 })).toBe(-1);
  });

  it("takes the nearest point when two are close together", () => {
    const close = [...bar, { x: 16, y: 44 }];
    expect(moldPointAt(close, { x: 15.6, y: 44 })).toBe(4);
  });

  it("draws the shape on screen as the same curves it measures", () => {
    const bowed = { points: bar.map((p, i) => (i === 1 ? { ...p, c: 50 } : p)) };
    const d = moldPath(bowed);
    const [cx, cy] = moldControl(bar[0], bowed.points[1]);
    expect(d).toContain(`Q ${cx.toFixed(2)} ${cy.toFixed(2)} 86 44`);
    expect(d.endsWith(" Z")).toBe(true);
  });

  it("has nothing to draw with fewer than two points", () => {
    expect(moldPath({ points: [{ x: 1, y: 1 }] })).toBe("");
  });
});
