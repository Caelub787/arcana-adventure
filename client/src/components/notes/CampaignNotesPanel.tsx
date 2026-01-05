import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Note, NoteFolder, NoteShare, UserProfile, SystemSpell, SystemSkill, SystemTrait, SystemSpecies } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
  FileText,
  Pin,
  Archive,
  Trash2,
  Share2,
  MoreVertical,
  ChevronRight,
  ChevronLeft,
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
import { ReferencePicker, NoteOnlyPicker } from "@/components/notes/ReferencePicker";
import { CanvasEditor, CanvasData } from "@/components/notes/CanvasEditor";
import { NotesGraph } from "@/components/notes/NotesGraph";
import type { SearchableEntity } from "@/lib/api";

interface CampaignNotesPanelProps {
  campaignId: string;
  onClose: () => void;
  isOpen: boolean;
  campaignPlayers?: Array<{ id: string; name: string; userId: string }>;
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
        className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
          isSelected
            ? "bg-amber-900/30 text-amber-400"
            : "hover:bg-stone-800/50 text-stone-300"
        }`}
        style={{ paddingLeft: `${level * 8 + 4}px` }}
        onClick={() => onSelect(folder.id)}
        data-testid={`panel-folder-item-${folder.id}`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-stone-700 rounded"
          >
            <ChevronRight
              className={`h-2.5 w-2.5 transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : (
          <span className="w-3" />
        )}
        {expanded && hasChildren ? (
          <FolderOpen className={`h-3 w-3 ${getFolderColorClass(folder.color)}`} />
        ) : (
          <Folder className={`h-3 w-3 ${getFolderColorClass(folder.color)}`} />
        )}
        <span className="flex-1 truncate">{folder.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-stone-700 rounded opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="h-2.5 w-2.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-stone-900 border-stone-700">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(folder);
              }}
            >
              <Edit className="h-3 w-3 mr-2" /> Edit
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

