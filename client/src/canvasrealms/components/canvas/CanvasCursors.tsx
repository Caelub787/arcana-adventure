import { useEffect, useState } from "react";
import { useViewport } from "@xyflow/react";
import { useRealtime } from "@cr/lib/realtime";

interface RemoteCursor {
  clientId: number;
  name: string;
  color: string;
  x: number; // flow coords
  y: number;
}

interface Props {
  /** Restrict cursor display to peers viewing this canvas node. */
  canvasNodeId: string;
}

/** Renders absolute-positioned cursors for every remote awareness state
 * whose `cursor.canvasNodeId` matches us. Coordinates are in flow space
 * and projected to screen via the live ReactFlow viewport. */
export function CanvasCursors({ canvasNodeId }: Props) {
  const ctx = useRealtime();
  const viewport = useViewport(); // re-renders on pan/zoom
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);

  useEffect(() => {
    if (!ctx) return;
    const aw = ctx.awareness;
    const recompute = () => {
      const out: RemoteCursor[] = [];
      aw.getStates().forEach((state, clientId) => {
        if (clientId === aw.clientID) return;
        const s = state as {
          user?: { name: string; color: string };
          cursor?: { canvasNodeId: string; x: number; y: number } | null;
        };
        if (!s.user || !s.cursor) return;
        if (s.cursor.canvasNodeId !== canvasNodeId) return;
        out.push({
          clientId,
          name: s.user.name,
          color: s.user.color,
          x: s.cursor.x,
          y: s.cursor.y,
        });
      });
      setCursors(out);
    };
    recompute();
    aw.on("change", recompute);
    return () => aw.off("change", recompute);
  }, [ctx, canvasNodeId]);

  if (!ctx || cursors.length === 0) return null;

  // Project flow coords into pane-local pixels using the live viewport
  // transform: paneX = vp.x + flowX * vp.zoom. flowToScreenPosition would
  // give us page-relative coords which don't match our absolutely-positioned
  // overlay (parented to the ReactFlow pane).
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-[60]">
      {cursors.map((c) => {
        const left = viewport.x + c.x * viewport.zoom;
        const top = viewport.y + c.y * viewport.zoom;
        return (
          <div
            key={c.clientId}
            className="absolute -translate-x-[2px] -translate-y-[2px] transition-transform duration-75"
            style={{ left, top }}
          >
            <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
              <path
                d="M1 1 L1 15 L5 11 L7.5 17 L9.5 16.2 L7 10 L13 10 Z"
                fill={c.color}
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            <div
              className="ml-2 -mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap shadow-md"
              style={{ backgroundColor: c.color }}
            >
              {c.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
