import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@cr/lib/utils";

interface Props {
  /**
   * Which edge of the sidebar this handle sits on. For a left-docked
   * sidebar the handle is on the right; for a right-docked sidebar the
   * handle is on the left.
   */
  edge: "right" | "left";
  current: number;
  min: number;
  max: number;
  onResize: (next: number) => void;
  /** Hidden below this breakpoint (matches the sidebar's reveal point). */
  hideBelow: "md" | "lg";
}

/**
 * Thin invisible-until-hover drag handle used to resize a docked sidebar.
 * Captures pointer events on pointerdown, listens to window pointermove
 * until pointerup, and feeds the new pixel width to onResize. Width is
 * computed from the absolute pointer X minus (or to) the surface edge,
 * so dragging "feels" attached to the cursor regardless of body scroll.
 */
export function SidebarResizeHandle({
  edge,
  current,
  min,
  max,
  onResize,
  hideBelow,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      // Right-edge handle on a left-docked sidebar: pointer moves right
      // -> wider. Left-edge handle on a right-docked sidebar: pointer
      // moves right -> narrower (and vice versa).
      const next = edge === "right" ? start.w + dx : start.w - dx;
      const clamped = Math.min(max, Math.max(min, next));
      onResize(clamped);
    },
    [edge, max, min, onResize],
  );

  const onPointerUp = useCallback(() => {
    setDragging(false);
    startRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onPointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startRef.current = { x: e.clientX, w: current };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={() => onResize(min)}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={current}
      aria-valuemin={min}
      aria-valuemax={max}
      title="Drag to resize · double-click to reset"
      className={cn(
        "absolute top-0 bottom-0 z-50 w-1.5 cursor-col-resize group select-none touch-none",
        hideBelow === "md" ? "hidden md:block" : "hidden lg:block",
        edge === "right" ? "-right-0.5" : "-left-0.5",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-colors",
          dragging
            ? "bg-accent"
            : "bg-transparent group-hover:bg-accent/60",
        )}
      />
    </div>
  );
}
