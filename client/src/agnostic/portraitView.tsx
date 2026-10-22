// A sheet's picture, big: a floating panel to look at it closely — zoom with the
// buttons, the wheel, a pinch or a double tap, and drag to move about.
import React, { useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { AgPanel } from "./float";

const clampZ = (z: number) => Math.max(1, Math.min(8, z));

export function PortraitViewer({ note, onClose }: { note: AgNote; onClose: () => void }) {
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const lastTap = useRef(0);
  /** Zoom about a point (in the box's pixels from its centre), keeping that point still. */
  const zoomAt = (z: number, cx = 0, cy = 0) => setView((v) => { const nz = clampZ(z); const k = nz / v.z; return nz === 1 ? { z: 1, x: 0, y: 0 } : { z: nz, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }; });
  const fromCentre = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2] as const; };
  const btn = "h-9 w-9 rounded-md border border-stone-700 bg-stone-900/90 text-stone-200 grid place-items-center active:bg-stone-700";
  if (!note.portrait) return null;
  return (
    <AgPanel title={note.name || "Picture"} onClose={onClose} width={560} height={620} padded={false} testId="ag-portrait-viewer">
      <div ref={box} className="relative w-full h-full min-h-[320px] overflow-hidden bg-stone-950 touch-none select-none cursor-grab active:cursor-grabbing" data-testid="ag-portrait-viewer-box"
        onWheel={(e) => { const [cx, cy] = fromCentre(e); zoomAt(view.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), cx, cy); }}
        onPointerDown={(e) => {
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) { const [a, b] = Array.from(pointers.current.values()); pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; }
          const now = Date.now();
          if (pointers.current.size === 1 && now - lastTap.current < 300) { const [cx, cy] = fromCentre(e); zoomAt(view.z > 1.5 ? 1 : 3, cx, cy); }
          lastTap.current = now;
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && pinch.current) { const [a, b] = Array.from(pointers.current.values()); zoomAt(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.current.d))); return; }
          if (view.z > 1) setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
        }}
        onPointerUp={(e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; }}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; }}>
        <img src={note.portrait} alt="" draggable={false} className="absolute inset-0 m-auto max-w-full max-h-full object-contain pointer-events-none"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "center", imageRendering: view.z >= 3 ? "pixelated" : "auto" }} data-testid="ag-portrait-viewer-img" />
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button type="button" className={btn} onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(view.z * 1.5)} aria-label="Zoom in" data-testid="ag-portrait-zoom-in"><ZoomIn className="h-4 w-4" /></button>
          <button type="button" className={btn} onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(view.z / 1.5)} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
          <button type="button" className={btn} onPointerDown={(e) => e.stopPropagation()} onClick={() => setView({ z: 1, x: 0, y: 0 })} aria-label="Fit"><Maximize className="h-4 w-4" /></button>
        </div>
        <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-stone-200">{view.z > 1 ? `${view.z.toFixed(1)}× · drag to look around` : "Pinch, scroll or double-tap to zoom"}</div>
      </div>
    </AgPanel>
  );
}
