// @vitest-environment jsdom
/**
 * A tablet that goes to the home screen and comes back has to come back as a
 * tablet.
 *
 * iOS drops a home-screen app that has been in the background and relaunches
 * it when you return, and the viewport wobbles on the way back: for a frame
 * or two innerWidth reads 0. The hook used to re-read innerWidth whenever the
 * media query stirred, and believe what it got — 0 is under the breakpoint,
 * so the desktop layout was swapped for the phone one. Worse, the query ends
 * up back on the side of the breakpoint it started on, so no further event
 * ever came to put it right, and the app stayed a phone until it was opened
 * fresh.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

const TABLET = 1210;
const PHONE = 390;

/** The window as the browser reports it, with a media query that really fires. */
const fake = {
  /** What innerWidth says — 0 for a moment during an iOS relaunch. */
  width: TABLET,
  /** What the media query goes by: the layout viewport, which is never 0. */
  layout: TABLET,
  listeners: new Map<string, Set<() => void>>(),
};

function install() {
  fake.listeners = new Map();
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => fake.width });
  (window as any).matchMedia = (q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1] ?? 0);
    const set = fake.listeners.get(q) ?? new Set<() => void>();
    fake.listeners.set(q, set);
    return {
      get matches() { return fake.layout <= max; },
      addEventListener: (_: string, fn: () => void) => set.add(fn),
      removeEventListener: (_: string, fn: () => void) => set.delete(fn),
      addListener: (fn: () => void) => set.add(fn),
      removeListener: (fn: () => void) => set.delete(fn),
    };
  };
}

/** The media query stirring, as it does while a relaunch settles. */
const stirMediaQuery = () => fake.listeners.forEach((s) => s.forEach((fn) => fn()));

function sizes(width: number, layout = width || fake.layout) {
  fake.width = width;
  fake.layout = layout;
}

afterEach(cleanup);

describe("useIsMobile", () => {
  it("reads a tablet as the desktop layout", () => {
    install(); sizes(TABLET);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });

  it("reads a phone as the phone layout", () => {
    install(); sizes(PHONE);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
  });

  it("stays a tablet when a relaunch reports no width yet", () => {
    install(); sizes(TABLET);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Back from the home screen. For a moment the window has no size, and the
    // media query stirs while it is in that state.
    act(() => { sizes(0, TABLET); stirMediaQuery(); window.dispatchEvent(new Event("pageshow")); });
    expect(result.current).toBe(false);

    // The width comes back. Nothing crossed the breakpoint, so the media
    // query has no further event to give — this has to right itself anyway.
    act(() => { sizes(TABLET); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(false);
  });

  it("still follows a real change of width", () => {
    install(); sizes(TABLET);
    const { result } = renderHook(() => useIsMobile());
    act(() => { sizes(PHONE); stirMediaQuery(); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(true);
    act(() => { sizes(TABLET); stirMediaQuery(); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(false);
  });
});
