// Floating sheet windows (draggable/resizable on desktop, full-screen on
// phones via FloatingPanel). Any number can be open; links between sheets
// open the target in its own window.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FloatingPanel, viewportFitScale } from "@/components/ui/floating-panel";
import { useAgMaybe } from "./hooks";
import { AgSheet } from "./AgSheet";

interface WinCtx { open: (noteId: string) => void; close: (noteId: string) => void; openIds: string[] }
const Ctx = createContext<WinCtx | null>(null);
export const useAgWindows = () => useContext(Ctx);

// The campaign page (map tokens, etc.) sits outside this provider: it opens
// sheets through this hook-free handle instead.
let pageOpener: ((id: string) => void) | null = null;
/** Open a sheet in the page's sheet windows (e.g. double-clicking its token). */
export function openAgNoteWindow(noteId: string) { pageOpener?.(noteId); }

export function AgWindowsProvider({ children }: { children: React.ReactNode }) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const open = useCallback((id: string) => setOpenIds((ids) => (ids.includes(id) ? [...ids.filter((x) => x !== id), id] : [...ids, id])), []);
  const close = useCallback((id: string) => setOpenIds((ids) => ids.filter((x) => x !== id)), []);
  useEffect(() => { pageOpener = open; return () => { if (pageOpener === open) pageOpener = null; }; }, [open]);
  const value = useMemo(() => ({ open, close, openIds }), [open, close, openIds]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Renders the open windows; must sit inside the AgScopeProvider. */
export function AgWindowStack() {
  const win = useAgWindows();
  const ag = useAgMaybe();
  if (!win || !ag) return null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  return (
    <>
      {win.openIds.map((id, i) => {
        const note = ag.state.notes.get(id);
        // A sheet opens at its template's size (the GM sets it by resizing the template's window).
        // That exact size is kept on every device: on a smaller screen (tablet, unfolded phone)
        // the whole window shrinks evenly to fit rather than being cropped into another shape.
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const size = note?.windowSize ?? null;
        const top = 70 + i * 24;
        const w = size ? size.width : Math.min(720, vw - 32);
        const h = size ? size.height : Math.min(760, vh - 120);
        const visualW = size ? w * viewportFitScale({ width: w, height: h }, top) : w;
        return (
          <FloatingPanel
            key={id}
            open
            onClose={() => win.close(id)}
            title={<span className="truncate">{note?.name || "Sheet"}</span>}
            panelKey={`ag-sheet-${id}`}
            defaultSize={{ width: w, height: h }}
            onSizeChange={note?.isTemplate && ag.realViewer.isGM ? (sz) => { void ag.request({ op: "note.update", id, patch: { windowSize: sz } }).catch(() => {}); } : undefined}
            fitToViewport={!!size}
            defaultPosition={{ x: Math.max(8, Math.min(Math.round((vw - visualW) / 2) + i * 24 - 60, vw - visualW - 8)), y: top }}
            minWidth={320}
            minHeight={260}
          >
            <AgSheet noteId={id} onClose={() => win.close(id)} />
          </FloatingPanel>
        );
      })}
    </>
  );
}
