/**
 * The same party should take the same amount of the screen whatever you are
 * looking at it on.
 *
 * A phone used to get a flat 80% and everything else full size, so on a fold
 * the cover screen showed the whole party and the big screen — the one with
 * more room — made you scroll for it. The cards are sized to the room there
 * actually is now, so five fit either way.
 */
import { describe, it, expect } from "vitest";
import { trackerFit } from "./AgTracker";

/** How many whole cards of this height fit in `room` once shrunk to `fit`. */
const fitted = (room: number, card: number) => {
  const h = card * trackerFit(room, card);
  // Counted rather than divided: a card sized to fit exactly lands on the
  // room to the pixel, and dividing that lands a hair under on a float.
  let n = 0;
  while ((n + 1) * h + n * 8 <= room + 0.001) n++;
  return n;
};

describe("trackerFit", () => {
  it("leaves cards alone when five already fit", () => {
    expect(trackerFit(1000, 100)).toBe(1);
  });

  it("shrinks them when they would overrun", () => {
    expect(trackerFit(500, 150)).toBeLessThan(1);
  });

  it("fits five on a cover screen and on the big one alike", () => {
    const CARD = 155;
    expect(fitted(945, CARD)).toBeGreaterThanOrEqual(5);  // fold, cover screen
    expect(fitted(670, CARD)).toBeGreaterThanOrEqual(5);  // fold, unfolded
    expect(fitted(1400, CARD)).toBeGreaterThanOrEqual(5); // a desktop
  });

  it("never shrinks a card to nothing, however little room there is", () => {
    expect(trackerFit(10, 400)).toBe(0.5);
  });

  it("gives a straight answer when there is nothing to measure", () => {
    expect(trackerFit(0, 100)).toBe(1);
    expect(trackerFit(800, 0)).toBe(1);
    expect(trackerFit(-50, 100)).toBe(1);
  });
});
