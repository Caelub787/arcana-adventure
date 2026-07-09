import { useAppStore } from "@cr/lib/store";
import { useRealmRole } from "@cr/lib/useRealmRole";
import {
  useListRealms,
  useListNodes,
  useListFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useCreateRealm,
  useUpdateRealm,
  useDeleteRealm,
  useCreateNode,
  useUpdateNode,
  useDeleteNode,
  useDuplicateNodeUnlinked,
  useGetRealmSummary,
  getListRealmsQueryKey,
  getListNodesQueryKey,
  getListFoldersQueryKey,
  getGetRealmSummaryQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import type { NodeKind } from "@workspace/api-zod";
import type { Folder } from "@workspace/api-client-react";
import {
  KIND_CATEGORIES,
  ARCANA_CATEGORY_ID,
  TAG_OPTIONS,
  getKindIcon,
  getKindMeta,
  getTagOption,
  hasArcanaKind,
  getCategoryIdForKind,
} from "@cr/lib/nodeKinds";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Drawer as VaulDrawer } from "vaul";
import { ScrollArea } from "@cr/components/ui/scroll-area";
import { Button } from "@cr/components/ui/button";
import { Input } from "@cr/components/ui/input";
import {
  Globe,
  FileText,
  MapPin,
  Users,
  Sword,
  BookOpen,
  Package,
  Plus,
  Search,
  X,
  LayoutGrid,
  GripVertical,
  Maximize,
  MoreHorizontal,
  Pencil,
  Trash2,
  Shapes,
  ColumnsIcon,
  RowsIcon,
  Loader2,
  Map as MapIcon,
  Sparkle,
  PawPrint,
  Shield,
  GitBranch,
  UserSquare,
  Dices,
  Link2,
  Unlink,
  ExternalLink,
  Share2,
  BookMarked,
  Tag,
  Copy,
  Check,
  Folder as FolderIcon,
  FolderPlus,
  FolderMinus,
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderInput,
  CheckSquare,
  ListChecks,
  MoveRight,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
  ArrowLeft,
} from "lucide-react";
import {
  LIBRARY_MAX_WIDTH,
  LIBRARY_MIN_WIDTH,
} from "@cr/lib/store";
import { SidebarResizeHandle } from "@cr/components/sidebar/SidebarResizeHandle";
import { useIsMobile } from "@cr/hooks/use-mobile";
import { cn } from "@cr/lib/utils";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import {
  setSidebarNodeDrag,
  getSidebarNodeDrag,
  hasSidebarNodeDrag,
  setSidebarSelectionDrag,
  hasSidebarSelectionDrag,
} from "@cr/lib/drag";
import { beginTouchDrag } from "@cr/lib/touchDrag";
import { Checkbox } from "@cr/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cr/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@cr/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cr/components/ui/dialog";
import { ARCANA_SYSTEM_OPTIONS } from "@cr/lib/arcanaSystems";
import { ArcanaSettingsDialog } from "@cr/components/arcana/ArcanaSettingsDialog";
import { ShareDialog } from "@cr/components/layout/ShareDialog";
import { NodeAvatar } from "@cr/components/workspace/NodeAvatar";
import { usePeersInNode } from "@cr/lib/realtime";

type ConfirmTarget =
  | { kind: "realm"; id: string; name: string }
  | { kind: "node"; id: string; name: string }
  | { kind: "folder"; id: string; name: string };

const EXPANDED_FOLDERS_STORAGE_KEY = "canvas-realms:expanded-folders";

