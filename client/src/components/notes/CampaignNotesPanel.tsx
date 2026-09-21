import React, { useState, useEffect, useRef, useCallback } from "react";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Note, NoteFolder, NoteShare, UserProfile, SystemSpell, SystemSkill, SystemTrait, SystemSpecies, gameWs, globalWs, noteWs, NotePresence, KnowledgeRevision } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { editKeepsGmSecrets, hasRedactedGmSecrets } from "@/lib/gmSecretGuard";
import { remapCaret } from "@/lib/liveTextSync";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Folder, FolderOpen, FolderPlus, FileText, Pin, Archive, Trash2, Eraser, Share2, MoreVertical, ChevronRight, ChevronDown, ChevronLeft, Users, Search, X, Edit, Eye, EyeOff, Link2, Grid3X3, Network, CloudUpload, Home, ArrowUp, ArrowLeft, BookOpen, Globe, History as HistoryIcon, Map as MapIcon, Table as TableIcon } from "lucide-react";
import { ReferencePicker, NoteOnlyPicker } from "@/components/notes/ReferencePicker";
import { CanvasEditor, CanvasData } from "@/components/notes/CanvasEditor";
import { NoteSheetGrid } from "@/components/notes/NoteSheetGrid";
import { type SheetData, makeEmptySheet } from "@/lib/sheetFormula";
import { NotesGraph } from "@/components/notes/NotesGraph";
import { NoteTabs, useNoteTabs, OpenNote, GRAPH_TAB_ID, TIMELINES_TAB_ID } from "@/components/notes/NoteTabs";
import { clickEndsNoteEditing } from "@/lib/noteEditFocus";
import { TimelinePanel } from "@/components/notes/TimelinePanel";
import { SceneNoteCard, type SceneNoteLink } from "@/components/notes/SceneNoteCard";
import { BookView } from "@/components/notes/BookView";

function sceneLinkFromNote(note: Note | undefined): SceneNoteLink | null {
  if (!note || note.type !== "scene") return null;
  const data = note.canvasData as any;
  if (!data || typeof data !== "object") return null;
  return data as SceneNoteLink;
}
import { FormattingToolbar, useFormattingShortcuts, renderFormattedText, getFontClass, replaceNthImageMarkdown, type NoteFont, type ImageEditContext } from "@/components/notes/FormattingToolbar";
import type { SearchableEntity, NoteReference } from "@/lib/api";

interface CampaignNotesPanelProps {
  campaignId: string;
  onClose: () => void;
  isOpen: boolean;
  campaignMembers?: Array<{ id: string; userId: string; username: string }>;
  onViewCharacter?: (character: any) => void;
  initialNoteId?: string | null;
  hideCloseButton?: boolean;
  // GMs get GM-only affordances (connect-to-sheet, import, history, ...) -
  // players never see them. Note/folder sharing itself is handled by the
  // Share dialog's per-member panel, plus the automatic Wiki/Party/player-
  // folder visibility rules applied server-side on move.
  isGm?: boolean;
  // Sidebar mode: the campaign side panel's "Notes" tab is navigation only
  // (folder tree + search), like Obsidian's sidebar - it never shows note
  // content inline. Selecting a note (or Graph/Timelines) hands off to
  // onOpenFloatingNote instead of opening inline, and the content pane
  // isn't rendered at all. Not set when this panel IS the floating/full
  // note view (opened from a sheet's Notes button, or popped out).
  navOnly?: boolean;
  onOpenFloatingNote?: (noteId: string) => void;
  // Sidebar mode only: a note linked to a character/item sheet opens docked
  // alongside that sheet (the same docking its own Notes button uses)
  // instead of via onOpenFloatingNote. Falls back to onOpenFloatingNote when
  // not provided, or for notes with no entity link.
  onOpenEntityNote?: (entityType: 'character-sheet' | 'item-sheet' | 'character-ability', entityId: string, noteId: string) => void;
  // Sidebar's right-click "Timelines" menu item - navOnly has no tab bar to
  // host the Timelines/Graph views inline, so opening them is delegated to
  // the caller (which can pop them into their own floating panel).
  onOpenTimelines?: () => void;
  // Content-only mode: the inverse of navOnly - no folder tree/search/Home,
  // no Graph/Timelines toggles, no multi-note tab bar. Just the single note
  // named by initialNoteId, full-bleed. Used everywhere a note is shown
  // outside the sidebar (a character/item sheet's docked notes pane, the
  // floating panel for a note with no entity link, mobile's fullscreen note
  // view) so navigation chrome only ever appears in the sidebar itself.
  contentOnly?: boolean;
  // contentOnly's own title bar (file icon + note title) is only useful when
  // nothing else on screen already shows the title - a caller that docks
  // this panel inside its own titled chrome (e.g. NotesWorkspace's window,
  // which already has a draggable header showing the same title) sets this
  // to skip the second copy entirely rather than stack two title rows.
  hideNoteHeader?: boolean;
}

const FOLDER_COLORS = [
  { name: "Default", value: null },
  { name: "Amber", value: "amber" },
  { name: "Blue", value: "blue" },
  { name: "Green", value: "green" },
  { name: "Purple", value: "purple" },
  { name: "Red", value: "red" },
];

function getFolderColorClass(color: string | null | undefined): string {
  switch (color) {
    case "amber":
      return "text-amber-500";
    case "blue":
      return "text-blue-500";
    case "green":
      return "text-green-500";
    case "purple":
      return "text-amber-500";
    case "red":
      return "text-red-500";
    default:
      return "text-stone-400";
  }
}

type FolderSortMode = "name" | "date" | "custom";

function DropIndicator({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`h-0.5 mx-2 rounded transition-all ${
        isActive ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-transparent"
      }`}
    />
  );
}

