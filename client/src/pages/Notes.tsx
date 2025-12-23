import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Note, NoteFolder, NoteShare, UserProfile } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  Plus,
  Folder,
  FolderOpen,
  FileText,
  Pin,
  Archive,
  Trash2,
  Share2,
  MoreVertical,
  ChevronRight,
  Menu,
  Users,
  Loader2,
  Search,
  X,
  Edit,
  Eye,
  Link2,
  Grid3X3,
  Network,
  List,
} from "lucide-react";
import { ReferencePicker, ReferenceInlineDisplay } from "@/components/notes/ReferencePicker";
import { CanvasEditor, CanvasData } from "@/components/notes/CanvasEditor";
import { NotesGraph } from "@/components/notes/NotesGraph";
import type { SearchableEntity } from "@/lib/api";

import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

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

interface FolderTreeItemProps {
  folder: NoteFolder;
  folders: NoteFolder[];
  selectedFolderId: string | null;
  onSelect: (id: string | null) => void;
  onContextMenu: (folder: NoteFolder) => void;
  level?: number;
}

function FolderTreeItem({
  folder,
  folders,
  selectedFolderId,
  onSelect,
  onContextMenu,
  level = 0,
}: FolderTreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const children = folders.filter((f) => f.parentId === folder.id);
  const isSelected = selectedFolderId === folder.id;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer transition-colors ${
          isSelected
            ? "bg-amber-900/30 text-amber-400"
            : "hover:bg-stone-800/50 text-stone-300"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(folder.id)}
        data-testid={`folder-item-${folder.id}`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-stone-700 rounded"
            data-testid={`folder-expand-${folder.id}`}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        {expanded && hasChildren ? (
          <FolderOpen className={`h-4 w-4 ${getFolderColorClass(folder.color)}`} />
        ) : (
          <Folder className={`h-4 w-4 ${getFolderColorClass(folder.color)}`} />
        )}
        <span className="flex-1 truncate text-sm">{folder.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1 hover:bg-stone-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid={`folder-menu-${folder.id}`}
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-stone-900 border-stone-700"
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(folder);
              }}
              data-testid={`folder-edit-${folder.id}`}
            >
              <Edit className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded &&
        children.map((child) => (
          <FolderTreeItem
            key={child.id}
            folder={child}
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            level={level + 1}
          />
        ))}
    </div>
  );
}

