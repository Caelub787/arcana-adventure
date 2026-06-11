/**
 * Touch-based drag-and-drop for mobile / tablet.
 *
 * HTML5 drag-and-drop doesn't fire on touch devices, so this module
 * provides a parallel system the app's sidebar uses to drag nodes onto
 * the canvas, map, or another pane (which triggers a split / replace).
 *
 * Usage:
 *   - The sidebar calls `beginTouchDrag()` when the user starts dragging
 *     a node row with their finger.
 *   - Each drop target registers itself once on mount via
 *     `registerTouchDropTarget()` and is notified of hover + drop.
 *
 * The system creates a small floating preview that follows the finger
 * and uses `document.elementFromPoint` to figure out which registered
 * target the finger is currently over.
 */

import type { SidebarDragPayload } from "./drag";

export type TouchDropPayload = SidebarDragPayload;

interface DropTarget {
  el: HTMLElement;
  /** Called when the dragging finger enters or leaves the target. */
  onHover?: (active: boolean) => void;
  /** Called once on touchend if the finger ended over this target. */
  onDrop: (e: {
    clientX: number;
    clientY: number;
    payload: TouchDropPayload;
  }) => void;
}

const targets = new Set<DropTarget>();

interface Session {
  payload: TouchDropPayload;
  preview: HTMLDivElement;
  lastHoverTarget: DropTarget | null;
  cleanup: () => void;
}

let activeSession: Session | null = null;

export function registerTouchDropTarget(t: DropTarget): () => void {
  targets.add(t);
  return () => {
    targets.delete(t);
    if (activeSession?.lastHoverTarget === t) {
      activeSession.lastHoverTarget = null;
    }
  };
}

function findTargetAt(x: number, y: number): DropTarget | null {
  if (!activeSession) return null;
  const prev = activeSession.preview.style.display;
  activeSession.preview.style.display = "none";
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  activeSession.preview.style.display = prev;
  if (!el) return null;
  // Walk up from the hit element so the innermost registered target wins
  // (e.g. an inner Map surface beats the outer pane wrapper).
  let cur: HTMLElement | null = el;
  while (cur) {
    for (const t of targets) {
      if (t.el === cur) return t;
    }
    cur = cur.parentElement;
  }
  return null;
}

export function beginTouchDrag(opts: {
  payload: TouchDropPayload;
  startX: number;
  startY: number;
  label: string;
}): void {
  endTouchDrag();

  const preview = document.createElement("div");
  preview.textContent = opts.label || "Node";
  preview.setAttribute("data-touch-drag-preview", "true");
  preview.style.cssText = [
    "position: fixed",
    "left: 0",
    "top: 0",
    "pointer-events: none",
    "z-index: 9999",
    "padding: 6px 10px",
    "border-radius: 6px",
    "background: hsl(var(--popover, 0 0% 100%))",
    "color: hsl(var(--popover-foreground, 0 0% 10%))",
    "border: 1px solid hsl(var(--border, 0 0% 80%))",
    "font: 600 13px system-ui, sans-serif",
    "max-width: 200px",
    "overflow: hidden",
    "text-overflow: ellipsis",
    "white-space: nowrap",
    "box-shadow: 0 10px 24px rgba(0,0,0,0.35)",
    "opacity: 0.92",
    "transform: translate(-9999px, -9999px)",
  ].join(";");
  document.body.appendChild(preview);

  const positionPreview = (x: number, y: number) => {
    preview.style.transform = `translate(${x - 60}px, ${y - 28}px)`;
  };
  positionPreview(opts.startX, opts.startY);

  const onMove = (e: TouchEvent) => {
    if (!activeSession) return;
    const t = e.touches[0];
    if (!t) return;
    // Block native scroll while a drag is in flight.
    if (e.cancelable) e.preventDefault();
    positionPreview(t.clientX, t.clientY);
    const hit = findTargetAt(t.clientX, t.clientY);
    if (hit !== activeSession.lastHoverTarget) {
      activeSession.lastHoverTarget?.onHover?.(false);
      hit?.onHover?.(true);
      activeSession.lastHoverTarget = hit;
    }
  };
  const onEnd = (e: TouchEvent) => {
    const session = activeSession;
    if (!session) return;
    const t = e.changedTouches[0];
    let hit: DropTarget | null = null;
    if (t) {
      hit = findTargetAt(t.clientX, t.clientY);
      if (hit) {
        hit.onDrop({
          clientX: t.clientX,
          clientY: t.clientY,
          payload: session.payload,
        });
      }
    }
    endTouchDrag();
  };
  const onCancel = () => endTouchDrag();

  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
  document.addEventListener("touchcancel", onCancel);

  activeSession = {
    payload: opts.payload,
    preview,
    lastHoverTarget: null,
    cleanup: () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    },
  };
}

export function endTouchDrag(): void {
  const session = activeSession;
  if (!session) return;
  session.lastHoverTarget?.onHover?.(false);
  session.cleanup();
  try {
    session.preview.remove();
  } catch {
    // ignore
  }
  activeSession = null;
}

export function isTouchDragActive(): boolean {
  return activeSession !== null;
}
