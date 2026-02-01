import React, { useRef, useEffect } from "react";
import { X, FileText, Grid3X3 } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export interface OpenNote {
  noteId: string;
  title: string;
  type?: "markdown" | "canvas";
}

interface NoteTabsProps {
  openNotes: OpenNote[];
  activeNoteId: string | null;
  onTabClick: (noteId: string) => void;
  onTabClose: (noteId: string) => void;
  compact?: boolean;
}

export function NoteTabs({
  openNotes,
  activeNoteId,
  onTabClick,
  onTabClose,
  compact = false,
}: NoteTabsProps) {
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeNoteId]);

  if (openNotes.length === 0) {
    return null;
  }

  return (
    <div className={`border-b border-stone-800 bg-stone-900/80 ${compact ? 'py-1' : 'py-1.5'}`}>
      <ScrollArea className="w-full">
        <div className={`flex gap-1 px-2 ${compact ? 'max-w-full' : 'max-w-full'}`}>
          {openNotes.map((note) => {
            const isActive = note.noteId === activeNoteId;
            return (
              <button
                key={note.noteId}
                ref={isActive ? activeTabRef : null}
                onClick={() => onTabClick(note.noteId)}
                className={`group flex items-center gap-1.5 px-2 rounded-t transition-all flex-shrink-0 ${
                  compact ? 'py-1 text-xs max-w-[120px]' : 'py-1.5 text-sm max-w-[180px]'
                } ${
                  isActive
                    ? "bg-stone-800 text-amber-400 border-b-2 border-amber-500"
                    : "bg-stone-900/50 text-stone-400 hover:bg-stone-800/70 hover:text-stone-300 border-b-2 border-transparent"
                }`}
                data-testid={`note-tab-${note.noteId}`}
              >
                {note.type === "canvas" ? (
                  <Grid3X3 className={`flex-shrink-0 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} ${isActive ? 'text-indigo-400' : 'text-stone-500'}`} />
                ) : (
                  <FileText className={`flex-shrink-0 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                )}
                <span className="truncate flex-1 text-left">{note.title || "Untitled"}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(note.noteId);
                  }}
                  className={`flex-shrink-0 p-0.5 rounded hover:bg-stone-700 transition-colors ${
                    isActive ? 'text-stone-400 hover:text-stone-200' : 'text-stone-500 hover:text-stone-300 opacity-0 group-hover:opacity-100'
                  }`}
                  data-testid={`note-tab-close-${note.noteId}`}
                >
                  <X className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                </button>
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </div>
  );
}

export function useNoteTabs(initialNotes: OpenNote[] = []) {
  const [openNotes, setOpenNotes] = React.useState<OpenNote[]>(initialNotes);
  const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);

  const openNote = React.useCallback((noteId: string, title: string, type?: "markdown" | "canvas") => {
    setOpenNotes((prev) => {
      const existing = prev.find((n) => n.noteId === noteId);
      if (existing) {
        if (existing.title !== title || existing.type !== type) {
          return prev.map((n) =>
            n.noteId === noteId ? { ...n, title, type } : n
          );
        }
        return prev;
      }
      return [...prev, { noteId, title, type }];
    });
    setActiveNoteId(noteId);
  }, []);

  const closeTab = React.useCallback((noteId: string) => {
    setOpenNotes((prev) => {
      const idx = prev.findIndex((n) => n.noteId === noteId);
      if (idx === -1) return prev;
      const newNotes = prev.filter((n) => n.noteId !== noteId);
      return newNotes;
    });
    setActiveNoteId((currentActive) => {
      if (currentActive !== noteId) return currentActive;
      const currentNotes = openNotes;
      const idx = currentNotes.findIndex((n) => n.noteId === noteId);
      if (currentNotes.length <= 1) return null;
      if (idx > 0) return currentNotes[idx - 1].noteId;
      return currentNotes[1]?.noteId || null;
    });
  }, [openNotes]);

  const switchTab = React.useCallback((noteId: string) => {
    setActiveNoteId(noteId);
  }, []);

  const updateTabTitle = React.useCallback((noteId: string, title: string) => {
    setOpenNotes((prev) =>
      prev.map((n) => (n.noteId === noteId ? { ...n, title } : n))
    );
  }, []);

  return {
    openNotes,
    activeNoteId,
    openNote,
    closeTab,
    switchTab,
    updateTabTitle,
    setOpenNotes,
    setActiveNoteId,
  };
}