export function CampaignNotesPanel({
  campaignId,
  onClose,
  isOpen,
  campaignPlayers = [],
}: CampaignNotesPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showSharedNotes, setShowSharedNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [noteMode, setNoteMode] = useState<"read" | "edit">("read");
  const [showSidebar, setShowSidebar] = useState(true);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

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
  const [shareTab, setShareTab] = useState<"friends" | "players">("friends");

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
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

  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<any>(null);
  const [entityLoading, setEntityLoading] = useState(false);

  const lastLoadedNoteIdRef = useRef<string | null>(null);

  const { data: folders = [], isLoading: foldersLoading } = useQuery<NoteFolder[]>({
    queryKey: ["/api/notes/folders", campaignId],
    queryFn: () => api.getNoteFolders(campaignId),
    enabled: !!user && isOpen,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", selectedFolderId, showSharedNotes, campaignId],
    queryFn: () => {
      if (showSharedNotes) return api.getSharedNotes();
      return api.getNotes(selectedFolderId ?? undefined, campaignId);
    },
    enabled: !!user && isOpen,
  });

  const { data: campaignCharacters = [] } = useQuery({
    queryKey: ["/api/campaigns", campaignId, "characters"],
    queryFn: () => api.getCampaignCharacters(campaignId),
    enabled: !!user && !!campaignId && isOpen,
  });

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
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createNoteMutation = useMutation({
    mutationFn: (data: Partial<Note>) => api.createNote(data),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", selectedNoteId] });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
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

  useEffect(() => {
    if (selectedNoteId && currentNote && (debouncedTitle !== currentNote.title || debouncedContent !== currentNote.content)) {
      updateNoteMutation.mutate({
        id: selectedNoteId,
        data: { title: debouncedTitle, content: debouncedContent },
      });
    }
  }, [debouncedTitle, debouncedContent]);

  useEffect(() => {
    if (selectedNoteId && currentNote?.type === "canvas" && !noteLoading) {
      updateNoteMutation.mutate({
        id: selectedNoteId,
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
        campaignId: campaignId,
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

  const handleShareWithPlayer = (player: { id: string; name: string; userId: string }) => {
    if (!shareNoteId) return;
    shareNoteMutation.mutate({
      noteId: shareNoteId,
      friendId: player.userId,
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
    if (pos >= 1) {
      const lastChar = newContent.slice(pos - 1, pos);
      const prevChar = pos >= 2 ? newContent.slice(pos - 2, pos - 1) : "";
      if (lastChar === "[" && prevChar !== "[") {
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
    const referenceText = `[${selectedNote.title}]`;
    const charsToRemove = notePickerTriggeredByTyping ? 1 : 0;
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
    const referenceText = `[${noteName}]`;
    const charsToRemove = notePickerTriggeredByTyping ? 1 : 0;
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

  const handleNoteReferenceClick = async (noteName: string) => {
    const existingNote = notes.find(n => n.title.toLowerCase() === noteName.toLowerCase());
    
    if (existingNote) {
      setSelectedNoteId(existingNote.id);
    } else {
      try {
        const newNote = await api.createNote({
          title: noteName,
          content: "",
          folderId: selectedFolderId,
          type: "markdown",
          campaignId: campaignId,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
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
    setSelectedEntityType(entityType);
    setSelectedEntityId(entityId);
    setEntityDialogOpen(true);
    setEntityLoading(true);
    setEntityData(null);

    try {
      let data: any = null;
      switch (entityType.toLowerCase()) {
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
          data = { name: "Item", description: "Item details are character-specific and cannot be displayed here." };
          break;
        case "character":
          const character = await api.getCharacter(entityId);
          data = character || { name: "Character", description: "Character not found or access denied." };
          break;
        default:
          data = { name: entityType, description: "Unknown entity type" };
      }
      setEntityData(data);
    } catch (error) {
      console.error("Failed to fetch entity:", error);
      setEntityData({ name: "Error", description: "Failed to load entity details" });
    } finally {
      setEntityLoading(false);
    }
  };

  const formatEntityReferences = (content: string): React.ReactNode[] => {
    const combinedRegex = /\[\[([^:]+):([^\|]+)\|([^\]]+)\]\]|\[\*([^\]]+)\]|\[([^\[\]:|\]]+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      
      if (match[1] && match[2] && match[3]) {
        const entityType = match[1];
        const entityId = match[2];
        const displayName = match[3];
        parts.push(
          <span
            key={match.index}
            className="text-amber-500 cursor-pointer hover:text-amber-400 hover:underline transition-colors"
            onClick={() => handleEntityClick(entityType, entityId)}
            data-testid={`panel-entity-ref-${entityType}-${entityId}`}
          >
            [{displayName}]
          </span>
        );
      } else if (match[4]) {
        const noteName = match[4];
        parts.push(
          <span
            key={match.index}
            className="text-cyan-400 cursor-pointer hover:text-cyan-300 hover:underline transition-colors"
            onClick={() => handleNoteReferenceClick(noteName)}
            data-testid={`panel-note-ref-${noteName}`}
          >
            [{noteName}]
          </span>
        );
      } else if (match[5]) {
        const noteName = match[5];
        parts.push(
          <span
            key={match.index}
            className="text-cyan-400 cursor-pointer hover:text-cyan-300 hover:underline transition-colors"
            onClick={() => handleNoteReferenceClick(noteName)}
            data-testid={`panel-note-ref-${noteName}`}
          >
            [{noteName}]
          </span>
        );
      }
      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [content];
  };

  const rootFolders = folders.filter((f) => !f.parentId);

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
    <div className="flex flex-col h-full border-r border-stone-700 bg-stone-950/50" style={{ width: showSidebar ? '140px' : '0', minWidth: showSidebar ? '140px' : '0', overflow: 'hidden', transition: 'all 0.2s' }}>
      <div className="flex items-center justify-between p-2 border-b border-stone-700">
        <span className="text-xs font-medium text-stone-300">Folders</span>
        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openFolderDialog()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-1">
        <div
          className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs ${
            !selectedFolderId && !showSharedNotes
              ? "bg-amber-900/30 text-amber-400"
              : "hover:bg-stone-800/50 text-stone-300"
          }`}
          onClick={() => {
            setSelectedFolderId(null);
            setShowSharedNotes(false);
          }}
          data-testid="panel-folder-all-notes"
        >
          <FileText className="h-3 w-3" />
          <span>All Notes</span>
        </div>
        <Separator className="my-1 bg-stone-800" />
        <div className="space-y-0.5 group">
          {foldersLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-3 w-3 animate-spin text-stone-500" />
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
                }}
                onContextMenu={(f) => openFolderDialog(f)}
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
      </ScrollArea>
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
              <div
                key={note.id}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 hover:bg-stone-700 rounded opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-3 w-3 text-stone-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-stone-900 border-stone-700">
                      {isOwner && (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePin(note);
                            }}
                          >
                            <Pin className="h-3 w-3 mr-2" />
                            {note.isPinned ? "Unpin" : "Pin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleArchive(note);
                            }}
                          >
                            <Archive className="h-3 w-3 mr-2" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openShareDialog(note.id);
                            }}
                          >
                            <Share2 className="h-3 w-3 mr-2" />
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
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                      {!isOwner && (
                        <DropdownMenuItem disabled className="text-stone-500 text-xs">
                          <Eye className="h-3 w-3 mr-2" />
                          Shared with you
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-xs text-stone-500 mt-0.5 truncate">
                  {note.content?.slice(0, 40) || "Empty note"}
                </p>
              </div>
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
      <div className="flex items-center justify-between p-2 border-b border-stone-700">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setSelectedNoteId(null)}
        >
          <ChevronLeft className="h-3 w-3 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-1">
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
          <div className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed" data-testid="panel-text-note-read-content">
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
        <CanvasEditor
          canvasData={canvasData}
          onChange={setCanvasData}
          readOnly={false}
          onClose={() => setSelectedNoteId(null)}
          title={noteTitle}
          onTitleChange={setNoteTitle}
        />
      );
    }
    
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
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
          <div className="flex-1 flex flex-col p-2 overflow-hidden">
            <Input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title"
              className="text-sm font-medium border-none bg-transparent focus-visible:ring-0 px-0 mb-2 h-7"
              data-testid="panel-input-note-title"
            />
            <div className="flex items-center gap-1 mb-1">
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
            </div>
            <div className="relative flex-1 overflow-hidden">
              <Textarea
                ref={textareaRef}
                value={noteContent}
                onChange={handleContentChange}
                placeholder="Start writing... Type [[ to link entities, [ to link notes"
                className="flex-1 resize-none border-stone-800 bg-stone-900/30 text-sm h-full w-full"
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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-stone-400 hover:text-white"
            onClick={onClose}
            data-testid="panel-button-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {viewMode === "graph" ? (
          renderGraphView()
        ) : (
          <>
            {renderSidebar()}
            {selectedNoteId ? (
              currentNote?.type === "canvas" || noteMode === "edit" ? renderNoteEditor() : renderNoteReadView()
            ) : (
              renderNoteList()
            )}
          </>
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
              <TabsTrigger value="players" className="flex-1 text-xs">Campaign Players</TabsTrigger>
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
                <Label className="text-xs">Share with Campaign Players</Label>
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
                {campaignPlayers.length === 0 ? (
                  <p className="text-xs text-stone-500">No other players in this campaign</p>
                ) : (
                  <div className="space-y-1">
                    {campaignPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between py-1.5 px-2 bg-stone-900/50 rounded text-xs"
                      >
                        <span className="text-stone-300">{player.name}</span>
                        <Button
                          size="sm"
                          className="h-6 text-xs bg-amber-700 hover:bg-amber-600"
                          onClick={() => handleShareWithPlayer(player)}
                          disabled={shareNoteMutation.isPending}
                        >
                          <Share2 className="h-3 w-3 mr-1" /> Share
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
                  const playerProfile = campaignPlayers.find((p) => p.userId === share.sharedWithId);
                  return (
                    <div
                      key={share.id}
                      className="flex items-center justify-between py-1.5 px-2 bg-stone-900/50 rounded text-xs"
                    >
                      <span className="text-stone-300">
                        {friendProfile?.username || playerProfile?.name || share.sharedWithId}
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
    </div>
  );
}
