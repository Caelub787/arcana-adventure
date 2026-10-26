// @vitest-environment jsdom
/**
 * Pressing a sheet puts an editor opened from it underneath - that is what
 * should happen, the sheet is what was pressed. What was missing was the way
 * back: pressing "health" again did nothing, because the panel was already
 * open, so no state changed, nothing re-rendered, and nothing rose. The only
 * way to reach the editor was to drag the sheet aside.
 *
 * The panel also keeps its z in a ref and re-applies it on every render, so a
 * panel raised from outside has to be told, or the next render snaps it back
 * under the sheet - which looks exactly like the raise never happened.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import {
  bringFloatingPanelToFront,
  getFloatingPanelZ,
  subscribeFloatingPanelZ,
} from "@/components/ui/floating-panel";
import { useAgPanel } from "@/agnostic/float";

beforeEach(() => cleanup());

/** A control that opens a panel, standing in for the health pip on a sheet. */
function Opener({ name = "number" }: { name?: string }) {
  const panel = useAgPanel(name);
  return (
    <>
      <button data-testid="opener" onClick={panel.show}>health</button>
      <span data-testid="state">{panel.open ? "open" : "closed"}</span>
      <span data-testid="key">{panel.panelKey}</span>
    </>
  );
}

describe("an editor opened from a sheet", () => {
  it("opens on the first press", () => {
    render(<Opener />);
    expect(screen.getByTestId("state").textContent).toBe("closed");
    fireEvent.click(screen.getByTestId("opener"));
    expect(screen.getByTestId("state").textContent).toBe("open");
  });

  it("comes back to the front when its control is pressed again", () => {
    render(<Opener />);
    fireEvent.click(screen.getByTestId("opener"));
    const key = screen.getByTestId("key").textContent!;
    // Standing in for the panel mounting, which is where it takes its first
    // z-index - this test renders the control, not the whole panel.
    const opened = bringFloatingPanelToFront(key, undefined, true);

    // The sheet behind it is pressed: it rises, burying the editor.
    const sheetZ = bringFloatingPanelToFront("sheet-1", undefined, true);
    expect(sheetZ).toBeGreaterThan(opened);

    // Pressing the control again brings the editor back over the sheet,
    // rather than doing nothing because it was already open.
    fireEvent.click(screen.getByTestId("opener"));
    expect(getFloatingPanelZ(key)!).toBeGreaterThan(sheetZ);
    expect(screen.getByTestId("state").textContent).toBe("open");
  });

  it("stays open - pressing the control again is not a toggle", () => {
    render(<Opener />);
    fireEvent.click(screen.getByTestId("opener"));
    fireEvent.click(screen.getByTestId("opener"));
    fireEvent.click(screen.getByTestId("opener"));
    expect(screen.getByTestId("state").textContent).toBe("open");
  });

  it("opens afresh after being closed, instead of only re-raising a gone panel", () => {
    function Closable() {
      const panel = useAgPanel("number");
      return (
        <>
          <button data-testid="opener" onClick={panel.show}>health</button>
          <button data-testid="closer" onClick={panel.hide}>close</button>
          <span data-testid="state">{panel.open ? "open" : "closed"}</span>
        </>
      );
    }
    render(<Closable />);
    fireEvent.click(screen.getByTestId("opener"));
    fireEvent.click(screen.getByTestId("closer"));
    expect(screen.getByTestId("state").textContent).toBe("closed");
    fireEvent.click(screen.getByTestId("opener"));
    expect(screen.getByTestId("state").textContent).toBe("open");
  });

  it("gives two editors on one sheet their own panels", () => {
    render(<><Opener name="hp" /><Opener name="energy" /></>);
    const [a, b] = screen.getAllByTestId("key").map((el) => el.textContent);
    expect(a).not.toBe(b);
  });
});

describe("a panel raised from outside", () => {
  it("tells the panel, so its next render does not snap it back down", () => {
    const heard: number[] = [];
    const stop = subscribeFloatingPanelZ("sheet-note", (z) => heard.push(z));
    const z = bringFloatingPanelToFront("sheet-note", undefined, true);
    expect(heard).toEqual([z]);
    stop();
    bringFloatingPanelToFront("sheet-note", undefined, true);
    expect(heard).toHaveLength(1);
  });

  it("ignores a panel with no key rather than throwing", () => {
    expect(() => subscribeFloatingPanelZ(undefined, () => {})()).not.toThrow();
  });
});
