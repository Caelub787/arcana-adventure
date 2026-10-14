// Floating sheet windows (draggable/resizable on desktop, full-screen on
// phones via FloatingPanel). Any number can be open; links between sheets
// open the target in its own window.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "@/components/ui/floating-panel";
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
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const size = note?.windowSize ?? null;
        const w = Math.min(size?.width ?? 720, vw - 32);
        const h = Math.min(size?.height ?? 760, vh - 120);
        return (
          <FloatingPanel
            key={id}
            open
            onClose={() => win.close(id)}
            title={<span className="truncate">{note?.name || "Sheet"}</span>}
            panelKey={`ag-sheet-${id}`}
            defaultSize={{ width: w, height: h }}
            onSizeChange={note?.isTemplate && ag.realViewer.isGM ? (sz) => { void ag.request({ op: "note.update", id, patch: { windowSize: sz } }).catch(() => {}); } : undefined}
            defaultPosition={{ x: Math.max(16, Math.round((vw - w) / 2) + i * 24 - 60), y: 70 + i * 24 }}
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
