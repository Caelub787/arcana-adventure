import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Note, NoteFolder, NoteShare, UserProfile, SystemSpell, SystemSkill, SystemTrait, SystemSpecies, GoogleDocInfo, gameWs, noteWs, NotePresence } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { format } from "date-fns";
import { useEntitiesByCampaign, ENTITY_TYPE_CONFIG, type Entity } from "@/lib/worldbuilding-api";
import { WikiArticleEditor } from "@/components/worldbuilding/WikiArticleEditor";

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
import {
  Plus,
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  Pin,
  Archive,
  Trash2,
  Share2,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Users,
  Loader2,
  Search,
  X,
  Edit,
  Eye,
  EyeOff,
  Link2,
  Grid3X3,
  Network,
  List,
  CloudUpload,
  CloudDownload,
  ExternalLink,
  Home,
  ArrowUp,
  ArrowLeft,
  BookOpen,
  Globe,
} from "lucide-react";
import { ReferencePicker, NoteOnlyPicker } from "@/components/notes/ReferencePicker";
import { CanvasEditor, CanvasData } from "@/components/notes/CanvasEditor";
import { NotesGraph } from "@/components/notes/NotesGraph";
import { NoteTabs, useNoteTabs, OpenNote } from "@/components/notes/NoteTabs";
import { FormattingToolbar, useFormattingShortcuts, renderFormattedText, getFontClass, type NoteFont } from "@/components/notes/FormattingToolbar";
import type { SearchableEntity } from "@/lib/api";

interface CampaignNotesPanelProps {
  campaignId: string;
  onClose: () => void;
  isOpen: boolean;
  campaignMembers?: Array<{ id: string; userId: string; username: string }>;
  onViewCharacter?: (character: any) => void;
  initialNoteId?: string | null;
  hideCloseButton?: boolean;
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
      return "text-purple-500";
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

function RootDropZone({ onDropToRoot }: { onDropToRoot: (folderId: string) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId) {
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
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
      <span>{isDragOver ? "Drop to move to root" : "Drag folder here for root"}</span>
    </div>
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
  onAddSubfolder: (parentId: string) => void;
  onDeleteFolder: (folder: NoteFolder) => void;
  onMoveFolder: (folderId: string, newParentId: string | null) => void;
  onReorderFolder: (folderId: string, targetIndex: number, parentId: string | null) => void;
  onCreateNote: (folderId: string) => void;
  onCreateCanvas: (folderId: string) => void;
  onShareNote: (noteId: string) => void;
  onDeleteNote: (note: Note) => void;
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
  onAddSubfolder,
  onDeleteFolder,
  onMoveFolder,
  onReorderFolder,
  onCreateNote,
  onCreateCanvas,
  onShareNote,
  onDeleteNote,
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
        <ContextMenuTrigger asChild>
          <div
            className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
              isDragOver && dropPosition === "into"
                ? "bg-amber-700/50 ring-2 ring-amber-500"
                : isSelected
                ? "bg-amber-900/30 text-amber-400"
                : isOtherCampaign
                ? "hover:bg-stone-800/50 text-stone-500 opacity-60"
                : "hover:bg-stone-800/50 text-stone-300"
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
        <span className="flex-1 truncate">{folder.name}</span>
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
            <EyeOff className="h-2.5 w-2.5 text-purple-400" />
          </span>
        )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-stone-900 border-stone-700">
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
              onAddSubfolder={onAddSubfolder}
              onDeleteFolder={onDeleteFolder}
              onMoveFolder={onMoveFolder}
              onReorderFolder={onReorderFolder}
              onCreateNote={onCreateNote}
              onCreateCanvas={onCreateCanvas}
              onShareNote={onShareNote}
              onDeleteNote={onDeleteNote}
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
            />
          ))}
          {folderNotes.map((note) => (
            <ContextMenu key={note.id}>
              <ContextMenuTrigger asChild>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onNoteSelect(note.id);
                  }}
                  className={`flex items-center gap-1 py-0.5 px-1.5 rounded cursor-pointer transition-colors text-xs ${
                    selectedNoteId === note.id
                      ? "bg-amber-900/30 text-amber-400"
                      : "hover:bg-stone-800/50 text-stone-400"
                  }`}
                  style={{ paddingLeft: `${(level + 1) * 8 + 4}px` }}
                  data-testid={`panel-folder-note-item-${note.id}`}
                >
                  {note.type === "canvas" ? (
                    <Grid3X3 className="h-2.5 w-2.5 flex-shrink-0" />
                  ) : (
                    <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate">{note.title || "Untitled"}</span>
                  {note.isPinned && <Pin className="h-2 w-2 text-amber-500" />}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="bg-stone-900 border-stone-700">
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
          ))}
        </>
      )}
    </div>
  );
}

