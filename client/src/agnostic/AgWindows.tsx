// Floating sheet windows (draggable/resizable on desktop, full-screen on
// phones via FloatingPanel). Any number can be open; links between sheets
// open the target in its own window.
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { useAgMaybe } from "./hooks";
import { AgSheet } from "./AgSheet";

interface WinCtx { open: (noteId: string) => void; close: (noteId: string) => void; openIds: string[] }
const Ctx = createContext<WinCtx | null>(null);
export const useAgWindows = () => useContext(Ctx);

export function AgWindowsProvider({ children }: { children: React.ReactNode }) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const open = useCallback((id: string) => setOpenIds((ids) => (ids.includes(id) ? [...ids.filter((x) => x !== id), id] : [...ids, id])), []);
  const close = useCallback((id: string) => setOpenIds((ids) => ids.filter((x) => x !== id)), []);
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
        const w = Math.min(720, vw - 32);
        return (
          <FloatingPanel
            key={id}
            open
            onClose={() => win.close(id)}
            title={<span className="truncate">{note?.name || "Sheet"}</span>}
            panelKey={`ag-sheet-${id}`}
            defaultSize={{ width: w, height: Math.min(760, (typeof window !== "undefined" ? window.innerHeight : 800) - 120) }}
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
