// The notes workspace: the whole screen given over to notes.
//
// The side panel is a column a few hundred pixels wide, which is fine for
// reading one note and miserable for working across several. This is the same
// notes, with room: a folder tree down the left and as many notes as you like
// open at once as windows you can move, resize, and tile side by side.
//
// Every window is an ordinary CampaignNotesPanel in content-only mode, so
// editing here is editing anywhere - same live collaboration, same presence,
// same saves reaching everyone else in the campaign as they type.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CampaignNotesPanel } from "@/components/notes/CampaignNotesPanel";
import { bringFloatingPanelToFront } from "@/components/ui/floating-panel";
import { useOverlayHistory } from "@/lib/appHistory";
import { Columns3, Grid2x2, Minimize2, Plus, X } from "lucide-react";

interface WorkspaceWindow {
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

const RAIL_WIDTH = 240;
const HEADER_HEIGHT = 40;
const MIN_W = 280;
const MIN_H = 180;

export function NotesWorkspace({
  campaignId,
  isGm,
  campaignMembers,
  onClose,
  initialNoteId,
}: {
  campaignId: string;
  isGm: boolean;
  campaignMembers?: Array<{ id: string; userId: string; username: string }>;
  onClose: () => void;
  /** The note the side panel was showing, so opening this keeps your place. */
  initialNoteId?: string | null;
}) {
  // The workspace takes its z from the same counter every panel and dialog
  // draws from, rather than a number of its own. A hardcoded one sat above
  // the dialog layer, so the Add-chapter picker, the share dialog and the
  // folder dialog all opened behind the workspace and read as dead buttons.
  const [baseZ] = useState(() => bringFloatingPanelToFront("notes-workspace", undefined, true));

  // The workspace comes back the way it was left: which notes were open, and
  // where each one sat. Per campaign, per browser - it is how you arranged
  // your own screen, not something the campaign shares.
  const layoutKey = `aa-notes-workspace-${campaignId}`;
  const [windows, setWindows] = useState<WorkspaceWindow[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(layoutKey) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved
        .filter((w: any) => w && typeof w.noteId === "string")
        .map((w: any, i: number) => ({
          noteId: w.noteId,
          x: Number(w.x) || 0,
          y: Number(w.y) || 0,
          w: Math.max(MIN_W, Number(w.w) || 480),
          h: Math.max(MIN_H, Number(w.h) || 420),
          z: Number(w.z) || i + 1,
        }));
    } catch {
      return [];
    }
  });
  const topZ = useRef(1);
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { kind: "move" | "resize"; noteId: string; startX: number; startY: number; ox: number; oy: number; ow: number; oh: number }
    | null
  >(null);

  const { data: notes = [] } = useQuery<any[]>({
    queryKey: ["/api/notes/all", campaignId],
    queryFn: () => api.getNotes(undefined, campaignId),
  });
  const titleOf = (id: string) => notes.find((n) => n.id === id)?.title || "Untitled";

  // `|| ` rather than `?? `: an unmeasured element reports 0, not undefined,
  // and laying windows out in a zero-width area puts them all on top of each
  // other at the origin.
  const areaSize = () => {
    const el = areaRef.current;
    return { w: el?.clientWidth || 900, h: el?.clientHeight || 600 };
  };

  const openWindow = useCallback((noteId: string) => {
    setWindows((prev) => {
      const already = prev.find((w) => w.noteId === noteId);
      topZ.current += 1;
      // Reopening a note that is already up brings it forward rather than
      // stacking a second copy of the same note on top of itself.
      if (already) return prev.map((w) => (w.noteId === noteId ? { ...w, z: topZ.current } : w));
      const { w: aw, h: ah } = areaSize();
      const width = Math.min(560, Math.max(MIN_W, Math.round(aw * 0.45)));
      const height = Math.min(560, Math.max(MIN_H, Math.round(ah * 0.7)));
      const step = prev.length * 28;
      return [...prev, {
        noteId,
        x: Math.min(Math.max(0, aw - width), 24 + step),
        y: Math.min(Math.max(0, ah - height), 24 + step),
        w: width,
        h: height,
        z: topZ.current,
      }];
    });
  }, []);

  useEffect(() => {
    topZ.current = windows.reduce((m, w) => Math.max(m, w.z), 1);
    // Only on the first render: from then on openWindow keeps it moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open on whatever the side panel was showing, so the button feels like
  // "give this more room" rather than "start again". A remembered layout is
  // the stronger claim, so a note already in it is only brought forward.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialNoteId) openWindow(initialNoteId);
  }, [initialNoteId, openWindow]);

  // Written on every change rather than on close, so a tab closed or reloaded
  // mid-session still comes back to the same arrangement.
  useEffect(() => {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(windows));
    } catch {
      // A browser with storage blocked just doesn't remember; nothing here
      // is worth failing the workspace over.
    }
  }, [windows, layoutKey]);

  // A note that has since been deleted (or that this viewer lost access to)
  // would be a window that can never render. Drop it once the list is known.
  useEffect(() => {
    if (notes.length === 0) return;
    setWindows((prev) => {
      const known = new Set(notes.map((n) => n.id));
      const kept = prev.filter((w) => known.has(w.noteId));
      return kept.length === prev.length ? prev : kept;
    });
  }, [notes]);

  const closeWindow = (noteId: string) =>
    setWindows((prev) => prev.filter((w) => w.noteId !== noteId));
  const bringToFront = (noteId: string) =>
    setWindows((prev) => {
      const w = prev.find((x) => x.noteId === noteId);
      if (!w || w.z === topZ.current) return prev;
      topZ.current += 1;
      return prev.map((x) => (x.noteId === noteId ? { ...x, z: topZ.current } : x));
    });

  // Split screen: everything open, laid out in a grid that fills the area.
  const tile = (columns?: number) => {
    setWindows((prev) => {
      if (prev.length === 0) return prev;
      const { w: aw, h: ah } = areaSize();
      const cols = columns ?? Math.ceil(Math.sqrt(prev.length));
      const rows = Math.ceil(prev.length / cols);
      const gap = 8;
      // Clamped before it is used for position as well as size, or a narrow
      // area lays the second column out to the left of the first.
      const cw = Math.max(MIN_W, Math.floor((aw - gap * (cols + 1)) / cols));
      const chh = Math.max(MIN_H, Math.floor((ah - gap * (rows + 1)) / rows));
      return prev.map((win, i) => ({
        ...win,
        x: gap + (i % cols) * (cw + gap),
        y: gap + Math.floor(i / cols) * (chh + gap),
        w: cw,
        h: chh,
      }));
    });
  };

  // One pointer-move listener for the whole workspace rather than one per
  // window: a listener added on every pointerdown is a listener leaked every
  // time a release lands somewhere unexpected.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const { w: aw, h: ah } = areaSize();
      setWindows((prev) => prev.map((win) => {
        if (win.noteId !== d.noteId) return win;
        if (d.kind === "move") {
          return {
            ...win,
            x: Math.min(Math.max(0, aw - 80), Math.max(0, d.ox + dx)),
            y: Math.min(Math.max(0, ah - HEADER_HEIGHT), Math.max(0, d.oy + dy)),
          };
        }
        return {
          ...win,
          w: Math.max(MIN_W, Math.min(aw - win.x, d.ow + dx)),
          h: Math.max(MIN_H, Math.min(ah - win.y, d.oh + dy)),
        };
      }));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const startDrag = (kind: "move" | "resize", win: WorkspaceWindow, e: React.PointerEvent) => {
    e.preventDefault();
    bringToFront(win.noteId);
    drag.current = {
      kind, noteId: win.noteId,
      startX: e.clientX, startY: e.clientY,
      ox: win.x, oy: win.y, ow: win.w, oh: win.h,
    };
  };

  // Back - the browser's, or the one on the side of a mouse - closes the
  // workspace rather than leaving the campaign. It is a whole screen, so it
  // ought to behave like a page even though it isn't one.
  useOverlayHistory(true, onClose, "notes-workspace");

  // Escape leaves the workspace, the same as the button - but not while a
  // dialog inside it is open, since that swallows the key first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-stone-950 flex flex-col" style={{ zIndex: baseZ }} data-testid="notes-workspace">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800 shrink-0">
        <span className="font-display text-sm font-bold" style={{ color: "var(--ca-gilt-bright)" }}>
          Notes
        </span>
        <span className="text-[11px] text-stone-500 flex-1 truncate">
          {windows.length === 0 ? "Pick a note on the left to open it here." : `${windows.length} open`}
        </span>
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => tile(2)} disabled={windows.length < 2}
          title="Side by side"
          data-testid="button-workspace-split"
        >
          <Columns3 className="h-3 w-3 mr-1" /> Split
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => tile()} disabled={windows.length < 2}
          title="Tile every open note"
          data-testid="button-workspace-tile"
        >
          <Grid2x2 className="h-3 w-3 mr-1" /> Tile
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          onClick={onClose}
          title="Back to the campaign"
          data-testid="button-workspace-close"
        >
          <Minimize2 className="h-3 w-3 mr-1" /> Close
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div style={{ width: RAIL_WIDTH }} className="shrink-0 h-full overflow-hidden border-r border-stone-800">
          <CampaignNotesPanel
            campaignId={campaignId}
            onClose={onClose}
            isOpen={true}
            isGm={isGm}
            campaignMembers={campaignMembers}
            navOnly
            hideCloseButton
            onOpenFloatingNote={openWindow}
            // An entity-linked note opens as a window here too; there is no
            // character sheet in the workspace to dock it against.
            onOpenEntityNote={(_type, _entityId, noteId) => openWindow(noteId)}
          />
        </div>

        <div ref={areaRef} className="relative flex-1 min-w-0 h-full overflow-hidden bg-stone-950">
          {windows.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-600 pointer-events-none">
              <Plus className="h-8 w-8" />
              <p className="text-sm">Open a note from the tree to start.</p>
              <p className="text-xs">Open as many as you like, then Split or Tile them.</p>
            </div>
          )}

          {windows.map((win) => (
            <div
              key={win.noteId}
              className="absolute rounded-lg overflow-hidden bg-stone-900 shadow-[0_8px_40px_rgba(0,0,0,0.6)] flex flex-col"
              style={{
                left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z,
                border: "1px solid var(--ca-gilt-line-soft)",
              }}
              onPointerDown={() => bringToFront(win.noteId)}
              data-testid={`workspace-window-${win.noteId}`}
            >
              <div
                className="flex items-center gap-1 px-2 shrink-0 border-b border-stone-800 cursor-move select-none"
                style={{ height: HEADER_HEIGHT }}
                onPointerDown={(e) => startDrag("move", win, e)}
                data-testid={`workspace-window-header-${win.noteId}`}
              >
                <span className="text-xs text-stone-300 truncate flex-1">{titleOf(win.noteId)}</span>
                <button
                  onClick={() => closeWindow(win.noteId)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded text-stone-500 hover:text-stone-200 hover:bg-stone-800"
                  aria-label="Close"
                  data-testid={`button-workspace-window-close-${win.noteId}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <CampaignNotesPanel
                  campaignId={campaignId}
                  onClose={() => closeWindow(win.noteId)}
                  isOpen={true}
                  isGm={isGm}
                  campaignMembers={campaignMembers}
                  contentOnly
                  hideCloseButton
                  initialNoteId={win.noteId}
                />
              </div>
              <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                onPointerDown={(e) => { e.stopPropagation(); startDrag("resize", win, e); }}
                data-testid={`workspace-window-resize-${win.noteId}`}
              >
                <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-stone-600" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
