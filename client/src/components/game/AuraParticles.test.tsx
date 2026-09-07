// @vitest-environment jsdom
/**
 * The aura shapes are a simulation rather than CSS keyframes, which buys
 * three things worth pinning down:
 *   - they actually move, frame to frame, off one shared rAF loop;
 *   - two fields never agree, so nothing reads as a repeating loop; and
 *   - the loop stops when the last field unmounts, because a battlemap
 *     mounts and unmounts these constantly and a leaked ticker would run
 *     for the rest of the session.
 * Plus the alpha ceiling, which is a deliberate visual choice and the kind
 * of thing a later tweak would quietly undo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { AuraShapeMark } from "./CAPanels";

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return ++id;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Runs `count` animation frames, 16ms apart. */
function advance(count: number, startMs = 1000) {
  for (let i = 0; i < count; i++) {
    const cb = frames.shift();
    if (!cb) return i;
    cb(startMs + i * 16);
  }
  return count;
}

function transforms(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-testid='aura-mark'] > span"))
    .map((el) => el.style.transform)
    .filter(Boolean);
}

describe("aura particle engine", () => {
  it("moves the shapes from frame to frame", () => {
    const { container } = render(<AuraShapeMark color="#c9a227" shape="star" size={64} />);
    advance(10);
    const early = transforms(container);
    expect(early.length).toBeGreaterThan(0);
    advance(40);
    const later = transforms(container);
    expect(later).toHaveLength(early.length);
    expect(later.some((t, i) => t !== early[i])).toBe(true);
  });

  it("gives two fields different motion, so neither reads as a loop", () => {
    const { container } = render(
      <>
        <AuraShapeMark color="#c9a227" shape="star" size={64} />
        <AuraShapeMark color="#c9a227" shape="star" size={64} />
      </>,
    );
    advance(30);
    const marks = container.querySelectorAll("[data-testid='aura-mark']");
    expect(marks).toHaveLength(2);
    const a = transforms(marks[0] as HTMLElement);
    const b = transforms(marks[1] as HTMLElement);
    expect(a.join("|")).not.toBe(b.join("|"));
  });

  it("keeps every shape under the alpha ceiling", () => {
    const { container } = render(<AuraShapeMark color="#c9a227" shape="hexagon" size={64} />);
    advance(120);
    const opacities = Array.from(
      container.querySelectorAll<HTMLElement>("[data-testid='aura-mark'] > span"),
    ).map((el) => Number(el.style.opacity));
    expect(opacities.length).toBeGreaterThan(0);
    for (const o of opacities) expect(o).toBeLessThanOrEqual(0.8);
  });

  it("stops the shared loop once the last field unmounts", () => {
    const { unmount } = render(<AuraShapeMark color="#c9a227" shape="star" size={64} />);
    advance(5);
    expect(frames.length).toBeGreaterThan(0);
    unmount();
    // Whatever frame was already queued runs, finds nothing subscribed, and
    // does not queue another.
    advance(1);
    expect(frames).toHaveLength(0);
  });
});