function RootDropZone({ onDropToRoot, onDropNoteToRoot }: { onDropToRoot: (folderId: string) => void; onDropNoteToRoot?: (noteId: string) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const noteId = e.dataTransfer.getData("application/note-id");
    if (noteId && onDropNoteToRoot) {
      onDropNoteToRoot(noteId);
      return;
    }
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId) {
      onDropToRoot(draggedId);
    }
  };

  return (
    <div
      className={`flex items-center gap-1 py-0.5 px-1.5 rounded text-xs transition-colors ${
        isDragOver
          ? "bg-amber-700/50 ring-1 ring-amber-500 text-amber-300"
          : "text-stone-500 hover:text-stone-400"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="panel-drop-zone-root"
    >
      <ArrowUp className="h-2.5 w-2.5" />
      <span>{isDragOver ? "Drop here to move to root" : "Drag here to move to root"}</span>
    </div>
  );
}

// The rename input for a single note - its own component (not just inline
// state in the row) because each row that needs it lives inside a .map(),
// where hooks can't be called conditionally per-iteration.
function NoteRenameInput({
  note,
  onCommit,
  onCancel,
}: {
  note: Note;
  onCommit: (noteId: string, title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(note.title);
  const commit = () => onCommit(note.id, draft.trim() || note.title);
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      className="flex-1 min-w-0 bg-stone-800 border border-amber-600 rounded px-1 text-stone-100 outline-none"
      data-testid={`input-rename-note-${note.id}`}
    />
  );
}

interface FolderTreeItemProps {
  folder: NoteFolder;
  folders: NoteFolder[];
  allNotes: Note[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  onSelect: (id: string | null) => void;
  onNoteSelect: (noteId: string) => void;
  onContextMenu: (folder: NoteFolder) => void;
  /** Only the folder's owner can share it, so this is absent for everyone else. */
  onShareFolder?: (folder: NoteFolder) => void;
  onAddSubfolder: (parentId: string) => void;
  onDeleteFolder: (folder: NoteFolder) => void;
  onMoveFolder: (folderId: string, newParentId: string | null) => void;
  onReorderFolder: (folderId: string, targetIndex: number, parentId: string | null) => void;
  onCreateNote: (folderId: string) => void;
  onCreateCanvas: (folderId: string) => void;
  onCreateSheet: (folderId: string) => void;
  /** Scene notes are a GM tool - absent for a non-GM viewer. */
  onCreateScene?: (folderId: string) => void;
  onShareNote: (noteId: string) => void;
  onDeleteNote: (note: Note) => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  level?: number;
  index?: number;
  siblingCount?: number;
  draggedFolderId: string | null;
  setDraggedFolderId: (id: string | null) => void;
  dropTargetIndex: number | null;
  setDropTargetIndex: (index: number | null) => void;
  currentCampaignId?: string;
  currentUserId?: string;
  sortMode: FolderSortMode;
  expandedFolderIds: Set<string>;
  setExpandedFolderIds: (ids: Set<string>) => void;
  /** Set right after this folder is created - swaps its name for an
   * editable, auto-selected input instead of opening a dialog to rename it. */
  renamingFolderId: string | null;
  onRenameCommit: (folderId: string, name: string) => void;
  onRenameCancel: () => void;
  /** Same pattern as renamingFolderId/onRenameCommit/onRenameCancel above,
   * for a note instead of a folder - double-clicking a note's title or
   * picking Rename from its context menu swaps it for an editable input. */
  renamingNoteId: string | null;
  onRenameNoteStart: (noteId: string) => void;
  onRenameNoteCommit: (noteId: string, title: string) => void;
  onRenameNoteCancel: () => void;
}

function FolderTreeItem({
  folder,
  folders,
  allNotes,
  selectedFolderId,
  selectedNoteId,
  onSelect,
  onNoteSelect,
  onContextMenu,
  onShareFolder,
  onAddSubfolder,
  onDeleteFolder,
  onMoveFolder,
  onReorderFolder,
  onCreateNote,
  onCreateCanvas,
  onCreateSheet,
  onCreateScene,
  onShareNote,
  onDeleteNote,
  onMoveNote,
  level = 0,
  index = 0,
  siblingCount = 1,
  draggedFolderId,
  setDraggedFolderId,
  dropTargetIndex,
  setDropTargetIndex,
  currentCampaignId,
  currentUserId,
  sortMode,
  expandedFolderIds,
  setExpandedFolderIds,
  renamingFolderId,
  onRenameCommit,
  onRenameCancel,
  renamingNoteId,
  onRenameNoteStart,
  onRenameNoteCommit,
  onRenameNoteCancel,
}: FolderTreeItemProps) {
  const expanded = expandedFolderIds.has(folder.id);
  const setExpanded = (isExpanded: boolean) => {
    const newSet = new Set(expandedFolderIds);
    if (isExpanded) {
      newSet.add(folder.id);
    } else {
      newSet.delete(folder.id);
    }
    setExpandedFolderIds(newSet);
  };
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState<"before" | "into" | "after" | null>(null);
  const isRenaming = renamingFolderId === folder.id;
  const [renameDraft, setRenameDraft] = useState(folder.name);
  useEffect(() => {
    if (isRenaming) setRenameDraft(folder.name);
  }, [isRenaming, folder.name]);
  const commitRename = () => {
    const trimmed = renameDraft.trim();
    onRenameCommit(folder.id, trimmed || folder.name);
  };
  const children = folders
    .filter((f) => f.parentId === folder.id)
    .sort((a, b) => {
      switch (sortMode) {
        case "name":
          return a.name.localeCompare(b.name);
        case "date":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "custom":
        default:
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }
    });
  const folderNotes = allNotes.filter((n) => n.folderId === folder.id);
  const isSelected = selectedFolderId === folder.id;
  const hasChildren = children.length > 0;
  const hasContent = hasChildren || folderNotes.length > 0;
  
  // Determine visibility status
  const isGlobal = !folder.campaignId;
  const isOtherCampaign = folder.campaignId && folder.campaignId !== currentCampaignId;
  const isSharedFolder = currentUserId && folder.userId !== currentUserId;

  const isDescendant = (parentId: string, childId: string): boolean => {
    const child = folders.find(f => f.id === childId);
    if (!child) return false;
    if (child.parentId === parentId) return true;
    if (child.parentId) return isDescendant(parentId, child.parentId);
    return false;
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", folder.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedFolderId(folder.id);
  };

  const handleDragEnd = () => {
    setDraggedFolderId(null);
    setDropTargetIndex(null);
    setDropPosition(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const hasNoteData = e.dataTransfer.types.includes("application/note-id");
    if (hasNoteData) {
      e.dataTransfer.dropEffect = "move";
      setDropPosition("into");
      setIsDragOver(true);
      return;
    }
    if (!draggedFolderId || draggedFolderId === folder.id || isDescendant(draggedFolderId, folder.id)) {
      return;
    }
    e.dataTransfer.dropEffect = "move";
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    if (y < height * 0.25) {
      setDropPosition("before");
      setDropTargetIndex(index);
    } else if (y > height * 0.75) {
      setDropPosition("after");
      setDropTargetIndex(index + 1);
    } else {
      setDropPosition("into");
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDropPosition(null);
    
    const noteId = e.dataTransfer.getData("application/note-id");
    if (noteId) {
      onMoveNote(noteId, folder.id);
      return;
    }
    
    if (!draggedFolderId || draggedFolderId === folder.id || isDescendant(draggedFolderId, folder.id)) {
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    if (y < height * 0.25) {
      onReorderFolder(draggedFolderId, index, folder.parentId ?? null);
    } else if (y > height * 0.75) {
      onReorderFolder(draggedFolderId, index + 1, folder.parentId ?? null);
    } else {
      onMoveFolder(draggedFolderId, folder.id);
    }
    
    setDraggedFolderId(null);
    setDropTargetIndex(null);
  };

  return (
    <div>
      {index === 0 && <DropIndicator isActive={dropPosition === "before" && dropTargetIndex === 0} />}
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
          <div
            className={`flex items-center gap-1 py-1 px-1.5 rounded-md border cursor-pointer transition-all text-xs ${
              isDragOver && dropPosition === "into"
                ? "bg-amber-700/50 ring-2 ring-amber-500 border-transparent"
                : isSelected
                ? "bg-amber-900/25 text-amber-400 border-amber-700/40 shadow-[0_0_10px_rgba(61,119,240,0.15)]"
                : isOtherCampaign
                ? "border-transparent hover:bg-stone-800/50 hover:border-stone-700/40 text-stone-500 opacity-60"
                : "border-transparent hover:bg-stone-800/50 hover:border-stone-700/40 text-stone-300"
            }`}
            style={{ paddingLeft: `${level * 8 + 4}px` }}
            onClick={() => setExpanded(!expanded)}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid={`panel-folder-item-${folder.id}`}
          >
        {hasContent ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-stone-700 rounded"
          >
            {expanded ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
          </button>
        ) : (
          <span className="w-3" />
        )}
        {expanded && hasContent ? (
          <FolderOpen className={`h-3 w-3 ${getFolderColorClass(folder.color)}`} />
        ) : (
          <Folder className={`h-3 w-3 ${getFolderColorClass(folder.color)}`} />
        )}
        {isRenaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              else if (e.key === "Escape") { e.preventDefault(); onRenameCancel(); }
            }}
            className="flex-1 min-w-0 bg-stone-800 border border-amber-600 rounded px-1 text-stone-100 outline-none"
            data-testid={`input-rename-folder-${folder.id}`}
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}
        {isGlobal && (
          <span title="Global folder">
            <Network className="h-2.5 w-2.5 text-stone-500" />
          </span>
        )}
        {isSharedFolder && (
          <span title="Shared with you">
            <Users className="h-2.5 w-2.5 text-blue-400" />
          </span>
        )}
        {isOtherCampaign && (
          <span title="Other campaign">
            <EyeOff className="h-2.5 w-2.5 text-amber-400" />
          </span>
        )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-stone-900 border-stone-700" onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem
            onClick={() => onContextMenu(folder)}
            data-testid={`context-menu-rename-${folder.id}`}
          >
            <Edit className="h-3 w-3 mr-2" /> Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onAddSubfolder(folder.id)}
            data-testid={`context-menu-add-subfolder-${folder.id}`}
          >
            <FolderPlus className="h-3 w-3 mr-2" /> Add Subfolder
          </ContextMenuItem>
          {onShareFolder && (
            <ContextMenuItem
              onClick={() => onShareFolder(folder)}
              data-testid={`context-menu-share-folder-${folder.id}`}
            >
              <Share2 className="h-3 w-3 mr-2" /> Share…
            </ContextMenuItem>
          )}
          <ContextMenuSeparator className="bg-stone-700" />
          <ContextMenuItem
            onClick={() => onCreateNote(folder.id)}
            data-testid={`context-menu-new-note-${folder.id}`}
          >
            <FileText className="h-3 w-3 mr-2" /> New Note
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCreateCanvas(folder.id)}
            data-testid={`context-menu-new-canvas-${folder.id}`}
          >
            <Grid3X3 className="h-3 w-3 mr-2" /> New Canvas
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onCreateSheet(folder.id)}
            data-testid={`context-menu-new-sheet-${folder.id}`}
          >
            <TableIcon className="h-3 w-3 mr-2" /> New Sheet
          </ContextMenuItem>
          {onCreateScene && (
            <ContextMenuItem
              onClick={() => onCreateScene(folder.id)}
              data-testid={`context-menu-new-scene-${folder.id}`}
            >
              <MapIcon className="h-3 w-3 mr-2" /> New Scene
            </ContextMenuItem>
          )}
          <ContextMenuSeparator className="bg-stone-700" />
          <ContextMenuItem
            onClick={() => onDeleteFolder(folder)}
            className="text-red-400 focus:text-red-400"
            data-testid={`context-menu-delete-folder-${folder.id}`}
          >
            <Trash2 className="h-3 w-3 mr-2" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <DropIndicator isActive={dropPosition === "after" && dropTargetIndex === index + 1} />
      {expanded && (
        <>
          {children.map((child, childIndex) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              folders={folders}
              allNotes={allNotes}
              selectedFolderId={selectedFolderId}
              selectedNoteId={selectedNoteId}
              onSelect={onSelect}
              onNoteSelect={onNoteSelect}
              onContextMenu={onContextMenu}
              onShareFolder={onShareFolder}
              onAddSubfolder={onAddSubfolder}
              onDeleteFolder={onDeleteFolder}
              onMoveFolder={onMoveFolder}
              onReorderFolder={onReorderFolder}
              onCreateNote={onCreateNote}
              onCreateCanvas={onCreateCanvas}
              onCreateSheet={onCreateSheet}
              onCreateScene={onCreateScene}
              onShareNote={onShareNote}
              onDeleteNote={onDeleteNote}
              onMoveNote={onMoveNote}
              level={level + 1}
              index={childIndex}
              siblingCount={children.length}
              draggedFolderId={draggedFolderId}
              setDraggedFolderId={setDraggedFolderId}
              dropTargetIndex={dropTargetIndex}
              setDropTargetIndex={setDropTargetIndex}
              currentCampaignId={currentCampaignId}
              currentUserId={currentUserId}
              sortMode={sortMode}
              expandedFolderIds={expandedFolderIds}
              setExpandedFolderIds={setExpandedFolderIds}
              renamingFolderId={renamingFolderId}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              renamingNoteId={renamingNoteId}
              onRenameNoteStart={onRenameNoteStart}
              onRenameNoteCommit={onRenameNoteCommit}
              onRenameNoteCancel={onRenameNoteCancel}
            />
          ))}
          {folderNotes.map((note) => {
            const isRenamingNote = renamingNoteId === note.id;
            return (
            <ContextMenu key={note.id}>
              <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
                <div
                  draggable={!isRenamingNote}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/note-id", note.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isRenamingNote) onNoteSelect(note.id);
                  }}
                  className={`flex items-center gap-1 py-0.5 px-1.5 rounded-md border cursor-pointer transition-all text-xs ${
                    selectedNoteId === note.id
                      ? "bg-amber-900/25 text-amber-400 border-amber-700/40 shadow-[0_0_8px_rgba(61,119,240,0.12)]"
                      : "border-transparent hover:bg-stone-800/50 hover:border-stone-700/40 text-stone-400"
                  }`}
                  style={{ paddingLeft: `${(level + 1) * 8 + 4}px` }}
                  data-testid={`panel-folder-note-item-${note.id}`}
                >
                  {note.type === "canvas" ? (
                    <Grid3X3 className="h-2.5 w-2.5 flex-shrink-0" />
                  ) : note.type === "sheet" ? (
                    <TableIcon className="h-2.5 w-2.5 flex-shrink-0" />
                  ) : note.type === "scene" ? (
                    <MapIcon className="h-2.5 w-2.5 flex-shrink-0" />
                  ) : note.type === "book" ? (
                    <BookOpen className="h-2.5 w-2.5 flex-shrink-0" />
                  ) : (
                    <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                  )}
                  {isRenamingNote ? (
                    <NoteRenameInput note={note} onCommit={onRenameNoteCommit} onCancel={onRenameNoteCancel} />
                  ) : (
                    <span
                      className="flex-1 truncate"
                      onDoubleClick={(e) => { e.stopPropagation(); onRenameNoteStart(note.id); }}
                    >
                      {note.title || "Untitled"}
                    </span>
                  )}
                  {note.isPinned && <Pin className="h-2 w-2 text-amber-500" />}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="bg-stone-900 border-stone-700" onCloseAutoFocus={(e) => e.preventDefault()}>
                <ContextMenuItem
                  onClick={() => onRenameNoteStart(note.id)}
                  data-testid={`panel-folder-note-rename-${note.id}`}
                >
                  <Edit className="h-3 w-3 mr-2" /> Rename
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onShareNote(note.id)}
                  data-testid={`panel-folder-note-share-${note.id}`}
                >
                  <Share2 className="h-3 w-3 mr-2" /> Share
                </ContextMenuItem>
                <ContextMenuSeparator className="bg-stone-700" />
                <ContextMenuItem
                  onClick={() => onDeleteNote(note)}
                  className="text-red-400 focus:text-red-400"
                  data-testid={`panel-folder-note-delete-${note.id}`}
                >
                  <Trash2 className="h-3 w-3 mr-2" /> Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            );
          })}
        </>
      )}
    </div>
  );
}

export function CampaignNotesPanel({
  campaignId,
  onClose,
  isOpen,
  campaignMembers: campaignMembersProp = [],
  onViewCharacter,
  initialNoteId,
  hideCloseButton = false,
  isGm = false,
  navOnly = false,
  onOpenFloatingNote,
  onOpenEntityNote,
  onOpenTimelines,
  contentOnly = false,
  hideNoteHeader = false,
}: CampaignNotesPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showHomeView, setShowHomeView] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  // "read" is the rendered note, "edit" is the textarea. There is no Edit or
  // Done button any more: clicking into the note's body starts editing and
  // clicking anywhere outside it goes back to the rendered view. Nothing is
  // saved on the way out - edits already persist as they're typed, over the
  // collaboration socket with a debounced REST write behind it.
  const [noteMode, setNoteMode] = useState<"read" | "edit">("read");
  const [showSidebar, setShowSidebar] = useState(window.innerWidth >= 768);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialNoteId || null);
  const lastInitialNoteIdRef = useRef<string | null>(initialNoteId || null);
  
  useEffect(() => {
    if (initialNoteId && initialNoteId !== lastInitialNoteIdRef.current) {
      lastInitialNoteIdRef.current = initialNoteId;
      setSelectedNoteId(initialNoteId);
      setShowHomeView(false);
    }
  }, [initialNoteId]);

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [crossCampaignImportOpen, setCrossCampaignImportOpen] = useState(false);
  const [importDestCampaignId, setImportDestCampaignId] = useState<string>("");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectSearch, setConnectSearch] = useState("");
  const [connectType, setConnectType] = useState<"character" | "item">("character");
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState<string | null>(null);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);

  const [folderCampaignAssignment, setFolderCampaignAssignment] = useState<string | null>(null);
  // A freshly-created folder goes straight into rename mode in the tree
  // itself (its name shown as an input, auto-selected) instead of opening
  // the full folder dialog first - the dialog is still there for changing
  // color/campaign assignment later via the existing Rename menu item.
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  // Same idea, for a note's title - double-clicking it or picking Rename
  // from its context menu (there was previously no way to rename a note
  // from the sidebar at all, only by opening it and editing the title
  // field inside its own editor, which several note types don't even show).
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const renameNoteCommit = (noteId: string, title: string) => {
    setRenamingNoteId(null);
    updateNoteMutation.mutate({ id: noteId, data: { title } });
  };

  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null);
  // A note attached to a character/item sheet can't be deleted while that
  // sheet still exists - this holds the note + the reference that's blocking
  // it, driving the "can't delete, delete the sheet first" dialog.
  const [protectedDeleteState, setProtectedDeleteState] = useState<{ note: Note; ref: NoteReference } | null>(null);
  const [confirmDeleteSheet, setConfirmDeleteSheet] = useState(false);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);
  // Folders share the same dialog. Sharing one shares everything inside it,
  // which is the point: handing someone a section rather than a note at a
  // time. Exactly one of these is ever set.
  const [shareFolderId, setShareFolderId] = useState<string | null>(null);

  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [folderSortMode, setFolderSortMode] = useState<FolderSortMode>(() => {
    const saved = localStorage.getItem("campaign-notes-folder-sort-mode");
    return (saved as FolderSortMode) || "custom";
  });

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("campaign-notes-expanded-folders");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Persist expanded folders to localStorage
  useEffect(() => {
    localStorage.setItem("campaign-notes-expanded-folders", JSON.stringify(Array.from(expandedFolderIds)));
  }, [expandedFolderIds]);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteFont, setNoteFont] = useState<NoteFont>("inherit");
  const [canvasData, setCanvasData] = useState<CanvasData>({ nodes: [], connections: [] });
  const [sheetData, setSheetData] = useState<SheetData>(makeEmptySheet());
  // An inline markdown table (in an ordinary note's body) is edited as a
  // real table directly in the read view, not as raw pipe text - this
  // tracks which cell of which table block is currently being edited.
  // rowKind is "header" or a body-row index; colCount/rowCount are captured
  // at edit-start so Tab/Enter navigation doesn't have to re-derive them.
  const [editingTableCell, setEditingTableCell] = useState<{
    tableStart: number;
    rowKind: "header" | number;
    colIndex: number;
    colCount: number;
    rowCount: number;
  } | null>(null);
  const [editingTableValue, setEditingTableValue] = useState("");
  const suppressTableBlurRef = useRef(false);
  const debouncedTitle = useDebouncedValue(noteTitle, 1000);
  const debouncedContent = useDebouncedValue(noteContent, 1000);
  // Live collaboration lane. 1s felt like "type, wait, save"; this is short
  // enough to read as live while still coalescing a burst of keystrokes into
  // one message.
  const liveTitle = useDebouncedValue(noteTitle, 150);
  const liveContent = useDebouncedValue(noteContent, 150);
  const debouncedCanvasData = useDebouncedValue(canvasData, 1000);
  const debouncedSheetData = useDebouncedValue(sheetData, 1000);

  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  // Sidebar tag filter - selecting a tag switches the tree to a flat list of
  // every note carrying it, the same way the search box already does.
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [notePickerInitialSearch, setNotePickerInitialSearch] = useState("");
  const [notePickerTriggeredByTyping, setNotePickerTriggeredByTyping] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The editor's outer element, so a click landing anywhere else can drop
  // back to the rendered view.
  const noteEditorRef = useRef<HTMLDivElement>(null);
  // Double-clicking the read view's title focuses this once edit mode opens,
  // so the gesture actually lands you in the title rather than just
  // switching to edit mode the same way clicking the body does.
  const noteTitleInputRef = useRef<HTMLInputElement>(null);
  const focusTitleOnRenderRef = useRef(false);
  // Set when entering edit mode by clicking the note body, so the caret lands
  // in the textarea instead of the player having to click a second time.
  const focusEditorOnRenderRef = useRef(false);
  // One nudge per note is enough; repeating it on every keystroke is noise.
  const gmSecretToastShownRef = useRef(false);
  // Whether the last edit went out over the live channel. When it did, the
  // server has already persisted it and the REST autosave below must stay out
  // of the way - two writers racing on the same text loses keystrokes.
  const liveSyncActiveRef = useRef(false);
  const handleFormattingKeyDown = useFormattingShortcuts(textareaRef as React.RefObject<HTMLTextAreaElement>, noteContent, setNoteContent);

  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<any>(null);
  const [entityLoading, setEntityLoading] = useState(false);

  const [notePreviewDialogOpen, setNotePreviewDialogOpen] = useState(false);
  const [previewNote, setPreviewNote] = useState<Note | null>(null);

  // Note tabs state
  const {
    openNotes,
    activeNoteId: tabActiveNoteId,
    openNote: openNoteTab,
    closeTab,
    switchTab,
    updateTabTitle,
    reorderTabs,
  } = useNoteTabs();

  // Live collaboration state
  const [remotePresence, setRemotePresence] = useState<NotePresence[]>([]);
  const isReceivingRemoteUpdateRef = useRef(false);
  const lastLocalUpdateRef = useRef<number>(0);
  const hasInitializedCollabRef = useRef(false);
  const lastSentContentRef = useRef<{ title: string; content: string } | null>(null);
  const lastSentCanvasRef = useRef<string | null>(null);

  const lastLoadedNoteIdRef = useRef<string | null>(null);
  const lastSavedContentRef = useRef<{ title: string; content: string } | null>(null);
  const lastSavedCanvasRef = useRef<CanvasData | null>(null);
  const lastSavedSheetRef = useRef<SheetData | null>(null);

  const { data: folders = [], isLoading: foldersLoading } = useQuery<NoteFolder[]>({
    queryKey: ["/api/notes/folders", campaignId],
    queryFn: () => api.getNoteFolders(campaignId),
    enabled: !!user && isOpen,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", selectedFolderId, campaignId],
    queryFn: () => api.getNotes(selectedFolderId ?? undefined, campaignId),
    enabled: !!user && isOpen,
  });

  const { data: allNotesForTree = [] } = useQuery<Note[]>({
    queryKey: ["/api/notes/all", campaignId],
    queryFn: () => api.getNotes(undefined, campaignId),
    enabled: !!user && isOpen,
  });

  const { data: campaignCharacters = [] } = useQuery({
    queryKey: ["/api/campaigns", campaignId, "characters"],
    queryFn: () => api.getCampaignCharacters(campaignId),
    enabled: !!user && !!campaignId && isOpen,
  });

  // Members drive the "specific players" visibility picker and the share
  // dialog. Several hosts (the notes docked into a character or item sheet)
  // render this panel without passing them, which made both lists claim the
  // campaign had no players at all. The panel knows its own campaignId, so it
  // fetches them itself rather than relying on every call site to remember;
  // a caller that does pass them still wins, so the main panel makes no
  // extra request.
  const { data: fetchedMembers = [] } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/members`],
    queryFn: () => api.getCampaignMembers(campaignId),
    enabled: !!user && !!campaignId && isOpen && campaignMembersProp.length === 0,
  });
  const campaignMembers = React.useMemo(() => {
    const rows: any[] = campaignMembersProp.length > 0 ? campaignMembersProp : (fetchedMembers as any[]);
    // Never offer the viewer themselves as someone to share with.
    return rows
      .filter((m: any) => m?.userId && m.userId !== user?.id)
      .map((m: any) => ({ id: m.id, userId: m.userId, username: m.username }));
  }, [campaignMembersProp, fetchedMembers, user?.id]);


  const { data: currentNote, isLoading: noteLoading } = useQuery<Note>({
    queryKey: ["/api/notes", selectedNoteId],
    queryFn: () => api.getNote(selectedNoteId!),
    enabled: !!selectedNoteId && !!user,
  });

  const { data: noteShares = [] } = useQuery<NoteShare[]>({
    queryKey: ["/api/notes", shareFolderId ? `folder:${shareFolderId}` : shareNoteId, "shares"],
    queryFn: () => (shareFolderId ? api.getFolderShares(shareFolderId) : api.getNoteShares(shareNoteId!)),
    enabled: !!shareNoteId || !!shareFolderId,
  });

  const { data: friends = [] } = useQuery<UserProfile[]>({
    queryKey: ["/api/friends"],
    queryFn: () => api.getFriends(),
    enabled: shareDialogOpen,
  });

  useEffect(() => {
    if (currentNote) {
      const isNewNote = lastLoadedNoteIdRef.current !== currentNote.id;
      
      if (isNewNote) {
        const prevNoteId = lastLoadedNoteIdRef.current;
        if (prevNoteId) {
          const lastSaved = lastSavedContentRef.current;
          if (lastSaved && (lastSaved.title !== noteTitle || lastSaved.content !== noteContent)) {
            updateNoteMutation.mutate({
              id: prevNoteId,
              data: { title: noteTitle, content: noteContent },
            });
          }
        }
        // Guard against the same race the "same note" branch below guards
        // against: if the cache-seed on note creation didn't cover this load
        // (e.g. an existing note opened before its cache entry exists) and
        // the user is already typing by the time this fires, don't stomp
        // their keystrokes with the (still loading/blank) server value.
        const loadEl = textareaRef.current;
        const isTypingOnLoad = !!loadEl && document.activeElement === loadEl;
        if (!isTypingOnLoad) {
          setNoteTitle(currentNote.title);
          setNoteContent(currentNote.content || "");
        }
        gmSecretToastShownRef.current = false;
        liveSyncActiveRef.current = false;
        lastLoadedNoteIdRef.current = currentNote.id;
        lastSavedContentRef.current = null;
        lastSavedCanvasRef.current = null;
        lastSavedSheetRef.current = null;

        if (currentNote.type === "canvas" && currentNote.canvasData) {
          setCanvasData(currentNote.canvasData as CanvasData);
          setNoteMode("edit");
        } else if (currentNote.type === "sheet") {
          setSheetData((currentNote.canvasData as SheetData) || makeEmptySheet());
          setNoteMode("edit");
        } else {
          setCanvasData({ nodes: [], connections: [] });
          setNoteMode("read");
        }
        
        // Open in tabs when selecting a note
        openNoteTab(currentNote.id, currentNote.title, currentNote.type as OpenNote["type"]);
      } else {
        // Same note as before, but the underlying data changed - a REST-only
        // update (tags, visibility, a save that landed while this client's
        // own noteWs join was reconnecting) that only reached us via the
        // `note_changed` broadcast's query refetch, not the live noteWs
        // `note_update` path (which already applies its own updates as they
        // arrive and does not need this). Without this, the fetched data
        // sat in the query cache updated while the screen kept showing
        // whatever was here when the note was first opened - the classic
        // "only shows up after a refresh" bug. Skipped while the user is
        // actively typing (don't clobber unsaved keystrokes) or while a live
        // remote update is already being applied (avoid fighting it).
        const el = textareaRef.current;
        const isTyping = !!el && document.activeElement === el;
        if (!isTyping && !isReceivingRemoteUpdateRef.current) {
          if (currentNote.title !== noteTitle) setNoteTitle(currentNote.title);
          if ((currentNote.content || "") !== noteContent) setNoteContent(currentNote.content || "");
        }
      }
    }
  }, [currentNote, openNoteTab]);

  // Sync tab title when note title changes
  useEffect(() => {
    if (selectedNoteId && noteTitle) {
      updateTabTitle(selectedNoteId, noteTitle);
    }
  }, [selectedNoteId, noteTitle, updateTabTitle]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = (data: any) => {
      if (data.type === 'notes_changed' || data.type === 'note_created' || data.type === 'note_deleted' || data.type === 'note_changed') {
        if (data.campaignId && data.campaignId !== campaignId) return;
        // refetch, not invalidate: invalidate only marks stale, and a query
        // whose panel is mounted but momentarily unobserved (a collapsed
        // side panel, a note window behind another) would then not update
        // until something else woke it. Notes are shared state; they update.
        queryClient.refetchQueries({ queryKey: ["/api/notes"] });
        queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
        queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
        
        // A deleted note's tab has to go, whoever deleted it. Closing it only
        // for the person who pressed Delete left everyone else's tab open on
        // a note that no longer exists, and even for them it depended on the
        // delete going through this client's own mutation.
        if (data.type === 'note_deleted' && data.noteId) {
          closeTab(data.noteId);
          if (data.noteId === selectedNoteId) {
            setSelectedNoteId(null);
            setShowHomeView(true);
          }
        }
      }
      if (data.type === 'note_folder_changed') {
        if (data.campaignId && data.campaignId !== campaignId) return;
        queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
        queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
      }
      if (data.type === 'timeline_changed') {
        if (data.campaignId && data.campaignId !== campaignId) return;
        queryClient.invalidateQueries({ queryKey: ["/api/timelines"] });
        if (data.timelineId) {
          queryClient.invalidateQueries({ queryKey: ["/api/timelines", data.timelineId, "events"] });
        }
      }
    };

    const unsub1 = gameWs.onMessage(handleMessage);
    const unsub2 = globalWs.onMessage(handleMessage);
    return () => { unsub1(); unsub2(); };
  }, [campaignId, isOpen, queryClient, selectedNoteId, closeTab]);

  // Join/leave note rooms for live collaboration
  useEffect(() => {
    if (selectedNoteId && user && isOpen) {
      // Join the note room
      noteWs.joinNote(selectedNoteId);
      setRemotePresence([]);
      hasInitializedCollabRef.current = false;
      lastSentContentRef.current = null;
      lastSentCanvasRef.current = null;
      
      // Cleanup: leave note room when unmounting or changing notes
      return () => {
        noteWs.leaveNote(selectedNoteId);
        setRemotePresence([]);
      };
    }
  }, [selectedNoteId, user, isOpen]);

  // Handle incoming WebSocket messages for note collaboration
  useEffect(() => {
    if (!selectedNoteId || !isOpen) return;

    const handleMessage = (data: any) => {
      // Only process messages for the current note
      if (data.noteId !== selectedNoteId) return;

      switch (data.type) {
        case 'note_joined':
          // Initial presence list when joining
          setRemotePresence(data.presence?.filter((p: NotePresence) => p.userId !== user?.id) || []);
          break;

        case 'note_presence_update':
          if (data.action === 'joined') {
            setRemotePresence(prev => {
              if (prev.some(p => p.userId === data.userId)) return prev;
              return [...prev, { 
                userId: data.userId, 
                username: data.username, 
                lastActive: Date.now() 
              }];
            });
          } else if (data.action === 'left') {
            setRemotePresence(prev => prev.filter(p => p.userId !== data.userId));
          }
          break;

        case 'note_update': {
          // Our own edits echo back only as a `correction`: the server merged
          // our version into the stored note and what we're holding no longer
          // matches (we deleted a redaction block, or typed #...# that got
          // defused). Those must be applied, or the editor keeps re-sending a
          // version the server keeps rejecting.
          if (data.userId === user?.id && !data.correction) return;

          // Everything else is applied immediately - the whole point is that
          // edits are live. The old "ignore anything within 500ms of a local
          // change" guard dropped exactly the updates that arrive while two
          // people are both typing, leaving the two editors permanently out
          // of sync. The caret is protected below instead.
          isReceivingRemoteUpdateRef.current = true;
          if (data.title !== undefined) {
            setNoteTitle(data.title);
          }
          if (data.content !== undefined) {
            const el = textareaRef.current;
            const isFocused = !!el && document.activeElement === el;
            if (isFocused) {
              // Re-setting a controlled textarea's value drops the caret at the
              // end, mid-sentence. Work out where the caret belongs in the new
              // text and put it back after React paints.
              const selStart = el.selectionStart;
              const selEnd = el.selectionEnd;
              setNoteContent((prev) => {
                const nextStart = remapCaret(prev, data.content, selStart);
                const nextEnd = remapCaret(prev, data.content, selEnd);
                requestAnimationFrame(() => {
                  if (textareaRef.current && document.activeElement === textareaRef.current) {
                    textareaRef.current.setSelectionRange(nextStart, nextEnd);
                  }
                });
                return data.content;
              });
            } else {
              setNoteContent(data.content);
            }
            // The live edit is already persisted server-side, so don't let the
            // PUT fallback fire and write this same text back again.
            lastSavedContentRef.current = {
              title: data.title !== undefined ? data.title : noteTitle,
              content: data.content,
            };
            lastSentContentRef.current = {
              title: data.title !== undefined ? data.title : noteTitle,
              content: data.content,
            };
          }
          if (data.canvasData !== undefined) {
            try {
              const parsed = typeof data.canvasData === 'string' 
                ? JSON.parse(data.canvasData) 
                : data.canvasData;
              setCanvasData(parsed);
            } catch (e) {
              console.error('Failed to parse remote canvas data:', e);
            }
          }
          // Small delay to allow state to settle before re-enabling local updates
          setTimeout(() => { isReceivingRemoteUpdateRef.current = false; }, 100);
          break;
        }

        case 'cursor_update':
          // Update remote user's cursor position
          setRemotePresence(prev => 
            prev.map(p => p.userId === data.userId 
              ? { ...p, cursorPosition: data.cursorPosition, lastActive: Date.now() }
              : p
            )
          );
          break;
      }
    };

    const unsubscribe = noteWs.onMessage(handleMessage);
    return () => { unsubscribe(); };
  }, [selectedNoteId, user?.id, isOpen]);

  // Broadcast local changes via WebSocket (alongside the save)
  useEffect(() => {
    // Skip if no note, receiving remote update, or not initialized yet
    if (!selectedNoteId || isReceivingRemoteUpdateRef.current || !isOpen) return;
    
    // Skip initial mount - only broadcast after first change
    if (!hasInitializedCollabRef.current) {
      hasInitializedCollabRef.current = true;
      lastSentContentRef.current = { title: liveTitle, content: liveContent };
      return;
    }
    
    // Skip if content hasn't actually changed (prevents ping-pong)
    const lastSent = lastSentContentRef.current;
    if (lastSent && lastSent.title === liveTitle && lastSent.content === liveContent) {
      return;
    }
    
    // Track that we made a local update
    lastLocalUpdateRef.current = Date.now();
    lastSentContentRef.current = { title: liveTitle, content: liveContent };
    
    // Send update to other collaborators. The server merges this against the
    // stored note, persists it, and fans out a per-recipient projection - so
    // this send IS the save, not a preview of one.
    liveSyncActiveRef.current = noteWs.sendNoteUpdate(selectedNoteId, {
      title: liveTitle,
      content: liveContent,
    });
  }, [liveTitle, liveContent, selectedNoteId, isOpen]);

  // Broadcast canvas changes separately
  useEffect(() => {
    if (!selectedNoteId || isReceivingRemoteUpdateRef.current || currentNote?.type !== 'canvas' || !isOpen) return;
    
    const canvasStr = JSON.stringify(debouncedCanvasData);
    if (lastSentCanvasRef.current === canvasStr) return;
    
    lastLocalUpdateRef.current = Date.now();
    lastSentCanvasRef.current = canvasStr;
    
    noteWs.sendNoteUpdate(selectedNoteId, {
      canvasData: JSON.stringify(debouncedCanvasData),
    });
  }, [debouncedCanvasData, selectedNoteId, currentNote?.type, isOpen]);

  // Handle tab switching
  const handleTabClick = (tabNoteId: string) => {
    if (tabNoteId === GRAPH_TAB_ID) {
      switchTab(GRAPH_TAB_ID);
      setSelectedNoteId(null);
      setShowHomeView(false);
      return;
    }
    if (tabNoteId === TIMELINES_TAB_ID) {
      switchTab(TIMELINES_TAB_ID);
      setSelectedNoteId(null);
      setShowHomeView(false);
      return;
    }
    if (tabNoteId !== selectedNoteId) {
      setSelectedNoteId(tabNoteId);
    }
  };

  // Handle tab close
  const handleTabClose = (tabNoteId: string) => {
    const remainingNotes = openNotes.filter(n => n.noteId !== tabNoteId);
    closeTab(tabNoteId);
    
    const isActiveTab = (tabNoteId === GRAPH_TAB_ID || tabNoteId === TIMELINES_TAB_ID)
      ? tabActiveNoteId === tabNoteId
      : tabNoteId === selectedNoteId;

    if (isActiveTab) {
      if (remainingNotes.length > 0) {
        const currentIdx = openNotes.findIndex(n => n.noteId === tabNoteId);
        const newActiveNote = currentIdx > 0
          ? openNotes[currentIdx - 1]
          : remainingNotes[0];
        if (newActiveNote) {
          if (newActiveNote.noteId === GRAPH_TAB_ID || newActiveNote.noteId === TIMELINES_TAB_ID) {
            switchTab(newActiveNote.noteId);
            setSelectedNoteId(null);
            setShowHomeView(false);
          } else {
            setSelectedNoteId(newActiveNote.noteId);
          }
        } else {
          setSelectedNoteId(null);
          setShowHomeView(true);
        }
      } else {
        setSelectedNoteId(null);
        setShowHomeView(true);
      }
    }
  };

  const createFolderMutation = useMutation({
    mutationFn: (data: Partial<NoteFolder>) => api.createNoteFolder(data),
    onSuccess: (newFolder) => {
      queryClient.setQueryData<NoteFolder[]>(["/api/notes/folders", campaignId], (prev) =>
        prev && !prev.some((f) => f.id === (newFolder as any)?.id) ? [...prev, newFolder as any] : prev);
      queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
      setFolderDialogOpen(false);
      resetFolderForm();
      toast({ title: "Folder created" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateFolderMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NoteFolder> }) =>
      api.updateNoteFolder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
      setFolderDialogOpen(false);
      setEditingFolder(null);
      resetFolderForm();
      toast({ title: "Folder updated" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reorderFoldersMutation = useMutation({
    mutationFn: (folderOrders: { id: string; sortOrder: number }[]) =>
      api.reorderNoteFolders(folderOrders),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
    },
    onError: (err: any) =>
      toast({
        title: "Error reordering folders",
        description: err.message,
        variant: "destructive",
      }),
  });

  const handleReorderFolder = useCallback((folderId: string, targetIndex: number, parentId: string | null) => {
    const siblingFolders = folders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    
    const movingFolderIndex = siblingFolders.findIndex(f => f.id === folderId);
    const movingFolder = folders.find(f => f.id === folderId);
    
    if (!movingFolder) return;
    
    const isFromDifferentParent = movingFolder.parentId !== parentId;
    
    if (isFromDifferentParent) {
      updateFolderMutation.mutate({
        id: folderId,
        data: { parentId: parentId },
      });
    }
    
    let newOrder: NoteFolder[];
    if (isFromDifferentParent) {
      newOrder = [...siblingFolders];
      newOrder.splice(targetIndex, 0, movingFolder);
    } else {
      newOrder = [...siblingFolders];
      newOrder.splice(movingFolderIndex, 1);
      const adjustedIndex = targetIndex > movingFolderIndex ? targetIndex - 1 : targetIndex;
      newOrder.splice(adjustedIndex, 0, movingFolder);
    }
    
    const folderOrders = newOrder.map((folder, idx) => ({
      id: folder.id,
      sortOrder: idx,
    }));
    
    reorderFoldersMutation.mutate(folderOrders);
  }, [folders, updateFolderMutation, reorderFoldersMutation]);

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.deleteNoteFolder(id),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
      setDeleteFolderDialogOpen(false);
      setFolderToDelete(null);
      if (selectedFolderId === folderToDelete?.id) {
        setSelectedFolderId(null);
      }
      toast({ title: "Folder deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: gmCampaigns = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/campaigns", "gm-owned"],
    queryFn: async () => {
      const { created } = await api.getCampaigns();
      return created.filter((c: any) => c.id !== campaignId);
    },
    enabled: isGm && crossCampaignImportOpen,
  });

  const importNoteMutation = useMutation({
    mutationFn: () => api.importNoteToCampaign(selectedNoteId!, importDestCampaignId),
    onSuccess: (result) => {
      setCrossCampaignImportOpen(false);
      setImportDestCampaignId("");
      toast({
        title: "Note imported",
        description: result.unlinked
          ? "Copied as an unlinked note (different game systems can't share a linked sheet)."
          : result.entityImported
          ? "Note and its linked sheet were copied as independent records."
          : "Note copied.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: noteHistory = [], isLoading: noteHistoryLoading } = useQuery<KnowledgeRevision[]>({
    queryKey: ["/api/notes", selectedNoteId, "history"],
    queryFn: () => api.getNoteHistory(selectedNoteId!),
    enabled: isGm && historyDialogOpen && !!selectedNoteId,
  });

  const restoreRevisionMutation = useMutation({
    mutationFn: (revisionId: string) => api.restoreNoteRevision(selectedNoteId!, revisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", selectedNoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", selectedNoteId, "history"] });
      toast({ title: "Revision restored" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: currentNoteRefsRaw } = useQuery<NoteReference[]>({
    queryKey: ["/api/notes", selectedNoteId, "references"],
    queryFn: () => api.getNoteReferences(selectedNoteId!),
    enabled: !!selectedNoteId,
  });
  const currentNoteRefs = currentNoteRefsRaw ?? [];
  // C.A.'s ability notes hang off a character the same way a sheet note does,
  // so they count as linked here too - otherwise clicking one in the sidebar
  // opened it as a loose note with no sheet beside it.
  const linkedEntityRef = currentNoteRefs.find(r => ["character-sheet", "item-sheet", "character-ability"].includes(r.entityType));

  // Whether the open note's linked sheet still exists - drives the Delete
  // button's disabled state. A stale reference left behind by a
  // since-deleted character/item no longer protects the note.
  const { data: openNoteLinkExists = false } = useQuery({
    queryKey: ["note-linked-entity-exists", linkedEntityRef?.entityType, linkedEntityRef?.entityId],
    queryFn: async () => {
      if (!linkedEntityRef) return false;
      try {
        if (linkedEntityRef.entityType === "item-sheet") await api.getItem(linkedEntityRef.entityId);
        else await api.getCharacter(linkedEntityRef.entityId);
        return true;
      } catch {
        return false;
      }
    },
    enabled: !!linkedEntityRef,
  });
  const openNoteIsProtected = !!linkedEntityRef && openNoteLinkExists;

  const deleteAttachedSheetMutation = useMutation({
    mutationFn: async (ref: NoteReference) => {
      if (ref.entityType === "item-sheet") await api.deleteItem(ref.entityId);
      else await api.deleteCharacter(ref.entityId);
    },
    onSuccess: () => {
      if (!protectedDeleteState) return;
      const { note } = protectedDeleteState;
      queryClient.invalidateQueries({ queryKey: ["note-linked-entity-exists"] });
      setProtectedDeleteState(null);
      setConfirmDeleteSheet(false);
      // The sheet is gone, so the note is a normal, deletable note now.
      setNoteToDelete(note);
      setDeleteNoteDialogOpen(true);
    },
    onError: (err: any) =>
      toast({ title: "Couldn't delete the attached sheet", description: err.message, variant: "destructive" }),
  });

  // Every "delete this note" entry point (sidebar rows, the open note's own
  // header) routes through here so none of them can silently fall into the
  // server's clear-content fallback: a note whose sheet still exists shows
  // the "delete the sheet first" dialog instead of a real delete attempt.
  const requestDeleteNote = async (note: Note) => {
    try {
      const refs = await api.getNoteReferences(note.id);
      const ref = refs.find(r => ["character-sheet", "item-sheet", "character-ability"].includes(r.entityType));
      if (ref) {
        const exists = await (ref.entityType === "item-sheet" ? api.getItem(ref.entityId) : api.getCharacter(ref.entityId))
          .then(() => true)
          .catch(() => false);
        if (exists) {
          setProtectedDeleteState({ note, ref });
          return;
        }
      }
    } catch {
      // Reference lookup failed - fall through to the normal delete flow
      // rather than silently doing nothing.
    }
    setNoteToDelete(note);
    setDeleteNoteDialogOpen(true);
  };

  // Sidebar (navOnly) mode never shows note content inline - whatever set
  // selectedNoteId (folder tree click, search result, "New Note", etc.) gets
  // redirected to onOpenEntityNote (docking alongside the linked character/
  // item sheet) when the note has an entity link and that callback is
  // provided, or onOpenFloatingNote otherwise - and the selection is cleared
  // right back so the content pane never renders. Centralizing the redirect
  // here means every existing setSelectedNoteId(...) call site "just works"
  // for both modes without being individually rewritten. When
  // onOpenEntityNote isn't provided (e.g. the mobile nav flow) this skips
  // waiting on currentNoteRefsRaw entirely, so mobile opens instantly same
  // as before.
  useEffect(() => {
    if (!navOnly || !selectedNoteId) return;
    if (!onOpenEntityNote) {
      if (onOpenFloatingNote) {
        const id = selectedNoteId;
        setSelectedNoteId(null);
        onOpenFloatingNote(id);
      }
      return;
    }
    if (currentNoteRefsRaw === undefined) return;
    const id = selectedNoteId;
    const entityRef = currentNoteRefsRaw.find(r => r.entityType === "character-sheet" || r.entityType === "item-sheet" || r.entityType === "character-ability");
    setSelectedNoteId(null);
    if (entityRef) {
      onOpenEntityNote(entityRef.entityType as "character-sheet" | "item-sheet" | "character-ability", entityRef.entityId, id);
    } else if (onOpenFloatingNote) {
      onOpenFloatingNote(id);
    }
  }, [navOnly, selectedNoteId, currentNoteRefsRaw, onOpenFloatingNote, onOpenEntityNote]);

  const debouncedConnectSearch = useDebouncedValue(connectSearch, 300);
  const { data: connectResults = [], isLoading: connectSearchLoading } = useQuery<SearchableEntity[]>({
    queryKey: ["/api/campaigns", campaignId, "connect-search", debouncedConnectSearch, connectType],
    queryFn: () => api.searchCampaignConnectEntities(campaignId, debouncedConnectSearch, connectType),
    enabled: connectDialogOpen && !!campaignId,
  });

  const connectMutation = useMutation({
    mutationFn: (entity: SearchableEntity) =>
      api.connectNoteToEntity(selectedNoteId!, entity.type === "character" ? "character-sheet" : "item-sheet", entity.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", selectedNoteId, "references"] });
      setConnectDialogOpen(false);
      setConnectSearch("");
      toast({ title: "Note connected" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createNoteMutation = useMutation({
    mutationFn: (data: Partial<Note>) => api.createNote(data),
    onSuccess: (newNote) => {
      // Put it in the tree before the refetch comes back. A refetch is a
      // round trip, and until it lands the sidebar looks like nothing
      // happened - which is what "I had to refresh to see my new note" is.
      queryClient.setQueryData<Note[]>(["/api/notes/all", campaignId], (prev) =>
        prev && !prev.some((n) => n.id === newNote.id) ? [newNote, ...prev] : prev);
      // Also seed the single-note cache before selecting it: without this,
      // `currentNote` starts undefined and has to round-trip to the server,
      // and typing into that gap gets wiped once the fetch resolves and the
      // load-effect resets to the (blank) server value - "the first few
      // letters I type get removed."
      queryClient.setQueryData(["/api/notes", newNote.id], newNote);
      queryClient.refetchQueries({ queryKey: ["/api/notes"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
      // Follow the note into whichever folder it landed in. The sidebar's
      // list is scoped to the selected folder, so a note created at root
      // while a folder was open was filed somewhere the sidebar wasn't
      // looking and read as "my new note didn't appear".
      const landedIn = (newNote as any).folderId ?? null;
      if (landedIn !== selectedFolderId) setSelectedFolderId(landedIn);
      setSelectedNoteId(newNote.id);
      toast({ title: "Note created" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Note> }) =>
      api.updateNote(id, data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/notes"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes", selectedNoteId] });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAddTag = (noteId: string, existing: string[], raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || existing.includes(tag)) return;
    updateNoteMutation.mutate({ id: noteId, data: { tags: [...existing, tag] } as any });
  };

  const handleRemoveTag = (noteId: string, existing: string[], tag: string) => {
    updateNoteMutation.mutate({ id: noteId, data: { tags: existing.filter(t => t !== tag) } as any });
  };

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: (data, deletedId) => {
      queryClient.refetchQueries({ queryKey: ["/api/notes"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
      setDeleteNoteDialogOpen(false);
      setNoteToDelete(null);
      // Entity-linked notes come back as the cleared Note (not { success })
      // since the row and its entity link stay - keep it open, just refresh
      // its content instead of closing it like a real delete would.
      const wasCleared = !!data && "id" in (data as any);
      if (wasCleared) {
        queryClient.refetchQueries({ queryKey: ["/api/notes", deletedId] });
        toast({ title: "Note contents cleared" });
        return;
      }
      closeTab(deletedId);
      if (selectedNoteId === deletedId) {
        setSelectedNoteId(null);
        setShowHomeView(true);
      }
      toast({ title: "Note deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const shareNoteMutation = useMutation({
    mutationFn: ({
      noteId,
      friendId,
      permission,
    }: {
      noteId: string;
      friendId: string;
      permission: string;
    }) => (shareFolderId
      ? api.shareFolder(shareFolderId, friendId, permission)
      : api.shareNote(noteId, friendId, permission)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", shareFolderId ? `folder:${shareFolderId}` : shareNoteId, "shares"] });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteShareMutation = useMutation({
    mutationFn: ({ noteId, shareId }: { noteId: string; shareId: string }) =>
      (shareFolderId ? api.deleteFolderShare(shareFolderId, shareId) : api.deleteNoteShare(noteId, shareId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", shareFolderId ? `folder:${shareFolderId}` : shareNoteId, "shares"] });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateShareMutation = useMutation({
    mutationFn: ({ shareId, permission }: { shareId: string; permission: "view" | "edit" }) =>
      (shareFolderId ? api.updateFolderShare(shareFolderId, shareId, permission) : api.updateNoteShare(shareNoteId ?? "", shareId, permission)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", shareFolderId ? `folder:${shareFolderId}` : shareNoteId, "shares"] });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Single entry point for the share panel: given a campaign member and the
  // access level chosen for them (none/view/edit), reconciles it against
  // whatever noteShares row (if any) already exists - create, update, or
  // remove, whichever the change actually calls for. This is what backs both
  // an individual row's select and the "set everyone" bulk buttons, so the
  // two can never drift into different logic for the same operation.
  const setMemberSharePermission = (memberUserId: string, level: "none" | "view" | "edit") => {
    if (!shareNoteId && !shareFolderId) return;
    const existing = noteShares.find((s) => s.sharedWithId === memberUserId);
    if (level === "none") {
      if (existing) deleteShareMutation.mutate({ noteId: shareNoteId ?? "", shareId: existing.id });
      return;
    }
    if (existing) {
      if (existing.permission !== level) updateShareMutation.mutate({ shareId: existing.id, permission: level });
      return;
    }
    shareNoteMutation.mutate({ noteId: shareNoteId ?? "", friendId: memberUserId, permission: level });
  };

  // Clicking into the note body starts editing; clicking anywhere outside the
  // editor ends it. Canvas and Sheet notes are always in their own editor
  // and opt out.
  const beginInlineEdit = (focusTitle = false) => {
    if (currentNote?.type === "canvas" || currentNote?.type === "sheet") return;
    if (focusTitle) focusTitleOnRenderRef.current = true;
    else focusEditorOnRenderRef.current = true;
    setNoteMode("edit");
  };

  useEffect(() => {
    if (noteMode !== "edit" || !focusEditorOnRenderRef.current) return;
    focusEditorOnRenderRef.current = false;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // Land at the end rather than the start - clicking a note you're about to
    // add to is the common case.
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [noteMode, selectedNoteId]);

  // Double-clicking the read view's title (see renderNoteReadView) lands here
  // instead of the body's textarea - same edit mode, different starting focus.
  useEffect(() => {
    if (noteMode !== "edit" || !focusTitleOnRenderRef.current) return;
    focusTitleOnRenderRef.current = false;
    const el = noteTitleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [noteMode, selectedNoteId]);

  useEffect(() => {
    if (noteMode !== "edit" || !selectedNoteId) return;
    const onPointerDown = (e: PointerEvent) => {
      if (clickEndsNoteEditing(e.target as Element | null, noteEditorRef.current)) {
        setNoteMode("read");
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [noteMode, selectedNoteId]);

  useEffect(() => {
    if (!selectedNoteId || !currentNote) return;

    const lastSaved = lastSavedContentRef.current;
    if (!lastSaved) {
      lastSavedContentRef.current = { title: debouncedTitle, content: debouncedContent };
      return;
    }
    if (lastSaved.title === debouncedTitle && lastSaved.content === debouncedContent) {
      return;
    }

    lastSavedContentRef.current = { title: debouncedTitle, content: debouncedContent };
    // Live edits already persist server-side as they happen. This REST save is
    // only the fallback for when the collaboration socket isn't carrying them
    // (still connecting, dropped, or reconnecting).
    if (liveSyncActiveRef.current && noteWs.isJoinedToNote(selectedNoteId)) return;
    updateNoteMutation.mutate({
      id: selectedNoteId,
      data: { title: debouncedTitle, content: debouncedContent },
    });
  }, [debouncedTitle, debouncedContent, selectedNoteId]);

  useEffect(() => {
    if (!selectedNoteId || currentNote?.type !== "canvas" || noteLoading) return;

    if (!lastSavedCanvasRef.current) {
      lastSavedCanvasRef.current = debouncedCanvasData;
      return;
    }
    if (JSON.stringify(lastSavedCanvasRef.current) === JSON.stringify(debouncedCanvasData)) {
      return;
    }

    lastSavedCanvasRef.current = debouncedCanvasData;
    updateNoteMutation.mutate({
      id: selectedNoteId,
      data: { canvasData: debouncedCanvasData },
    });
  }, [debouncedCanvasData, selectedNoteId]);

  useEffect(() => {
    if (!selectedNoteId || currentNote?.type !== "sheet" || noteLoading) return;

    if (!lastSavedSheetRef.current) {
      lastSavedSheetRef.current = debouncedSheetData;
      return;
    }
    if (JSON.stringify(lastSavedSheetRef.current) === JSON.stringify(debouncedSheetData)) {
      return;
    }

    lastSavedSheetRef.current = debouncedSheetData;
    updateNoteMutation.mutate({
      id: selectedNoteId,
      data: { canvasData: debouncedSheetData as any },
    });
  }, [debouncedSheetData, selectedNoteId]);

  const resetFolderForm = () => {
    setFolderName("");
    setFolderColor(null);
    setFolderParentId(null);
    setFolderCampaignAssignment(campaignId);
  };

  // Creates the folder right away with a placeholder name and drops it
  // straight into inline-rename mode, instead of making the GM fill out the
  // full folder dialog before anything exists - matches how a new note,
  // canvas, scene or book already get created in this tree.
  const createFolderInline = (parentId: string | null) => {
    createFolderMutation.mutate(
      { name: "New Folder", color: null, parentId, campaignId } as any,
      { onSuccess: (created: any) => { if (created?.id) setRenamingFolderId(created.id); } },
    );
  };

  const openFolderDialog = (folder?: NoteFolder) => {
    if (folder) {
      setEditingFolder(folder);
      setFolderName(folder.name);
      setFolderColor(folder.color ?? null);
      setFolderParentId(folder.parentId ?? null);
      setFolderCampaignAssignment(folder.campaignId ?? null);
    } else {
      setEditingFolder(null);
      resetFolderForm();
    }
    setFolderDialogOpen(true);
  };

  const handleFolderSubmit = () => {
    if (!folderName.trim()) return;
    if (editingFolder) {
      updateFolderMutation.mutate({
        id: editingFolder.id,
        data: {
          name: folderName,
          color: folderColor,
          parentId: folderParentId,
          campaignId: folderCampaignAssignment,
        },
      });
    } else {
      createFolderMutation.mutate({
        name: folderName,
        color: folderColor,
        parentId: folderParentId,
        campaignId: folderCampaignAssignment,
      });
    }
  };

  const handleCreateNote = () => {
    createNoteMutation.mutate({
      title: "Untitled Note",
      content: "",
      folderId: selectedFolderId,
      type: "markdown",
      campaignId: campaignId,
    });
  };

  const handleCreateCanvas = () => {
    createNoteMutation.mutate({
      title: "Untitled Canvas",
      content: "",
      type: "canvas",
      canvasData: { nodes: [], connections: [] },
      folderId: selectedFolderId ?? undefined,
      campaignId: campaignId,
    });
  };

  const handleCreateSheet = () => {
    createNoteMutation.mutate({
      title: "Untitled Sheet",
      content: "",
      type: "sheet",
      canvasData: makeEmptySheet() as any,
      folderId: selectedFolderId ?? undefined,
      campaignId: campaignId,
    });
  };

  const handleTogglePin = (note: Note) => {
    updateNoteMutation.mutate({
      id: note.id,
      data: { isPinned: !note.isPinned },
    });
  };

  const handleToggleArchive = (note: Note) => {
    updateNoteMutation.mutate({
      id: note.id,
      data: { isArchived: !note.isArchived },
    });
  };

  const openShareDialog = (noteId: string) => {
    setShareFolderId(null);
    setShareNoteId(noteId);
    setShareDialogOpen(true);
  };

  const openFolderShareDialog = (folderId: string) => {
    setShareNoteId(null);
    setShareFolderId(folderId);
    setShareDialogOpen(true);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const pos = e.target.selectionStart;

    // GM secrets arrive as blocks of █ and are the GM's to change, not the
    // reader's. Refuse any edit that would alter one and put the textarea
    // back — the value is controlled, so with no state change React would
    // otherwise leave the typed characters sitting in the DOM.
    if (!editKeepsGmSecrets(noteContent, newContent)) {
      const el = e.target;
      el.value = noteContent;
      const caret = Math.min(pos, noteContent.length);
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      if (!gmSecretToastShownRef.current) {
        gmSecretToastShownRef.current = true;
        toast({
          title: "That part is GM-only",
          description: "Hidden sections belong to the GM — you can edit everything around them.",
        });
      }
      return;
    }

    setNoteContent(newContent);
    setCursorPosition(pos);

    if (pos >= 2) {
      const lastTwoChars = newContent.slice(pos - 2, pos);
      if (lastTwoChars === "[[") {
        setReferencePickerOpen(true);
      }
      // Check for // to trigger note-only picker (new syntax)
      if (lastTwoChars === "//") {
        setNotePickerInitialSearch("");
        setNotePickerTriggeredByTyping(true);
        setNotePickerOpen(true);
      }
    }
  };

  const handleReferenceSelect = (entity: SearchableEntity) => {
    const referenceText = `[[${entity.type}:${entity.id}|${entity.name}]]`;
    
    const beforeCursor = noteContent.slice(0, cursorPosition - 2);
    const afterCursor = noteContent.slice(cursorPosition);
    const newContent = beforeCursor + referenceText + afterCursor;
    
    setNoteContent(newContent);
    setReferencePickerOpen(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeCursor.length + referenceText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);

    if (selectedNoteId) {
      api.createNoteReference(selectedNoteId, {
        entityType: entity.type,
        entityId: entity.id,
        label: entity.name,
      }).catch((err) => {
        console.error("Failed to save reference:", err);
      });
    }
  };

  const handleInsertReferenceClick = () => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart);
    }
    setReferencePickerOpen(true);
  };

  const handleReferenceSelectFromButton = (entity: SearchableEntity) => {
    const referenceText = `[[${entity.type}:${entity.id}|${entity.name}]]`;
    
    const beforeCursor = noteContent.slice(0, cursorPosition);
    const afterCursor = noteContent.slice(cursorPosition);
    const newContent = beforeCursor + referenceText + afterCursor;
    
    setNoteContent(newContent);
    setReferencePickerOpen(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeCursor.length + referenceText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);

    if (selectedNoteId) {
      api.createNoteReference(selectedNoteId, {
        entityType: entity.type,
        entityId: entity.id,
        label: entity.name,
      }).catch((err) => {
        console.error("Failed to save reference:", err);
      });
    }
  };

  const handleNotePickerSelect = (selectedNote: Note) => {
    // Use //note name// format for note links
    const referenceText = `//${selectedNote.title}//`;
    // Only remove the // if the picker was triggered by typing //
    const charsToRemove = notePickerTriggeredByTyping ? 2 : 0;
    const beforeCursor = noteContent.slice(0, cursorPosition - charsToRemove);
    const afterCursor = noteContent.slice(cursorPosition);
    const newContent = beforeCursor + referenceText + afterCursor;
    
    setNoteContent(newContent);
    setNotePickerOpen(false);
    setNotePickerTriggeredByTyping(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeCursor.length + referenceText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleNotePickerCreate = async (noteName: string) => {
    // Use (/note name/) format for new note creation
    const referenceText = `(/${noteName}/)`;
    // Only remove the // if the picker was triggered by typing //
    const charsToRemove = notePickerTriggeredByTyping ? 2 : 0;
    const beforeCursor = noteContent.slice(0, cursorPosition - charsToRemove);
    const afterCursor = noteContent.slice(cursorPosition);
    const newContent = beforeCursor + referenceText + afterCursor;
    
    setNoteContent(newContent);
    setNotePickerOpen(false);
    setNotePickerTriggeredByTyping(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeCursor.length + referenceText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleNoteReferenceClick = async (noteName: string, forceCreate: boolean = false) => {
    const existingNote = notes.find(n => n.title.toLowerCase() === noteName.toLowerCase());
    
    if (existingNote && !forceCreate) {
      // Show note content in a dialog (statblock style)
      setPreviewNote(existingNote);
      setNotePreviewDialogOpen(true);
    } else {
      // Create new note and select it
      try {
        const newNote = await api.createNote({
          title: noteName,
          content: "",
          folderId: selectedFolderId,
          type: "markdown",
          campaignId: campaignId,
        });
        queryClient.refetchQueries({ queryKey: ["/api/notes"] });
        queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
        queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
        setSelectedNoteId(newNote.id);
        toast({ title: `Note "${noteName}" created` });
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive",
        });
      }
    }
  };

  const handleEntityClick = async (entityType: string, entityId: string) => {
    const cleanType = entityType.replace(/^\[+/, '').toLowerCase().trim();

    setSelectedEntityType(cleanType);
    setSelectedEntityId(entityId);
    setEntityDialogOpen(true);
    setEntityLoading(true);
    setEntityData(null);

    try {
      let data: any = null;
      switch (cleanType) {
        case "spell":
          data = await api.getSystemSpell(entityId);
          break;
        case "skill":
          data = await api.getSystemSkill(entityId);
          break;
        case "trait":
          data = await api.getSystemTrait(entityId);
          break;
        case "species":
          const speciesList = await api.getSpecies();
          data = speciesList.find((s: SystemSpecies) => s.id === entityId) || null;
          break;
        case "item":
          try {
            data = await api.getSystemItem(entityId);
          } catch {
            data = null;
          }
          if (!data) {
            data = { name: "Item", description: "Item not found or access denied." };
          }
          break;
        case "character":
          if (onViewCharacter) {
            try {
              const character = await api.getCharacter(entityId);
              if (character) {
                setEntityDialogOpen(false);
                setEntityLoading(false);
                onViewCharacter(character);
                return;
              }
            } catch {
            }
          }
          try {
            const character = await api.getCharacter(entityId);
            data = character || { name: "Character", description: "Character not found or access denied." };
          } catch {
            data = { name: "Character", description: "Character not found or you don't have permission to view it." };
          }
          break;
        default:
          console.warn("Unknown entity type:", cleanType, "original:", entityType);
          data = { name: cleanType || "Unknown", description: `Entity type "${cleanType}" is not recognized.` };
      }
      setEntityData(data);
    } catch (error) {
      console.error("Failed to fetch entity:", error);
      setEntityData({ name: "Error", description: "Failed to load entity details" });
    } finally {
      setEntityLoading(false);
    }
  };

  const formatInlineReferences = (content: string, keyPrefix: string, imageCtx?: ImageEditContext): React.ReactNode[] => {
    const combinedRegex = /\[\[([^:\]]+):([^\|]+)\|([^\]]+)\]\]|\/\/([^\/]+)\/\/|\(\/([^\/]+)\/\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const plainText = content.slice(lastIndex, match.index);
        parts.push(...renderFormattedText(plainText, `${keyPrefix}-plain-${lastIndex}`, imageCtx));
      }
      
      if (match[1] && match[2] && match[3]) {
        const entityType = match[1];
        const entityId = match[2];
        const displayName = match[3];
        parts.push(
          <span
            key={`${keyPrefix}-${match.index}`}
            className="text-amber-500 cursor-pointer hover:text-amber-400 hover:underline transition-colors font-medium"
            onClick={() => handleEntityClick(entityType, entityId)}
            data-testid={`panel-entity-ref-${entityType}-${entityId}`}
          >
            {displayName}
          </span>
        );
      } else if (match[4]) {
        const noteName = match[4];
        parts.push(
          <span
            key={`${keyPrefix}-${match.index}`}
            className="text-cyan-400 cursor-pointer hover:text-cyan-300 hover:underline transition-colors font-medium"
            onClick={() => handleNoteReferenceClick(noteName, false)}
            data-testid={`panel-note-ref-${noteName}`}
          >
            {noteName}
          </span>
        );
      } else if (match[5]) {
        const noteName = match[5];
        parts.push(
          <span
            key={`${keyPrefix}-${match.index}`}
            className="text-cyan-400 cursor-pointer hover:text-cyan-300 hover:underline transition-colors italic font-medium"
            onClick={() => handleNoteReferenceClick(noteName, true)}
            data-testid={`panel-note-create-ref-${noteName}`}
          >
            {noteName}+
          </span>
        );
      }
      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      const plainText = content.slice(lastIndex);
      parts.push(...renderFormattedText(plainText, `${keyPrefix}-plain-${lastIndex}`));
    }

    return parts.length > 0 ? parts : renderFormattedText(content, keyPrefix, imageCtx);
  };

  // A markdown table is a header row immediately followed by a
  // |---|---| separator row - detected here (not in the per-line map
  // below) since rendering one means consuming several lines at once.
  const isTableRow = (l: string) => /\|/.test(l) && l.trim().length > 0;
  const isTableSeparatorRow = (l: string) =>
    /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(l);
  const parseTableRow = (l: string) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  // Applies `mutate` to the current note's content split into lines, then
  // saves the result the same way any other one-off note edit does
  // (tags, pin, archive, ...) - immediate, not routed through the
  // raw-textarea's debounced save.
  const updateNoteContentLines = (mutate: (lines: string[]) => void) => {
    if (!selectedNoteId) return;
    // Base the patch on `noteContent`, not `currentNote.content` - the query
    // cache lags behind while live-sync is active (see the load effect above),
    // and patching from a stale base would silently revert whatever's been
    // typed or received since the cache was last populated.
    const lines = (noteContent || "").split("\n");
    mutate(lines);
    const nextContent = lines.join("\n");
    setNoteContent(nextContent);
    updateNoteMutation.mutate({ id: selectedNoteId, data: { content: nextContent } });
  };

  // Same immediate-save pattern as updateNoteContentLines, for the read
  // view's click-to-resize/reposition image controls (renderFormattedText's
  // NoteImage). Operates on the raw content string directly rather than
  // per-line, since an image's position in "document order" (see
  // replaceNthImageMarkdown) is independent of which line, bullet, or table
  // cell it's nested inside.
  const updateNoteImage = (index: number, newMarkdown: string) => {
    if (!selectedNoteId) return;
    const newContent = replaceNthImageMarkdown(noteContent || "", index, newMarkdown);
    setNoteContent(newContent);
    updateNoteMutation.mutate({ id: selectedNoteId, data: { content: newContent } });
  };

  const startEditingTableCell = (
    tableStart: number,
    rowKind: "header" | number,
    colIndex: number,
    colCount: number,
    rowCount: number,
    initialValue: string
  ) => {
    setEditingTableCell({ tableStart, rowKind, colIndex, colCount, rowCount });
    setEditingTableValue(initialValue);
  };

  // Commits the cell being edited and, if `moveTo` is given, immediately
  // starts editing the next cell (Tab/Enter navigation) using the value
  // read from the very same line mutation, since the server's copy of the
  // note hasn't round-tripped back yet.
  const commitEditingTableCell = (moveTo?: { rowKind: "header" | number; colIndex: number }) => {
    if (!editingTableCell) return;
    const { tableStart, rowKind, colIndex, colCount, rowCount } = editingTableCell;
    let nextValue = "";
    updateNoteContentLines((lines) => {
      const lineIdx = rowKind === "header" ? tableStart : tableStart + 2 + rowKind;
      if (lineIdx < lines.length) {
        const cells = parseTableRow(lines[lineIdx]);
        cells[colIndex] = editingTableValue;
        lines[lineIdx] = `| ${cells.join(" | ")} |`;
      }
      if (moveTo) {
        const nextLineIdx = moveTo.rowKind === "header" ? tableStart : tableStart + 2 + moveTo.rowKind;
        if (nextLineIdx < lines.length) {
          const nextCells = parseTableRow(lines[nextLineIdx]);
          nextValue = nextCells[moveTo.colIndex] ?? "";
        }
      }
    });
    if (moveTo) {
      setEditingTableCell({ tableStart, rowKind: moveTo.rowKind, colIndex: moveTo.colIndex, colCount, rowCount });
      setEditingTableValue(nextValue);
    } else {
      setEditingTableCell(null);
    }
  };

  const handleTableCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editingTableCell) return;
    const { rowKind, colIndex, colCount, rowCount } = editingTableCell;
    if (e.key === "Escape") {
      suppressTableBlurRef.current = true;
      setEditingTableCell(null);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      suppressTableBlurRef.current = true;
      if (colIndex < colCount - 1) {
        commitEditingTableCell({ rowKind, colIndex: colIndex + 1 });
      } else if (rowKind === "header" && rowCount > 0) {
        commitEditingTableCell({ rowKind: 0, colIndex: 0 });
      } else if (typeof rowKind === "number" && rowKind < rowCount - 1) {
        commitEditingTableCell({ rowKind: rowKind + 1, colIndex: 0 });
      } else {
        commitEditingTableCell();
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      suppressTableBlurRef.current = true;
      if (rowKind === "header" && rowCount > 0) {
        commitEditingTableCell({ rowKind: 0, colIndex });
      } else if (typeof rowKind === "number" && rowKind < rowCount - 1) {
        commitEditingTableCell({ rowKind: rowKind + 1, colIndex });
      } else {
        commitEditingTableCell();
      }
    }
  };

  const handleTableCellBlur = () => {
    if (suppressTableBlurRef.current) {
      suppressTableBlurRef.current = false;
      return;
    }
    commitEditingTableCell();
  };

  const addTableRow = (colCount: number, insertAtLineIdx: number) => {
    updateNoteContentLines((lines) => {
      const newRow = `| ${Array(colCount).fill("").join(" | ")} |`;
      lines.splice(insertAtLineIdx, 0, newRow);
    });
  };

  const addTableColumn = (tableStart: number, endLineIdx: number) => {
    updateNoteContentLines((lines) => {
      for (let i = tableStart; i < endLineIdx; i++) {
        const cells = parseTableRow(lines[i]);
        if (i === tableStart) {
          cells.push(`Column ${cells.length + 1}`);
        } else if (i === tableStart + 1) {
          cells.push("---");
        } else {
          cells.push("");
        }
        lines[i] = `| ${cells.join(" | ")} |`;
      }
    });
  };

  const removeTableColumn = (tableStart: number, endLineIdx: number, colIndex: number, colCount: number) => {
    if (colCount <= 1) return;
    updateNoteContentLines((lines) => {
      for (let i = tableStart; i < endLineIdx; i++) {
        const cells = parseTableRow(lines[i]);
        cells.splice(colIndex, 1);
        lines[i] = `| ${cells.join(" | ")} |`;
      }
    });
    setEditingTableCell(null);
  };

  const removeTableRow = (lineIdx: number) => {
    updateNoteContentLines((lines) => {
      lines.splice(lineIdx, 1);
    });
    setEditingTableCell(null);
  };

  const formatEntityReferences = (content: string, editable: boolean = false, idPrefix?: string): React.ReactNode => {
    const lines = content.split('\n');
    const blocks: React.ReactNode[] = [];
    let lineIndex = 0;
    // One counter for the whole note, shared by every line/bullet/table-cell
    // call to formatInlineReferences below, so each image's position in
    // "document order" (see replaceNthImageMarkdown) survives however this
    // line got transformed (bullet prefix stripped, table cell split out).
    const imageCtx: ImageEditContext | undefined = editable
      ? { counter: { current: 0 }, onImageEdit: updateNoteImage }
      : undefined;
    // Same ordering extractNoteHeadings uses, so a heading's id here lines
    // up with the index a Book's "sub chapter" outline scrolls to.
    let headingCounter = 0;

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];

      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const HeadingTag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
        const headingClass =
          level === 1
            ? "text-xl font-display font-bold text-stone-100 mt-3 mb-1 pb-1 border-b"
            : level === 2
              ? "text-lg font-display font-bold text-stone-100 mt-2 mb-1"
              : "text-base font-semibold text-stone-200 mt-2 mb-0.5";
        blocks.push(
          <HeadingTag
            key={lineIndex}
            id={idPrefix ? `${idPrefix}-heading-${headingCounter}` : undefined}
            className={headingClass}
            style={level === 1 ? { borderColor: "var(--ca-gilt-line-soft)" } : undefined}
          >
            {formatInlineReferences(text, `line-${lineIndex}`, imageCtx)}
          </HeadingTag>
        );
        headingCounter++;
        lineIndex++;
        continue;
      }

      if (isTableRow(line) && lineIndex + 1 < lines.length && isTableSeparatorRow(lines[lineIndex + 1])) {
        const headerCells = parseTableRow(line);
        const tableStart = lineIndex;
        let j = lineIndex + 2;
        const bodyRows: string[][] = [];
        while (j < lines.length && isTableRow(lines[j]) && !isTableSeparatorRow(lines[j])) {
          bodyRows.push(parseTableRow(lines[j]));
          j++;
        }
        const colCount = headerCells.length;
        const rowCount = bodyRows.length;
        const tableEndLineIdx = j;
        blocks.push(
          <div
            key={tableStart}
            className="my-2 overflow-x-auto"
            onClick={editable ? (e) => e.stopPropagation() : undefined}
          >
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr>
                  {headerCells.map((cell, ci) => {
                    const isEditingThis =
                      editable &&
                      editingTableCell?.tableStart === tableStart &&
                      editingTableCell.rowKind === "header" &&
                      editingTableCell.colIndex === ci;
                    return (
                      <th
                        key={ci}
                        className="relative group border border-stone-700 bg-stone-800/60 px-2 py-1 text-left font-medium text-stone-200"
                      >
                        {isEditingThis ? (
                          <Input
                            autoFocus
                            value={editingTableValue}
                            onChange={(e) => setEditingTableValue(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={handleTableCellKeyDown}
                            onBlur={handleTableCellBlur}
                            className="h-6 px-1 py-0 bg-stone-900 border-amber-600"
                          />
                        ) : (
                          <div
                            className={editable ? "cursor-text pr-3" : undefined}
                            onClick={
                              editable
                                ? () => startEditingTableCell(tableStart, "header", ci, colCount, rowCount, cell)
                                : undefined
                            }
                          >
                            {formatInlineReferences(cell, `th-${tableStart}-${ci}`, imageCtx)}
                          </div>
                        )}
                        {editable && colCount > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTableColumn(tableStart, tableEndLineIdx, ci, colCount)}
                            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-stone-500 hover:text-red-400"
                            title="Remove column"
                            data-testid={`button-remove-table-col-${tableStart}-${ci}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </th>
                    );
                  })}
                  {editable && (
                    <th className="border border-stone-700 bg-stone-800/60 w-6 p-0">
                      <button
                        type="button"
                        onClick={() => addTableColumn(tableStart, tableEndLineIdx)}
                        className="w-full h-full flex items-center justify-center text-stone-500 hover:text-amber-400 py-1"
                        title="Add column"
                        data-testid={`button-add-table-col-${tableStart}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => {
                  const lineIdx = tableStart + 2 + ri;
                  return (
                    <tr key={ri} className="group">
                      {row.map((cell, ci) => {
                        const isEditingThis =
                          editable &&
                          editingTableCell?.tableStart === tableStart &&
                          editingTableCell.rowKind === ri &&
                          editingTableCell.colIndex === ci;
                        return (
                          <td key={ci} className="border border-stone-700 px-2 py-1 align-top">
                            {isEditingThis ? (
                              <Input
                                autoFocus
                                value={editingTableValue}
                                onChange={(e) => setEditingTableValue(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={handleTableCellKeyDown}
                                onBlur={handleTableCellBlur}
                                className="h-6 px-1 py-0 bg-stone-900 border-amber-600"
                              />
                            ) : (
                              <div
                                className={editable ? "cursor-text min-h-[1.25rem]" : undefined}
                                onClick={
                                  editable
                                    ? () => startEditingTableCell(tableStart, ri, ci, colCount, rowCount, cell)
                                    : undefined
                                }
                              >
                                {formatInlineReferences(cell, `td-${tableStart}-${ri}-${ci}`, imageCtx)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {editable && (
                        <td className="border border-stone-700 w-6 p-0 text-center">
                          <button
                            type="button"
                            onClick={() => removeTableRow(lineIdx)}
                            className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-red-400"
                            title="Remove row"
                            data-testid={`button-remove-table-row-${tableStart}-${ri}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editable && (
              <button
                type="button"
                onClick={() => addTableRow(colCount, tableEndLineIdx)}
                className="mt-1 text-xs text-stone-500 hover:text-amber-400 flex items-center gap-1"
                data-testid={`button-add-table-row-${tableStart}`}
              >
                <Plus className="h-3 w-3" /> Add row
              </button>
            )}
          </div>
        );
        lineIndex = j;
        continue;
      }

      const bulletMatch = line.match(/^(\s*)(-|\*)\s+(.*)$/);
      if (bulletMatch) {
        const [, indent, , text] = bulletMatch;
        const indentLevel = Math.floor(indent.length / 2);
        blocks.push(
          <div
            key={lineIndex}
            className="flex items-start gap-2"
            style={{ paddingLeft: `${indentLevel * 16}px` }}
          >
            <span className="text-amber-500 mt-0.5">•</span>
            <span>{formatInlineReferences(text, `line-${lineIndex}`, imageCtx)}</span>
          </div>
        );
        lineIndex++;
        continue;
      }

      const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        const [, indent, num, text] = numberedMatch;
        const indentLevel = Math.floor(indent.length / 2);
        blocks.push(
          <div
            key={lineIndex}
            className="flex items-start gap-2"
            style={{ paddingLeft: `${indentLevel * 16}px` }}
          >
            <span className="text-amber-500 font-medium min-w-[1.5rem]">{num}.</span>
            <span>{formatInlineReferences(text, `line-${lineIndex}`, imageCtx)}</span>
          </div>
        );
        lineIndex++;
        continue;
      }

      if (line.trim() === '') {
        blocks.push(<div key={lineIndex} className="h-4" />);
        lineIndex++;
        continue;
      }

      blocks.push(
        <div key={lineIndex}>
          {formatInlineReferences(line, `line-${lineIndex}`, imageCtx)}
        </div>
      );
      lineIndex++;
    }

    return <div className="space-y-1">{blocks}</div>;
  };

  // Notes with no folder never show up by browsing the folder tree above -
  // that includes every character/item sheet's entity-linked note, since
  // those are always created at root with no folder assignment. Without
  // this they're only reachable via search/tags/the sheet's own Notes
  // button, which made the whole sidebar look like it wasn't tracking them.
  const unfiledNotesForTree = allNotesForTree
    .filter((n) => !n.folderId && !n.isArchived)
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

  const rootFolders = folders
    .filter((f) => !f.parentId)
    .sort((a, b) => {
      switch (folderSortMode) {
        case "name":
          return a.name.localeCompare(b.name);
        case "date":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "custom":
        default:
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }
    });

  const sortedNotes = [...notes]
    .filter((n) => !n.isArchived)
    .filter(
      (n) =>
        !searchQuery ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const allTagsForFilter = Array.from(
    new Set(allNotesForTree.flatMap((n) => ((n as any).tags || []) as string[]))
  ).sort();

  if (!isOpen) return null;

  // What you can make at the top level of this campaign's notes. One list,
  // shown two ways: as the sidebar's New button and as the right-click menu,
  // so the two can't drift apart.
  // Root-level (unfiled) creation is a GM tool - a player's only place to
  // create a note is inside their own player folder (via the per-folder
  // "New Note" context menu), not floating unfiled at the top of the tree.
  // Timelines isn't a creation action, so it stays available either way.
  const rootCreateActions: Array<{ key: string; label: string; icon: any; run: () => void } | { separator: true }> = [
    ...(isGm ? [
      { key: "folder", label: "New Folder", icon: FolderPlus, run: () => createFolderInline(null) },
      { separator: true as const },
      { key: "note", label: "New Note", icon: FileText, run: () => createNoteMutation.mutate({ title: "Untitled Note", content: "", folderId: null, type: "markdown", campaignId } as any) },
      { key: "canvas", label: "New Canvas", icon: Grid3X3, run: () => createNoteMutation.mutate({ title: "Untitled Canvas", content: "", type: "canvas", canvasData: { nodes: [], connections: [] }, folderId: null, campaignId } as any) },
      { key: "sheet", label: "New Sheet", icon: TableIcon, run: () => createNoteMutation.mutate({ title: "Untitled Sheet", content: "", type: "sheet", canvasData: makeEmptySheet(), folderId: null, campaignId } as any) },
      { key: "scene", label: "New Scene", icon: MapIcon, run: () => createNoteMutation.mutate({ title: "Untitled Scene", content: "", type: "scene", canvasData: {}, folderId: null, campaignId } as any) },
      { key: "book", label: "New Book", icon: BookOpen, run: () => createNoteMutation.mutate({ title: "Untitled Book", content: "", type: "book", folderId: null, campaignId } as any) },
    ] : []),
    ...(onOpenTimelines ? [{ separator: true as const }, { key: "timelines", label: "Timelines", icon: HistoryIcon, run: onOpenTimelines }] : []),
  ];

  const renderSidebar = () => (
    <div className="flex flex-col h-full border-r border-stone-700 bg-stone-950/50 overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b border-stone-700">
        <span className="text-xs font-medium text-stone-300">Folders</span>
        {/* Everything the right-click menu offers, on a button you can find.
            Right-clicking used to be the only way to make a note, a canvas or
            a scene, and only over the sliver of blank space under the tree. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-5 w-5" title="New…" data-testid="button-sidebar-new">
              <Plus className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-stone-900 border-stone-700">
            {rootCreateActions.map((a, i) => (
              "separator" in a ? (
                <DropdownMenuSeparator key={`sep-${i}`} className="bg-stone-700" />
              ) : (
                <DropdownMenuItem key={a.key} onClick={a.run} data-testid={`menu-new-root-${a.key}`}>
                  <a.icon className="h-3 w-3 mr-2" /> {a.label}
                </DropdownMenuItem>
              )
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="p-1 border-b border-stone-700">
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-stone-500" />
          <Input
            placeholder="Search..."
            value={sidebarSearchQuery}
            onChange={(e) => setSidebarSearchQuery(e.target.value)}
            className="h-6 pl-5 text-xs bg-stone-900/50 border-stone-700"
            data-testid="panel-input-sidebar-search"
          />
          {sidebarSearchQuery && (
            <button
              onClick={() => setSidebarSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>
      {allTagsForFilter.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap px-1.5 py-1 border-b border-stone-700">
          {allTagsForFilter.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${activeTagFilter === tag ? "bg-amber-900/50 text-amber-400" : "bg-stone-800/60 text-stone-400 hover:text-stone-200"}`}
              data-testid={`panel-tag-filter-${tag}`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      {sidebarSearchQuery || activeTagFilter ? (
        // A plain scroller, not ScrollArea: Radix lays its viewport content out
        // as a table, and a table sizes to its content - so one long note
        // title stretched every row past the panel's own edge.
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1">
          {allNotesForTree
            .filter((n) => n.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
            .filter((n) => !activeTagFilter || ((n as any).tags || []).includes(activeTagFilter))
            .map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  setShowHomeView(false);
                  setSelectedNoteId(note.id);
                  setSidebarSearchQuery("");
                }}
                className="flex items-center gap-1 py-1 px-1.5 rounded-md border border-transparent cursor-pointer transition-all text-xs hover:bg-stone-800/50 hover:border-stone-700/40 text-stone-300"
                data-testid={`panel-sidebar-search-result-${note.id}`}
              >
                <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="flex-1 truncate">{note.title || "Untitled"}</span>
              </div>
            ))}
          {allNotesForTree
            .filter((n) => n.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
            .filter((n) => !activeTagFilter || ((n as any).tags || []).includes(activeTagFilter)).length === 0 && (
            <p className="text-xs text-stone-500 text-center py-2">No notes found</p>
          )}
          {activeTagFilter && (
            <button
              onClick={() => setActiveTagFilter(null)}
              className="w-full text-xs text-stone-500 hover:text-stone-300 text-center py-1 mt-1 border-t border-stone-800"
              data-testid="button-clear-tag-filter"
            >
              Clear #{activeTagFilter} filter
            </button>
          )}
        </div>
      ) : (
      // A plain scroller, not ScrollArea: Radix lays its viewport content out
      // as a table, and a table sizes to its content - so one long note title
      // stretched every row past the panel's own edge.
      //
      // The whole scroller is the right-click target. It used to be a 100px
      // filler under the tree, so with more than a screenful of folders there
      // was barely anywhere left to aim at. A row's own menu still wins: each
      // row's trigger stops the event before it reaches this one.
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1">
        <div
          className={`flex items-center gap-1 py-1 px-1.5 rounded-md border cursor-pointer transition-all text-xs ${
            showHomeView && !selectedFolderId
              ? "bg-amber-900/25 text-amber-400 border-amber-700/40 shadow-[0_0_10px_rgba(61,119,240,0.15)]"
              : "border-transparent hover:bg-stone-800/50 hover:border-stone-700/40 text-stone-300"
          }`}
          onClick={() => {
            setSelectedFolderId(null);
            setShowHomeView(true);
            setSelectedNoteId(null);
          }}
          data-testid="panel-folder-home"
        >
          <Home className="h-3 w-3" />
          <span>Home</span>
        </div>
        <Separator className="my-1 bg-stone-800" />
        <div className="flex items-center gap-1 px-1.5 mb-0.5">
          <span className="text-xs text-stone-500 flex-1">Sort:</span>
          <select
            value={folderSortMode}
            onChange={(e) => {
              const mode = e.target.value as FolderSortMode;
              setFolderSortMode(mode);
              localStorage.setItem("campaign-notes-folder-sort-mode", mode);
            }}
            className="text-xs bg-stone-800 border-stone-700 text-stone-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
            data-testid="panel-folder-sort-dropdown"
          >
            <option value="custom">Custom</option>
            <option value="name">Name</option>
            <option value="date">Date</option>
          </select>
        </div>
        <RootDropZone 
          onDropToRoot={(folderId) => {
            handleReorderFolder(folderId, 0, null);
          }}
          onDropNoteToRoot={(noteId) => {
            updateNoteMutation.mutate({
              id: noteId,
              data: { folderId: null },
            });
          }}
        />
        <div className="space-y-0.5 group">
          {foldersLoading ? (
            <div className="flex items-center justify-center py-2">
              <LoadingLogo className="h-3 w-3 text-stone-500" />
            </div>
          ) : (
            rootFolders.map((folder, folderIndex) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                folders={folders}
                allNotes={allNotesForTree}
                selectedFolderId={selectedFolderId}
                selectedNoteId={selectedNoteId}
                onSelect={(id) => {
                  setSelectedFolderId(id);
                }}
                onNoteSelect={(id) => {
                  setShowHomeView(false);
                  setSelectedNoteId(id);
                }}
                onContextMenu={(f) => openFolderDialog(f)}
                onShareFolder={(f) => openFolderShareDialog(f.id)}
                onAddSubfolder={(parentId) => createFolderInline(parentId)}
                onDeleteFolder={(f) => {
                  setFolderToDelete(f);
                  setDeleteFolderDialogOpen(true);
                }}
                onMoveFolder={(folderId, newParentId) => {
                  updateFolderMutation.mutate({
                    id: folderId,
                    data: { parentId: newParentId },
                  });
                }}
                onReorderFolder={handleReorderFolder}
                onCreateNote={(folderId) => {
                  createNoteMutation.mutate({
                    title: "Untitled Note",
                    content: "",
                    folderId: folderId,
                    type: "markdown",
                    campaignId: campaignId,
                  });
                }}
                onCreateCanvas={(folderId) => {
                  createNoteMutation.mutate({
                    title: "Untitled Canvas",
                    content: "",
                    type: "canvas",
                    canvasData: { nodes: [], connections: [] },
                    folderId: folderId,
                    campaignId: campaignId,
                  });
                }}
                onCreateSheet={(folderId) => {
                  createNoteMutation.mutate({
                    title: "Untitled Sheet",
                    content: "",
                    type: "sheet",
                    canvasData: makeEmptySheet() as any,
                    folderId: folderId,
                    campaignId: campaignId,
                  });
                }}
                onCreateScene={isGm ? (folderId) => {
                  createNoteMutation.mutate({
                    title: "Untitled Scene",
                    content: "",
                    type: "scene",
                    canvasData: {},
                    folderId: folderId,
                    campaignId: campaignId,
                  });
                } : undefined}
                onShareNote={(id) => {
                  openShareDialog(id);
                }}
                onDeleteNote={requestDeleteNote}
                onMoveNote={(noteId, folderId) => {
                  updateNoteMutation.mutate({
                    id: noteId,
                    data: { folderId },
                  });
                }}
                index={folderIndex}
                siblingCount={rootFolders.length}
                draggedFolderId={draggedFolderId}
                setDraggedFolderId={setDraggedFolderId}
                dropTargetIndex={dropTargetIndex}
                setDropTargetIndex={setDropTargetIndex}
                currentCampaignId={campaignId}
                currentUserId={user?.id}
                sortMode={folderSortMode}
                expandedFolderIds={expandedFolderIds}
                setExpandedFolderIds={setExpandedFolderIds}
                renamingFolderId={renamingFolderId}
                onRenameCommit={(folderId, name) => {
                  setRenamingFolderId(null);
                  updateFolderMutation.mutate({ id: folderId, data: { name } });
                }}
                onRenameCancel={() => setRenamingFolderId(null)}
                renamingNoteId={renamingNoteId}
                onRenameNoteStart={(noteId) => setRenamingNoteId(noteId)}
                onRenameNoteCommit={renameNoteCommit}
                onRenameNoteCancel={() => setRenamingNoteId(null)}
              />
            ))
          )}
          {unfiledNotesForTree.length > 0 && (
            <div className="mt-1 pt-1 border-t border-stone-800">
              {unfiledNotesForTree.map((note) => {
                const isRenamingNote = renamingNoteId === note.id;
                return (
                <ContextMenu key={note.id}>
                  <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
                    <div
                      onClick={() => {
                        if (isRenamingNote) return;
                        setShowHomeView(false);
                        setSelectedNoteId(note.id);
                      }}
                      className={`flex items-center gap-1 py-1 px-1.5 rounded-md border cursor-pointer transition-all text-xs ${
                        selectedNoteId === note.id
                          ? "bg-amber-900/25 text-amber-400 border-amber-700/40 shadow-[0_0_10px_rgba(61,119,240,0.15)]"
                          : "border-transparent hover:bg-stone-800/50 hover:border-stone-700/40 text-stone-300"
                      }`}
                      data-testid={`panel-sidebar-unfiled-note-${note.id}`}
                    >
                      {note.type === "canvas" ? (
                        <Grid3X3 className="h-2.5 w-2.5 flex-shrink-0" />
                      ) : note.type === "sheet" ? (
                        <TableIcon className="h-2.5 w-2.5 flex-shrink-0" />
                      ) : note.type === "scene" ? (
                        <MapIcon className="h-2.5 w-2.5 flex-shrink-0" />
                      ) : note.type === "book" ? (
                        <BookOpen className="h-2.5 w-2.5 flex-shrink-0" />
                      ) : (
                        <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                      )}
                      {isRenamingNote ? (
                        <NoteRenameInput note={note} onCommit={renameNoteCommit} onCancel={() => setRenamingNoteId(null)} />
                      ) : (
                        <span
                          className="flex-1 truncate"
                          onDoubleClick={(e) => { e.stopPropagation(); setRenamingNoteId(note.id); }}
                        >
                          {note.title || "Untitled"}
                        </span>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="bg-stone-900 border-stone-700" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <ContextMenuItem
                      onClick={() => setRenamingNoteId(note.id)}
                      data-testid={`panel-sidebar-unfiled-note-rename-${note.id}`}
                    >
                      <Edit className="h-3 w-3 mr-2" /> Rename
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => openShareDialog(note.id)}
                      data-testid={`panel-sidebar-unfiled-note-share-${note.id}`}
                    >
                      <Share2 className="h-3 w-3 mr-2" /> Share
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-stone-700" />
                    <ContextMenuItem
                      onClick={() => requestDeleteNote(note)}
                      className="text-red-400 focus:text-red-400"
                      data-testid={`panel-sidebar-unfiled-note-delete-${note.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-2" /> Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                );
              })}
            </div>
          )}
        </div>
        {/* Right-click blank space to create a new top-level folder/note/
            canvas/scene, or jump to Timelines - a folder/note row's own
            context menu (above) takes precedence when right-clicking it
            directly, since this filler only covers space below the list. */}
        {/* Still here so the tree has somewhere to drop onto below the last
            folder; the right-click menu is the whole scroller now. */}
        <div className="min-h-[100px]" data-testid="panel-sidebar-blank-context-target" />
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-stone-900 border-stone-700" onCloseAutoFocus={(e) => e.preventDefault()}>
        {rootCreateActions.map((a, i) => (
          "separator" in a ? (
            <ContextMenuSeparator key={`sep-${i}`} className="bg-stone-700" />
          ) : (
            <ContextMenuItem key={a.key} onClick={a.run} data-testid={`context-menu-new-root-${a.key}`}>
              <a.icon className="h-3 w-3 mr-2" /> {a.label}
            </ContextMenuItem>
          )
        ))}
      </ContextMenuContent>
      </ContextMenu>
      )}
    </div>
  );

  const renderHomeView = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-xs">
        <Home className="h-10 w-10 mx-auto mb-4 text-stone-600" />
        <h2 className="text-lg font-display font-bold text-stone-200 mb-2">
          Notes
        </h2>
        <p className="text-xs text-stone-400 mb-4">
          Create a new note or select a folder from the sidebar.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button
            onClick={handleCreateNote}
            size="sm"
            className="bg-amber-700 hover:bg-amber-600"
            data-testid="panel-button-home-create-note"
          >
            <Plus className="h-3 w-3 mr-1" />
            Note
          </Button>
          <Button
            onClick={handleCreateCanvas}
            size="sm"
            className="bg-stone-700 hover:bg-stone-600 border border-amber-700/50"
            data-testid="panel-button-home-create-canvas"
          >
            <Grid3X3 className="h-3 w-3 mr-1" />
            Canvas
          </Button>
          <Button
            onClick={handleCreateSheet}
            size="sm"
            className="bg-stone-700 hover:bg-stone-600 border border-amber-700/50"
            data-testid="panel-button-home-create-sheet"
          >
            <TableIcon className="h-3 w-3 mr-1" />
            Sheet
          </Button>
        </div>
      </div>
    </div>
  );

  const renderNoteList = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-2 border-b border-stone-700">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-stone-500" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-xs bg-stone-900/50 border-stone-700"
            data-testid="panel-input-search-notes"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {notesLoading ? (
          <div className="flex items-center justify-center py-8 text-stone-500">
            <LoadingLogo className="h-4 w-4 mr-2" />
            <span className="text-xs">Loading...</span>
          </div>
        ) : sortedNotes.length === 0 ? (
          <div className="text-center py-8 text-stone-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No notes yet</p>
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {sortedNotes.map((note) => {
              const isOwner = note.userId === user?.id;
              const canManage = isOwner || isGm;
              const isRenamingNote = renamingNoteId === note.id;
              return (
              <ContextMenu key={note.id}>
                <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
                  <div
                    className={`group p-2 rounded cursor-pointer transition-colors ${
                      selectedNoteId === note.id
                        ? "bg-amber-900/40 border border-amber-700"
                        : "hover:bg-stone-800/50 border border-transparent"
                    }`}
                    onClick={() => { if (!isRenamingNote) setSelectedNoteId(note.id); }}
                    data-testid={`panel-card-note-${note.id}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        {note.type === "canvas" ? (
                          <Grid3X3 className="h-3 w-3 text-amber-400 flex-shrink-0" />
                        ) : note.type === "sheet" ? (
                          <TableIcon className="h-3 w-3 text-teal-400 flex-shrink-0" />
                        ) : note.type === "book" ? (
                          <BookOpen className="h-3 w-3 flex-shrink-0" style={{ color: "var(--ca-gilt)" }} />
                        ) : (
                          <FileText className="h-3 w-3 text-stone-500 flex-shrink-0" />
                        )}
                        {canManage && isRenamingNote ? (
                          <NoteRenameInput note={note} onCommit={renameNoteCommit} onCancel={() => setRenamingNoteId(null)} />
                        ) : (
                          <span
                            className="text-xs font-medium text-stone-200 truncate"
                            onDoubleClick={(e) => { if (canManage) { e.stopPropagation(); setRenamingNoteId(note.id); } }}
                          >
                            {note.isPinned && <Pin className="inline h-2.5 w-2.5 mr-0.5 text-amber-500" />}
                            {note.title}
                          </span>
                        )}
                        {!isOwner && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-cyan-400 border-cyan-600 flex-shrink-0">
                            Shared
                          </Badge>
                        )}
                      </div>
                      {isMobile && canManage && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); openShareDialog(note.id); }}
                            className="p-0.5 hover:bg-stone-700 rounded text-stone-500 hover:text-stone-300"
                            data-testid={`panel-card-note-share-mobile-${note.id}`}
                          >
                            <Share2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); requestDeleteNote(note); }}
                            className="p-0.5 hover:bg-stone-700 rounded text-red-400 hover:text-red-300"
                            data-testid={`panel-card-note-delete-mobile-${note.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 truncate">
                      {note.content?.slice(0, 40) || "Empty note"}
                    </p>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="bg-stone-900 border-stone-700" onCloseAutoFocus={(e) => e.preventDefault()}>
                  {canManage && (
                    <>
                      <ContextMenuItem onClick={() => setRenamingNoteId(note.id)}>
                        <Edit className="h-3 w-3 mr-2" />
                        Rename
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleTogglePin(note)}>
                        <Pin className="h-3 w-3 mr-2" />
                        {note.isPinned ? "Unpin" : "Pin"}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleToggleArchive(note)}>
                        <Archive className="h-3 w-3 mr-2" />
                        Archive
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => openShareDialog(note.id)}>
                        <Share2 className="h-3 w-3 mr-2" />
                        Share
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-stone-700" />
                      <ContextMenuItem
                        onClick={() => requestDeleteNote(note)}
                        className="text-red-400 focus:text-red-400"
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        Delete
                      </ContextMenuItem>
                    </>
                  )}
                  {!canManage && (
                    <ContextMenuItem disabled className="text-stone-500 text-xs">
                      <Eye className="h-3 w-3 mr-2" />
                      Shared with you
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="p-2 border-t border-stone-700 flex gap-1">
        <Button
          size="sm"
          onClick={handleCreateNote}
          className="flex-1 h-7 text-xs bg-amber-700 hover:bg-amber-600"
          data-testid="panel-button-create-note"
        >
          <Plus className="h-3 w-3 mr-1" /> Note
        </Button>
        <Button
          size="sm"
          onClick={handleCreateCanvas}
          className="h-7 text-xs bg-stone-700 hover:bg-stone-600 border border-amber-700/50"
          data-testid="panel-button-create-canvas"
        >
          <Grid3X3 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );

  const renderTagRow = () => {
    if (!currentNote) return null;
    const tags: string[] = (currentNote as any).tags || [];
    return (
      <div className="flex items-center gap-1 flex-wrap mb-1">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="bg-stone-800 text-stone-400 text-[10px] gap-1 pr-1"
            data-testid={`note-tag-${tag}`}
          >
            <button
              onClick={() => setActiveTagFilter(tag)}
              className="hover:text-amber-400"
              title={`Filter by #${tag}`}
            >
              #{tag}
            </button>
            <button
              onClick={() => handleRemoveTag(currentNote.id, tags, tag)}
              className="hover:text-red-400"
              data-testid={`button-remove-tag-${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        {addingTag ? (
          <Input
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddTag(currentNote.id, tags, tagDraft);
                setTagDraft("");
                setAddingTag(false);
              } else if (e.key === "Escape") {
                setTagDraft("");
                setAddingTag(false);
              }
            }}
            onBlur={() => {
              if (tagDraft.trim()) handleAddTag(currentNote.id, tags, tagDraft);
              setTagDraft("");
              setAddingTag(false);
            }}
            placeholder="tag name"
            className="h-5 w-24 text-[10px] px-1.5 bg-stone-900 border-stone-700"
            data-testid="input-new-note-tag"
          />
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            className="text-[10px] text-stone-500 hover:text-amber-400 px-1"
            data-testid="button-add-note-tag"
          >
            + tag
          </button>
        )}
      </div>
    );
  };

  const renderNoteReadView = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      {noteLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingLogo className="h-5 w-5 text-stone-500" />
        </div>
      ) : (
        // A plain scroller rather than ScrollArea: Radix lays its viewport
        // content out as a table, which leaves a percentage height on a child
        // with nothing to resolve against - so the card was sized by
        // `min-h-[40vh]`, a slice of the WINDOW, and stopped partway down a
        // docked pane no matter how tall the pane was. A definite-height
        // scroller lets the card simply fill it.
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {/* The whole card is the click target, including the empty space
              under a short note - an empty note would otherwise have almost
              nothing to click. Share/Delete/presence used to be a whole
              separate header bar above this card - folded into the title
              row instead so a short note isn't mostly empty chrome. */}
          <div
            role="textbox"
            tabIndex={0}
            onClick={() => beginInlineEdit()}
            onFocus={() => beginInlineEdit()}
            className="rounded-lg shadow-[0_0_24px_rgba(0,0,0,0.35)] p-4 min-h-full cursor-text outline-none bg-stone-900/40"
            style={{ border: '1px solid var(--ca-gilt-line-soft)' }}
            data-testid="panel-note-read-surface"
          >
            <div className="flex items-start justify-between gap-2">
              <h1
                className="text-2xl font-bold text-stone-100 mb-1 font-display min-w-0 truncate"
                data-testid="panel-text-note-read-title"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  beginInlineEdit(true);
                }}
              >
                {noteTitle || currentNote?.title}
              </h1>
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {remotePresence.length > 0 && (
                  <div className="flex items-center gap-0.5 mr-1" data-testid="panel-presence-indicators-read">
                    {remotePresence.slice(0, 3).map((p, i) => (
                      <div
                        key={p.userId}
                        className="relative group"
                        style={{ zIndex: remotePresence.length - i }}
                      >
                        <div
                          className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-[10px] font-bold text-stone-900 border border-stone-800 ring-1 ring-green-500/50"
                          title={p.username}
                        >
                          {p.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-stone-800" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-stone-900 border border-stone-700 rounded text-[10px] text-stone-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          {p.username}
                        </div>
                      </div>
                    ))}
                    {remotePresence.length > 3 && (
                      <div className="w-5 h-5 rounded-full bg-stone-700 flex items-center justify-center text-[10px] font-bold text-stone-300 border border-stone-800">
                        +{remotePresence.length - 3}
                      </div>
                    )}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => selectedNoteId && openShareDialog(selectedNoteId)}
                >
                  <Share2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={openNoteIsProtected ? "h-6 w-6 p-0 text-stone-600 cursor-not-allowed" : "h-6 w-6 p-0 text-red-400"}
                  title={openNoteIsProtected ? "Can't delete - attached to a character/item sheet" : undefined}
                  onClick={() => {
                    if (!currentNote) return;
                    if (openNoteIsProtected && linkedEntityRef) {
                      setProtectedDeleteState({ note: currentNote, ref: linkedEntityRef });
                      return;
                    }
                    setNoteToDelete(currentNote);
                    setDeleteNoteDialogOpen(true);
                  }}
                  data-testid="button-delete-note"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>{renderTagRow()}</div>
            <div className={`text-sm text-stone-300 whitespace-pre-wrap leading-relaxed mt-2 ${getFontClass(noteFont)}`} data-testid="panel-text-note-read-content">
              {formatEntityReferences(noteContent || currentNote?.content || "", true)}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderBookView = () => (
    <BookView
      noteId={selectedNoteId!}
      campaignId={campaignId}
      title={noteTitle || currentNote?.title || "Untitled Book"}
      liveSyncStored={!!(currentNote as any)?.bookLiveSync}
      onToggleLiveSync={(next) => updateNoteMutation.mutate({ id: selectedNoteId!, data: { bookLiveSync: next } as any })}
      availableNotes={allNotesForTree.map((n) => ({ id: n.id, title: n.title, type: (n as any).type }))}
      renderContent={(text, idPrefix) => formatEntityReferences(text, false, idPrefix)}
      onRenameTitle={(title) => { setNoteTitle(title); renameNoteCommit(selectedNoteId!, title); }}
    />
  );

  const renderNoteEditor = () => {
    if (currentNote?.type === "canvas") {
      if (noteLoading) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <LoadingLogo className="h-5 w-5 text-stone-500" />
          </div>
        );
      }
      return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CanvasEditor
            canvasData={canvasData}
            onChange={setCanvasData}
            readOnly={false}
            onClose={() => setSelectedNoteId(null)}
            title={noteTitle}
            onTitleChange={setNoteTitle}
            campaignId={campaignId}
          />
        </div>
      );
    }

    if (currentNote?.type === "sheet") {
      if (noteLoading) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <LoadingLogo className="h-5 w-5 text-stone-500" />
          </div>
        );
      }
      return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3">
          <Input
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            className="text-lg font-display font-bold bg-transparent border-0 border-b border-stone-700 rounded-none px-0 mb-3 focus-visible:ring-0"
            placeholder="Untitled Sheet"
            data-testid="input-sheet-title"
          />
          <div className="flex-1 min-h-0 overflow-auto">
            <NoteSheetGrid data={sheetData} onChange={setSheetData} readOnly={false} />
          </div>
        </div>
      );
    }

    return (
      <div ref={noteEditorRef} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center justify-end p-2 border-b border-stone-700">
          <div className="flex items-center gap-1">
            {remotePresence.length > 0 && (
              <div className="flex items-center gap-0.5 mr-1" data-testid="panel-presence-indicators-edit">
                {remotePresence.slice(0, 3).map((p, i) => (
                  <div
                    key={p.userId}
                    className="relative group"
                    style={{ zIndex: remotePresence.length - i }}
                  >
                    <div
                      className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-[10px] font-bold text-stone-900 border border-stone-800 ring-1 ring-green-500/50"
                      title={p.username}
                    >
                      {p.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-stone-800" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-stone-900 border border-stone-700 rounded text-[10px] text-stone-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      {p.username}
                    </div>
                  </div>
                ))}
                {remotePresence.length > 3 && (
                  <div className="w-5 h-5 rounded-full bg-stone-700 flex items-center justify-center text-[10px] font-bold text-stone-300 border border-stone-800">
                    +{remotePresence.length - 3}
                  </div>
                )}
              </div>
            )}
            {/* On a sheet note "GM Only" can't lock out whoever controls the
                character - say so here rather than letting a GM believe they
                hid something. Wrapping the line in # marks makes it a real
                secret, which is redacted on the way out and can't be edited. */}
            {isGm && currentNote && linkedEntityRef && (currentNote as any).visibility === "gm" && (
              <span className="text-[10px] text-amber-500/80" data-testid="text-sheet-note-visibility-hint">
                Players with edit access on this sheet can still see it — use #…# to hide a line.
              </span>
            )}
            {isGm && currentNote && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                title="Import into another campaign"
                onClick={() => setCrossCampaignImportOpen(true)}
                data-testid="button-import-note"
              >
                <CloudUpload className="h-3 w-3" />
              </Button>
            )}
            {isGm && currentNote && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                title="Change history"
                onClick={() => setHistoryDialogOpen(true)}
                data-testid="button-note-history"
              >
                <HistoryIcon className="h-3 w-3" />
              </Button>
            )}
            {isGm && currentNote && currentNote.type !== "canvas" && currentNote.type !== "scene" && currentNote.type !== "sheet" && !linkedEntityRef && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs gap-1 text-amber-400"
                title="Connect this note to a character or item"
                onClick={() => { setConnectType("character"); setConnectSearch(""); setConnectDialogOpen(true); }}
                data-testid="button-connect-note"
              >
                <Link2 className="h-3 w-3" /> Connect
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => selectedNoteId && openShareDialog(selectedNoteId)}
            >
              <Share2 className="h-3 w-3" />
            </Button>
            {/* Wipes the note's own content without touching the note object
                itself - the one way to clear out a note that's attached to a
                character/item sheet and can't be deleted (see Delete below). */}
            {!!noteContent && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-stone-400 hover:text-amber-400"
                title="Clear this note's content"
                onClick={() => {
                  if (!selectedNoteId) return;
                  if (!window.confirm("Clear all content from this note? This can't be undone.")) return;
                  setNoteContent("");
                  updateNoteMutation.mutate({ id: selectedNoteId, data: { content: "" } });
                }}
                data-testid="button-clear-note-content"
              >
                <Eraser className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={openNoteIsProtected ? "h-6 w-6 p-0 text-stone-600 cursor-not-allowed" : "h-6 w-6 p-0 text-red-400"}
              title={openNoteIsProtected ? "Can't delete - attached to a character/item sheet" : undefined}
              onClick={() => {
                if (!currentNote) return;
                if (openNoteIsProtected && linkedEntityRef) {
                  setProtectedDeleteState({ note: currentNote, ref: linkedEntityRef });
                  return;
                }
                setNoteToDelete(currentNote);
                setDeleteNoteDialogOpen(true);
              }}
              data-testid="button-delete-note"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {noteLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingLogo className="h-5 w-5 text-stone-500" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-2 overflow-hidden min-h-0 min-w-0">
            <Input
              ref={noteTitleInputRef}
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title"
              className="text-sm font-medium border-none bg-transparent focus-visible:ring-0 px-0 mb-1 h-7 shrink-0"
              data-testid="panel-input-note-title"
            />
            <div className="shrink-0 mb-1">{renderTagRow()}</div>
            {currentNote?.type === "scene" && (
              <div className="shrink-0 mb-2">
                <SceneNoteCard
                  campaignId={campaignId}
                  isGm={isGm}
                  link={sceneLinkFromNote(currentNote)}
                  onLinkChange={(link) => {
                    if (!selectedNoteId) return;
                    updateNoteMutation.mutate({ id: selectedNoteId, data: { canvasData: link } as any });
                  }}
                />
              </div>
            )}
            <div className="shrink-0">
              <FormattingToolbar
                textareaRef={textareaRef}
                content={noteContent}
                onContentChange={setNoteContent}
                font={noteFont}
                onFontChange={setNoteFont}
                compact={true}
                isGm={isGm}
              />
            </div>
            <div className="flex items-center gap-1 mb-1 shrink-0">
              <ReferencePicker
                open={referencePickerOpen}
                onOpenChange={setReferencePickerOpen}
                onSelect={handleReferenceSelectFromButton}
                campaignId={campaignId}
                triggerElement={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs border-stone-700 hover:bg-stone-800"
                    onClick={handleInsertReferenceClick}
                  >
                    <Link2 className="h-3 w-3 mr-1" />
                    Reference
                  </Button>
                }
              />
              <span className="text-xs text-stone-500">
                <kbd className="px-1 py-0.5 bg-stone-800 rounded text-stone-400 text-xs">[[</kbd> entities
              </span>
              <span className="text-xs text-stone-500">
                <kbd className="px-1 py-0.5 bg-stone-800 rounded text-stone-400 text-xs">**</kbd>bold
              </span>
              <span className="text-xs text-stone-500">
                <kbd className="px-1 py-0.5 bg-stone-800 rounded text-stone-400 text-xs">*</kbd>italic
              </span>
            </div>
            <div className="relative flex-1 overflow-hidden min-h-0">
              <Textarea
                ref={textareaRef}
                value={noteContent}
                onChange={handleContentChange}
                onKeyDown={handleFormattingKeyDown}
                placeholder="Start writing... Type [[ to link entities, // to link notes"
                className={`flex-1 resize-none border-stone-800 bg-stone-900/30 text-sm h-full w-full ${getFontClass(noteFont)}`}
                data-testid="panel-textarea-note-content"
              />
              <NoteOnlyPicker
                open={notePickerOpen}
                onOpenChange={(open) => {
                  setNotePickerOpen(open);
                  if (!open) setNotePickerTriggeredByTyping(false);
                }}
                notes={notes}
                onSelectNote={handleNotePickerSelect}
                onCreateNote={handleNotePickerCreate}
                initialSearch={notePickerInitialSearch}
              />
            </div>
            {hasRedactedGmSecrets(noteContent) && (
              <p className="text-xs text-stone-500 mt-1" data-testid="text-gm-secret-hint">
                <span className="text-red-400/80">█</span> marks GM-only text. You can edit everything around it.
              </p>
            )}
            {updateNoteMutation.isPending && (
              <p className="text-xs text-stone-500 mt-1">Saving...</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderGraphView = () => (
    <div className="flex-1 relative overflow-hidden">
      <NotesGraph
        notes={sortedNotes}
        characters={campaignCharacters}
        onNoteClick={(clickedNoteId) => {
          setSelectedNoteId(clickedNoteId);
        }}
      />
    </div>
  );

  return (
    // The notes panel reads as a page rather than another slab of chrome: a
    // gilt rule down its edge, a warmer ground than the sheet beside it, and
    // a vignette so the middle sits forward the way a spread does.
    <div
      className="h-full flex flex-col shadow-2xl relative"
      data-testid="notes-panel-root"
      style={{
        borderLeft: '1px solid var(--ca-gilt-line-soft)',
        background:
          'radial-gradient(120% 90% at 50% 0%, rgb(41 37 36 / 0.55) 0%, transparent 60%), ' +
          'radial-gradient(100% 80% at 50% 100%, rgb(28 25 23 / 0.5) 0%, transparent 55%), ' +
          'rgb(var(--notes-page-rgb, 20 20 27) / 0.98)',
      }}
    >
      {/* There was a second gilt rule here, inset from the panel edge the way
          a tooled border sits in from the edge of a cover. It was drawn over
          the whole panel, so in the narrow sidebar it cut straight across the
          header, the Home row and the note rows rather than framing them - a
          stray box on top of the content instead of a border around it. The
          edge rule on the root is the frame. */}
      {!hideNoteHeader && (
      <div className="flex items-center justify-between p-2 border-b border-stone-700 bg-stone-900">
        <div className="flex items-center gap-2 min-w-0">
          {/* The sidebar-toggle/title header only applies to the two-pane
              "full" layout (sidebar + content side by side) - navOnly is the
              pure-navigation sidebar itself (its own "Notes" label already
              lives in the surrounding side-panel chrome), and contentOnly is
              a single note's content with zero nav chrome, so neither mode
              shows this row's icon/toggle. */}
          {!contentOnly && !navOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? <ChevronLeft className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
            </Button>
          )}
          {!navOnly && (
            <>
              <FileText className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <h2 className="text-sm font-bold truncate font-display" style={{ color: 'var(--ca-gilt-bright)' }}>
                {contentOnly ? (currentNote?.title || "Note") : "Campaign Notes"}
              </h2>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!navOnly && !contentOnly && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${tabActiveNoteId === GRAPH_TAB_ID ? 'bg-amber-900/50 text-amber-400' : 'text-stone-400'}`}
            onClick={() => {
              const existing = openNotes.find(n => n.noteId === GRAPH_TAB_ID);
              if (existing) {
                if (tabActiveNoteId === GRAPH_TAB_ID) {
                  closeTab(GRAPH_TAB_ID);
                  setShowHomeView(true);
                } else {
                  switchTab(GRAPH_TAB_ID);
                  setSelectedNoteId(null);
                  setShowHomeView(false);
                }
              } else {
                openNoteTab(GRAPH_TAB_ID, "Graph View", "graph");
                setSelectedNoteId(null);
                setShowHomeView(false);
              }
            }}
            data-testid="panel-button-toggle-view"
          >
            <Network className="h-4 w-4" />
          </Button>
          )}
          {!navOnly && !contentOnly && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${tabActiveNoteId === TIMELINES_TAB_ID ? 'bg-amber-900/50 text-amber-400' : 'text-stone-400'}`}
            onClick={() => {
              const existing = openNotes.find(n => n.noteId === TIMELINES_TAB_ID);
              if (existing) {
                if (tabActiveNoteId === TIMELINES_TAB_ID) {
                  closeTab(TIMELINES_TAB_ID);
                  setShowHomeView(true);
                } else {
                  switchTab(TIMELINES_TAB_ID);
                  setSelectedNoteId(null);
                  setShowHomeView(false);
                }
              } else {
                openNoteTab(TIMELINES_TAB_ID, "Timelines", "timeline");
                setSelectedNoteId(null);
                setShowHomeView(false);
              }
            }}
            data-testid="panel-button-toggle-timelines"
            aria-label="Timelines"
          >
            <HistoryIcon className="h-4 w-4" />
          </Button>
          )}
          {!hideCloseButton && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-stone-400 hover:text-white"
              onClick={onClose}
              data-testid="panel-button-close"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      )}

      {!navOnly && !contentOnly && openNotes.length > 0 && (
        <NoteTabs
          openNotes={openNotes}
          activeNoteId={selectedNoteId || tabActiveNoteId}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
          onReorder={reorderTabs}
          compact
        />
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {navOnly ? (
          <div className="flex-1 min-w-0 h-full overflow-hidden">
            {renderSidebar()}
          </div>
        ) : contentOnly ? (
          <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden relative isolate flex flex-col">
              {noteLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <LoadingLogo className="h-5 w-5 text-stone-500" />
                </div>
              ) : selectedNoteId ? (
                currentNote?.type === "book" ? renderBookView() : currentNote?.type === "canvas" || currentNote?.type === "sheet" || noteMode === "edit" ? renderNoteEditor() : renderNoteReadView()
              ) : null}
            </div>
          </div>
        ) : tabActiveNoteId === GRAPH_TAB_ID && !selectedNoteId ? (
          renderGraphView()
        ) : tabActiveNoteId === TIMELINES_TAB_ID && !selectedNoteId ? (
          <TimelinePanel campaignId={campaignId} isGm={isGm} campaignMembers={campaignMembers} />
        ) : (
          <div className="flex h-full min-h-0 overflow-hidden w-full">
            {/* The sidebar used to be hidden while a note was being edited.
                Now that clicking into the body IS editing, that would make it
                vanish the moment you started typing. */}
            {showSidebar && (
              <>
                <div
                  style={{ width: `${sidebarWidth}px`, minWidth: '120px', maxWidth: '50%' }}
                  className="flex-shrink-0 min-w-0 h-full overflow-hidden"
                >
                  {renderSidebar()}
                </div>
                <div
                  className="w-1.5 flex-shrink-0 bg-stone-700/50 hover:bg-amber-600 transition-colors cursor-col-resize flex items-center justify-center"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
                  }}
                  onPointerMove={(e) => {
                    if (!sidebarResizeRef.current) return;
                    const dx = e.clientX - sidebarResizeRef.current.startX;
                    const newWidth = Math.max(120, Math.min(600, sidebarResizeRef.current.startWidth + dx));
                    setSidebarWidth(newWidth);
                  }}
                  onPointerUp={(e) => {
                    sidebarResizeRef.current = null;
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                  }}
                  data-testid="panel-sidebar-resize-handle"
                >
                  <div className="w-0.5 h-6 bg-stone-500 rounded-full" />
                </div>
              </>
            )}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full overflow-hidden">
              <div className="flex-1 min-h-0 overflow-hidden relative isolate flex flex-col">
                {selectedNoteId ? (
                  currentNote?.type === "book" ? renderBookView() : currentNote?.type === "canvas" || currentNote?.type === "sheet" || noteMode === "edit" ? renderNoteEditor() : renderNoteReadView()
                ) : showHomeView ? (
                  renderHomeView()
                ) : (
                  renderNoteList()
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={crossCampaignImportOpen} onOpenChange={(open) => { setCrossCampaignImportOpen(open); if (!open) setImportDestCampaignId(""); }}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Import Note to Another Campaign</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-stone-500">
            Copies this note into a campaign you GM. Same game system entity-linked notes copy the linked sheet too, as an independent record; different systems copy the note text only, unlinked.
          </p>
          <Select value={importDestCampaignId} onValueChange={setImportDestCampaignId}>
            <SelectTrigger className="h-8 text-xs bg-stone-900 border-stone-700" data-testid="select-import-destination">
              <SelectValue placeholder="Choose a destination campaign..." />
            </SelectTrigger>
            <SelectContent className="bg-stone-900 border-stone-700 text-xs">
              {gmCampaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
              {gmCampaigns.length === 0 && (
                <div className="px-2 py-1.5 text-[11px] text-stone-600">No other campaigns you GM.</div>
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCrossCampaignImportOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!importDestCampaignId || importNoteMutation.isPending}
              onClick={() => importNoteMutation.mutate()}
              data-testid="button-confirm-import"
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Change History</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {noteHistoryLoading && (
              <div className="flex justify-center py-4"><LoadingLogo className="h-5 w-5 text-stone-500" /></div>
            )}
            {!noteHistoryLoading && noteHistory.length === 0 && (
              <p className="text-xs text-stone-600 text-center py-4">No recorded changes yet.</p>
            )}
            {noteHistory.map((rev) => {
              const actor = campaignMembers.find(m => m.userId === rev.actorUserId);
              const actionLabel: Record<string, string> = {
                content: "Edited content",
                visibility: "Changed visibility",
                move: "Moved",
                create: "Created",
                delete: "Deleted",
                import: "Imported",
                scene_link: "Linked a Scene",
                restore: "Restored a revision",
                link: "Connected to a sheet",
              };
              return (
                <div key={rev.id} className="rounded border border-stone-800 bg-stone-900/50 p-2 text-xs" data-testid={`history-revision-${rev.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-stone-300 font-medium">{actionLabel[rev.action] || rev.action}</span>
                    <span className="text-[10px] text-stone-500">{new Date(rev.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-[10px] text-stone-500 mt-0.5">by {actor?.username || "someone"}</div>
                  {rev.action === "visibility" && rev.after && (
                    <div className="text-[10px] text-stone-500 mt-1">→ {rev.after.visibility}</div>
                  )}
                  {rev.action === "content" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] mt-1.5"
                      disabled={restoreRevisionMutation.isPending}
                      onClick={() => restoreRevisionMutation.mutate(rev.id)}
                      data-testid={`button-restore-revision-${rev.id}`}
                    >
                      Restore this version
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={connectDialogOpen} onOpenChange={(open) => { setConnectDialogOpen(open); if (!open) setConnectSearch(""); }}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Connect Note to a Sheet</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-stone-500">
            Link this note to an existing character or item in this campaign.
          </p>
          <div className="flex gap-1">
            <Button
              variant={connectType === "character" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => setConnectType("character")}
              data-testid="button-connect-tab-character"
            >
              Characters
            </Button>
            <Button
              variant={connectType === "item" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => setConnectType("item")}
              data-testid="button-connect-tab-item"
            >
              Items
            </Button>
          </div>
          <Input
            value={connectSearch}
            onChange={(e) => setConnectSearch(e.target.value)}
            placeholder={`Search ${connectType === "character" ? "characters" : "items"}...`}
            className="h-8 text-xs bg-stone-900 border-stone-700"
            data-testid="input-connect-search"
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {connectSearchLoading && (
              <div className="flex justify-center py-4"><LoadingLogo className="h-5 w-5 text-stone-500" /></div>
            )}
            {!connectSearchLoading && connectResults.length === 0 && (
              <p className="text-xs text-stone-600 text-center py-4">No matches.</p>
            )}
            {connectResults.map((entity) => (
              <button
                key={entity.id}
                type="button"
                className="w-full flex items-center gap-2 rounded border border-stone-800 bg-stone-900/50 hover:bg-stone-800/70 p-1.5 text-left disabled:opacity-50"
                disabled={connectMutation.isPending}
                onClick={() => connectMutation.mutate(entity)}
                data-testid={`button-connect-entity-${entity.id}`}
              >
                {entity.icon ? (
                  <img src={entity.icon} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="h-6 w-6 rounded bg-stone-800 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs text-stone-200 truncate">{entity.name}</div>
                  {entity.description && (
                    <div className="text-[10px] text-stone-500 truncate">{entity.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingFolder ? "Edit Folder" : "Create Folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="h-8 text-sm bg-stone-900 border-stone-700"
                data-testid="panel-input-folder-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <Select
                value={folderColor ?? "default"}
                onValueChange={(v) => setFolderColor(v === "default" ? null : v)}
              >
                <SelectTrigger className="h-8 text-sm bg-stone-900 border-stone-700">
                  <SelectValue placeholder="Select color" />
                </SelectTrigger>
                <SelectContent className="bg-stone-900 border-stone-700">
                  {FOLDER_COLORS.map((c) => (
                    <SelectItem key={c.name} value={c.value ?? "default"}>
                      <div className="flex items-center gap-2">
                        <Folder className={`h-3 w-3 ${getFolderColorClass(c.value)}`} />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Parent Folder</Label>
              <Select
                value={folderParentId ?? "none"}
                onValueChange={(v) => setFolderParentId(v === "none" ? null : v)}
              >
                <SelectTrigger className="h-8 text-sm bg-stone-900 border-stone-700">
                  <SelectValue placeholder="No parent" />
                </SelectTrigger>
                <SelectContent className="bg-stone-900 border-stone-700">
                  <SelectItem value="none">No parent</SelectItem>
                  {folders
                    .filter((f) => f.id !== editingFolder?.id)
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Campaign Visibility</Label>
              <Select
                value={folderCampaignAssignment ?? "global"}
                onValueChange={(v) => setFolderCampaignAssignment(v === "global" ? null : v)}
              >
                <SelectTrigger className="h-8 text-sm bg-stone-900 border-stone-700">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent className="bg-stone-900 border-stone-700">
                  <SelectItem value="global">
                    <div className="flex items-center gap-2">
                      <Network className="h-3 w-3 text-stone-400" />
                      Global (visible everywhere)
                    </div>
                  </SelectItem>
                  <SelectItem value={campaignId}>
                    <div className="flex items-center gap-2">
                      <Link2 className="h-3 w-3 text-amber-400" />
                      This Campaign Only
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingFolder && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => {
                  setFolderToDelete(editingFolder);
                  setDeleteFolderDialogOpen(true);
                  setFolderDialogOpen(false);
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Delete Folder
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleFolderSubmit}
              className="bg-amber-700 hover:bg-amber-600"
              disabled={!folderName.trim() || createFolderMutation.isPending || updateFolderMutation.isPending}
            >
              {(createFolderMutation.isPending || updateFolderMutation.isPending) && (
                <LoadingLogo className="h-3 w-3 mr-1" />
              )}
              {editingFolder ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteNoteDialogOpen} onOpenChange={setDeleteNoteDialogOpen}>
        <AlertDialogContent className="bg-stone-950 border-stone-800 text-stone-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500 text-sm">Delete Note?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400 text-xs">
              Are you sure you want to delete "{noteToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs bg-stone-900 border-stone-700 text-stone-100 hover:bg-stone-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => noteToDelete && deleteNoteMutation.mutate(noteToDelete.id)}
              className="h-8 text-xs bg-red-700 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* A note attached to a still-existing character/item can't be deleted
          directly - the sheet's Notes button always needs a note to open.
          This explains why and offers the one real way to unblock it: delete
          the attached sheet first (with its own confirmation step). */}
      <Dialog
        open={!!protectedDeleteState}
        onOpenChange={(open) => { if (!open) { setProtectedDeleteState(null); setConfirmDeleteSheet(false); } }}
      >
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-amber-500 text-sm">Can't Delete This Note</DialogTitle>
          </DialogHeader>
          {!confirmDeleteSheet ? (
            <>
              <p className="text-stone-400 text-xs">
                "{protectedDeleteState?.note.title}" is attached to a{" "}
                {protectedDeleteState?.ref.entityType === "item-sheet" ? "item" : "character"} sheet and can't be
                removed while that sheet still exists. Delete the attached sheet first to free up this note.
              </p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  className="h-8 text-xs bg-stone-900 border-stone-700 text-stone-100 hover:bg-stone-800"
                  onClick={() => { setProtectedDeleteState(null); setConfirmDeleteSheet(false); }}
                >
                  Close
                </Button>
                <Button
                  className="h-8 text-xs bg-red-700 hover:bg-red-600"
                  onClick={() => setConfirmDeleteSheet(true)}
                  data-testid="button-delete-attached-sheet"
                >
                  Delete Attached Sheet
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-stone-400 text-xs">
                This permanently deletes the attached {protectedDeleteState?.ref.entityType === "item-sheet" ? "item" : "character"}
                {" "}sheet, not just this note. Are you sure?
              </p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  className="h-8 text-xs bg-stone-900 border-stone-700 text-stone-100 hover:bg-stone-800"
                  onClick={() => setConfirmDeleteSheet(false)}
                >
                  Back
                </Button>
                <Button
                  className="h-8 text-xs bg-red-700 hover:bg-red-600"
                  disabled={deleteAttachedSheetMutation.isPending}
                  onClick={() => protectedDeleteState && deleteAttachedSheetMutation.mutate(protectedDeleteState.ref)}
                  data-testid="button-confirm-delete-attached-sheet"
                >
                  {deleteAttachedSheetMutation.isPending ? "Deleting..." : "Yes, Delete It"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <AlertDialogContent className="bg-stone-950 border-stone-800 text-stone-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500 text-sm">Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400 text-xs">
              Are you sure you want to delete "{folderToDelete?.name}"? Notes in this folder will be moved to All Notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs bg-stone-900 border-stone-700 text-stone-100 hover:bg-stone-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => folderToDelete && deleteFolderMutation.mutate(folderToDelete.id)}
              className="h-8 text-xs bg-red-700 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{shareFolderId ? "Share Folder" : "Share Note"}</DialogTitle>
          </DialogHeader>
          {shareFolderId && (
            <p className="text-xs text-stone-500 -mt-1">
              Everything in this folder goes with it, subfolders included.
            </p>
          )}
          {(() => {
            const shareOwnerId = shareFolderId
              ? folders.find((f) => f.id === shareFolderId)?.userId
              : allNotesForTree.find((n) => n.id === shareNoteId)?.userId;
            const canManageShares = !!shareOwnerId && shareOwnerId === user?.id;
            const permissionFor = (memberUserId: string): "none" | "view" | "edit" =>
              (noteShares.find((s) => s.sharedWithId === memberUserId)?.permission as "view" | "edit" | undefined) ?? "none";
            if (!canManageShares) {
              return (
                <p className="text-xs text-stone-500 py-2">
                  Only the {shareFolderId ? "folder's" : "note's"} owner can manage sharing.
                </p>
              );
            }
            return (
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Campaign Members</Label>
                    <span className="text-[10px] text-stone-500">Set everyone:</span>
                  </div>
                  <div className="flex justify-end gap-1 -mt-1">
                    {(["none", "view", "edit"] as const).map((level) => (
                      <Button
                        key={level}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] border-stone-700 bg-stone-900 hover:bg-stone-800"
                        onClick={() => campaignMembers.forEach((m) => setMemberSharePermission(m.userId, level))}
                        data-testid={`button-share-set-all-${level}`}
                      >
                        {level === "none" ? "None" : level === "view" ? "View" : "Edit"}
                      </Button>
                    ))}
                  </div>
                  {campaignMembers.length === 0 ? (
                    <p className="text-xs text-stone-500">No other members in this campaign</p>
                  ) : (
                    <div className="space-y-1">
                      {campaignMembers.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between py-1.5 px-2 bg-stone-900/50 rounded text-xs"
                          data-testid={`row-share-member-${member.userId}`}
                        >
                          <span className="text-stone-300">{member.username}</span>
                          <Select
                            value={permissionFor(member.userId)}
                            onValueChange={(v) => setMemberSharePermission(member.userId, v as "none" | "view" | "edit")}
                          >
                            <SelectTrigger className="w-24 h-7 text-xs bg-stone-900 border-stone-700" data-testid={`select-share-permission-${member.userId}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-stone-900 border-stone-700">
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="view">
                                <div className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" /> View
                                </div>
                              </SelectItem>
                              <SelectItem value="edit">
                                <div className="flex items-center gap-1">
                                  <Edit className="h-3 w-3" /> Edit
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setShareDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={entityDialogOpen} onOpenChange={setEntityDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {selectedEntityType && (
                <Badge className="bg-amber-700/50 text-amber-300 capitalize text-xs">
                  {selectedEntityType}
                </Badge>
              )}
              {entityData?.name || "Entity Details"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {entityLoading ? (
              <div className="flex items-center justify-center py-6">
                <LoadingLogo className="h-5 w-5 text-amber-500" />
              </div>
            ) : entityData ? (
              <div className="space-y-3 text-xs">
                {entityData.description && (
                  <div>
                    <Label className="text-stone-400 text-xs uppercase tracking-wide">Description</Label>
                    <p className="text-stone-300 mt-1">{entityData.description}</p>
                  </div>
                )}
                
                {selectedEntityType?.toLowerCase() === "spell" && (
                  <>
                    {entityData.school && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">School</Label>
                          <p className="text-stone-300 mt-0.5 capitalize">{entityData.school}</p>
                        </div>
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Level</Label>
                          <p className="text-stone-300 mt-0.5">{entityData.level}</p>
                        </div>
                      </div>
                    )}
                    {entityData.energyCost !== undefined && (
                      <div>
                        <Label className="text-stone-400 text-xs uppercase tracking-wide">Energy Cost</Label>
                        <p className="text-stone-300 mt-0.5">{entityData.energyCost}</p>
                      </div>
                    )}
                  </>
                )}

                {selectedEntityType?.toLowerCase() === "character" && (
                  <>
                    {entityData.portrait && (
                      <div className="flex justify-center">
                        <img 
                          src={entityData.portrait} 
                          alt={entityData.name}
                          className="w-16 h-16 rounded-full object-cover border-2 border-stone-700"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {entityData.race && (
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Race</Label>
                          <p className="text-stone-300 mt-0.5 capitalize">{entityData.race}</p>
                        </div>
                      )}
                      {entityData.level !== undefined && (
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Level</Label>
                          <p className="text-stone-300 mt-0.5">{entityData.level}</p>
                        </div>
                      )}
                    </div>
                    {(entityData.hp !== undefined || entityData.energy !== undefined) && (
                      <div className="grid grid-cols-2 gap-2">
                        {entityData.hp !== undefined && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">HP</Label>
                            <p className="text-red-400 mt-0.5">
                              {entityData.hp} / {entityData.maxHp !== undefined ? entityData.maxHp : '—'}
                            </p>
                          </div>
                        )}
                        {entityData.energy !== undefined && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">Energy</Label>
                            <p className="text-blue-400 mt-0.5">
                              {entityData.energy} / {entityData.maxEnergy !== undefined ? entityData.maxEnergy : '—'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {selectedEntityType?.toLowerCase() === "item" && (
                  <>
                    {entityData.image && (
                      <div className="flex justify-center">
                        <img 
                          src={entityData.image} 
                          alt={entityData.name}
                          className="w-16 h-16 rounded object-cover border-2 border-stone-700"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {(entityData.itemType || entityData.type) && (
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Type</Label>
                          <p className="text-stone-300 mt-0.5 capitalize">{entityData.itemType || entityData.type}</p>
                        </div>
                      )}
                      {entityData.rarity && (
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Rarity</Label>
                          <p className="text-stone-300 mt-0.5 capitalize">{entityData.rarity}</p>
                        </div>
                      )}
                    </div>
                    {(entityData.damage || entityData.damageDice) && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Damage</Label>
                          <p className="text-amber-400 mt-0.5">{entityData.damage || entityData.damageDice}</p>
                        </div>
                        {entityData.damageType && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">Damage Type</Label>
                            <p className="text-stone-300 mt-0.5 capitalize">{entityData.damageType}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {(entityData.range || entityData.mod !== undefined) && (
                      <div className="grid grid-cols-2 gap-2">
                        {entityData.range && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">Range</Label>
                            <p className="text-stone-300 mt-0.5">{entityData.range} ft</p>
                          </div>
                        )}
                        {entityData.mod !== undefined && entityData.mod !== 0 && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">Modifier</Label>
                            <p className="text-stone-300 mt-0.5">{entityData.mod > 0 ? `+${entityData.mod}` : entityData.mod}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {(entityData.itemWeight || entityData.weight || entityData.durability) && (
                      <div className="grid grid-cols-2 gap-2">
                        {(entityData.itemWeight || entityData.weight) && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">Weight</Label>
                            <p className="text-stone-300 mt-0.5">{entityData.itemWeight || entityData.weight} lbs</p>
                          </div>
                        )}
                        {entityData.durability && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">Durability</Label>
                            <p className="text-stone-300 mt-0.5">{entityData.durability}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {(entityData.breakChance !== undefined && entityData.breakChance > 0) && (
                      <div>
                        <Label className="text-stone-400 text-xs uppercase tracking-wide">Break Chance</Label>
                        <p className="text-red-400 mt-0.5">{entityData.breakChance}%</p>
                      </div>
                    )}
                    {entityData.value !== undefined && entityData.value > 0 && (
                      <div>
                        <Label className="text-stone-400 text-xs uppercase tracking-wide">Value</Label>
                        <p className="text-amber-300 mt-0.5">{entityData.value} {entityData.currency || 'gold'}</p>
                      </div>
                    )}
                  </>
                )}

                {selectedEntityType?.toLowerCase() === "trait" && (
                  <>
                    {entityData.image && (
                      <div className="flex justify-center">
                        <img 
                          src={entityData.image} 
                          alt={entityData.name}
                          className="w-12 h-12 rounded object-cover border-2 border-stone-700"
                        />
                      </div>
                    )}
                    {entityData.usesPerLongRest !== undefined && entityData.usesPerLongRest > 0 && (
                      <div>
                        <Label className="text-stone-400 text-xs uppercase tracking-wide">Uses per Long Rest</Label>
                        <p className="text-amber-400 mt-0.5">{entityData.usesPerLongRest}</p>
                      </div>
                    )}
                    {entityData.diceNotation && (
                      <div>
                        <Label className="text-stone-400 text-xs uppercase tracking-wide">Dice</Label>
                        <p className="text-amber-400 mt-0.5">{entityData.diceNotation}</p>
                      </div>
                    )}
                  </>
                )}

                {selectedEntityType?.toLowerCase() === "skill" && (
                  <>
                    {entityData.image && (
                      <div className="flex justify-center">
                        <img 
                          src={entityData.image} 
                          alt={entityData.name}
                          className="w-12 h-12 rounded object-cover border-2 border-stone-700"
                        />
                      </div>
                    )}
                    {entityData.attribute && (
                      <div>
                        <Label className="text-stone-400 text-xs uppercase tracking-wide">Attribute</Label>
                        <p className="text-stone-300 mt-0.5 capitalize">{entityData.attribute}</p>
                      </div>
                    )}
                  </>
                )}

                {selectedEntityType?.toLowerCase() === "species" && (
                  <>
                    {entityData.image && (
                      <div className="flex justify-center">
                        <img 
                          src={entityData.image} 
                          alt={entityData.name}
                          className="w-16 h-16 rounded object-cover border-2 border-stone-700"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {entityData.size && (
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Size</Label>
                          <p className="text-stone-300 mt-0.5 capitalize">{entityData.size}</p>
                        </div>
                      )}
                      {entityData.speed && (
                        <div>
                          <Label className="text-stone-400 text-xs uppercase tracking-wide">Speed</Label>
                          <p className="text-stone-300 mt-0.5">{entityData.speed} ft</p>
                        </div>
                      )}
                    </div>
                    {(entityData.hpPerLevel || entityData.energyPerLevel) && (
                      <div className="grid grid-cols-2 gap-2">
                        {entityData.hpPerLevel && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">HP/Level</Label>
                            <p className="text-red-400 mt-0.5">{entityData.hpPerLevel}</p>
                          </div>
                        )}
                        {entityData.energyPerLevel && (
                          <div>
                            <Label className="text-stone-400 text-xs uppercase tracking-wide">Energy/Level</Label>
                            <p className="text-blue-400 mt-0.5">{entityData.energyPerLevel}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-stone-500 text-center py-4 text-xs">No data available</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setEntityDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notePreviewDialogOpen} onOpenChange={setNotePreviewDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-500" />
              {previewNote?.title || "Note"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            {previewNote?.content ? (
              <div className="text-stone-300 whitespace-pre-wrap leading-relaxed text-sm">
                {formatEntityReferences(previewNote.content)}
              </div>
            ) : (
              <p className="text-stone-500 text-center py-4 italic text-sm">This note is empty</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (previewNote) {
                  setNotePreviewDialogOpen(false);
                  setSelectedNoteId(previewNote.id);
                }
              }}
              data-testid="button-edit-note-preview"
            >
              <Edit className="h-3 w-3 mr-1" />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setNotePreviewDialogOpen(false)}
              data-testid="button-close-note-preview"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
