// @vitest-environment jsdom
/**
 * The tracker's roll reveal runs on its own clock and is not aware of what's
 * covering it. A panel fullscreened over the tracker neither pauses it nor
 * defers it: the tumble and the total play behind the panel, and closing the
 * panel while the 3.2s window is still open shows whatever is left of it.
 *
 * This is worth pinning down because the tempting "fix" is to hold the roll
 * until the player is back out, and that is explicitly not wanted - a roll
 * from four minutes ago should not come tumbling out of a card the moment
 * you close a character sheet.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

let fullscreen = false;
const listeners = new Set<() => void>();
function setFullscreen(v: boolean) {
  fullscreen = v;
  listeners.forEach((l) => l());
}

// Only the fullscreen flag is faked; the module's z-index machinery is real,
// because the tracker's roll tray renders a Popover that reaches for it.
vi.mock("@/components/ui/floating-panel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/floating-panel")>()),
  useAnyPanelFullscreen: () => {
    const [, force] = React.useState(0);
    React.useEffect(() => {
      const l = () => force((n) => n + 1);
      listeners.add(l);
      return () => { listeners.delete(l); };
    }, []);
    return fullscreen;
  },
  isAnyPanelFullscreen: () => fullscreen,
}));

import { PinnedRosterBar, FullscreenRollFallback, type PinnedRollFeedEntry } from "./GameComponents";

const members = [{ id: "m1", userId: "u1", username: "Reed", pinned: true, assignedCharacterId: "c1" }];
const characters = [{ id: "c1", name: "Mara", hp: 10, maxHp: 10, energy: 5, maxEnergy: 5, naturalArmor: 12 }];

function roll(id: string): PinnedRollFeedEntry {
  return { id, userId: "u1", username: "Reed", characterName: "Mara", text: "Longsword", total: 17, dieType: "d20" } as any;
}

function tray() {
  return screen.getByTestId("pinned-roll-pinned-chip-u1").parentElement as HTMLElement;
}
const revealed = () => tray().style.height !== "0px";

// Both halves of what a player sees during a fullscreened panel: the tracker
// itself, covered but still running, and the banner that stands in for it.
function Harness({ rollFeed }: { rollFeed: PinnedRollFeedEntry[] }) {
  return (
    <>
      <FullscreenRollFallback members={members} characters={characters} rollFeed={rollFeed} />
      <PinnedRosterBar members={members} characters={characters} campaignSystem="swampy" rollFeed={rollFeed} isMobile />
    </>
  );
}

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as any;
  }
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  fullscreen = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("tracker rolls and fullscreen panels", () => {
  it("reveals a roll immediately when nothing is fullscreen", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    expect(revealed()).toBe(false);

    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });
    expect(revealed()).toBe(true);
  });

  it("reveals a roll that lands while a panel is fullscreen", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { setFullscreen(true); });

    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });
    expect(revealed()).toBe(true);
  });

  it("is still showing the roll when the panel closes mid-window", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { setFullscreen(true); });
    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });

    act(() => { vi.advanceTimersByTime(1500); });
    act(() => { setFullscreen(false); });

    expect(revealed()).toBe(true);
    expect(screen.getByTestId("pinned-roll-pinned-chip-u1").textContent).toContain("Longsword");

    // and then hides on the roll's own schedule, not the panel's
    act(() => { vi.advanceTimersByTime(1800); });
    expect(revealed()).toBe(false);
  });

  it("does not resurrect a roll whose window ran out behind the panel", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { setFullscreen(true); });
    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });

    act(() => { vi.advanceTimersByTime(5000); });
    expect(revealed()).toBe(false);

    act(() => { setFullscreen(false); });
    expect(revealed()).toBe(false);
  });

  // Also proves the fullscreen flag in this file's mock actually reaches the
  // code under test - without something that reads it, the tests above would
  // pass whether or not the mock were wired up at all.
  it("stands the roll in as a banner over the panel while the tracker is covered", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { setFullscreen(true); });
    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });

    expect(screen.getByTestId("fullscreen-roll-fallback").textContent).toContain("Longsword");

    act(() => { setFullscreen(false); });
    expect(screen.queryByTestId("fullscreen-roll-fallback")).toBeNull();
  });

  it("hides on its own schedule with no panel involved", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });
    expect(revealed()).toBe(true);

    act(() => { vi.advanceTimersByTime(3300); });
    expect(revealed()).toBe(false);
  });
});