export function CampaignNotesPanel({
  campaignId,
  onClose,
  isOpen,
  campaignMembers = [],
  onViewCharacter,
  initialNoteId,
  hideCloseButton = false,
}: CampaignNotesPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showSharedNotes, setShowSharedNotes] = useState(false);
  const [showHomeView, setShowHomeView] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
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
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState<string | null>(null);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);

  const [showHiddenFolders, setShowHiddenFolders] = useState(false);
  const [folderCampaignAssignment, setFolderCampaignAssignment] = useState<string | null>(null);

  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);
  const [shareSearchUsername, setShareSearchUsername] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "edit">("view");
  const [shareTab, setShareTab] = useState<"friends" | "players">("friends");

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
  const debouncedTitle = useDebouncedValue(noteTitle, 1000);
  const debouncedContent = useDebouncedValue(noteContent, 1000);
  const debouncedCanvasData = useDebouncedValue(canvasData, 1000);

  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [notePickerInitialSearch, setNotePickerInitialSearch] = useState("");
  const [notePickerTriggeredByTyping, setNotePickerTriggeredByTyping] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleFormattingKeyDown = useFormattingShortcuts(textareaRef as React.RefObject<HTMLTextAreaElement>, noteContent, setNoteContent);

  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<any>(null);
  const [entityLoading, setEntityLoading] = useState(false);

  const [notePreviewDialogOpen, setNotePreviewDialogOpen] = useState(false);
  const [previewNote, setPreviewNote] = useState<Note | null>(null);

  const [showWorldSection, setShowWorldSection] = useState(false);
  const [worldEntityFilter, setWorldEntityFilter] = useState<string>("");
  const [selectedWorldEntityId, setSelectedWorldEntityId] = useState<string | null>(null);

  // Google Drive sync state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDocInfo[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState<string | null>(null);
  const [exportingNoteId, setExportingNoteId] = useState<string | null>(null);

  // Note tabs state
  const {
    openNotes,
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

  const { data: folders = [], isLoading: foldersLoading } = useQuery<NoteFolder[]>({
    queryKey: ["/api/notes/folders", campaignId, showHiddenFolders],
    queryFn: () => api.getNoteFolders(campaignId, showHiddenFolders),
    enabled: !!user && isOpen,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", selectedFolderId, showSharedNotes, campaignId, showHiddenFolders],
    queryFn: () => {
      if (showSharedNotes) return api.getSharedNotes();
      const isHiddenFolder = showHiddenFolders && selectedFolderId && folders.length > 0 &&
        folders.find(f => f.id === selectedFolderId)?.campaignId !== campaignId;
      return api.getNotes(selectedFolderId ?? undefined, isHiddenFolder ? undefined : campaignId);
    },
    enabled: !!user && isOpen,
  });

  const { data: allNotesForTree = [] } = useQuery<Note[]>({
    queryKey: ["/api/notes/all", campaignId, showHiddenFolders],
    queryFn: () => showHiddenFolders ? api.getNotes(undefined) : api.getNotes(undefined, campaignId),
    enabled: !!user && isOpen,
  });

  const { data: campaignCharacters = [] } = useQuery({
    queryKey: ["/api/campaigns", campaignId, "characters"],
    queryFn: () => api.getCampaignCharacters(campaignId),
    enabled: !!user && !!campaignId && isOpen,
  });

  const { data: worldEntities = [] } = useEntitiesByCampaign(isOpen ? campaignId : undefined);

  const { data: campaignData } = useQuery({
    queryKey: ["/api/campaigns", campaignId, "detail"],
    queryFn: () => api.getCampaign(campaignId),
    enabled: !!campaignId && isOpen,
  });
  const isGMForWorld = campaignData?.gmUserId === user?.id;
  const selectedWorldEntity = worldEntities.find((e: Entity) => e.id === selectedWorldEntityId) || null;

  const { data: currentNote, isLoading: noteLoading } = useQuery<Note>({
    queryKey: ["/api/notes", selectedNoteId],
    queryFn: () => api.getNote(selectedNoteId!),
    enabled: !!selectedNoteId && !!user,
  });

  const { data: noteShares = [] } = useQuery<NoteShare[]>({
    queryKey: ["/api/notes", shareNoteId, "shares"],
    queryFn: () => api.getNoteShares(shareNoteId!),
    enabled: !!shareNoteId,
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
        setNoteTitle(currentNote.title);
        setNoteContent(currentNote.content || "");
        lastLoadedNoteIdRef.current = currentNote.id;
        lastSavedContentRef.current = null;
        lastSavedCanvasRef.current = null;
        
        if (currentNote.type === "canvas" && currentNote.canvasData) {
          setCanvasData(currentNote.canvasData as CanvasData);
          setNoteMode("edit");
        } else {
          setCanvasData({ nodes: [], connections: [] });
          setNoteMode("read");
        }
        
        // Open in tabs when selecting a note
        openNoteTab(currentNote.id, currentNote.title, currentNote.type as "markdown" | "canvas" | undefined);
      }
    }
  }, [currentNote, openNoteTab]);

  // Sync tab title when note title changes
  useEffect(() => {
    if (selectedNoteId && noteTitle) {
      updateTabTitle(selectedNoteId, noteTitle);
    }
  }, [selectedNoteId, noteTitle, updateTabTitle]);

  // Subscribe to campaign WebSocket for real-time note updates
  useEffect(() => {
    if (!campaignId || !isOpen) return;

    const handleMessage = (data: any) => {
      // Handle note creation/deletion events for this campaign
      if (data.campaignId !== campaignId) return;

      if (data.type === 'note_created' || data.type === 'note_deleted' || data.type === 'note_changed') {
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes/all"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
        
        if (data.type === 'note_deleted' && data.noteId === selectedNoteId) {
          setSelectedNoteId(null);
          setShowHomeView(true);
        }
      }
      if (data.type === 'note_folder_changed') {
        queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
      }
    };

    const unsubscribe = gameWs.onMessage(handleMessage);
    return () => {
      unsubscribe();
    };
  }, [campaignId, isOpen, queryClient, selectedNoteId]);

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

        case 'note_update':
          // Ignore our own updates and updates that arrived shortly after our local change
          if (data.userId === user?.id) return;
          if (Date.now() - lastLocalUpdateRef.current < 500) return;
          
          // Apply remote changes
          isReceivingRemoteUpdateRef.current = true;
          if (data.title !== undefined) {
            setNoteTitle(data.title);
          }
          if (data.content !== undefined) {
            setNoteContent(data.content);
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
      lastSentContentRef.current = { title: debouncedTitle, content: debouncedContent };
      return;
    }
    
    // Skip if content hasn't actually changed (prevents ping-pong)
    const lastSent = lastSentContentRef.current;
    if (lastSent && lastSent.title === debouncedTitle && lastSent.content === debouncedContent) {
      return;
    }
    
    // Track that we made a local update
    lastLocalUpdateRef.current = Date.now();
    lastSentContentRef.current = { title: debouncedTitle, content: debouncedContent };
    
    // Send update to other collaborators
    noteWs.sendNoteUpdate(selectedNoteId, {
      title: debouncedTitle,
      content: debouncedContent,
    });
  }, [debouncedTitle, debouncedContent, selectedNoteId, isOpen]);

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
    if (tabNoteId !== selectedNoteId) {
      setSelectedNoteId(tabNoteId);
    }
  };

  // Handle tab close
  const handleTabClose = (tabNoteId: string) => {
    const remainingNotes = openNotes.filter(n => n.noteId !== tabNoteId);
    closeTab(tabNoteId);
    
    if (tabNoteId === selectedNoteId) {
      if (remainingNotes.length > 0) {
        const currentIdx = openNotes.findIndex(n => n.noteId === tabNoteId);
        const newActiveNote = currentIdx > 0 
          ? openNotes[currentIdx - 1] 
          : remainingNotes[0];
        if (newActiveNote) {
          setSelectedNoteId(newActiveNote.noteId);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
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

  const createNoteMutation = useMutation({
    mutationFn: (data: Partial<Note>) => api.createNote(data),
    onSuccess: (newNote) => {
      queryClient.refetchQueries({ queryKey: ["/api/notes"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
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

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/notes"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/all"] });
      queryClient.refetchQueries({ queryKey: ["/api/notes/folders"] });
      setDeleteNoteDialogOpen(false);
      setNoteToDelete(null);
      if (selectedNoteId) {
        setSelectedNoteId(null);
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
    }) => api.shareNote(noteId, friendId, permission),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/notes", shareNoteId, "shares"],
      });
      setShareSearchUsername("");
      toast({ title: "Note shared" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteShareMutation = useMutation({
    mutationFn: ({ noteId, shareId }: { noteId: string; shareId: string }) =>
      api.deleteNoteShare(noteId, shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/notes", shareNoteId, "shares"],
      });
      toast({ title: "Share removed" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Google Drive export mutation
  const exportToDriveMutation = useMutation({
    mutationFn: (noteId: string) => api.exportNoteToDrive(noteId),
    onSuccess: (data) => {
      setExportingNoteId(null);
      toast({ 
        title: "Exported to Google Docs",
        description: "Note has been saved to your Google Drive.",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(data.webViewLink, '_blank')}
          >
            <ExternalLink className="h-3 w-3 mr-1" /> Open
          </Button>
        ),
      });
    },
    onError: (err: any) => {
      setExportingNoteId(null);
      toast({
        title: "Export failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Google Drive import mutation
  const importFromDriveMutation = useMutation({
    mutationFn: ({ docId, folderId, campaignId }: { docId: string; folderId?: string; campaignId?: string }) =>
      api.importFromDrive(docId, folderId, campaignId),
    onSuccess: (note) => {
      setImportDialogOpen(false);
      setSelectedDriveFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
      toast({ title: "Note imported from Google Docs" });
      setSelectedNoteId(note.id);
    },
    onError: (err: any) =>
      toast({
        title: "Import failed",
        description: err.message,
        variant: "destructive",
      }),
  });

  // Handler to open import dialog and fetch drive files
  const handleOpenImportDialog = async () => {
    setImportDialogOpen(true);
    setDriveFilesLoading(true);
    setSelectedDriveFile(null);
    try {
      const files = await api.getDriveFiles();
      setDriveFiles(files);
    } catch (err: any) {
      toast({
        title: "Failed to load Google Docs",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDriveFilesLoading(false);
    }
  };

  // Handler to export current note
  const handleExportToDrive = (id: string) => {
    setExportingNoteId(id);
    exportToDriveMutation.mutate(id);
  };

  // Handler to import selected file
  const handleImportFromDrive = () => {
    if (!selectedDriveFile) return;
    importFromDriveMutation.mutate({
      docId: selectedDriveFile,
      folderId: selectedFolderId ?? undefined,
      campaignId: campaignId,
    });
  };

  useEffect(() => {
    if (!selectedNoteId || !currentNote) return;

    const lastSaved = lastSavedContentRef.current;
    if (!lastSaved && debouncedTitle === currentNote.title && debouncedContent === currentNote.content) {
      lastSavedContentRef.current = { title: debouncedTitle, content: debouncedContent };
      return;
    }
    if (lastSaved && lastSaved.title === debouncedTitle && lastSaved.content === debouncedContent) {
      return;
    }

    lastSavedContentRef.current = { title: debouncedTitle, content: debouncedContent };
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

  const resetFolderForm = () => {
    setFolderName("");
    setFolderColor(null);
    setFolderParentId(null);
    setFolderCampaignAssignment(campaignId);
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
    setShareNoteId(noteId);
    setShareDialogOpen(true);
  };

  const handleAddShare = () => {
    if (!shareNoteId || !shareSearchUsername.trim()) return;
    const friend = friends.find(
      (f) => f.username.toLowerCase() === shareSearchUsername.toLowerCase()
    );
    if (!friend) {
      toast({
        title: "Friend not found",
        description: "Enter a valid friend's username",
        variant: "destructive",
      });
      return;
    }
    shareNoteMutation.mutate({
      noteId: shareNoteId,
      friendId: friend.id,
      permission: sharePermission,
    });
  };

  const handleShareWithMember = (member: { id: string; userId: string; username: string }) => {
    if (!shareNoteId) return;
    shareNoteMutation.mutate({
      noteId: shareNoteId,
      friendId: member.userId,
      permission: sharePermission,
    });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const pos = e.target.selectionStart;
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
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes/all"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
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

  const handleWorldEntityClick = (entityId: string) => {
    setSelectedWorldEntityId(entityId);
    setSelectedNoteId(null);
    setShowHomeView(false);
    setShowWorldSection(true);
  };

  const handleWikiLinkClick = (entityName: string) => {
    const match = worldEntities.find(
      (e: Entity) => e.displayName.toLowerCase() === entityName.toLowerCase() && !e.isDeleted
    );
    if (match) {
      handleWorldEntityClick(match.id);
    } else {
      toast({
        title: "Entity not found",
        description: `No worldbuilding entity named "${entityName}" was found.`,
      });
    }
  };

  const handleEntityClick = async (entityType: string, entityId: string) => {
    const cleanType = entityType.replace(/^\[+/, '').toLowerCase().trim();

    if (ENTITY_TYPE_CONFIG[cleanType]) {
      const wEntity = worldEntities.find((e: Entity) => e.id === entityId);
      if (wEntity) {
        handleWorldEntityClick(entityId);
        return;
      }
    }
    
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

  const formatInlineReferences = (content: string, keyPrefix: string): React.ReactNode[] => {
    const combinedRegex = /\[\[([^:\]]+):([^\|]+)\|([^\]]+)\]\]|\[\[([^\]:\|]+)\]\]|\/\/([^\/]+)\/\/|\(\/([^\/]+)\/\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const plainText = content.slice(lastIndex, match.index);
        parts.push(...renderFormattedText(plainText, `${keyPrefix}-plain-${lastIndex}`));
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
        const wikiName = match[4];
        parts.push(
          <span
            key={`${keyPrefix}-wiki-${match.index}`}
            className="text-amber-400 cursor-pointer hover:text-amber-300 hover:underline transition-colors font-medium bg-amber-900/20 px-0.5 rounded"
            onClick={() => handleWikiLinkClick(wikiName)}
            data-testid={`panel-wiki-link-${wikiName}`}
          >
            {wikiName}
          </span>
        );
      } else if (match[5]) {
        const noteName = match[5];
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
      } else if (match[6]) {
        const noteName = match[6];
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

    return parts.length > 0 ? parts : renderFormattedText(content, keyPrefix);
  };

  const formatEntityReferences = (content: string): React.ReactNode => {
    const lines = content.split('\n');
    
    return (
      <div className="space-y-1">
        {lines.map((line, lineIndex) => {
          const bulletMatch = line.match(/^(\s*)(-|\*)\s+(.*)$/);
          if (bulletMatch) {
            const [, indent, , text] = bulletMatch;
            const indentLevel = Math.floor(indent.length / 2);
            return (
              <div 
                key={lineIndex} 
                className="flex items-start gap-2"
                style={{ paddingLeft: `${indentLevel * 16}px` }}
              >
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{formatInlineReferences(text, `line-${lineIndex}`)}</span>
              </div>
            );
          }
          
          const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
          if (numberedMatch) {
            const [, indent, num, text] = numberedMatch;
            const indentLevel = Math.floor(indent.length / 2);
            return (
              <div 
                key={lineIndex} 
                className="flex items-start gap-2"
                style={{ paddingLeft: `${indentLevel * 16}px` }}
              >
                <span className="text-amber-500 font-medium min-w-[1.5rem]">{num}.</span>
                <span>{formatInlineReferences(text, `line-${lineIndex}`)}</span>
              </div>
            );
          }
          
          if (line.trim() === '') {
            return <div key={lineIndex} className="h-4" />;
          }
          
          return (
            <div key={lineIndex}>
              {formatInlineReferences(line, `line-${lineIndex}`)}
            </div>
          );
        })}
      </div>
    );
  };

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

  if (!isOpen) return null;

  const renderSidebar = () => (
    <div className="flex flex-col h-full border-r border-stone-700 bg-stone-950/50 overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b border-stone-700">
        <span className="text-xs font-medium text-stone-300">Folders</span>
        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openFolderDialog()}>
          <Plus className="h-3 w-3" />
        </Button>
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
      {sidebarSearchQuery ? (
        <ScrollArea className="flex-1 p-1">
          {allNotesForTree
            .filter((n) => n.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
            .map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  setShowHomeView(false);
                  setSelectedNoteId(note.id);
                  setSidebarSearchQuery("");
                }}
                className="flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs hover:bg-stone-800/50 text-stone-300"
                data-testid={`panel-sidebar-search-result-${note.id}`}
              >
                <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="flex-1 truncate">{note.title || "Untitled"}</span>
              </div>
            ))}
          {allNotesForTree.filter((n) => n.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase())).length === 0 && (
            <p className="text-xs text-stone-500 text-center py-2">No notes found</p>
          )}
        </ScrollArea>
      ) : (
      <ScrollArea className="flex-1 p-1">
        <div
          className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
            showHomeView && !selectedFolderId && !showSharedNotes
              ? "bg-amber-900/30 text-amber-400"
              : "hover:bg-stone-800/50 text-stone-300"
          }`}
          onClick={() => {
            setSelectedFolderId(null);
            setShowSharedNotes(false);
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
        {folderSortMode === "custom" && (
          <RootDropZone 
            onDropToRoot={(folderId) => {
              handleReorderFolder(folderId, 0, null);
            }}
          />
        )}
        <div className="space-y-0.5 group">
          {foldersLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-3 w-3 animate-spin text-stone-500" />
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
                  setShowSharedNotes(false);
                }}
                onNoteSelect={(id) => {
                  setShowHomeView(false);
                  setSelectedNoteId(id);
                }}
                onContextMenu={(f) => openFolderDialog(f)}
                onAddSubfolder={(parentId) => {
                  setEditingFolder(null);
                  setFolderName("");
                  setFolderColor(null);
                  setFolderParentId(parentId);
                  setFolderCampaignAssignment(campaignId);
                  setFolderDialogOpen(true);
                }}
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
                onShareNote={(id) => {
                  openShareDialog(id);
                }}
                onDeleteNote={(note) => {
                  setNoteToDelete(note);
                  setDeleteNoteDialogOpen(true);
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
              />
            ))
          )}
        </div>
        <Separator className="my-1 bg-stone-800" />
        <div
          className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
            showSharedNotes
              ? "bg-amber-900/30 text-amber-400"
              : "hover:bg-stone-800/50 text-stone-300"
          }`}
          onClick={() => {
            setShowSharedNotes(true);
            setSelectedFolderId(null);
          }}
          data-testid="panel-folder-shared"
        >
          <Users className="h-3 w-3" />
          <span>Shared</span>
        </div>
        <Separator className="my-1 bg-stone-800" />
        <div
          className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
            showWorldSection
              ? "bg-emerald-900/30 text-emerald-400"
              : "hover:bg-stone-800/50 text-stone-300"
          }`}
          onClick={() => {
            setShowWorldSection(!showWorldSection);
            if (!showWorldSection) {
              setWorldEntityFilter("");
              setSelectedWorldEntityId(null);
            }
          }}
          data-testid="panel-folder-world"
        >
          <Globe className="h-3 w-3" />
          <span>World</span>
          {worldEntities.length > 0 && (
            <span className="ml-auto text-[10px] text-stone-500">{worldEntities.filter((e: Entity) => !e.isDeleted).length}</span>
          )}
        </div>
        {showWorldSection && (
          <div className="ml-2 mt-1 space-y-0.5">
            <Input
              placeholder="Filter entities..."
              value={worldEntityFilter}
              onChange={(e) => setWorldEntityFilter(e.target.value)}
              className="h-6 text-xs bg-stone-900/50 border-stone-700 mb-1"
              data-testid="panel-world-filter-input"
            />
            {worldEntities
              .filter((e: Entity) => !e.isDeleted)
              .filter((e: Entity) =>
                !worldEntityFilter || e.displayName.toLowerCase().includes(worldEntityFilter.toLowerCase()) ||
                e.entityType.toLowerCase().includes(worldEntityFilter.toLowerCase())
              )
              .sort((a: Entity, b: Entity) => a.displayName.localeCompare(b.displayName))
              .map((entity: Entity) => {
                const cfg = ENTITY_TYPE_CONFIG[entity.entityType];
                return (
                  <div
                    key={entity.id}
                    className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer transition-colors text-xs ${
                      selectedWorldEntityId === entity.id
                        ? "bg-emerald-900/30 text-emerald-300"
                        : "hover:bg-stone-800/50 text-stone-400"
                    }`}
                    onClick={() => handleWorldEntityClick(entity.id)}
                    data-testid={`panel-world-entity-${entity.id}`}
                  >
                    <span className="text-[10px]">{cfg?.icon || "📄"}</span>
                    <span className="truncate">{entity.displayName}</span>
                    <span className="ml-auto text-[9px] text-stone-600 capitalize">{entity.entityType}</span>
                  </div>
                );
              })}
            {worldEntities.filter((e: Entity) => !e.isDeleted).length === 0 && (
              <div className="text-[10px] text-stone-600 px-1 py-1">No worldbuilding entities yet</div>
            )}
          </div>
        )}
        <Separator className="my-1 bg-stone-800" />
        <div
          className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
            showHiddenFolders
              ? "bg-purple-900/30 text-purple-400"
              : "hover:bg-stone-800/50 text-stone-400"
          }`}
          onClick={() => setShowHiddenFolders(!showHiddenFolders)}
          data-testid="panel-toggle-hidden-folders"
        >
          {showHiddenFolders ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          <span className="truncate">{showHiddenFolders ? "Hide Others" : "Show Hidden"}</span>
        </div>
      </ScrollArea>
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
            className="bg-indigo-700 hover:bg-indigo-600"
            data-testid="panel-button-home-create-canvas"
          >
            <Grid3X3 className="h-3 w-3 mr-1" />
            Canvas
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
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
              return (
              <ContextMenu key={note.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={`group p-2 rounded cursor-pointer transition-colors ${
                      selectedNoteId === note.id
                        ? "bg-amber-900/40 border border-amber-700"
                        : "hover:bg-stone-800/50 border border-transparent"
                    }`}
                    onClick={() => setSelectedNoteId(note.id)}
                    data-testid={`panel-card-note-${note.id}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        {note.type === "canvas" ? (
                          <Grid3X3 className="h-3 w-3 text-indigo-400 flex-shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 text-stone-500 flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium text-stone-200 truncate">
                          {note.isPinned && <Pin className="inline h-2.5 w-2.5 mr-0.5 text-amber-500" />}
                          {note.title}
                        </span>
                        {!isOwner && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-cyan-400 border-cyan-600 flex-shrink-0">
                            Shared
                          </Badge>
                        )}
                      </div>
                      {isMobile && isOwner && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); openShareDialog(note.id); }}
                            className="p-0.5 hover:bg-stone-700 rounded text-stone-500 hover:text-stone-300"
                            data-testid={`panel-card-note-share-mobile-${note.id}`}
                          >
                            <Share2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setNoteToDelete(note); setDeleteNoteDialogOpen(true); }}
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
                <ContextMenuContent className="bg-stone-900 border-stone-700">
                  {isOwner && (
                    <>
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
                        onClick={() => { setNoteToDelete(note); setDeleteNoteDialogOpen(true); }}
                        className="text-red-400 focus:text-red-400"
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        Delete
                      </ContextMenuItem>
                    </>
                  )}
                  {!isOwner && (
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
          onClick={handleOpenImportDialog}
          className="h-7 text-xs bg-blue-700 hover:bg-blue-600"
          title="Import from Google Docs"
          data-testid="panel-button-import-from-drive"
        >
          <CloudDownload className="h-3 w-3" />
        </Button>
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
          className="h-7 text-xs bg-indigo-700 hover:bg-indigo-600"
          data-testid="panel-button-create-canvas"
        >
          <Grid3X3 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );

  const renderNoteReadView = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-end p-2 border-b border-stone-700">
        <div className="flex items-center gap-1">
          {remotePresence.length > 0 && (
            <div className="flex items-center gap-0.5 mr-2" data-testid="panel-presence-indicators-read">
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
            className="h-6 w-6 p-0 text-amber-400"
            onClick={() => setNoteMode("edit")}
          >
            <Edit className="h-3 w-3" />
          </Button>
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
            className="h-6 w-6 p-0"
            onClick={() => selectedNoteId && handleExportToDrive(selectedNoteId)}
            disabled={exportingNoteId === selectedNoteId || currentNote?.type === 'canvas'}
            title={currentNote?.type === 'canvas' ? 'Canvas notes cannot be exported' : 'Export to Google Docs'}
          >
            {exportingNoteId === selectedNoteId ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CloudUpload className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-red-400"
            onClick={() => {
              if (currentNote) {
                setNoteToDelete(currentNote);
                setDeleteNoteDialogOpen(true);
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {noteLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
        </div>
      ) : (
        <ScrollArea className="flex-1 p-3">
          <h1 className="text-lg font-bold text-stone-100 mb-3" data-testid="panel-text-note-read-title">
            {currentNote?.title}
          </h1>
          <div className={`text-sm text-stone-300 whitespace-pre-wrap leading-relaxed ${getFontClass(noteFont)}`} data-testid="panel-text-note-read-content">
            {formatEntityReferences(currentNote?.content || "")}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const renderNoteEditor = () => {
    if (currentNote?.type === "canvas") {
      if (noteLoading) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
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
          />
        </div>
      );
    }
    
    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center justify-between p-2 border-b border-stone-700">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setNoteMode("read")}
          >
            <ChevronLeft className="h-3 w-3 mr-1" /> Done
          </Button>
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
              className="h-6 w-6 p-0 text-red-400"
              onClick={() => {
                if (currentNote) {
                  setNoteToDelete(currentNote);
                  setDeleteNoteDialogOpen(true);
                }
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {noteLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-2 overflow-hidden min-h-0 min-w-0">
            <Input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title"
              className="text-sm font-medium border-none bg-transparent focus-visible:ring-0 px-0 mb-1 h-7 shrink-0"
              data-testid="panel-input-note-title"
            />
            <div className="shrink-0">
              <FormattingToolbar
                textareaRef={textareaRef}
                content={noteContent}
                onContentChange={setNoteContent}
                font={noteFont}
                onFontChange={setNoteFont}
                compact={true}
              />
            </div>
            <div className="flex items-center gap-1 mb-1 shrink-0">
              <ReferencePicker
                open={referencePickerOpen}
                onOpenChange={setReferencePickerOpen}
                onSelect={handleReferenceSelectFromButton}
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
        onNoteClick={(noteId) => {
          setSelectedNoteId(noteId);
          setViewMode("list");
        }}
      />
    </div>
  );

  return (
    <div className="h-full bg-stone-900/98 border-l border-stone-700 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between p-2 border-b border-stone-700 bg-stone-900">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            {showSidebar ? <ChevronLeft className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
          </Button>
          <FileText className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-bold text-amber-500">Campaign Notes</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${viewMode === "graph" ? 'bg-amber-900/50 text-amber-400' : 'text-stone-400'}`}
            onClick={() => setViewMode(viewMode === "list" ? "graph" : "list")}
            data-testid="panel-button-toggle-view"
          >
            {viewMode === "list" ? <Network className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </Button>
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

      <div className="flex-1 flex overflow-hidden min-h-0">
        {viewMode === "graph" ? (
          renderGraphView()
        ) : (
          <div className="flex h-full min-h-0 overflow-hidden w-full">
            {showSidebar && !(selectedNoteId && noteMode === "edit" && currentNote?.type !== "canvas") && (
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
              {openNotes.length > 0 && (
                <NoteTabs
                  openNotes={openNotes}
                  activeNoteId={selectedNoteId}
                  onTabClick={handleTabClick}
                  onTabClose={handleTabClose}
                  onReorder={reorderTabs}
                  compact
                />
              )}
              <div className="flex-1 min-h-0 overflow-hidden relative isolate flex flex-col">
                {selectedNoteId ? (
                  currentNote?.type === "canvas" || noteMode === "edit" ? renderNoteEditor() : renderNoteReadView()
                ) : selectedWorldEntity ? (
                  <div className="flex-1 flex flex-col overflow-hidden" data-testid="panel-world-entity-view">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800 bg-stone-950/50">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-stone-400 hover:text-stone-200"
                        onClick={() => setSelectedWorldEntityId(null)}
                        data-testid="panel-world-entity-back"
                      >
                        <ArrowLeft className="h-3 w-3 mr-1" />
                        Back
                      </Button>
                      <Globe className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-medium text-emerald-300 truncate">{selectedWorldEntity.displayName}</span>
                      <span className="text-[10px] text-stone-500 capitalize">({selectedWorldEntity.entityType})</span>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <WikiArticleEditor
                        entity={selectedWorldEntity}
                        campaignId={campaignId}
                        isGM={isGMForWorld}
                        onEntityUpdated={() => {}}
                      />
                    </div>
                  </div>
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
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
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
            <DialogTitle className="text-sm">Share Note</DialogTitle>
          </DialogHeader>
          <Tabs value={shareTab} onValueChange={(v) => setShareTab(v as "friends" | "players")}>
            <TabsList className="w-full bg-stone-900">
              <TabsTrigger value="friends" className="flex-1 text-xs">Friends</TabsTrigger>
              <TabsTrigger value="players" className="flex-1 text-xs">Campaign Members</TabsTrigger>
            </TabsList>
            <TabsContent value="friends" className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Add Friend</Label>
                <div className="flex gap-1">
                  <Input
                    placeholder="Friend's username"
                    value={shareSearchUsername}
                    onChange={(e) => setShareSearchUsername(e.target.value)}
                    className="h-8 text-xs bg-stone-900 border-stone-700 flex-1"
                    data-testid="panel-input-share-username"
                  />
                  <Select
                    value={sharePermission}
                    onValueChange={(v) => setSharePermission(v as "view" | "edit")}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs bg-stone-900 border-stone-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-stone-900 border-stone-700">
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
                  <Button
                    size="sm"
                    className="h-8 w-8 p-0 bg-amber-700 hover:bg-amber-600"
                    onClick={handleAddShare}
                    disabled={shareNoteMutation.isPending}
                  >
                    {shareNoteMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="players" className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Share with Campaign Members</Label>
                <Select
                  value={sharePermission}
                  onValueChange={(v) => setSharePermission(v as "view" | "edit")}
                >
                  <SelectTrigger className="h-8 text-xs bg-stone-900 border-stone-700 mb-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-900 border-stone-700">
                    <SelectItem value="view">
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> View Only
                      </div>
                    </SelectItem>
                    <SelectItem value="edit">
                      <div className="flex items-center gap-1">
                        <Edit className="h-3 w-3" /> Can Edit
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {(() => {
                  const sharedUserIds = new Set(noteShares.map(s => s.sharedWithId));
                  const unsharedMembers = campaignMembers.filter(m => !sharedUserIds.has(m.userId));
                  if (unsharedMembers.length === 0) {
                    return <p className="text-xs text-stone-500">
                      {campaignMembers.length === 0 
                        ? "No other members in this campaign" 
                        : "Already shared with all campaign members"}
                    </p>;
                  }
                  return (
                    <div className="space-y-1">
                      {unsharedMembers.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between py-1.5 px-2 bg-stone-900/50 rounded text-xs"
                        >
                          <span className="text-stone-300">{member.username}</span>
                          <Button
                            size="sm"
                            className="h-6 text-xs bg-amber-700 hover:bg-amber-600"
                            onClick={() => handleShareWithMember(member)}
                            disabled={shareNoteMutation.isPending}
                          >
                            <Share2 className="h-3 w-3 mr-1" /> Share
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </TabsContent>
          </Tabs>
          <Separator className="bg-stone-800" />
          <div className="space-y-1">
            <Label className="text-xs">Current Shares</Label>
            {noteShares.length === 0 ? (
              <p className="text-xs text-stone-500">Not shared with anyone</p>
            ) : (
              <div className="space-y-1">
                {noteShares.map((share) => {
                  const friendProfile = friends.find((f) => f.id === share.sharedWithId);
                  const memberProfile = campaignMembers.find((m) => m.userId === share.sharedWithId);
                  return (
                    <div
                      key={share.id}
                      className="flex items-center justify-between py-1.5 px-2 bg-stone-900/50 rounded text-xs"
                    >
                      <span className="text-stone-300">
                        {friendProfile?.username || memberProfile?.username || share.sharedWithId}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge
                          className={`text-xs px-1 py-0 ${
                            share.permission === "edit" ? "bg-amber-700" : "bg-stone-700"
                          }`}
                        >
                          {share.permission === "edit" ? (
                            <Edit className="h-2.5 w-2.5 mr-0.5" />
                          ) : (
                            <Eye className="h-2.5 w-2.5 mr-0.5" />
                          )}
                          {share.permission}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            shareNoteId &&
                            deleteShareMutation.mutate({
                              noteId: shareNoteId,
                              shareId: share.id,
                            })
                          }
                          className="h-5 w-5 p-0 text-red-400 hover:text-red-300"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
                <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
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

      {/* Import from Google Drive Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudDownload className="h-4 w-4 text-blue-400" />
              Import from Google Docs
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            {driveFilesLoading ? (
              <div className="flex flex-col items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400 mb-2" />
                <p className="text-stone-400 text-sm">Loading your Google Docs...</p>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-stone-400">
                <FileText className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">No Google Docs found</p>
              </div>
            ) : (
              <ScrollArea className="h-[250px] pr-3">
                <div className="space-y-1.5">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => setSelectedDriveFile(file.id)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        selectedDriveFile === file.id
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-stone-700 hover:border-stone-600 hover:bg-stone-800/50"
                      }`}
                      data-testid={`panel-drive-file-${file.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-200 truncate">{file.name}</p>
                          {file.modifiedTime && (
                            <p className="text-xs text-stone-500">
                              {format(new Date(file.modifiedTime), "MMM d, yyyy")}
                            </p>
                          )}
                        </div>
                        {file.webViewLink && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(file.webViewLink, '_blank');
                            }}
                            title="Open in Google Docs"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setImportDialogOpen(false);
                setSelectedDriveFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImportFromDrive}
              disabled={!selectedDriveFile || importFromDriveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-500"
              data-testid="panel-button-confirm-import"
            >
              {importFromDriveMutation.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <CloudDownload className="h-3 w-3 mr-1" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