function loadExpandedFolders(realmId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(
      `${EXPANDED_FOLDERS_STORAGE_KEY}:${realmId}`,
    );
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function saveExpandedFolders(realmId: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${EXPANDED_FOLDERS_STORAGE_KEY}:${realmId}`,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    // ignore quota or serialization issues
  }
}

/**
 * Renders up to 3 small circular avatars for peers currently focused on
 * any text block inside `nodeId`. The Compass overlay + caret in the
 * document already shows WHERE peers are typing; this row affordance
 * just tells the user WHICH node has someone in it.
 */
function NodePresenceAvatars({ nodeId }: { nodeId: string }) {
  const peers = usePeersInNode(nodeId);
  if (peers.length === 0) return null;
  const shown = peers.slice(0, 3);
  const extra = peers.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5 pr-1 flex-shrink-0">
      {shown.map((p) => (
        <span
          key={p.clientId}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-background overflow-hidden"
          style={{ backgroundColor: p.color }}
          title={`${p.name} is editing`}
        >
          {p.imageUrl ? (
            <img
              src={p.imageUrl}
              alt={p.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            (p.name?.[0] ?? "?").toUpperCase()
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-1 ring-background px-1"
          title={`${extra} more`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export function LibrarySidebar({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    activeRealmId,
    openInFocused,
    openNewNode,
    splitAtPane,
    focusedPaneId,
    setViewMode,
    openNodeIds,
    isLibraryOpen,
    setLibraryOpen,
    libraryWidth,
    setLibraryWidth,
    libraryCollapsed,
    setLibraryCollapsed,
    removeNodeFromAllPanes,
    forgetRealmLocalState,
    activeGuide,
  } = useAppStore();
  const isMobile = useIsMobile();

  const { data: realms } = useListRealms();
  const { canEdit, isOwner, isEditor, isViewer } = useRealmRole(activeRealmId);
  const { data: nodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });
  const { data: folders } = useListFolders(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListFoldersQueryKey(activeRealmId || ""),
    },
  });
  const { data: summary } = useGetRealmSummary(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getGetRealmSummaryQueryKey(activeRealmId || ""),
    },
  });

  // In a campaign-linked (shared) world a plain viewer (player) only ever sees
  // their OWN personal folder among owned folders — the server hides everyone
  // else's. So any visible folder carrying an ownerUserId is the caller's, and
  // they may author private nodes inside it even without full edit rights.
  const myFolderId =
    (folders ?? []).find(
      (f) => (f as unknown as { ownerUserId?: string | null }).ownerUserId,
    )?.id ?? null;
  const canCreateInFolder = (folderId: string | null | undefined) =>
    canEdit || (isViewer && !!folderId && folderId === myFolderId);

  const createRealm = useCreateRealm();
  const updateRealm = useUpdateRealm();
  const deleteRealm = useDeleteRealm();
  const createNode = useCreateNode();
  const updateNode = useUpdateNode();
  const deleteNode = useDeleteNode();
  const duplicateUnlinked = useDuplicateNodeUnlinked();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Embedded (campaign-hosted) mode starts with the sidebar collapsed so the
  // host panel has room. This override is session-local and never persists, so
  // the standalone /app sidebar keeps its own remembered collapse state.
  const [embeddedCollapsed, setEmbeddedCollapsed] = useState(true);
  const effLibraryCollapsed = embedded ? embeddedCollapsed : libraryCollapsed;
  const setEffLibraryCollapsed = embedded ? setEmbeddedCollapsed : setLibraryCollapsed;

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<NodeKind | null>(null);
  const [kindFilterOpen, setKindFilterOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [newRealmOpen, setNewRealmOpen] = useState(false);
  const [newRealmName, setNewRealmName] = useState("");
  const [newRealmError, setNewRealmError] = useState<string | null>(null);
  const [newRealmSystem, setNewRealmSystem] = useState<string>("aa-v2");
  const [arcanaDialogRealmId, setArcanaDialogRealmId] = useState<string | null>(null);
  const [campaignLinkRealmId, setCampaignLinkRealmId] = useState<string | null>(null);
  const [shareDialogRealmId, setShareDialogRealmId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

  // Multi-select state. Selection is scoped to the active realm — switching
  // realms exits select mode (see effect below).
  type FolderSelMode = "self" | "with-contents";
  const [selectMode, setSelectMode] = useState(false);
  const [selNodes, setSelNodes] = useState<Set<string>>(() => new Set());
  const [selFolders, setSelFolders] = useState<Map<string, FolderSelMode>>(
    () => new Map(),
  );
  const [selOrder, setSelOrder] = useState<string[]>([]);
  const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [massRenameOpen, setMassRenameOpen] = useState(false);
  const [massRenameBase, setMassRenameBase] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelNodes(new Set());
    setSelFolders(new Map());
    setSelOrder([]);
    setLastSelectedKey(null);
  };
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  // Reload expansion state when the active realm changes.
  useEffect(() => {
    if (!activeRealmId) {
      setExpandedFolders(new Set());
      return;
    }
    setExpandedFolders(loadExpandedFolders(activeRealmId));
  }, [activeRealmId]);

  // Exit multi-select mode whenever the active realm changes — selections
  // are scoped to the realm where they were started.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    exitSelectMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRealmId]);

  // Esc exits multi-select mode.
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (renamingId) return;
      if (bulkDeleteOpen || bulkMoveOpen || massRenameOpen) return;
      e.preventDefault();
      exitSelectMode();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, renamingId, bulkDeleteOpen, bulkMoveOpen, massRenameOpen]);

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      if (activeRealmId) saveExpandedFolders(activeRealmId, next);
      return next;
    });
  };
  const [newNodeMenuOpen, setNewNodeMenuOpen] = useState(false);
  const [newNodeMenuAnchor, setNewNodeMenuAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const newNodeMenuRef = useRef<HTMLDivElement | null>(null);
  // The menu itself renders in a body portal (it must escape the sidebar's
  // backdrop-blur stacking context, or the part overhanging the canvas pane
  // loses hit-testing to it), so outside-click checks both the trigger
  // wrapper and the portaled menu.
  const newNodeMenuPortalRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!newNodeMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        newNodeMenuRef.current &&
        !newNodeMenuRef.current.contains(t) &&
        (!newNodeMenuPortalRef.current ||
          !newNodeMenuPortalRef.current.contains(t))
      ) {
        setNewNodeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [newNodeMenuOpen]);

  // Per-open-session expanded category state for the kind picker. Both
  // the + New dropdown and the long-press / right-click picker share
  // this set. Categories start COLLAPSED every time either picker
  // opens; closing the picker resets the set so the next open is
  // again all-collapsed (the behavior the user asked for explicitly).
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const allCategoriesExpanded =
    expandedCategories.size === KIND_CATEGORIES.length;
  const toggleAllCategories = useCallback(() => {
    setExpandedCategories((prev) => {
      if (prev.size === KIND_CATEGORIES.length) return new Set();
      return new Set(KIND_CATEGORIES.map((c) => c.id));
    });
  }, []);
  // Reset when the + New dropdown closes.
  useEffect(() => {
    if (!newNodeMenuOpen) setExpandedCategories(new Set());
  }, [newNodeMenuOpen]);

  const [kindPickerPos, setKindPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [kindPickerFolderId, setKindPickerFolderId] = useState<string | null>(null);
  const kindPickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!kindPickerPos) return;
    const onDoc = (e: MouseEvent) => {
      if (kindPickerRef.current && !kindPickerRef.current.contains(e.target as Node)) {
        setKindPickerPos(null);
        setKindPickerFolderId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setKindPickerPos(null);
        setKindPickerFolderId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [kindPickerPos]);
  // Reset the expanded-category set when the long-press picker closes,
  // matching the + New dropdown behavior.
  useEffect(() => {
    if (!kindPickerPos) setExpandedCategories(new Set());
  }, [kindPickerPos]);

  // When a create-node guide is active and the user opens either picker,
  // auto-expand the category that contains the suggested kindHint so the
  // guide's next step (which highlights the specific kind item) finds
  // its target without making the user tap the category header first.
  useEffect(() => {
    if (!newNodeMenuOpen && !kindPickerPos) return;
    if (!activeGuide || activeGuide.guideId !== "create-node") return;
    const kindHint = activeGuide.params?.kindHint;
    if (!kindHint) return;
    const categoryId = getCategoryIdForKind(kindHint);
    if (!categoryId) return;
    setExpandedCategories((prev) => {
      if (prev.has(categoryId)) return prev;
      const next = new Set(prev);
      next.add(categoryId);
      return next;
    });
  }, [newNodeMenuOpen, kindPickerPos, activeGuide]);

  const emptyLongPressTimer = useRef<number | null>(null);
  const cancelEmptyLongPress = () => {
    if (emptyLongPressTimer.current !== null) {
      window.clearTimeout(emptyLongPressTimer.current);
      emptyLongPressTimer.current = null;
    }
  };
  useEffect(() => {
    return () => {
      if (emptyLongPressTimer.current !== null) {
        window.clearTimeout(emptyLongPressTimer.current);
        emptyLongPressTimer.current = null;
      }
    };
  }, []);
  const handleLibraryContextMenu = (e: React.MouseEvent) => {
    if (!canEdit || !activeRealmId) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-guide="node-row"]')) return;
    e.preventDefault();
    setNewNodeMenuOpen(false);
    setKindPickerFolderId(null);
    setKindPickerPos({ x: e.clientX, y: e.clientY });
  };
  const handleLibraryTouchStart = (e: React.TouchEvent) => {
    if (!canEdit || !activeRealmId) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-guide="node-row"]')) return;
    const touch = e.touches[0];
    if (!touch) return;
    const x = touch.clientX;
    const y = touch.clientY;
    cancelEmptyLongPress();
    emptyLongPressTimer.current = window.setTimeout(() => {
      setNewNodeMenuOpen(false);
      setKindPickerFolderId(null);
      setKindPickerPos({ x, y });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          (navigator as Navigator & { vibrate: (p: number) => void }).vibrate(15);
        } catch {}
      }
    }, 450);
  };

  const handleNewNode = (
    meta: { kind: string; color: string; label: string },
    fromArcana: boolean,
  ) => {
    if (!activeRealmId) return;
    const targetFolderId = kindPickerFolderId;
    if (!canCreateInFolder(targetFolderId)) return;
    setNewNodeMenuOpen(false);
    setKindPickerPos(null);
    setKindPickerFolderId(null);
    const { kind, color, label } = meta;
    createNode.mutate(
      {
        realmId: activeRealmId,
        data: {
          title:
            kind === "canvas"
              ? "New Canvas"
              : kind === "map"
                ? "New Map"
                : `New ${label}`,
          content: "",
          kind: kind as NodeKind,
          mode: "window",
          x: -100,
          y: -100,
          width: 320,
          height: 240,
          zIndex: 10,
          color,
          arcanaSync: fromArcana,
          ...(targetFolderId ? { folderId: targetFolderId } : {}),
        },
      },
      {
        onSuccess: () => {
          // Just refresh the sidebar list — don't change which panes
          // are open. Previously this called `openNewNode(res.id)`
          // which replaced the focused pane and closed/replaced
          // whatever the user had open.
          queryClient.invalidateQueries({
            queryKey: getListNodesQueryKey(activeRealmId),
          });
        },
      },
    );
  };

  const longPressTimer = useRef<number | null>(null);
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const startLongPress = (id: string) => {
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => {
      setOpenMenuId(id);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          (navigator as Navigator & { vibrate: (p: number) => void }).vibrate(15);
        } catch {}
      }
    }, 450);
  };

  // Touch drag-and-drop for sidebar node rows.
  //
  // The user has to press-and-hold on a specific row (~450ms) before
  // a drag can begin — moving the finger before that timer fires is
  // treated as a scroll and cancels everything, so vertical swipes
  // through the library scroll the list instead of grabbing a node.
  //
  // After the row is "armed":
  //   - Moving the finger starts the touch drag (and collapses the
  //     fullscreen mobile drawer so the finger can land on a drop
  //     target — map surface, canvas, pane edge — underneath it).
  //   - Lifting the finger without moving opens the row's context
  //     menu (the previous long-press behavior).
  const rowTouchRef = useRef<{
    x: number;
    y: number;
    nodeId: string;
    title: string;
    rowKey: string;
    armed: boolean;
    started: boolean;
  } | null>(null);
  const armTimer = useRef<number | null>(null);
  const cancelArmTimer = () => {
    if (armTimer.current !== null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  };
  const startRowTouch = (
    e: React.TouchEvent,
    nodeId: string,
    nodeTitle: string,
    rowKey: string,
  ) => {
    const t = e.touches[0];
    if (!t) return;
    rowTouchRef.current = {
      x: t.clientX,
      y: t.clientY,
      nodeId,
      title: nodeTitle,
      rowKey,
      armed: false,
      started: false,
    };
    cancelArmTimer();
    armTimer.current = window.setTimeout(() => {
      armTimer.current = null;
      const data = rowTouchRef.current;
      if (!data) return;
      data.armed = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          (navigator as Navigator & { vibrate: (p: number) => void }).vibrate(15);
        } catch {}
      }
    }, 450);
  };
  const handleRowTouchMove = (e: React.TouchEvent) => {
    const data = rowTouchRef.current;
    if (!data || data.started) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - data.x;
    const dy = t.clientY - data.y;
    const moved = Math.hypot(dx, dy) > 10;
    if (!moved) return;
    if (!data.armed) {
      // User started scrolling before press-and-hold fired — cancel
      // the arm timer and bail out so the browser handles the scroll.
      cancelArmTimer();
      rowTouchRef.current = null;
      return;
    }
    data.started = true;
    setLibraryOpen(false);
    beginTouchDrag({
      payload: { nodeId: data.nodeId },
      startX: t.clientX,
      startY: t.clientY,
      label: data.title || "Node",
    });
  };
  const handleRowTouchEnd = () => {
    const data = rowTouchRef.current;
    const wasArmedTap = !!data && data.armed && !data.started;
    const rowKey = data?.rowKey;
    rowTouchRef.current = null;
    cancelArmTimer();
    // Armed + released without moving = the user wanted the context
    // menu rather than a drag.
    if (wasArmedTap && rowKey) setOpenMenuId(rowKey);
  };

  const describeMutationError = (err: unknown, fallback: string): string => {
    if (err && typeof err === "object") {
      const data = (err as { data?: unknown }).data;
      if (data && typeof data === "object") {
        const apiMessage = (data as { error?: unknown }).error;
        if (typeof apiMessage === "string" && apiMessage.trim()) {
          return apiMessage;
        }
      }
      const message = (err as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }
    return fallback;
  };

  const openNewRealmDialog = () => {
    if (createRealm.isPending) return;
    setNewRealmName("New Realm");
    setNewRealmError(null);
    setNewRealmSystem("aa-v2");
    setNewRealmOpen(true);
  };

  const submitNewRealm = () => {
    const next = newRealmName.trim();
    if (!next) {
      setNewRealmError("Please enter a name.");
      return;
    }
    if (createRealm.isPending) return;
    createRealm.mutate(
      { data: { name: next, arcanaSystem: newRealmSystem } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
          setLocation(`/app/realm/${res.id}`);
          setNewRealmOpen(false);
          setNewRealmName("");
          setNewRealmError(null);
        },
        onError: (err) => {
          console.error("Failed to create realm", err);
          toast.error("Couldn't create realm", {
            description: describeMutationError(err, "Please try again."),
          });
        },
      },
    );
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameDraft(currentName);
    setOpenMenuId(null);
  };

  const openNewFolderDialog = (parentFolderId: string | null) => {
    if (createFolder.isPending) return;
    setNewFolderParentId(parentFolderId);
    setNewFolderName("New folder");
    setNewFolderError(null);
    setOpenMenuId(null);
    setNewFolderOpen(true);
  };

  const submitNewFolder = () => {
    if (!activeRealmId) return;
    const next = newFolderName.trim();
    if (!next) {
      setNewFolderError("Please enter a name.");
      return;
    }
    if (createFolder.isPending) return;
    createFolder.mutate(
      {
        realmId: activeRealmId,
        data: { name: next, parentFolderId: newFolderParentId ?? null },
      },
      {
        onSuccess: (folder) => {
          queryClient.invalidateQueries({
            queryKey: getListFoldersQueryKey(activeRealmId),
          });
          setNewFolderOpen(false);
          setNewFolderName("");
          setNewFolderParentId(null);
          setNewFolderError(null);
          // Auto-expand the parent (if any) so the new folder is visible.
          if (folder.parentFolderId) {
            setExpandedFolders((prev) => {
              const set = new Set(prev);
              set.add(folder.parentFolderId as string);
              if (activeRealmId) saveExpandedFolders(activeRealmId, set);
              return set;
            });
          }
        },
        onError: (err) => {
          console.error("Failed to create folder", err);
          toast.error("Couldn't create folder", {
            description: describeMutationError(err, "Please try again."),
          });
        },
      },
    );
  };

  const handleMoveNodeToFolder = (
    nodeId: string,
    folderId: string | null,
  ) => {
    setOpenMenuId(null);
    updateNode.mutate(
      { nodeId, data: { folderId } },
      {
        onSuccess: () => {
          if (activeRealmId) {
            queryClient.invalidateQueries({
              queryKey: getListNodesQueryKey(activeRealmId),
            });
          }
          // Auto-expand the destination folder so the moved node is visible.
          if (folderId) {
            setExpandedFolders((prev) => {
              const set = new Set(prev);
              set.add(folderId);
              if (activeRealmId) saveExpandedFolders(activeRealmId, set);
              return set;
            });
          }
        },
        onError: (err) => {
          console.error("Failed to move node", err);
          toast.error("Couldn't move node", {
            description: describeMutationError(err, "Please try again."),
          });
        },
      },
    );
  };

  const commitRename = (target: ConfirmTarget["kind"], id: string) => {
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!next) return;
    if (target === "realm") {
      const current = realms?.find((r) => r.id === id);
      if (!current || current.name === next) return;
      updateRealm.mutate(
        { realmId: id, data: { name: next } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
          },
          onError: (err) => {
            console.error("Failed to rename realm", err);
            toast.error("Couldn't rename realm", {
              description: describeMutationError(err, "Please try again."),
            });
          },
        },
      );
    } else if (target === "folder") {
      const current = folders?.find((f) => f.id === id);
      if (!current || current.name === next) return;
      updateFolder.mutate(
        { folderId: id, data: { name: next } },
        {
          onSuccess: () => {
            if (activeRealmId) {
              queryClient.invalidateQueries({
                queryKey: getListFoldersQueryKey(activeRealmId),
              });
            }
          },
          onError: (err) => {
            console.error("Failed to rename folder", err);
            toast.error("Couldn't rename folder", {
              description: describeMutationError(err, "Please try again."),
            });
          },
        },
      );
    } else {
      const current = nodes?.find((n) => n.id === id);
      if (!current || current.title === next) return;
      updateNode.mutate(
        { nodeId: id, data: { title: next } },
        {
          onSuccess: () => {
            if (activeRealmId) {
              queryClient.invalidateQueries({ queryKey: getListNodesQueryKey(activeRealmId) });
            }
          },
          onError: (err) => {
            console.error("Failed to rename node", err);
            toast.error("Couldn't rename node", {
              description: describeMutationError(err, "Please try again."),
            });
          },
        },
      );
    }
  };

  const handleChangeKind = (
    nodeId: string,
    kind: NodeKind,
    color: string,
  ) => {
    setOpenMenuId(null);
    updateNode.mutate(
      { nodeId, data: { kind, color } },
      {
        onSuccess: () => {
          if (activeRealmId) {
            queryClient.invalidateQueries({ queryKey: getListNodesQueryKey(activeRealmId) });
          }
        },
        onError: (err) => {
          console.error("Failed to update node", err);
          toast.error("Couldn't update node", {
            description: describeMutationError(err, "Please try again."),
          });
        },
      },
    );
  };

  const handleDuplicateUnlinked = (nodeId: string) => {
    setOpenMenuId(null);
    duplicateUnlinked.mutate(
      { nodeId },
      {
        onSuccess: (res) => {
          if (activeRealmId) {
            queryClient.invalidateQueries({ queryKey: getListNodesQueryKey(activeRealmId) });
          }
          if (res?.id) {
            openNewNode(res.id);
          }
          toast.success("Duplicated as unlinked copy", {
            description: res?.title,
          });
        },
        onError: (err) => {
          console.error("Failed to duplicate node", err);
          toast.error("Couldn't duplicate node", {
            description: describeMutationError(err, "Please try again."),
          });
        },
      },
    );
  };

  const handleToggleTag = (
    nodeId: string,
    currentTags: readonly string[],
    tagId: string,
  ) => {
    const set = new Set(currentTags);
    if (set.has(tagId)) set.delete(tagId);
    else set.add(tagId);
    updateNode.mutate(
      { nodeId, data: { tags: Array.from(set) } },
      {
        onSuccess: () => {
          if (activeRealmId) {
            queryClient.invalidateQueries({ queryKey: getListNodesQueryKey(activeRealmId) });
          }
        },
        onError: (err) => {
          console.error("Failed to update tags", err);
          toast.error("Couldn't update tags", {
            description: describeMutationError(err, "Please try again."),
          });
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    const target = confirmTarget;
    if (!target) return;
    setConfirmTarget(null);
    if (target.kind === "realm") {
      const fallback =
        realms?.find((r) => r.id !== target.id)?.id ?? null;
      deleteRealm.mutate(
        { realmId: target.id },
        {
          onSuccess: () => {
            forgetRealmLocalState(target.id, fallback);
            queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
            setLocation(fallback ? `/app/realm/${fallback}` : "/app", {
              replace: true,
            });
          },
          onError: (err) => {
            console.error("Failed to delete realm", err);
            toast.error("Couldn't delete realm", {
              description: describeMutationError(err, "Please try again."),
            });
          },
        },
      );
    } else if (target.kind === "folder") {
      deleteFolder.mutate(
        { folderId: target.id },
        {
          onSuccess: () => {
            if (activeRealmId) {
              queryClient.invalidateQueries({
                queryKey: getListFoldersQueryKey(activeRealmId),
              });
              queryClient.invalidateQueries({
                queryKey: getListNodesQueryKey(activeRealmId),
              });
            }
          },
          onError: (err) => {
            console.error("Failed to delete folder", err);
            toast.error("Couldn't delete folder", {
              description: describeMutationError(err, "Please try again."),
            });
          },
        },
      );
    } else {
      deleteNode.mutate(
        { nodeId: target.id },
        {
          onSuccess: () => {
            removeNodeFromAllPanes(target.id);
            if (activeRealmId) {
              queryClient.invalidateQueries({ queryKey: getListNodesQueryKey(activeRealmId) });
              queryClient.invalidateQueries({
                queryKey: getGetRealmSummaryQueryKey(activeRealmId),
              });
            }
          },
          onError: (err) => {
            console.error("Failed to delete node", err);
            toast.error("Couldn't delete node", {
              description: describeMutationError(err, "Please try again."),
            });
          },
        },
      );
    }
  };

  const availableKinds = (() => {
    const counts = new Map<string, number>();
    for (const n of nodes ?? []) {
      counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    }
    return counts;
  })();

  const filteredNodes =
    nodes?.filter((n) => {
      const q = search.toLowerCase();
      const matchesSearch =
        q.length === 0 ||
        n.title.toLowerCase().includes(q) ||
        (n.key ?? "").toLowerCase().includes(q);
      return matchesSearch && (kindFilter === null || n.kind === kindFilter);
    }) || [];

  const activeKindMeta = kindFilter ? getKindMeta(kindFilter) : null;

  // Folder tree data structures.
  const folderList: Folder[] = folders ?? [];
  const folderById = new Map<string, Folder>();
  for (const f of folderList) folderById.set(f.id, f);
  const foldersByParent = new Map<string | null, Folder[]>();
  for (const f of folderList) {
    const key = f.parentFolderId ?? null;
    const arr = foldersByParent.get(key) ?? [];
    arr.push(f);
    foldersByParent.set(key, arr);
  }
  for (const arr of foldersByParent.values()) {
    arr.sort(
      (a, b) =>
        (a.sortIndex ?? 0) - (b.sortIndex ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }
  const folderPathCache = new Map<string, string>();
  const computeFolderPath = (id: string): string => {
    const cached = folderPathCache.get(id);
    if (cached !== undefined) return cached;
    const f = folderById.get(id);
    if (!f) return "";
    const parentPath = f.parentFolderId
      ? computeFolderPath(f.parentFolderId)
      : "";
    const path = parentPath ? `${parentPath} / ${f.name}` : f.name;
    folderPathCache.set(id, path);
    return path;
  };
  const moveDestinations = folderList
    .map((f) => ({ id: f.id, path: computeFolderPath(f.id) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Group filtered nodes by their folderId. Nodes whose folderId no longer
  // exists in this realm fall back to the root bucket.
  const nodesByFolder = new Map<string | null, typeof filteredNodes>();
  for (const n of filteredNodes) {
    const key = n.folderId && folderById.has(n.folderId) ? n.folderId : null;
    const arr = nodesByFolder.get(key) ?? [];
    arr.push(n);
    nodesByFolder.set(key, arr);
  }

  const isFiltering = search.trim().length > 0 || kindFilter !== null;

  // ---- Multi-select helpers ----------------------------------------------
  // Build the descendant maps for the active realm.
  const folderDescendants = (folderId: string): {
    folders: string[];
    nodes: string[];
  } => {
    const folders: string[] = [];
    const nodeIds: string[] = [];
    const stack = [folderId];
    while (stack.length) {
      const id = stack.pop()!;
      const kids = foldersByParent.get(id) ?? [];
      for (const k of kids) {
        folders.push(k.id);
        stack.push(k.id);
      }
    }
    const allFolderIds = new Set([folderId, ...folders]);
    for (const n of nodes ?? []) {
      if (n.folderId && allFolderIds.has(n.folderId)) {
        nodeIds.push(n.id);
      }
    }
    return { folders, nodes: nodeIds };
  };

  const isNodeSelected = (id: string) => selNodes.has(id);
  const folderSelMode = (id: string): FolderSelMode | null =>
    selFolders.get(id) ?? null;

  const recordSelectionOrder = (key: string) => {
    setSelOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };
  const removeSelectionOrder = (key: string) => {
    setSelOrder((prev) => prev.filter((k) => k !== key));
  };

  const setNodeSelected = (id: string, on: boolean) => {
    setSelNodes((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    if (on) recordSelectionOrder(`node:${id}`);
    else removeSelectionOrder(`node:${id}`);
  };
  const setFolderSelected = (
    id: string,
    mode: FolderSelMode | null,
  ) => {
    setSelFolders((prev) => {
      const next = new Map(prev);
      if (mode) next.set(id, mode);
      else next.delete(id);
      return next;
    });
    if (mode) recordSelectionOrder(`folder:${id}`);
    else removeSelectionOrder(`folder:${id}`);
  };

  const toggleFolderWithContents = (
    folderId: string,
    on: boolean,
  ) => {
    const desc = folderDescendants(folderId);
    if (on) {
      setSelFolders((prev) => {
        const next = new Map(prev);
        next.set(folderId, "with-contents");
        for (const fid of desc.folders) {
          if (!next.has(fid)) next.set(fid, "self");
        }
        return next;
      });
      setSelNodes((prev) => {
        const next = new Set(prev);
        for (const nid of desc.nodes) next.add(nid);
        return next;
      });
      setSelOrder((prev) => {
        const seen = new Set(prev);
        const out = [...prev];
        const add = (k: string) => {
          if (!seen.has(k)) {
            seen.add(k);
            out.push(k);
          }
        };
        add(`folder:${folderId}`);
        for (const fid of desc.folders) add(`folder:${fid}`);
        for (const nid of desc.nodes) add(`node:${nid}`);
        return out;
      });
    } else {
      // Unchecking the folder+contents box clears the folder and its
      // descendants from the selection.
      const all = new Set([folderId, ...desc.folders]);
      const allNodes = new Set(desc.nodes);
      setSelFolders((prev) => {
        const next = new Map(prev);
        for (const f of all) next.delete(f);
        return next;
      });
      setSelNodes((prev) => {
        const next = new Set(prev);
        for (const nid of allNodes) next.delete(nid);
        return next;
      });
      setSelOrder((prev) =>
        prev.filter(
          (k) =>
            !(
              (k.startsWith("folder:") &&
                all.has(k.slice("folder:".length))) ||
              (k.startsWith("node:") &&
                allNodes.has(k.slice("node:".length)))
            ),
        ),
      );
    }
  };

  const enterSelectMode = (initialKey?: string, withContents = false) => {
    setSelectMode(true);
    setOpenMenuId(null);
    if (initialKey) {
      const [kind, id] = initialKey.split(":");
      if (kind === "node") {
        setNodeSelected(id, true);
      } else if (kind === "folder") {
        if (withContents) toggleFolderWithContents(id, true);
        else setFolderSelected(id, "self");
      }
      setLastSelectedKey(initialKey);
    }
  };

  // Visible row order for shift-click range selection.
  const visibleRowOrder: string[] = (() => {
    const out: string[] = [];
    if (isFiltering) {
      for (const n of filteredNodes) out.push(`node:${n.id}`);
      return out;
    }
    const walk = (parentId: string | null) => {
      const subfolders = foldersByParent.get(parentId) ?? [];
      for (const f of subfolders) {
        out.push(`folder:${f.id}`);
        if (expandedFolders.has(f.id)) walk(f.id);
      }
      const childNodes = nodesByFolder.get(parentId) ?? [];
      for (const n of childNodes) out.push(`node:${n.id}`);
    };
    walk(null);
    return out;
  })();

  const handleRowSelectClick = (
    e: React.MouseEvent,
    rowKey: string,
  ): boolean => {
    // Returns true if the click was consumed by selection logic.
    if (!selectMode) {
      if (!(e.metaKey || e.ctrlKey || e.shiftKey)) return false;
      enterSelectMode();
    }
    if (e.shiftKey && lastSelectedKey) {
      const start = visibleRowOrder.indexOf(lastSelectedKey);
      const end = visibleRowOrder.indexOf(rowKey);
      if (start !== -1 && end !== -1) {
        const [a, b] = start < end ? [start, end] : [end, start];
        for (let i = a; i <= b; i++) {
          const key = visibleRowOrder[i];
          const [kind, id] = key.split(":");
          if (kind === "node") {
            if (!selNodes.has(id)) setNodeSelected(id, true);
          } else if (kind === "folder") {
            if (!selFolders.has(id)) setFolderSelected(id, "self");
          }
        }
      }
    } else {
      const [kind, id] = rowKey.split(":");
      if (kind === "node") {
        setNodeSelected(id, !selNodes.has(id));
      } else if (kind === "folder") {
        setFolderSelected(id, selFolders.has(id) ? null : "self");
      }
    }
    setLastSelectedKey(rowKey);
    return true;
  };

  const selectionTotal = selNodes.size + selFolders.size;

  const renderNodeRow = (
    node: (typeof filteredNodes)[number],
    depth: number,
  ): React.ReactNode => {
    const Icon = getKindIcon(node.kind);
    const isOpen = openNodeIds.includes(node.id);
    const rowKey = `node:${node.id}`;
    const isRenaming = renamingId === rowKey;
    const nodeTags = (node.tags ?? []) as string[];
    const arcanaLinkedNode =
      !!node.arcanaSync && hasArcanaKind(node.kind);
    const checked = isNodeSelected(node.id);
    return (
      <div
        key={node.id}
        data-guide="node-row"
        draggable={!isRenaming}
        onDragStart={(e) => {
          if (selectMode && checked) {
            setSidebarSelectionDrag(e);
          } else {
            setSidebarNodeDrag(e, { nodeId: node.id });
          }
          // Auto-collapse the mobile drawer so the user can drop the
          // node onto whatever is underneath (a map, the canvas, etc).
          // On desktop the sidebar isn't a drawer, so this is a no-op
          // visually — `setLibraryOpen(false)` only affects the Vaul
          // drawer's `open` state.
          if (isMobile) setLibraryOpen(false);
        }}
        onTouchStart={(e) => startRowTouch(e, node.id, node.title, rowKey)}
        onTouchMove={handleRowTouchMove}
        onTouchEnd={handleRowTouchEnd}
        onTouchCancel={handleRowTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpenMenuId(rowKey);
        }}
        style={depth > 0 ? { paddingLeft: `${depth * 12}px` } : undefined}
        className={cn(
          "group flex items-center gap-1 rounded-md hover:bg-accent/15 transition-colors",
          !isRenaming && "cursor-grab active:cursor-grabbing",
          isOpen && "bg-accent/10",
          checked && "bg-primary/10",
        )}
      >
        {selectMode && (
          <span className="pl-2 flex items-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => setNodeSelected(node.id, !!v)}
              aria-label={checked ? "Unselect node" : "Select node"}
              className="h-3.5 w-3.5"
            />
          </span>
        )}
        <span className="pl-1 text-muted-foreground/40 group-hover:text-muted-foreground/80 hidden md:block">
          <GripVertical className="w-3 h-3" />
        </span>
        {isRenaming ? (
          <div className="flex items-center gap-2 flex-1 px-2 h-8">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: node.color || "hsl(var(--primary))" }}
            />
            <NodeAvatar
              imageUrl={node.imageUrl}
              icon={Icon}
              iconClassName="w-3.5 h-3.5 opacity-60 flex-shrink-0"
              imgClassName="w-3.5 h-3.5 rounded-sm flex-shrink-0"
              alt={node.title}
            />
            <Input
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename("node", node.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename("node", node.id);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setRenamingId(null);
                }
              }}
              className="h-6 text-sm px-2 bg-background/60"
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            className={cn(
              "flex-1 justify-start text-sm h-auto min-h-8 py-1 px-2 font-normal hover:bg-transparent min-w-0",
              isOpen && "text-accent hover:text-accent",
            )}
            onClick={(e) => {
              if (handleRowSelectClick(e, rowKey)) return;
              setViewMode("windows");
              openInFocused(node.id);
              setLibraryOpen(false);
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full mr-2 flex-shrink-0"
              style={{ backgroundColor: node.color || "hsl(var(--primary))" }}
            />
            <NodeAvatar
              imageUrl={node.imageUrl}
              icon={Icon}
              iconClassName="w-3.5 h-3.5 mr-2 opacity-60 flex-shrink-0"
              imgClassName="w-3.5 h-3.5 mr-2 rounded-sm flex-shrink-0"
              alt={node.title}
            />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1">
                <span className="truncate flex-1">{node.title}</span>
                {(node as unknown as { isPrivate?: boolean }).isPrivate && (
                  <Lock
                    className="w-3 h-3 text-amber-500 flex-shrink-0"
                    aria-label="Private node"
                  />
                )}
                {node.key && (
                  <span
                    className="font-mono text-[10px] text-muted-foreground/70 flex-shrink-0"
                    title={`Key: ${node.key}`}
                  >
                    {node.key}
                  </span>
                )}
                {isOpen && <div className="w-1.5 h-1.5 rounded-full bg-accent ml-1 flex-shrink-0" />}
              </div>
              {nodeTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {nodeTags.map((tagId) => {
                    const tag = getTagOption(tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tagId}
                        className={cn(
                          "inline-flex items-center px-1.5 py-0 text-[9px] uppercase tracking-wider rounded border leading-tight",
                          tag.className,
                        )}
                      >
                        {tag.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </Button>
        )}
        <NodePresenceAvatars nodeId={node.id} />
        <NodeRowMenu
          open={openMenuId === rowKey}
          onOpenChange={(o) => setOpenMenuId(o ? rowKey : null)}
          canSplit={!!focusedPaneId}
          canEdit={canEdit}
          onOpenHere={() => {
            setOpenMenuId(null);
            setViewMode("windows");
            openInFocused(node.id);
            setLibraryOpen(false);
          }}
          onSplitRight={() => {
            setOpenMenuId(null);
            if (!focusedPaneId) return;
            setViewMode("windows");
            splitAtPane(focusedPaneId, "right", node.id);
            setLibraryOpen(false);
          }}
          onSplitDown={() => {
            setOpenMenuId(null);
            if (!focusedPaneId) return;
            setViewMode("windows");
            splitAtPane(focusedPaneId, "bottom", node.id);
            setLibraryOpen(false);
          }}
          onChangeKind={(k, c) => handleChangeKind(node.id, k, c)}
          currentKind={node.kind}
          currentTags={nodeTags}
          canDuplicateUnlinked={arcanaLinkedNode}
          onDuplicateUnlinked={() => handleDuplicateUnlinked(node.id)}
          onToggleTag={(tagId) => handleToggleTag(node.id, nodeTags, tagId)}
          moveDestinations={moveDestinations}
          currentFolderId={node.folderId ?? null}
          onMoveToFolder={(folderId) =>
            handleMoveNodeToFolder(node.id, folderId)
          }
          onRename={() => startRename(rowKey, node.title)}
          onDelete={() =>
            setConfirmTarget({ kind: "node", id: node.id, name: node.title })
          }
          onStartSelect={() => {
            setOpenMenuId(null);
            enterSelectMode(rowKey);
          }}
        />
      </div>
    );
  };

  const renderFolderTree = (
    parentId: string | null,
    depth: number,
  ): React.ReactNode => {
    const subfolders = foldersByParent.get(parentId) ?? [];
    const childNodes = nodesByFolder.get(parentId) ?? [];
    return (
      <>
        {subfolders.map((f) => {
          const expanded = expandedFolders.has(f.id);
          const rowKey = `folder:${f.id}`;
          const isRenaming = renamingId === rowKey;
          const fMode = folderSelMode(f.id);
          const fChecked = fMode != null;
          const fWithContents = fMode === "with-contents";
          return (
            <div key={`f:${f.id}`}>
              <div
                draggable={selectMode && fChecked && !isRenaming}
                onDragStart={(e) => {
                  if (selectMode && fChecked) {
                    setSidebarSelectionDrag(e);
                  }
                }}
                className={cn(
                  "group flex items-center gap-0.5 rounded-md hover:bg-accent/15 transition-colors",
                  fChecked && "bg-primary/10",
                )}
                style={depth > 0 ? { paddingLeft: `${depth * 12}px` } : undefined}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenMenuId(rowKey);
                }}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  if (!hasSidebarNodeDrag(e) && !hasSidebarSelectionDrag(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  if (!canEdit) return;
                  if (hasSidebarSelectionDrag(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                    void performBulkMove(activeRealmId!, f.id);
                    return;
                  }
                  const payload = getSidebarNodeDrag(e);
                  if (!payload?.nodeId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  handleMoveNodeToFolder(payload.nodeId, f.id);
                }}
              >
                {selectMode && (
                  <span
                    className="pl-1 flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={fChecked && !fWithContents ? true : fChecked && fWithContents ? "indeterminate" : false}
                      onCheckedChange={(v) => {
                        if (v) setFolderSelected(f.id, "self");
                        else if (fWithContents) toggleFolderWithContents(f.id, false);
                        else setFolderSelected(f.id, null);
                      }}
                      aria-label="Select folder only"
                      title="Select folder only"
                      className="h-3.5 w-3.5"
                    />
                    <Checkbox
                      checked={fWithContents}
                      onCheckedChange={(v) => toggleFolderWithContents(f.id, !!v)}
                      aria-label="Select folder and all contents"
                      title="Select folder and all contents"
                      className="h-3.5 w-3.5"
                    />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleFolderExpanded(f.id)}
                  className="ml-1 h-7 w-5 inline-flex items-center justify-center text-muted-foreground/60 hover:text-foreground"
                  aria-label={expanded ? "Collapse folder" : "Expand folder"}
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {isRenaming ? (
                  <div className="flex items-center gap-2 flex-1 px-1 h-8">
                    <FolderIcon className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                    <Input
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename("folder", f.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename("folder", f.id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenamingId(null);
                        }
                      }}
                      className="h-6 text-sm px-2 bg-background/60"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      if (handleRowSelectClick(e, rowKey)) return;
                      toggleFolderExpanded(f.id);
                    }}
                    className="flex items-center gap-2 flex-1 min-w-0 h-8 px-1 text-left text-sm font-medium"
                  >
                    <FolderIcon
                      className={cn(
                        "w-3.5 h-3.5 flex-shrink-0",
                        expanded ? "opacity-90 text-accent" : "opacity-70",
                      )}
                    />
                    <span className="truncate flex-1">{f.name}</span>
                  </button>
                )}
                {(canEdit || (isViewer && f.id === myFolderId)) && (
                  <FolderRowMenu
                    viewerOnly={!canEdit}
                    open={openMenuId === rowKey}
                    onOpenChange={(o) =>
                      setOpenMenuId(o ? rowKey : null)
                    }
                    onCreateNode={(anchor) => {
                      setOpenMenuId(null);
                      setNewNodeMenuOpen(false);
                      setKindPickerFolderId(f.id);
                      setKindPickerPos({ x: anchor.x, y: anchor.y });
                    }}
                    onNewSubfolder={() => openNewFolderDialog(f.id)}
                    onRename={() => startRename(rowKey, f.name)}
                    onDelete={() =>
                      setConfirmTarget({
                        kind: "folder",
                        id: f.id,
                        name: f.name,
                      })
                    }
                    onStartSelect={() => {
                      setOpenMenuId(null);
                      enterSelectMode(rowKey, false);
                    }}
                    onStartSelectWithContents={() => {
                      setOpenMenuId(null);
                      enterSelectMode(rowKey, true);
                    }}
                  />
                )}
              </div>
              {expanded && (
                <div className="space-y-0.5">
                  {renderFolderTree(f.id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
        {childNodes.map((n) => renderNodeRow(n, depth))}
      </>
    );
  };

  // ---- Bulk actions ------------------------------------------------------
  // Selection roots are items whose containing folder is NOT itself in the
  // selection. Acting on a root applies to the whole subtree it owns.
  const computeSelectionRoots = (): {
    folderRoots: string[];
    nodeRoots: string[];
  } => {
    const folderRoots: string[] = [];
    for (const fid of selFolders.keys()) {
      const f = folderById.get(fid);
      const parent = f?.parentFolderId ?? null;
      if (!parent || !selFolders.has(parent)) folderRoots.push(fid);
    }
    const nodeRoots: string[] = [];
    for (const nid of selNodes) {
      const n = nodes?.find((x) => x.id === nid);
      if (!n) continue;
      if (n.folderId && selFolders.has(n.folderId)) continue;
      nodeRoots.push(nid);
    }
    return { folderRoots, nodeRoots };
  };

  // Before acting on selected folders, rescue the immediate non-selected
  // children out by re-parenting them to the closest non-selected ancestor.
  // We only reparent direct children (not deeper descendants): a child's
  // own subtree stays attached via foreign key, preserving hierarchy.
  // This collapses the "folder-only" vs "folder + contents" distinction for
  // execution: per-item unchecks always win.
  const rescueExclusions = async () => {
    // Closest non-selected ancestor of `folderId`. Walks up the parent chain
    // through any selected folders.
    const destinationFor = (folderId: string): string | null => {
      let parentId = folderById.get(folderId)?.parentFolderId ?? null;
      while (parentId && selFolders.has(parentId)) {
        parentId = folderById.get(parentId)?.parentFolderId ?? null;
      }
      return parentId;
    };
    for (const fid of selFolders.keys()) {
      const dest = destinationFor(fid);
      const subfolders = foldersByParent.get(fid) ?? [];
      for (const sub of subfolders) {
        if (selFolders.has(sub.id)) continue;
        try {
          await updateFolder.mutateAsync({
            folderId: sub.id,
            data: { parentFolderId: dest },
          });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) throw err;
        }
      }
      const childNodes = (nodes ?? []).filter((n) => n.folderId === fid);
      for (const n of childNodes) {
        if (selNodes.has(n.id)) continue;
        try {
          await updateNode.mutateAsync({
            nodeId: n.id,
            data: { folderId: dest },
          });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) throw err;
        }
      }
    }
  };

  // Counts of items the user will actually affect, broken down by kind and
  // folder mode. Used by the delete confirmation dialog.
  const selectionCounts = (() => {
    const cascadedFolders = new Set<string>();
    const cascadedNodes = new Set<string>();
    for (const [fid, mode] of selFolders) {
      if (mode !== "with-contents") continue;
      const desc = folderDescendants(fid);
      for (const sub of desc.folders) cascadedFolders.add(sub);
      for (const nid of desc.nodes) cascadedNodes.add(nid);
    }
    let foldersSelf = 0;
    let foldersWithContents = 0;
    for (const [fid, mode] of selFolders) {
      if (cascadedFolders.has(fid)) continue;
      if (mode === "with-contents") foldersWithContents++;
      else foldersSelf++;
    }
    let nodesExplicit = 0;
    for (const nid of selNodes) {
      if (cascadedNodes.has(nid)) continue;
      const n = nodes?.find((x) => x.id === nid);
      if (n && n.folderId && cascadedFolders.has(n.folderId)) continue;
      nodesExplicit++;
    }
    return { foldersSelf, foldersWithContents, nodesExplicit };
  })();

  const performBulkDelete = async () => {
    if (!activeRealmId) return;
    setBulkBusy(true);
    try {
      const { folderRoots, nodeRoots } = computeSelectionRoots();

      // Rescue unchecked descendants out of selected folder roots BEFORE
      // we cascade-delete the roots. This honors per-item exclusions.
      await rescueExclusions();

      // Delete explicit node selections that aren't inside a folder root
      // (those go away with the folder cascade).
      for (const nid of nodeRoots) {
        try {
          await deleteNode.mutateAsync({ nodeId: nid });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) throw err;
        }
      }

      // Delete folder roots deepest-first.
      const folderDepth = (id: string): number => {
        let d = 0;
        let cur = folderById.get(id);
        while (cur && cur.parentFolderId) {
          d++;
          cur = folderById.get(cur.parentFolderId);
        }
        return d;
      };
      const sortedRoots = folderRoots
        .slice()
        .sort((a, b) => folderDepth(b) - folderDepth(a));
      for (const fid of sortedRoots) {
        try {
          await deleteFolder.mutateAsync({ folderId: fid });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) throw err;
        }
      }

      queryClient.invalidateQueries({
        queryKey: getListNodesQueryKey(activeRealmId),
      });
      queryClient.invalidateQueries({
        queryKey: getListFoldersQueryKey(activeRealmId),
      });
      toast.success(`Deleted ${selectionTotal} item${selectionTotal === 1 ? "" : "s"}`);
      setBulkDeleteOpen(false);
      exitSelectMode();
    } catch (err) {
      console.error("Bulk delete failed", err);
      toast.error("Bulk delete failed", {
        description: describeMutationError(err, "Some items could not be removed."),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const performBulkMove = async (
    targetRealmId: string,
    targetFolderId: string | null,
  ) => {
    if (!activeRealmId) return;
    setBulkBusy(true);
    try {
      const sourceRealmId = activeRealmId;
      const crossRealm = targetRealmId !== sourceRealmId;

      const { folderRoots, nodeRoots } = computeSelectionRoots();

      // Reject moving a folder into itself or its own subtree.
      if (targetFolderId) {
        const banned = new Set<string>();
        for (const fid of folderRoots) {
          banned.add(fid);
          for (const sub of folderDescendants(fid).folders) banned.add(sub);
        }
        if (banned.has(targetFolderId)) {
          toast.error("Can't move a folder into itself");
          setBulkBusy(false);
          return;
        }
      }

      // Rescue any unchecked descendants out of folder roots before the
      // root subtree is moved (otherwise the FK relationship would drag
      // them along).
      await rescueExclusions();

      for (const fid of folderRoots) {
        const data: { parentFolderId: string | null; realmId?: string } = {
          parentFolderId: targetFolderId,
        };
        if (crossRealm) data.realmId = targetRealmId;
        try {
          await updateFolder.mutateAsync({ folderId: fid, data });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) throw err;
        }
      }
      for (const nid of nodeRoots) {
        const data: { folderId: string | null; realmId?: string } = {
          folderId: targetFolderId,
        };
        if (crossRealm) data.realmId = targetRealmId;
        try {
          await updateNode.mutateAsync({ nodeId: nid, data });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) throw err;
        }
      }

      queryClient.invalidateQueries({
        queryKey: getListNodesQueryKey(sourceRealmId),
      });
      queryClient.invalidateQueries({
        queryKey: getListFoldersQueryKey(sourceRealmId),
      });
      if (crossRealm) {
        queryClient.invalidateQueries({
          queryKey: getListNodesQueryKey(targetRealmId),
        });
        queryClient.invalidateQueries({
          queryKey: getListFoldersQueryKey(targetRealmId),
        });
      }
      if (targetFolderId && !crossRealm) {
        setExpandedFolders((prev) => {
          const set = new Set(prev);
          set.add(targetFolderId);
          if (activeRealmId) saveExpandedFolders(activeRealmId, set);
          return set;
        });
      }
      toast.success(`Moved ${selectionTotal} item${selectionTotal === 1 ? "" : "s"}`);
      setBulkMoveOpen(false);
      exitSelectMode();
    } catch (err) {
      console.error("Bulk move failed", err);
      toast.error("Bulk move failed", {
        description: describeMutationError(err, "Some items could not be moved."),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const performMassRename = async () => {
    if (!activeRealmId) return;
    const base = massRenameBase.trim();
    if (!base) {
      toast.error("Please enter a base name");
      return;
    }
    setBulkBusy(true);
    try {
      let i = 0;
      for (const key of selOrder) {
        const newName = i === 0 ? base : `${base}_${i}`;
        i++;
        const [kind, id] = key.split(":");
        try {
          if (kind === "node") {
            await updateNode.mutateAsync({ nodeId: id, data: { title: newName } });
          } else if (kind === "folder") {
            await updateFolder.mutateAsync({ folderId: id, data: { name: newName } });
          }
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) throw err;
        }
      }
      queryClient.invalidateQueries({
        queryKey: getListNodesQueryKey(activeRealmId),
      });
      queryClient.invalidateQueries({
        queryKey: getListFoldersQueryKey(activeRealmId),
      });
      toast.success(`Renamed ${selectionTotal} item${selectionTotal === 1 ? "" : "s"}`);
      setMassRenameOpen(false);
      setMassRenameBase("");
      exitSelectMode();
    } catch (err) {
      console.error("Mass rename failed", err);
      toast.error("Mass rename failed", {
        description: describeMutationError(err, "Some items could not be renamed."),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  // Desktop collapsed state: render a slim rail instead of the full sidebar.
  // The mobile drawer is unaffected — on mobile we always render the full
  // panel so the drawer toggle keeps working even if collapse was set on
  // a previous desktop session.
  if (effLibraryCollapsed && !isMobile) {
    return (
      <div className="hidden md:flex w-9 shrink-0 flex-col items-center py-2 bg-sidebar/80 border-r border-sidebar-border safe-pl">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Expand library"
          aria-label="Expand library"
          onClick={() => setEffLibraryCollapsed(false)}
        >
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  const panelInner = (
    <>
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1 min-w-0">
              {!embedded && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  title="Back to menu"
                  aria-label="Back to menu"
                  data-testid="button-canvasrealms-back"
                  onClick={() => setLocation("/")}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <h2 className="text-xs font-bold text-sidebar-foreground/50 uppercase tracking-wider">
                Realms
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                data-guide="new-realm"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={openNewRealmDialog}
                disabled={createRealm.isPending}
                title="New realm"
              >
                {createRealm.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 md:hidden"
                onClick={() => setLibraryOpen(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hidden md:inline-flex"
                title="Collapse library"
                aria-label="Collapse library"
                onClick={() => setEffLibraryCollapsed(true)}
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {realms && realms.length === 0 && (
            <div className="rounded-md border border-dashed border-sidebar-border/70 px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">
                You don't have any realms yet.
              </p>
              <Button
                data-guide="new-realm-empty"
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={openNewRealmDialog}
                disabled={createRealm.isPending}
              >
                {createRealm.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Create your first realm
              </Button>
            </div>
          )}
          <div className="space-y-1">
            {realms?.map((realm) => {
              const rowKey = `realm:${realm.id}`;
              const isActive = realm.id === activeRealmId;
              const isRenaming = renamingId === rowKey;
              return (
                <div
                  key={realm.id}
                  data-guide="realm-row"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setOpenMenuId(rowKey);
                  }}
                  onTouchStart={() => startLongPress(rowKey)}
                  onTouchMove={cancelLongPress}
                  onTouchEnd={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                  className={cn(
                    "group relative flex items-center rounded-md transition-colors",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-accent/15 text-sidebar-foreground",
                  )}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-2 w-full px-3 h-9">
                      <Globe className="w-4 h-4 opacity-70 flex-shrink-0" />
                      <Input
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => commitRename("realm", realm.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename("realm", realm.id);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setRenamingId(null);
                          }
                        }}
                        className="h-7 text-sm px-2 bg-background/60"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLocation(`/app/realm/${realm.id}`)}
                      className="flex-1 flex items-center font-medium h-9 text-sm px-3 text-left min-w-0"
                    >
                      <Globe className="w-4 h-4 mr-2 opacity-70 flex-shrink-0" />
                      <span className="truncate">{realm.name}</span>
                      {(realm as unknown as { campaignShared?: boolean })
                        .campaignShared && (
                        <span
                          data-testid={`badge-shared-realm-${realm.id}`}
                          title="Shared by your GM — view only"
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-500 ring-1 ring-amber-500/30 flex-shrink-0"
                        >
                          <Lock className="w-2.5 h-2.5" />
                          <span className="whitespace-nowrap">
                            Shared · view only
                          </span>
                        </span>
                      )}
                    </button>
                  )}
                  {isActive && (isOwner || isEditor || isViewer) && (
                    <RealmRowMenu
                      open={openMenuId === rowKey}
                      onOpenChange={(o) => setOpenMenuId(o ? rowKey : null)}
                      isOwner={isOwner}
                      onShare={() => {
                        setOpenMenuId(null);
                        setShareDialogRealmId(realm.id);
                      }}
                      onRename={() => startRename(rowKey, realm.name)}
                      onDelete={() =>
                        setConfirmTarget({ kind: "realm", id: realm.id, name: realm.name })
                      }
                      arcanaLinked={!!(realm as unknown as { arcanaLinked?: boolean }).arcanaLinked}
                      onArcanaSync={() => {
                        setOpenMenuId(null);
                        setArcanaDialogRealmId(realm.id);
                      }}
                      onLinkCampaign={() => {
                        setOpenMenuId(null);
                        setCampaignLinkRealmId(realm.id);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {activeRealmId && (
          <>
            <div className="p-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search nodes..."
                    className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:border-primary"
                  />
                </div>
                <DropdownMenu open={kindFilterOpen} onOpenChange={setKindFilterOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-9 w-9 flex-shrink-0 bg-muted/50 hover:bg-muted relative",
                        kindFilter && "text-primary",
                      )}
                      aria-label={
                        activeKindMeta
                          ? `Filter: ${activeKindMeta.label}`
                          : "Filter by kind"
                      }
                      title={
                        activeKindMeta
                          ? `Filter: ${activeKindMeta.label}`
                          : "Filter by kind"
                      }
                    >
                      <Shapes className="w-4 h-4" />
                      {activeKindMeta && (
                        <span
                          className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ring-1 ring-background"
                          style={{ backgroundColor: activeKindMeta.color }}
                        />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-60 max-h-[70dvh] overflow-y-auto"
                  >
                    <DropdownMenuItem
                      onClick={() => setKindFilter(null)}
                      className="gap-2"
                    >
                      <Shapes className="w-3.5 h-3.5 opacity-70" />
                      <span className="flex-1">All kinds</span>
                      {kindFilter === null && (
                        <Check className="w-3.5 h-3.5 opacity-70" />
                      )}
                    </DropdownMenuItem>
                    {availableKinds.size === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground italic">
                        No nodes yet.
                      </div>
                    ) : (
                      KIND_CATEGORIES.map((cat) => {
                        const kindsInRealm = cat.kinds.filter((k) =>
                          availableKinds.has(k.kind),
                        );
                        if (kindsInRealm.length === 0) return null;
                        return (
                          <div key={cat.id} className="py-1">
                            <DropdownMenuSeparator />
                            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                              {cat.label}
                            </div>
                            {kindsInRealm.map((opt) => {
                              const Icon = opt.icon;
                              const count = availableKinds.get(opt.kind) ?? 0;
                              const selected = kindFilter === opt.kind;
                              return (
                                <DropdownMenuItem
                                  key={`${cat.id}:${opt.kind}`}
                                  onClick={() => setKindFilter(opt.kind)}
                                  className="gap-2"
                                >
                                  <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: opt.color }}
                                  />
                                  <Icon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                                  <span className="flex-1 truncate">{opt.label}</span>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {count}
                                  </span>
                                  {selected && (
                                    <Check className="w-3.5 h-3.5 opacity-70" />
                                  )}
                                </DropdownMenuItem>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {canEdit && (
                  <div className="relative" ref={newNodeMenuRef}>
                    <Button
                      data-guide="new-node"
                      variant="default"
                      size="icon"
                      className="h-9 w-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 flex-shrink-0"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setNewNodeMenuAnchor({ left: r.left, top: r.bottom + 4 });
                        setNewNodeMenuOpen((v) => !v);
                      }}
                      disabled={createNode.isPending}
                      aria-label="Create new node"
                      title="Create new node"
                    >
                      {createNode.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </Button>
                    {newNodeMenuOpen && newNodeMenuAnchor && createPortal(
                      <div
                        ref={newNodeMenuPortalRef}
                        role="menu"
                        aria-label="Create new node"
                        className="fixed w-60 max-w-[calc(100vw-1rem)] max-h-[70dvh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-2xl py-1 z-[100] pointer-events-auto"
                        style={{
                          left: Math.max(
                            8,
                            Math.min(
                              newNodeMenuAnchor.left,
                              (typeof window !== "undefined" ? window.innerWidth : 0) - 248,
                            ),
                          ),
                          top: Math.max(
                            8,
                            Math.min(
                              newNodeMenuAnchor.top,
                              (typeof window !== "undefined" ? window.innerHeight : 0) - 320,
                            ),
                          ),
                        }}
                      >
                        <div className="flex items-center justify-end px-2 py-0.5 border-b border-border/60 mb-0.5">
                          <button
                            type="button"
                            onClick={toggleAllCategories}
                            aria-label={
                              allCategoriesExpanded
                                ? "Collapse all categories"
                                : "Expand all categories"
                            }
                            aria-expanded={allCategoriesExpanded}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground hover:bg-accent/30 font-semibold rounded-sm"
                          >
                            {allCategoriesExpanded ? (
                              <ChevronsDownUp className="w-3 h-3" />
                            ) : (
                              <ChevronsUpDown className="w-3 h-3" />
                            )}
                            <span>
                              {allCategoriesExpanded ? "Collapse all" : "Expand all"}
                            </span>
                          </button>
                        </div>
                        {KIND_CATEGORIES.map((cat) => {
                          const fromArcana = cat.id === ARCANA_CATEGORY_ID;
                          const expanded = expandedCategories.has(cat.id);
                          return (
                            <div key={cat.id} className="py-0.5">
                              <button
                                type="button"
                                data-guide={`new-node-category-${cat.id}`}
                                onClick={() => toggleCategory(cat.id)}
                                aria-expanded={expanded}
                                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground hover:bg-accent/30 font-semibold rounded-sm"
                              >
                                {expanded ? (
                                  <ChevronDown className="w-3 h-3" />
                                ) : (
                                  <ChevronRight className="w-3 h-3" />
                                )}
                                <span className="flex-1 text-left truncate">
                                  {cat.label}
                                </span>
                                <span className="text-muted-foreground/50 normal-case tracking-normal text-[10px]">
                                  {cat.kinds.length}
                                </span>
                              </button>
                              {expanded &&
                                cat.kinds.map((opt) => {
                                  const Icon = opt.icon;
                                  return (
                                    <button
                                      key={`${cat.id}:${opt.kind}`}
                                      type="button"
                                      data-guide={`new-node-kind-${opt.kind}`}
                                      onClick={() => handleNewNode(opt, fromArcana)}
                                      className="w-full flex items-center gap-2 pl-7 pr-3 py-1.5 text-sm hover:bg-accent/40 text-left"
                                    >
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                                      <Icon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                                      <span className="truncate">{opt.label}</span>
                                    </button>
                                  );
                                })}
                            </div>
                          );
                        })}
                      </div>,
                      document.body,
                    )}
                  </div>
                )}
              </div>

              {summary && (
                <div className="flex gap-2 mt-4 text-xs text-muted-foreground">
                  <span className="bg-muted px-2 py-0.5 rounded-sm">
                    {summary.nodeCount} Nodes
                  </span>
                  <span className="bg-muted px-2 py-0.5 rounded-sm">
                    {summary.relationshipCount} Links
                  </span>
                </div>
              )}
            </div>

            <ScrollArea
              className="flex-1 p-3"
              onContextMenu={handleLibraryContextMenu}
              onTouchStart={handleLibraryTouchStart}
              onTouchMove={cancelEmptyLongPress}
              onTouchEnd={cancelEmptyLongPress}
              onTouchCancel={cancelEmptyLongPress}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-xs font-bold text-sidebar-foreground/50 uppercase tracking-wider">
                  Library
                </h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openNewFolderDialog(null)}
                    title="New folder"
                    aria-label="New folder"
                    className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-accent/30 transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {selectMode && canEdit && (
                <div className="mb-2 px-1.5 py-1 rounded-md border border-primary/30 bg-primary/10 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="font-medium flex-1 truncate">
                      {selectionTotal} selected
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      title="Exit select mode"
                      onClick={exitSelectMode}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      title="Move"
                      disabled={selectionTotal === 0 || bulkBusy}
                      onClick={() => setBulkMoveOpen(true)}
                    >
                      <MoveRight className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      title="Mass rename"
                      disabled={selectionTotal === 0 || bulkBusy}
                      onClick={() => {
                        setMassRenameBase("");
                        setMassRenameOpen(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0 text-destructive hover:text-destructive"
                      title="Delete"
                      disabled={selectionTotal === 0 || bulkBusy}
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              {(realms?.find((r) => r.id === activeRealmId) as unknown as { arcanaLinked?: boolean })?.arcanaLinked && (
                <button
                  type="button"
                  onClick={() => setLocation(`/app/realm/${activeRealmId}/library`)}
                  className="w-full flex items-center gap-2 h-8 px-2 mb-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-accent/20 hover:text-foreground transition-colors"
                  title="Arcana library"
                >
                  <BookMarked className="w-4 h-4 opacity-70" />
                  <span>Arcana Library</span>
                </button>
              )}
              <p className="text-[10px] text-muted-foreground/70 px-1 mb-2 hidden md:block">
                Click to open · drag onto a pane to split
              </p>
              {filteredNodes.length === 0 && folderList.length === 0 && (
                <div className="text-sm text-muted-foreground italic px-1">No nodes found.</div>
              )}
              {isFiltering ? (
                <div className="space-y-0.5">
                  {filteredNodes.map((node) => renderNodeRow(node, 0))}
                </div>
              ) : (
                <div
                  className="space-y-0.5"
                  onDragOver={(e) => {
                    if (!canEdit) return;
                    if (!hasSidebarNodeDrag(e) && !hasSidebarSelectionDrag(e)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    if (!canEdit) return;
                    if (hasSidebarSelectionDrag(e)) {
                      e.preventDefault();
                      void performBulkMove(activeRealmId!, null);
                      return;
                    }
                    const payload = getSidebarNodeDrag(e);
                    if (!payload?.nodeId) return;
                    e.preventDefault();
                    handleMoveNodeToFolder(payload.nodeId, null);
                  }}
                >
                  {renderFolderTree(null, 0)}
                </div>
              )}
            </ScrollArea>
          </>
        )}
        <SidebarResizeHandle
          edge="right"
          current={libraryWidth}
          min={LIBRARY_MIN_WIDTH}
          max={LIBRARY_MAX_WIDTH}
          onResize={setLibraryWidth}
          hideBelow="md"
          disabled={newNodeMenuOpen || !!kindPickerPos}
        />
    </>
  );

  return (
    <>
      {isMobile ? (
        <VaulDrawer.Root
          direction="left"
          open={isLibraryOpen}
          onOpenChange={setLibraryOpen}
        >
          <VaulDrawer.Portal>
            <VaulDrawer.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
            <VaulDrawer.Content
              data-guide="library-panel"
              style={{ "--reborn-lib-w": `${libraryWidth}px` } as React.CSSProperties}
              className="fixed inset-0 z-50 w-full max-w-none flex flex-col bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border shadow-2xl shadow-black/20 safe-pl outline-none"
            >
              <VaulDrawer.Title className="sr-only">Library</VaulDrawer.Title>
              <VaulDrawer.Description className="sr-only">
                Browse your realms, folders, and nodes.
              </VaulDrawer.Description>
              {panelInner}
            </VaulDrawer.Content>
          </VaulDrawer.Portal>
        </VaulDrawer.Root>
      ) : (
        <div
          data-guide="library-panel"
          style={{ "--reborn-lib-w": `${libraryWidth}px` } as React.CSSProperties}
          className="w-[var(--reborn-lib-w)] flex flex-col bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border h-full shadow-2xl shadow-black/20 safe-pl relative"
        >
          {panelInner}
        </div>
      )}

      <Dialog
        open={newRealmOpen}
        onOpenChange={(o) => {
          if (createRealm.isPending) return;
          setNewRealmOpen(o);
          if (!o) {
            setNewRealmName("");
            setNewRealmError(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Name your realm</DialogTitle>
            <DialogDescription>
              Give this realm a title. You can rename it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={newRealmName}
              onChange={(e) => {
                setNewRealmName(e.target.value);
                if (newRealmError) setNewRealmError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNewRealm();
                }
              }}
              placeholder="Realm name"
              aria-invalid={!!newRealmError}
            />
            {newRealmError && (
              <p className="text-xs text-destructive">{newRealmError}</p>
            )}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-muted-foreground">
                Game system
              </label>
              <Select
                value={newRealmSystem}
                onValueChange={(v) => setNewRealmSystem(v)}
              >
                <SelectTrigger data-testid="select-realm-system">
                  <SelectValue placeholder="Select a system" />
                </SelectTrigger>
                <SelectContent>
                  {ARCANA_SYSTEM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Controls which stat sheets characters, items, and other game
                objects use in this realm.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNewRealmOpen(false)}
              disabled={createRealm.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitNewRealm} disabled={createRealm.isPending}>
              {createRealm.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : null}
              Create realm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newFolderOpen}
        onOpenChange={(o) => {
          if (createFolder.isPending) return;
          setNewFolderOpen(o);
          if (!o) {
            setNewFolderName("");
            setNewFolderParentId(null);
            setNewFolderError(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {newFolderParentId
                ? "Name your subfolder"
                : "Name your folder"}
            </DialogTitle>
            <DialogDescription>
              {newFolderParentId
                ? `This folder will be created inside "${
                    folders?.find((f) => f.id === newFolderParentId)?.name ??
                    "the selected folder"
                  }".`
                : "Folders help you organize nodes in the sidebar. You can move nodes into them later."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value);
                if (newFolderError) setNewFolderError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNewFolder();
                }
              }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Folder name"
              aria-invalid={!!newFolderError}
            />
            {newFolderError && (
              <p className="text-xs text-destructive">{newFolderError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNewFolderOpen(false)}
              disabled={createFolder.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitNewFolder} disabled={createFolder.isPending}>
              {createFolder.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : null}
              Create folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {confirmTarget?.kind === "realm"
                ? "realm"
                : confirmTarget?.kind === "folder"
                  ? "folder"
                  : "node"}
              ?
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.kind === "realm"
                ? `"${confirmTarget?.name}" and every node, link, and viewport inside it will be permanently removed.`
                : confirmTarget?.kind === "folder"
                  ? `"${confirmTarget?.name}" and any subfolders will be removed. Nodes inside will return to the library root.`
                  : `"${confirmTarget?.name}" will be permanently removed from this realm.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => !bulkBusy && setBulkDeleteOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selectionTotal} item{selectionTotal === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <div>This will remove:</div>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {selectionCounts.nodesExplicit > 0 && (
                    <li>
                      {selectionCounts.nodesExplicit} node
                      {selectionCounts.nodesExplicit === 1 ? "" : "s"}
                    </li>
                  )}
                  {selectionCounts.foldersSelf > 0 && (
                    <li>
                      {selectionCounts.foldersSelf} folder
                      {selectionCounts.foldersSelf === 1 ? "" : "s"} (folder
                      only — non-selected children move up one level)
                    </li>
                  )}
                  {selectionCounts.foldersWithContents > 0 && (
                    <li>
                      {selectionCounts.foldersWithContents} folder
                      {selectionCounts.foldersWithContents === 1 ? "" : "s"}{" "}
                      with contents (everything still selected inside is
                      deleted; anything you unchecked is moved up one level
                      first)
                    </li>
                  )}
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkBusy}
              onClick={() => void performBulkDelete()}
            >
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bulkMoveOpen && activeRealmId && (
        <BulkMoveDialog
          open={bulkMoveOpen}
          onOpenChange={(o) => !bulkBusy && setBulkMoveOpen(o)}
          sourceRealmId={activeRealmId}
          realms={realms ?? []}
          excludedFolderIds={(() => {
            const banned = new Set<string>();
            for (const fid of selFolders.keys()) {
              banned.add(fid);
              for (const sub of folderDescendants(fid).folders) banned.add(sub);
            }
            return banned;
          })()}
          busy={bulkBusy}
          onConfirm={(targetRealmId, targetFolderId) =>
            performBulkMove(targetRealmId, targetFolderId)
          }
          selectionTotal={selectionTotal}
        />
      )}

      <Dialog open={massRenameOpen} onOpenChange={(o) => !bulkBusy && setMassRenameOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {selectionTotal} item{selectionTotal === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Items will be renamed in selection order: <code>name</code>, <code>name_1</code>, <code>name_2</code>…
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Input
              autoFocus
              value={massRenameBase}
              placeholder="Base name"
              onChange={(e) => setMassRenameBase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !bulkBusy) {
                  e.preventDefault();
                  void performMassRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => setMassRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={bulkBusy || !massRenameBase.trim()}
              onClick={() => void performMassRename()}
            >
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {arcanaDialogRealmId && (
        <ArcanaSettingsDialog
          realmId={arcanaDialogRealmId}
          open={!!arcanaDialogRealmId}
          onOpenChange={(o) => {
            if (!o) setArcanaDialogRealmId(null);
          }}
        />
      )}

      {campaignLinkRealmId && (
        <CampaignLinkDialog
          realmId={campaignLinkRealmId}
          open={!!campaignLinkRealmId}
          onOpenChange={(o) => {
            if (!o) setCampaignLinkRealmId(null);
          }}
        />
      )}

      {kindPickerPos && (canEdit || isViewer) && activeRealmId && createPortal(
        <div
          ref={kindPickerRef}
          role="menu"
          aria-label="Create new node"
          onContextMenu={(e) => e.preventDefault()}
          className="fixed w-60 max-h-[70dvh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-2xl py-1 z-[100] pointer-events-auto"
          style={{
            left: Math.max(0, Math.min(kindPickerPos.x, (typeof window !== "undefined" ? window.innerWidth : 0) - 248)),
            top: Math.max(0, Math.min(kindPickerPos.y, (typeof window !== "undefined" ? window.innerHeight : 0) - 320)),
          }}
        >
          <div className="flex items-center justify-end px-2 py-0.5 border-b border-border/60 mb-0.5">
            <button
              type="button"
              onClick={toggleAllCategories}
              aria-label={
                allCategoriesExpanded
                  ? "Collapse all categories"
                  : "Expand all categories"
              }
              aria-expanded={allCategoriesExpanded}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground hover:bg-accent/30 font-semibold rounded-sm"
            >
              {allCategoriesExpanded ? (
                <ChevronsDownUp className="w-3 h-3" />
              ) : (
                <ChevronsUpDown className="w-3 h-3" />
              )}
              <span>
                {allCategoriesExpanded ? "Collapse all" : "Expand all"}
              </span>
            </button>
          </div>
          {KIND_CATEGORIES.map((cat) => {
            const fromArcana = cat.id === ARCANA_CATEGORY_ID;
            const expanded = expandedCategories.has(cat.id);
            return (
              <div key={cat.id} className="py-0.5">
                <button
                  type="button"
                  data-guide={`new-node-category-${cat.id}`}
                  onClick={() => toggleCategory(cat.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground hover:bg-accent/30 font-semibold rounded-sm"
                >
                  {expanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <span className="flex-1 text-left truncate">{cat.label}</span>
                  <span className="text-muted-foreground/50 normal-case tracking-normal text-[10px]">
                    {cat.kinds.length}
                  </span>
                </button>
                {expanded &&
                  cat.kinds.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={`${cat.id}:${opt.kind}`}
                        type="button"
                        onClick={() => handleNewNode(opt, fromArcana)}
                        className="w-full flex items-center gap-2 pl-7 pr-3 py-1.5 text-sm hover:bg-accent/40 text-left"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                        <Icon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>,
        document.body,
      )}

      {shareDialogRealmId && (() => {
        const r = realms?.find((x) => x.id === shareDialogRealmId);
        if (!r) return null;
        return (
          <ShareDialog
            open={!!shareDialogRealmId}
            onOpenChange={(o) => {
              if (!o) setShareDialogRealmId(null);
            }}
            realmId={shareDialogRealmId}
            realmName={r.name}
            isOwner={isOwner}
          />
        );
      })()}
    </>
  );
}

function CampaignLinkDialog({
  realmId,
  open,
  onOpenChange,
}: {
  realmId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const NONE = "__none__";

  type CampaignLink = {
    linkedCampaignId: string | null;
    campaigns: { id: string; name: string }[];
  };
  const { data, isLoading } = useQuery<CampaignLink>({
    queryKey: ["cr-campaign-link", realmId],
    queryFn: () =>
      customFetch<CampaignLink>(`/api/realms/${realmId}/campaign-link`, {
        responseType: "json",
      }),
    enabled: open && !!realmId,
  });

  const [selected, setSelected] = useState<string>(NONE);
  useEffect(() => {
    if (data) setSelected(data.linkedCampaignId ?? NONE);
  }, [data]);

  const save = useMutation({
    mutationFn: (campaignId: string | null) =>
      customFetch(`/api/realms/${realmId}/campaign-link`, {
        method: "PUT",
        body: JSON.stringify({ campaignId }),
        responseType: "json",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cr-campaign-link", realmId] });
      queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
      toast.success("Campaign link updated");
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to update link");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link realm to a campaign</DialogTitle>
          <DialogDescription>
            Linking shares this realm read-only with every member of the chosen
            campaign. They'll see it in their realm list.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data?.campaigns ?? []).length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">
            You don't run any campaigns to link this realm to.
          </div>
        ) : (
          <div className="py-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not linked</SelectItem>
                {(data?.campaigns ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || isLoading}
            onClick={() => save.mutate(selected === NONE ? null : selected)}
          >
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RealmRowMenu({
  open,
  onOpenChange,
  isOwner,
  onShare,
  onRename,
  onDelete,
  arcanaLinked,
  onArcanaSync,
  onLinkCampaign,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isOwner: boolean;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
  arcanaLinked: boolean;
  onArcanaSync: () => void;
  onLinkCampaign: () => void;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Realm menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "mr-1 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60",
            "hover:text-foreground hover:bg-accent/30 transition-opacity",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onShare}>
          <Share2 className="w-3.5 h-3.5 mr-2 opacity-70" />
          {isOwner ? "Share realm" : "Members"}
        </DropdownMenuItem>
        {isOwner && (
          <>
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="w-3.5 h-3.5 mr-2 opacity-70" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArcanaSync}>
              {arcanaLinked ? (
                <Unlink className="w-3.5 h-3.5 mr-2 opacity-70" />
              ) : (
                <Link2 className="w-3.5 h-3.5 mr-2 opacity-70" />
              )}
              {arcanaLinked ? "Arcana sync (linked)" : "Connect Arcana sync"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onLinkCampaign}>
              <Users className="w-3.5 h-3.5 mr-2 opacity-70" /> Link to campaign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2 opacity-70" /> Delete realm
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkMoveDialog({
  open,
  onOpenChange,
  sourceRealmId,
  realms,
  excludedFolderIds,
  busy,
  onConfirm,
  selectionTotal,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sourceRealmId: string;
  realms: { id: string; name: string }[];
  excludedFolderIds: Set<string>;
  busy: boolean;
  onConfirm: (targetRealmId: string, targetFolderId: string | null) => void;
  selectionTotal: number;
}) {
  const [targetRealmId, setTargetRealmId] = useState<string>(sourceRealmId);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  useEffect(() => {
    setTargetFolderId(null);
  }, [targetRealmId]);

  const { data: targetFolders } = useListFolders(targetRealmId, {
    query: {
      enabled: !!targetRealmId,
      queryKey: getListFoldersQueryKey(targetRealmId),
    },
  });

  const folderOptions: { id: string; path: string }[] = (() => {
    const list = targetFolders ?? [];
    const byParent = new Map<string | null, typeof list>();
    for (const f of list) {
      const arr = byParent.get(f.parentFolderId ?? null) ?? [];
      arr.push(f);
      byParent.set(f.parentFolderId ?? null, arr);
    }
    const out: { id: string; path: string }[] = [];
    const walk = (parentId: string | null, prefix: string) => {
      const subs = (byParent.get(parentId) ?? []).slice().sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const f of subs) {
        const path = prefix ? `${prefix} / ${f.name}` : f.name;
        const isExcluded =
          targetRealmId === sourceRealmId && excludedFolderIds.has(f.id);
        if (!isExcluded) out.push({ id: f.id, path });
        walk(f.id, path);
      }
    };
    walk(null, "");
    return out;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Move {selectionTotal} item{selectionTotal === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Pick a destination realm and folder.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Realm</label>
            <Select value={targetRealmId} onValueChange={setTargetRealmId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {realms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.id === sourceRealmId ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Folder</label>
            <Select
              value={targetFolderId ?? "__root__"}
              onValueChange={(v) =>
                setTargetFolderId(v === "__root__" ? null : v)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[40dvh]">
                <SelectItem value="__root__">Library root</SelectItem>
                {folderOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => onConfirm(targetRealmId, targetFolderId)}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NodeRowMenu({
  open,
  onOpenChange,
  canSplit,
  canEdit,
  onOpenHere,
  onSplitRight,
  onSplitDown,
  onChangeKind,
  currentKind,
  currentTags,
  canDuplicateUnlinked,
  onDuplicateUnlinked,
  onToggleTag,
  moveDestinations,
  currentFolderId,
  onMoveToFolder,
  onRename,
  onDelete,
  onStartSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canSplit: boolean;
  canEdit: boolean;
  onOpenHere: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onChangeKind: (kind: NodeKind, color: string) => void;
  currentKind: string;
  currentTags: readonly string[];
  canDuplicateUnlinked: boolean;
  onDuplicateUnlinked: () => void;
  onToggleTag: (tagId: string) => void;
  moveDestinations: { id: string; path: string }[];
  currentFolderId: string | null;
  onMoveToFolder: (folderId: string | null) => void;
  onRename: () => void;
  onDelete: () => void;
  onStartSelect: () => void;
}) {
  const tagSet = new Set(currentTags);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Node menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "mr-1 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60",
            "hover:text-foreground hover:bg-accent/30 transition-opacity",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onOpenHere}>
          <Maximize className="w-3.5 h-3.5 mr-2 opacity-70" /> Open here
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSplitRight} disabled={!canSplit}>
          <ColumnsIcon className="w-3.5 h-3.5 mr-2 opacity-70" /> Split right
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSplitDown} disabled={!canSplit}>
          <RowsIcon className="w-3.5 h-3.5 mr-2 opacity-70" /> Split down
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Shapes className="w-3.5 h-3.5 mr-2 opacity-70" /> Change kind
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 max-h-[60dvh] overflow-y-auto">
                {KIND_CATEGORIES.map((cat, idx) => (
                  <div key={cat.id}>
                    {idx > 0 && <DropdownMenuSeparator />}
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                      {cat.label}
                    </div>
                    {cat.kinds.map((opt) => {
                      const Icon = opt.icon;
                      const isCurrent = opt.kind === currentKind;
                      return (
                        <DropdownMenuItem
                          key={`${cat.id}:${opt.kind}`}
                          onSelect={() => onChangeKind(opt.kind as NodeKind, opt.color)}
                          className={cn(isCurrent && "bg-accent/30")}
                        >
                          <span
                            className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                            style={{ backgroundColor: opt.color }}
                          />
                          <Icon className="w-3.5 h-3.5 mr-2 opacity-70" />
                          {opt.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tag className="w-3.5 h-3.5 mr-2 opacity-70" /> Tags
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44 max-h-[60dvh] overflow-y-auto">
                {TAG_OPTIONS.map((tag) => {
                  const active = tagSet.has(tag.id);
                  return (
                    <DropdownMenuItem
                      key={tag.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        onToggleTag(tag.id);
                      }}
                      className={cn(active && "bg-accent/30")}
                    >
                      <span
                        className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1">{tag.label}</span>
                      {active && <Check className="w-3.5 h-3.5 ml-2 opacity-80" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="w-3.5 h-3.5 mr-2 opacity-70" /> Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 max-h-[60dvh] overflow-y-auto">
                <DropdownMenuItem
                  onSelect={() => onMoveToFolder(null)}
                  className={cn(currentFolderId === null && "bg-accent/30")}
                >
                  <FolderMinus className="w-3.5 h-3.5 mr-2 opacity-70" />
                  <span className="flex-1">Library root</span>
                  {currentFolderId === null && (
                    <Check className="w-3.5 h-3.5 ml-2 opacity-80" />
                  )}
                </DropdownMenuItem>
                {moveDestinations.length > 0 && <DropdownMenuSeparator />}
                {moveDestinations.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground italic">
                    No folders yet.
                  </div>
                ) : (
                  moveDestinations.map((dest) => {
                    const active = currentFolderId === dest.id;
                    return (
                      <DropdownMenuItem
                        key={dest.id}
                        onSelect={() => onMoveToFolder(dest.id)}
                        className={cn(active && "bg-accent/30")}
                      >
                        <FolderIcon className="w-3.5 h-3.5 mr-2 opacity-70 flex-shrink-0" />
                        <span className="flex-1 truncate">{dest.path}</span>
                        {active && (
                          <Check className="w-3.5 h-3.5 ml-2 opacity-80" />
                        )}
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {canDuplicateUnlinked && (
              <DropdownMenuItem onSelect={onDuplicateUnlinked}>
                <Copy className="w-3.5 h-3.5 mr-2 opacity-70" /> Duplicate unlinked
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="w-3.5 h-3.5 mr-2 opacity-70" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onStartSelect}>
              <CheckSquare className="w-3.5 h-3.5 mr-2 opacity-70" /> Select
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2 opacity-70" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderRowMenu({
  open,
  onOpenChange,
  onCreateNode,
  onNewSubfolder,
  onRename,
  onDelete,
  onStartSelect,
  onStartSelectWithContents,
  viewerOnly = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreateNode: (anchor: { x: number; y: number }) => void;
  onNewSubfolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onStartSelect: () => void;
  onStartSelectWithContents: () => void;
  // A plain viewer (player) authoring in their own personal folder only gets the
  // "Create node" action — no rename/delete/subfolder/select.
  viewerOnly?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Folder menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "mr-1 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60",
            "hover:text-foreground hover:bg-accent/30 transition-opacity",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onSelect={() => {
            const rect = triggerRef.current?.getBoundingClientRect();
            const anchor = rect
              ? { x: rect.left, y: rect.bottom }
              : { x: 0, y: 0 };
            onCreateNode(anchor);
          }}
        >
          <Plus className="w-3.5 h-3.5 mr-2 opacity-70" /> Create node
        </DropdownMenuItem>
        {!viewerOnly && (
          <>
            <DropdownMenuItem onSelect={onNewSubfolder}>
              <FolderPlus className="w-3.5 h-3.5 mr-2 opacity-70" /> New subfolder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="w-3.5 h-3.5 mr-2 opacity-70" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onStartSelect}>
              <CheckSquare className="w-3.5 h-3.5 mr-2 opacity-70" /> Select folder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onStartSelectWithContents}>
              <ListChecks className="w-3.5 h-3.5 mr-2 opacity-70" /> Select with contents
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2 opacity-70" /> Delete folder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