export default function Notes() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showSharedNotes, setShowSharedNotes] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [noteMode, setNoteMode] = useState<"read" | "edit">("read");

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState<string | null>(null);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);

  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);
  const [shareSearchUsername, setShareSearchUsername] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "edit">("view");

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [canvasData, setCanvasData] = useState<CanvasData>({ nodes: [], connections: [] });
  const debouncedTitle = useDebouncedValue(noteTitle, 1000);
  const debouncedContent = useDebouncedValue(noteContent, 1000);
  const debouncedCanvasData = useDebouncedValue(canvasData, 1000);

  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const noteId = params.id;
  const isEditing = !!noteId;

  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const campaign = urlParams.get('campaign');
    setCampaignId(campaign);
  }, []);

  const { data: folders = [], isLoading: foldersLoading } = useQuery<NoteFolder[]>({
    queryKey: ["/api/notes/folders", campaignId],
    queryFn: () => api.getNoteFolders(campaignId ?? undefined),
    enabled: !!user,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", selectedFolderId, showSharedNotes, campaignId],
    queryFn: () => {
      if (showSharedNotes) return api.getSharedNotes();
      return api.getNotes(selectedFolderId ?? undefined, campaignId ?? undefined);
    },
    enabled: !!user,
  });

  const { data: currentNote, isLoading: noteLoading } = useQuery<Note>({
    queryKey: ["/api/notes", noteId],
    queryFn: () => api.getNote(noteId!),
    enabled: !!noteId && !!user,
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

  // Track which note ID we last loaded to avoid resetting mode on data refresh
  const lastLoadedNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentNote) {
      // Only reset mode when loading a NEW note, not when the same note updates
      const isNewNote = lastLoadedNoteIdRef.current !== currentNote.id;
      
      if (isNewNote) {
        setNoteTitle(currentNote.title);
        setNoteContent(currentNote.content || "");
        lastLoadedNoteIdRef.current = currentNote.id;
        
        if (currentNote.type === "canvas" && currentNote.canvasData) {
          setCanvasData(currentNote.canvasData as CanvasData);
          setNoteMode("edit");
        } else {
          setCanvasData({ nodes: [], connections: [] });
          setNoteMode("read");
        }
      }
    }
  }, [currentNote]);

  const createFolderMutation = useMutation({
    mutationFn: (data: Partial<NoteFolder>) => api.createNoteFolder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
      setFolderDialogOpen(false);
      resetFolderForm();
      toast({ title: "Folder created" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
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
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.deleteNoteFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setDeleteFolderDialogOpen(false);
      setFolderToDelete(null);
      if (selectedFolderId === folderToDelete?.id) {
        setSelectedFolderId(null);
      }
      toast({ title: "Folder deleted" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const createNoteMutation = useMutation({
    mutationFn: (data: Partial<Note>) => api.createNote(data),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setLocation(`/notes/${newNote.id}`);
      toast({ title: "Note created" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Note> }) =>
      api.updateNote(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", noteId] });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setDeleteNoteDialogOpen(false);
      setNoteToDelete(null);
      if (noteId) {
        setLocation("/notes");
      }
      toast({ title: "Note deleted" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
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
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const updateShareMutation = useMutation({
    mutationFn: ({
      noteId,
      shareId,
      permission,
    }: {
      noteId: string;
      shareId: string;
      permission: string;
    }) => api.updateNoteShare(noteId, shareId, permission),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/notes", shareNoteId, "shares"],
      });
      toast({ title: "Permission updated" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
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
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  useEffect(() => {
    if (noteId && currentNote && (debouncedTitle !== currentNote.title || debouncedContent !== currentNote.content)) {
      updateNoteMutation.mutate({
        id: noteId,
        data: { title: debouncedTitle, content: debouncedContent },
      });
    }
  }, [debouncedTitle, debouncedContent]);

  useEffect(() => {
    if (noteId && currentNote?.type === "canvas" && !noteLoading) {
      updateNoteMutation.mutate({
        id: noteId,
        data: { canvasData: debouncedCanvasData },
      });
    }
  }, [debouncedCanvasData]);

  const resetFolderForm = () => {
    setFolderName("");
    setFolderColor(null);
    setFolderParentId(null);
  };

  const openFolderDialog = (folder?: NoteFolder) => {
    if (folder) {
      setEditingFolder(folder);
      setFolderName(folder.name);
      setFolderColor(folder.color ?? null);
      setFolderParentId(folder.parentId ?? null);
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
        },
      });
    } else {
      createFolderMutation.mutate({
        name: folderName,
        color: folderColor,
        parentId: folderParentId,
        campaignId: campaignId ?? undefined,
      });
    }
  };

  const handleCreateNote = () => {
    createNoteMutation.mutate({
      title: "Untitled Note",
      content: "",
      folderId: selectedFolderId,
      type: "markdown",
      campaignId: campaignId ?? undefined,
    });
  };

  const handleCreateCanvas = () => {
    createNoteMutation.mutate({
      title: "Untitled Canvas",
      content: "",
      type: "canvas",
      canvasData: { nodes: [], connections: [] },
      folderId: selectedFolderId ?? undefined,
      campaignId: campaignId ?? undefined,
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

    if (noteId) {
      api.createNoteReference(noteId, {
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

    if (noteId) {
      api.createNoteReference(noteId, {
        entityType: entity.type,
        entityId: entity.id,
        label: entity.name,
      }).catch((err) => {
        console.error("Failed to save reference:", err);
      });
    }
  };

  const rootFolders = folders.filter((f) => !f.parentId);

  const formatEntityReferences = (content: string): React.ReactNode[] => {
    const regex = /\[\[([^:]+):([^\|]+)\|([^\]]+)\]\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      const displayName = match[3];
      parts.push(
        <span key={match.index} className="text-amber-500">[{displayName}]</span>
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [content];
  };

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

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-stone-800">
        <h2 className="font-display text-lg text-stone-200">Folders</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openFolderDialog()}
          data-testid="button-create-folder"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors ${
            !selectedFolderId && !showSharedNotes
              ? "bg-amber-900/30 text-amber-400"
              : "hover:bg-stone-800/50 text-stone-300"
          }`}
          onClick={() => {
            setSelectedFolderId(null);
            setShowSharedNotes(false);
            if (isMobile) setSidebarOpen(false);
          }}
          data-testid="folder-all-notes"
        >
          <FileText className="h-4 w-4" />
          <span className="text-sm">All Notes</span>
        </div>
        <Separator className="my-2 bg-stone-800" />
        <div className="space-y-0.5 group">
          {foldersLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-stone-500" />
            </div>
          ) : (
            rootFolders.map((folder) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelect={(id) => {
                  setSelectedFolderId(id);
                  setShowSharedNotes(false);
                  if (isMobile) setSidebarOpen(false);
                }}
                onContextMenu={(f) => {
                  openFolderDialog(f);
                }}
              />
            ))
          )}
        </div>
        <Separator className="my-2 bg-stone-800" />
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors ${
            showSharedNotes
              ? "bg-amber-900/30 text-amber-400"
              : "hover:bg-stone-800/50 text-stone-300"
          }`}
          onClick={() => {
            setShowSharedNotes(true);
            setSelectedFolderId(null);
            if (isMobile) setSidebarOpen(false);
          }}
          data-testid="folder-shared"
        >
          <Users className="h-4 w-4" />
          <span className="text-sm">Shared with me</span>
        </div>
      </ScrollArea>
    </div>
  );

  const renderNoteList = () => (
    <div className="flex-1 p-4 md:p-6 overflow-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-stone-900/50 border-stone-700"
            data-testid="input-search-notes"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {notesLoading ? (
        <div className="flex items-center justify-center py-12 text-stone-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading notes...
        </div>
      ) : sortedNotes.length === 0 ? (
        <div className="text-center py-12 text-stone-500 border border-dashed border-stone-800 rounded-lg bg-stone-950/30">
          <FileText className="h-12 w-12 mx-auto mb-3 text-stone-700" />
          <p className="text-sm">No notes yet</p>
          <Button
            onClick={handleCreateNote}
            className="mt-4 bg-amber-700 hover:bg-amber-600"
            data-testid="button-create-first-note"
          >
            <Plus className="h-4 w-4 mr-2" /> Create Note
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedNotes.map((note) => (
            <Card
              key={note.id}
              className="bg-stone-900/60 border-stone-800 backdrop-blur hover:border-amber-900/50 transition-all cursor-pointer group"
              onClick={() => setLocation(`/notes/${note.id}`)}
              data-testid={`card-note-${note.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {note.type === "canvas" ? (
                      <Grid3X3 className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-stone-500 flex-shrink-0" />
                    )}
                    <h3
                      className="font-medium text-stone-200 flex-1 truncate"
                      data-testid={`text-note-title-${note.id}`}
                    >
                      {note.isPinned && (
                        <Pin className="inline h-3 w-3 mr-1 text-amber-500" />
                      )}
                      {note.title}
                    </h3>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-stone-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-note-menu-${note.id}`}
                      >
                        <MoreVertical className="h-4 w-4 text-stone-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-stone-900 border-stone-700"
                    >
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(note);
                        }}
                        data-testid={`menu-pin-${note.id}`}
                      >
                        <Pin className="h-4 w-4 mr-2" />
                        {note.isPinned ? "Unpin" : "Pin"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleArchive(note);
                        }}
                        data-testid={`menu-archive-${note.id}`}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openShareDialog(note.id);
                        }}
                        data-testid={`menu-share-${note.id}`}
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-stone-700" />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(note);
                          setDeleteNoteDialogOpen(true);
                        }}
                        className="text-red-400"
                        data-testid={`menu-delete-${note.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-xs text-stone-600">
                  {format(new Date(note.updatedAt), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="fixed bottom-6 right-6 flex gap-3">
        <Button
          onClick={handleCreateCanvas}
          className="h-14 w-14 rounded-full bg-indigo-700 hover:bg-indigo-600 shadow-lg shadow-indigo-900/30"
          data-testid="button-new-canvas"
        >
          <Grid3X3 className="h-6 w-6" />
        </Button>
        <Button
          onClick={handleCreateNote}
          className="h-14 w-14 rounded-full bg-amber-700 hover:bg-amber-600 shadow-lg shadow-amber-900/30"
          data-testid="button-create-note"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );

  const renderNoteReadView = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-stone-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/notes")}
          data-testid="button-back-to-notes"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNoteMode("edit")}
            className="text-amber-400 hover:text-amber-300"
            data-testid="button-edit-note"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => noteId && openShareDialog(noteId)}
            data-testid="button-share-note"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (currentNote) {
                setNoteToDelete(currentNote);
                setDeleteNoteDialogOpen(true);
              }
            }}
            className="text-red-400 hover:text-red-300"
            data-testid="button-delete-note"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {noteLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-auto">
          <h1 className="text-3xl font-display font-bold text-stone-100 mb-6" data-testid="text-note-read-title">
            {currentNote?.title}
          </h1>
          <div className="flex-1 text-stone-300 whitespace-pre-wrap leading-relaxed" data-testid="text-note-read-content">
            {formatEntityReferences(currentNote?.content || "")}
          </div>
        </div>
      )}
    </div>
  );

  const renderNoteEditor = () => {
    if (currentNote?.type === "canvas") {
      if (noteLoading) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
          </div>
        );
      }
      return (
        <CanvasEditor
          canvasData={canvasData}
          onChange={setCanvasData}
          readOnly={false}
          onClose={() => setLocation("/notes")}
          title={noteTitle}
          onTitleChange={setNoteTitle}
        />
      );
    }
    
    return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-stone-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setNoteMode("read")}
          data-testid="button-back-to-notes"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Done
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => noteId && openShareDialog(noteId)}
            data-testid="button-share-note"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (currentNote) {
                setNoteToDelete(currentNote);
                setDeleteNoteDialogOpen(true);
              }
            }}
            className="text-red-400 hover:text-red-300"
            data-testid="button-delete-note"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {noteLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-auto">
          <Input
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Note title"
            className="text-2xl font-display border-none bg-transparent focus-visible:ring-0 px-0 mb-4"
            data-testid="input-note-title"
          />
          <div className="flex items-center gap-2 mb-2">
            <ReferencePicker
              open={referencePickerOpen}
              onOpenChange={setReferencePickerOpen}
              onSelect={handleReferenceSelectFromButton}
              triggerElement={
                <Button
                  variant="outline"
                  size="sm"
                  className="border-stone-700 hover:bg-stone-800"
                  onClick={handleInsertReferenceClick}
                  data-testid="button-insert-reference"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Insert Reference
                </Button>
              }
            />
            <span className="text-xs text-stone-500">
              or type <kbd className="px-1.5 py-0.5 bg-stone-800 rounded text-stone-400">[[</kbd> to link entities
            </span>
          </div>
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={noteContent}
              onChange={handleContentChange}
              placeholder="Start writing... Type [[ to link game entities (Markdown supported)"
              className="flex-1 resize-none border-stone-800 bg-stone-900/30 min-h-[300px] w-full h-full"
              data-testid="textarea-note-content"
            />
          </div>
          {updateNoteMutation.isPending && (
            <p className="text-xs text-stone-500 mt-2">Saving...</p>
          )}
        </div>
      )}
    </div>
  );
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black font-sans text-stone-100">
      <div className="absolute inset-0 z-0">
        <img
          src={bgImage}
          alt="Background"
          className="h-full w-full object-cover opacity-40 blur-sm"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80" />
      </div>

      <div className="relative z-10 flex h-screen">
        {isMobile ? (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="w-72 p-0 bg-stone-950 border-stone-800"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Folders</SheetTitle>
              </SheetHeader>
              {sidebarContent}
            </SheetContent>
          </Sheet>
        ) : (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            className="w-64 bg-stone-950/80 backdrop-blur border-r border-stone-800 flex-shrink-0"
          >
            {sidebarContent}
          </motion.aside>
        )}

        <div className="flex-1 flex flex-col">
          <header className="flex items-center gap-4 p-4 border-b border-stone-800 bg-stone-950/60 backdrop-blur">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                data-testid="button-open-sidebar"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              className="text-stone-400 hover:text-white"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-display text-2xl font-bold text-amber-500 flex-1">
              {campaignId ? "Campaign Notes" : "My Notes"}
            </h1>
            {!isEditing && (
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                  className={viewMode === "list" ? "bg-amber-700 hover:bg-amber-600" : "text-stone-400 hover:text-white"}
                  data-testid="button-list-view"
                >
                  <List className="h-5 w-5" />
                </Button>
                <Button
                  variant={viewMode === "graph" ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("graph")}
                  className={viewMode === "graph" ? "bg-amber-700 hover:bg-amber-600" : "text-stone-400 hover:text-white"}
                  data-testid="button-graph-view"
                >
                  <Network className="h-5 w-5" />
                </Button>
              </div>
            )}
          </header>

          {campaignId && (
            <div className="flex items-center gap-2 py-3 px-4 border-b border-stone-800 bg-stone-950/40">
              <Badge className="bg-indigo-900/50 text-indigo-300">Campaign Notes</Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => window.history.back()}
                className="text-stone-400"
                data-testid="button-back-to-campaign"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Campaign
              </Button>
            </div>
          )}

          {isEditing ? (
            currentNote?.type === "canvas" || noteMode === "edit" ? renderNoteEditor() : renderNoteReadView()
          ) : viewMode === "graph" ? (
            <div className="flex-1 relative">
              <NotesGraph
                notes={sortedNotes}
                onNoteClick={(noteId) => setLocation(`/notes/${noteId}`)}
              />
            </div>
          ) : renderNoteList()}
        </div>
      </div>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100">
          <DialogHeader>
            <DialogTitle>
              {editingFolder ? "Edit Folder" : "Create Folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="bg-stone-900 border-stone-700"
                data-testid="input-folder-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-color">Color</Label>
              <Select
                value={folderColor ?? "default"}
                onValueChange={(v) =>
                  setFolderColor(v === "default" ? null : v)
                }
              >
                <SelectTrigger className="bg-stone-900 border-stone-700">
                  <SelectValue placeholder="Select color" />
                </SelectTrigger>
                <SelectContent className="bg-stone-900 border-stone-700">
                  {FOLDER_COLORS.map((c) => (
                    <SelectItem key={c.name} value={c.value ?? "default"}>
                      <div className="flex items-center gap-2">
                        <Folder
                          className={`h-4 w-4 ${getFolderColorClass(c.value)}`}
                        />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-parent">Parent Folder</Label>
              <Select
                value={folderParentId ?? "none"}
                onValueChange={(v) =>
                  setFolderParentId(v === "none" ? null : v)
                }
              >
                <SelectTrigger className="bg-stone-900 border-stone-700">
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
            {editingFolder && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  setFolderToDelete(editingFolder);
                  setDeleteFolderDialogOpen(true);
                  setFolderDialogOpen(false);
                }}
                data-testid="button-delete-folder"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Folder
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setFolderDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFolderSubmit}
              className="bg-amber-700 hover:bg-amber-600"
              disabled={
                !folderName.trim() ||
                createFolderMutation.isPending ||
                updateFolderMutation.isPending
              }
              data-testid="button-save-folder"
            >
              {createFolderMutation.isPending ||
              updateFolderMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {editingFolder ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteNoteDialogOpen}
        onOpenChange={setDeleteNoteDialogOpen}
      >
        <AlertDialogContent className="bg-stone-950 border-stone-800 text-stone-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">
              Delete Note?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              Are you sure you want to delete "{noteToDelete?.title}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-900 border-stone-700 text-stone-100 hover:bg-stone-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                noteToDelete && deleteNoteMutation.mutate(noteToDelete.id)
              }
              className="bg-red-700 hover:bg-red-600"
              data-testid="button-confirm-delete-note"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteFolderDialogOpen}
        onOpenChange={setDeleteFolderDialogOpen}
      >
        <AlertDialogContent className="bg-stone-950 border-stone-800 text-stone-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">
              Delete Folder?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              Are you sure you want to delete "{folderToDelete?.name}"? Notes in
              this folder will be moved to All Notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-900 border-stone-700 text-stone-100 hover:bg-stone-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                folderToDelete && deleteFolderMutation.mutate(folderToDelete.id)
              }
              className="bg-red-700 hover:bg-red-600"
              data-testid="button-confirm-delete-folder"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100">
          <DialogHeader>
            <DialogTitle>Share Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Add Friend</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Friend's username"
                  value={shareSearchUsername}
                  onChange={(e) => setShareSearchUsername(e.target.value)}
                  className="bg-stone-900 border-stone-700 flex-1"
                  data-testid="input-share-username"
                />
                <Select
                  value={sharePermission}
                  onValueChange={(v) =>
                    setSharePermission(v as "view" | "edit")
                  }
                >
                  <SelectTrigger className="w-24 bg-stone-900 border-stone-700">
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
                  onClick={handleAddShare}
                  className="bg-amber-700 hover:bg-amber-600"
                  disabled={shareNoteMutation.isPending}
                  data-testid="button-add-share"
                >
                  {shareNoteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <Separator className="bg-stone-800" />
            <div className="space-y-2">
              <Label>Current Shares</Label>
              {noteShares.length === 0 ? (
                <p className="text-sm text-stone-500">Not shared with anyone</p>
              ) : (
                <div className="space-y-2">
                  {noteShares.map((share) => {
                    const friendProfile = friends.find(
                      (f) => f.id === share.sharedWithId
                    );
                    return (
                      <div
                        key={share.id}
                        className="flex items-center justify-between py-2 px-3 bg-stone-900/50 rounded"
                        data-testid={`share-item-${share.id}`}
                      >
                        <span className="text-sm text-stone-300">
                          {friendProfile?.username || share.sharedWithId}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              share.permission === "edit"
                                ? "default"
                                : "secondary"
                            }
                            className={
                              share.permission === "edit"
                                ? "bg-amber-700"
                                : "bg-stone-700"
                            }
                          >
                            {share.permission === "edit" ? (
                              <Edit className="h-3 w-3 mr-1" />
                            ) : (
                              <Eye className="h-3 w-3 mr-1" />
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
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                            data-testid={`button-remove-share-${share.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShareDialogOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
