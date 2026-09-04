// @vitest-environment jsdom
/**
 * A roll that lands while a panel is fullscreened over the tracker has to
 * wait. Playing it right away burns the 3.2s reveal window behind the panel,
 * so the player comes back out to an empty card and never sees the roll -
 * which is exactly what a mobile player does all the time, since a character
 * sheet or item dialog covers the whole screen.
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

import { PinnedRosterBar, type PinnedRollFeedEntry } from "./GameComponents";

const members = [{ id: "m1", userId: "u1", username: "Reed", pinned: true, assignedCharacterId: "c1" }];
const characters = [{ id: "c1", name: "Mara", hp: 10, maxHp: 10, energy: 5, maxEnergy: 5, naturalArmor: 12 }];

function roll(id: string): PinnedRollFeedEntry {
  return { id, userId: "u1", username: "Reed", characterName: "Mara", text: "Longsword", total: 17, dieType: "d20" } as any;
}

function tray() {
  return screen.getByTestId("pinned-roll-pinned-chip-u1").parentElement as HTMLElement;
}
const revealed = () => tray().style.height !== "0px";

function Harness({ rollFeed }: { rollFeed: PinnedRollFeedEntry[] }) {
  return (
    <PinnedRosterBar members={members} characters={characters} campaignSystem="swampy" rollFeed={rollFeed} isMobile />
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

  it("holds a roll that lands while a panel is fullscreen, then plays it on exit", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { setFullscreen(true); });

    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });
    expect(revealed()).toBe(false);

    // However long the player stays in the sheet, the roll is still waiting.
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(revealed()).toBe(false);

    act(() => { setFullscreen(false); });
    expect(revealed()).toBe(true);
    expect(screen.getByTestId("pinned-roll-pinned-chip-u1").textContent).toContain("Longsword");
  });

  it("replays a reveal that was still on screen when the panel opened", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });
    expect(revealed()).toBe(true);

    act(() => { setFullscreen(true); });
    act(() => { vi.advanceTimersByTime(30_000); });
    act(() => { setFullscreen(false); });
    expect(revealed()).toBe(true);
  });

  it("plays only the newest of several rolls held during fullscreen", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { setFullscreen(true); });
    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });
    act(() => {
      rerender(<Harness rollFeed={[{ ...roll("r2"), text: "Stealth", total: 4 }, roll("r1")]} />);
    });
    act(() => { setFullscreen(false); });

    expect(revealed()).toBe(true);
    expect(screen.getByTestId("pinned-roll-pinned-chip-u1").textContent).toContain("Stealth");
  });

  it("still hides the roll on its own once the player is back out", () => {
    const { rerender } = render(<Harness rollFeed={[]} />);
    act(() => { setFullscreen(true); });
    act(() => { rerender(<Harness rollFeed={[roll("r1")]} />); });
    act(() => { setFullscreen(false); });
    expect(revealed()).toBe(true);

    act(() => { vi.advanceTimersByTime(3300); });
    expect(revealed()).toBe(false);
  });
});
