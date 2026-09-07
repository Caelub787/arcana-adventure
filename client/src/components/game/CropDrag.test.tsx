// @vitest-environment jsdom
/**
 * The crop box has come unstuck twice, both times the same way: document
 * listeners added per pointerdown, with at least one path where the matching
 * pointerup never arrived, so the box carried on following the cursor after
 * release. These pin the behaviour that matters - it moves by how far you
 * dragged, and it stops the moment you let go, however you let go.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useCropDrag } from "./GameComponents";

function Harness({ max = 300 }: { max?: number }) {
  const [pos, setPos] = useState({ x: 50, y: 50, size: 100 });
  const crop = useCropDrag(pos, setPos, () => ({ maxX: max, maxY: max, scaleX: 1, scaleY: 1 }));
  return (
    <div>
      <div data-testid="box" {...crop.handlers} />
      <span data-testid="pos">{`${Math.round(pos.x)},${Math.round(pos.y)}`}</span>
    </div>
  );
}

beforeEach(() => {
  // jsdom has no pointer capture.
  Object.assign(Element.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => false),
  });
});
afterEach(cleanup);

const at = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y });

describe("crop box drag", () => {
  it("moves by how far the pointer travelled, not to where it is", () => {
    const { getByTestId } = render(<Harness />);
    const box = getByTestId("box");
    fireEvent.pointerDown(box, at(200, 200));
    fireEvent.pointerMove(box, at(230, 190));
    // Grabbed at 50,50 and moved +30,-10 - it keeps the offset it was
    // grabbed with rather than centring under the cursor.
    expect(getByTestId("pos").textContent).toBe("80,40");
  });

  it("stays put after the pointer is released", () => {
    const { getByTestId } = render(<Harness />);
    const box = getByTestId("box");
    fireEvent.pointerDown(box, at(200, 200));
    fireEvent.pointerMove(box, at(250, 250));
    fireEvent.pointerUp(box, at(250, 250));
    fireEvent.pointerMove(box, at(400, 400));
    expect(getByTestId("pos").textContent).toBe("100,100");
  });

  it("stays put when the drag is cancelled instead of released", () => {
    const { getByTestId } = render(<Harness />);
    const box = getByTestId("box");
    fireEvent.pointerDown(box, at(200, 200));
    fireEvent.pointerMove(box, at(220, 220));
    fireEvent.pointerCancel(box, at(220, 220));
    fireEvent.pointerMove(box, at(400, 400));
    expect(getByTestId("pos").textContent).toBe("70,70");
  });

  it("stays put when the element merely loses capture", () => {
    const { getByTestId } = render(<Harness />);
    const box = getByTestId("box");
    fireEvent.pointerDown(box, at(200, 200));
    fireEvent.pointerMove(box, at(210, 210));
    fireEvent.lostPointerCapture(box, at(210, 210));
    fireEvent.pointerMove(box, at(500, 500));
    expect(getByTestId("pos").textContent).toBe("60,60");
  });

  it("ignores a second pointer pressed mid-drag", () => {
    const { getByTestId } = render(<Harness />);
    const box = getByTestId("box");
    fireEvent.pointerDown(box, at(200, 200));
    fireEvent.pointerDown(box, { pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(box, { pointerId: 2, clientX: 400, clientY: 400 });
    expect(getByTestId("pos").textContent).toBe("50,50");
    fireEvent.pointerMove(box, at(220, 220));
    expect(getByTestId("pos").textContent).toBe("70,70");
  });

  it("keeps the box inside the image", () => {
    const { getByTestId } = render(<Harness max={120} />);
    const box = getByTestId("box");
    fireEvent.pointerDown(box, at(0, 0));
    fireEvent.pointerMove(box, at(9999, -9999));
    expect(getByTestId("pos").textContent).toBe("120,0");
  });
});
