import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  Node,
  NodeBlock,
  useUpdateNode,
  useListNodes,
  useCreateNode,
  getGetNodeQueryKey,
  getListNodesQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import {
  Bold,
  Italic,
  Heading2,
  Link as LinkIcon,
  List,
  Code,
  Sparkles,
  Loader2,
  Check,
  X,
  ImagePlus,
  LayoutGrid,
  Map as MapIcon,
  Type as TypeIcon,
  Trash2,
  Upload,
  ExternalLink,
  Plus,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  History as HistoryIcon,
  Maximize2,
  Minimize2,
  Undo2,
  Redo2,
} from "lucide-react";
import { useAppStore } from "@cr/lib/store";
import { useRealmRole } from "@cr/lib/useRealmRole";
import { Button } from "@cr/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import {
  useNodeBlockYText,
  useRealtime,
  useFieldPresence,
  usePeersInBlock,
} from "@cr/lib/realtime";
import { bindYTextToTextarea } from "@cr/lib/yTextarea";
import { useAutoGrowTextarea } from "@cr/lib/useAutoGrowTextarea";
import { scanForMentions } from "@cr/lib/mentionScan";
import {
  MentionSuggestionsStrip,
  APPLY_MENTION_EVENT,
  APPLY_MENTIONS_BATCH_EVENT,
  type AggregatedSuggestion,
  type ApplyMentionDetail,
  type ApplyMentionsBatchDetail,
} from "@cr/components/workspace/MentionSuggestionsStrip";
import { getCaretCoordinates, getSelectionRects } from "@cr/lib/textareaCaret";
import type { PresenceFieldPeer } from "@cr/lib/realtime";
import { ArcanaStatsSection } from "@cr/components/arcana/ArcanaStatsSection";
import { uploadImage, objectUrl } from "@cr/lib/uploadImage";
import { toast } from "sonner";
import { registerPaneShortcuts, notePaneActive } from "@cr/lib/paneShortcuts";

interface Props {
  node: Node;
  paneId: string;
  autoFocusTitle?: boolean;
  onConsumeAutoFocus?: () => void;
  isFocusedPane?: boolean;
  onClosePane?: () => void;
}

type CompassAction = "expand" | "rewrite" | "continue" | "custom";

type BlockSize = "small" | "medium" | "full";

type LocalBlock =
  | { id: string; type: "text"; text: string; heading?: string }
  | { id: string; type: "media"; url: string; alt?: string; size?: BlockSize }
  | { id: string; type: "map-ref"; nodeId: string; size?: BlockSize }
  | { id: string; type: "canvas-ref"; nodeId: string; size?: BlockSize };

type ActiveBlockSelection = {
  blockId: string;
  start: number;
  end: number;
  text: string;
};

function makeBlockId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Initialize the in-memory block list for an editor mount.
 *  - Use node.blocks if any exist.
 *  - Otherwise migrate node.content into a single text block (so legacy
 *    nodes still display their markdown body in the new editor).
 *  - Otherwise start empty.
 */
function initBlocks(node: Node): LocalBlock[] {
  const fromServer = (node.blocks ?? []) as LocalBlock[];
  if (fromServer.length > 0) {
    return fromServer.map((b) => ({ ...b }));
  }
  if (node.content && node.content.trim().length > 0) {
    return [{ id: "legacy", type: "text", text: node.content }];
  }
  return [];
}

function blocksEqual(a: LocalBlock[], b: LocalBlock[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id || x.type !== y.type) return false;
    if (x.type === "text" && y.type === "text") {
      if (x.text !== y.text) return false;
      if ((x.heading ?? "") !== (y.heading ?? "")) return false;
    }
    if (x.type === "media" && y.type === "media") {
      if (x.url !== y.url || (x.alt ?? "") !== (y.alt ?? "")) return false;
      if ((x.size ?? "full") !== (y.size ?? "full")) return false;
    }
    if (
      (x.type === "map-ref" || x.type === "canvas-ref") &&
      (y.type === "map-ref" || y.type === "canvas-ref")
    ) {
      if (x.nodeId !== y.nodeId) return false;
      if ((x.size ?? "full") !== (y.size ?? "full")) return false;
    }
  }
  return true;
}

export function DocumentEditor({ node, paneId, autoFocusTitle, onConsumeAutoFocus, isFocusedPane, onClosePane }: Props) {
  const id = node.id;
  const {
    activeRealmId,
    focusedNodeIdFullscreen,
    toggleFocusedNode,
    pendingMatch,
    consumePendingMatch,
  } = useAppStore();
  const isNodeFocused = focusedNodeIdFullscreen === id;
  const { canEdit } = useRealmRole(activeRealmId);
  const readOnly = !canEdit;
  const updateNode = useUpdateNode();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(node.title);
  const [nodeKey, setNodeKey] = useState(node.key);
  const [imageUrl, setImageUrl] = useState<string | null>(node.imageUrl ?? null);
  const [blocks, setBlocks] = useState<LocalBlock[]>(() => initBlocks(node));
  const [tagDraft, setTagDraft] = useState("");
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  // Ref to the editor's vertical scroll container so we can preserve the
  // user's scroll position when a text block transitions between its
  // parsed-prose ("not focused") and textarea ("focused") renderings.
  // Without this, the small height delta between the two states (the
  // edit-mode toolbar appearing/disappearing, slightly different inline
  // wrapping of [[key]] link buttons, the per-block Refs row, etc.) can
  // shift the viewport — and on long nodes the browser's scroll-anchoring
  // sometimes snaps all the way to the top. We bracket every
  // focus/blur-driven `setFocusedBlockId` call by recording scrollTop
  // synchronously, letting React commit the layout change, then restoring
  // the saved value on the next two animation frames (the second frame
  // catches the late-resize from `useAutoGrowTextarea`'s layout effect).
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const setFocusedBlockIdKeepScroll = useCallback(
    (updater: React.SetStateAction<string | null>) => {
      const c = scrollContainerRef.current;
      const saved = c ? c.scrollTop : 0;
      setFocusedBlockId(updater);
      if (c) {
        requestAnimationFrame(() => {
          c.scrollTop = saved;
          requestAnimationFrame(() => {
            c.scrollTop = saved;
          });
        });
      }
    },
    [],
  );
  // Per-block collapsed override for text blocks with headings. When a block
  // id is absent here, we fall back to the default policy: collapsed when
  // the editor is read-only and the block has a heading. The user can flip
  // either default with the chevron toggle on the heading row.
  const [collapseOverride, setCollapseOverride] = useState<
    Map<string, boolean>
  >(() => new Map());
  const isBlockCollapsed = useCallback(
    (block: LocalBlock): boolean => {
      if (block.type !== "text") return false;
      const override = collapseOverride.get(block.id);
      if (override !== undefined) return override;
      const hasHeading = (block.heading ?? "").trim().length > 0;
      return readOnly && hasHeading;
    },
    [collapseOverride, readOnly],
  );
  const toggleBlockCollapsed = useCallback(
    (block: LocalBlock) => {
      if (block.type !== "text") return;
      const current = isBlockCollapsed(block);
      setCollapseOverride((prev) => {
        const next = new Map(prev);
        next.set(block.id, !current);
        return next;
      });
    },
    [isBlockCollapsed],
  );
  const [activeSelection, setActiveSelection] =
    useState<ActiveBlockSelection | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const initializedForId = useRef<string | null>(null);
  const lastSaved = useRef({
    title: node.title,
    key: node.key,
    imageUrl: node.imageUrl ?? null,
    blocks: initBlocks(node),
    content: node.content,
  });
  const mutateFnRef = useRef(updateNode.mutate);
  mutateFnRef.current = updateNode.mutate;

  // Keep the latest local-state values in a ref so the re-sync effect below
  // can read them without re-running on every keystroke.
  const localStateRef = useRef({ title, nodeKey, imageUrl, blocks });
  localStateRef.current = { title, nodeKey, imageUrl, blocks };

  useEffect(() => {
    if (initializedForId.current !== id) {
      initializedForId.current = id;
      setTitle(node.title);
      setNodeKey(node.key);
      setImageUrl(node.imageUrl ?? null);
      const initial = initBlocks(node);
      setBlocks(initial);
      lastSaved.current = {
        title: node.title,
        key: node.key,
        imageUrl: node.imageUrl ?? null,
        blocks: initial,
        content: node.content,
      };
      setFocusedBlockId(null);
      setActiveSelection(null);
      return;
    }
    // Same id, but upstream node data changed (e.g. another pane showing the
    // same node just saved, or a key-rename cascade rewrote `[[OLDKEY]]`
    // references inside blocks). Re-sync ONLY the body (blocks/content),
    // and only when local blocks are clean — we never re-sync title / key /
    // imageUrl from upstream after the initial load.
    //
    // The debounced save updates `lastSaved.current` optimistically before
    // the server response lands, so a refetch that arrives in the gap can
    // return the pre-save title and cause the visible title input to flip
    // between the user's new name and the placeholder default (e.g.
    // "Cithall" <-> "New Settlement"). Title / key / imageUrl are purely
    // user-driven through the local inputs, so we let the local state be
    // the source of truth.
    const cur = localStateRef.current;
    const last = lastSaved.current;
    const blocksDirty = !blocksEqual(cur.blocks, last.blocks);
    if (blocksDirty) return;
    const fresh = initBlocks(node);
    if (blocksEqual(fresh, cur.blocks)) return;
    setBlocks(fresh);
    lastSaved.current = {
      ...lastSaved.current,
      blocks: fresh,
      content: node.content,
    };
  }, [id, node.content, node.blocks, node]);

  // Auto-focus the title field when the pane was just created via the
  // "create + open" flow. Selects the placeholder title text so the user
  // can immediately type to replace it.
  useEffect(() => {
    if (!autoFocusTitle || readOnly) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.select();
    } catch {
      // ignore
    }
    onConsumeAutoFocus?.();
  }, [autoFocusTitle, readOnly, id, onConsumeAutoFocus]);

  // Urgent-save trigger: bump this counter to flush the next render's state
  // to the server immediately, bypassing the 500ms debounce. Used after
  // image uploads so the new objectPath isn't lost if the user navigates
  // away (or unmounts mid-upload) before the debounce timer would fire.
  const [urgentSaveTick, setUrgentSaveTick] = useState(0);
  const bumpUrgentSave = useCallback(() => {
    setUrgentSaveTick((t) => t + 1);
  }, []);

  const patchLocal = useCallback(
    (updated: Node) => {
      queryClient.setQueryData(getGetNodeQueryKey(id), updated);
      if (activeRealmId) {
        queryClient.setQueryData(
          getListNodesQueryKey(activeRealmId),
          (old: Node[] | undefined) =>
            old?.map((n) => (n.id === id ? updated : n)),
        );
      }
    },
    [id, queryClient, activeRealmId],
  );

  // Handle key conflict / empty errors from the server: pop a toast and
  // revert the input to the last successfully-saved value.
  const handleKeyError = useCallback((err: unknown) => {
    const code =
      err instanceof ApiError &&
      err.data &&
      typeof err.data === "object" &&
      "code" in err.data
        ? (err.data as { code?: unknown }).code
        : undefined;
    if (code === "key_conflict") {
      toast.error("That key is already used by another node");
    } else if (code === "key_empty") {
      toast.error("Key can't be empty");
    } else {
      toast.error("Couldn't save key");
    }
    setNodeKey(lastSaved.current.key);
  }, []);

  // Debounced persistence of title / imageUrl / blocks. The `key` field is
  // saved in its own dedicated PATCH below so a key_conflict / key_empty
  // response can never reject (and silently drop) edits to other fields.
  useEffect(() => {
    if (initializedForId.current !== id) return;
    if (readOnly) return;
    const timer = setTimeout(() => {
      const last = lastSaved.current;
      const titleChanged = title !== last.title;
      const imageChanged = (imageUrl ?? null) !== (last.imageUrl ?? null);
      const blocksChanged = !blocksEqual(blocks, last.blocks);
      if (!titleChanged && !imageChanged && !blocksChanged) return;
      const data: Partial<Node> = {};
      if (titleChanged) data.title = title;
      if (imageChanged) data.imageUrl = imageUrl;
      if (blocksChanged) {
        data.blocks = blocks;
        // Once the new editor has saved a block list, the legacy `content`
        // field is superseded. Clear it so the next mount doesn't re-migrate
        // the same text into a duplicate block.
        if (last.content && last.content.length > 0) {
          data.content = "";
        }
      }
      mutateFnRef.current(
        { nodeId: id, data },
        { onSuccess: patchLocal },
      );
      lastSaved.current = {
        ...lastSaved.current,
        title,
        imageUrl,
        blocks: blocks.map((b) => ({ ...b })),
        content: blocksChanged ? "" : last.content,
      };
    }, 500);
    return () => clearTimeout(timer);
  }, [title, imageUrl, blocks, id, readOnly, patchLocal]);

  // Urgent flush: runs whenever bumpUrgentSave() is called. Saves the
  // current state synchronously (no debounce) so freshly-uploaded image
  // URLs are persisted before the user can navigate away.
  useEffect(() => {
    if (urgentSaveTick === 0) return;
    if (initializedForId.current !== id) return;
    if (readOnly) return;
    const last = lastSaved.current;
    const titleChanged = title !== last.title;
    const imageChanged = (imageUrl ?? null) !== (last.imageUrl ?? null);
    const blocksChanged = !blocksEqual(blocks, last.blocks);
    if (!titleChanged && !imageChanged && !blocksChanged) return;
    const data: Partial<Node> = {};
    if (titleChanged) data.title = title;
    if (imageChanged) data.imageUrl = imageUrl;
    if (blocksChanged) {
      data.blocks = blocks;
      if (last.content && last.content.length > 0) data.content = "";
    }
    mutateFnRef.current(
      { nodeId: id, data },
      { onSuccess: patchLocal },
    );
    lastSaved.current = {
      ...lastSaved.current,
      title,
      imageUrl,
      blocks: blocks.map((b) => ({ ...b })),
      content: blocksChanged ? "" : last.content,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgentSaveTick]);

  // Dedicated debounced save for the `key` field. Kept separate so a
  // server-side key_conflict / key_empty error reverts only the key input
  // and never drops in-flight edits to title / blocks / image.
  useEffect(() => {
    if (initializedForId.current !== id) return;
    if (readOnly) return;
    if (nodeKey === lastSaved.current.key) return;
    const timer = setTimeout(() => {
      const attemptedKey = nodeKey;
      mutateFnRef.current(
        { nodeId: id, data: { key: attemptedKey } },
        {
          onSuccess: (updated) => {
            lastSaved.current = { ...lastSaved.current, key: attemptedKey };
            patchLocal(updated);
          },
          onError: handleKeyError,
        },
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [nodeKey, id, readOnly, patchLocal, handleKeyError]);

  // Flush on unmount / id change
  useEffect(() => {
    return () => {
      if (readOnly) return;
      const last = lastSaved.current;
      const titleChanged = title !== last.title;
      const keyChanged = nodeKey !== last.key;
      const imageChanged = (imageUrl ?? null) !== (last.imageUrl ?? null);
      const blocksChanged = !blocksEqual(blocks, last.blocks);
      if (titleChanged || imageChanged || blocksChanged) {
        const data: Partial<Node> = {};
        if (titleChanged) data.title = title;
        if (imageChanged) data.imageUrl = imageUrl;
        if (blocksChanged) {
          data.blocks = blocks;
          if (last.content && last.content.length > 0) data.content = "";
        }
        mutateFnRef.current({ nodeId: id, data });
      }
      // Flush key as a separate PATCH so a key conflict can't drop the
      // other field updates above.
      if (keyChanged) {
        mutateFnRef.current({ nodeId: id, data: { key: nodeKey } });
      }
    };
  }, [id, title, nodeKey, imageUrl, blocks, readOnly]);

  // ----- Tag management ------------------------------------------------
  const commitTag = () => {
    const t = tagDraft.trim().replace(/^#+/, "");
    if (!t) return;
    const next = Array.from(new Set([...(node.tags ?? []), t]));
    mutateFnRef.current({ nodeId: id, data: { tags: next } }, { onSuccess: patchLocal });
    setTagDraft("");
  };

  const removeTag = (t: string) => {
    const next = (node.tags ?? []).filter((x) => x !== t);
    mutateFnRef.current({ nodeId: id, data: { tags: next } }, { onSuccess: patchLocal });
  };

  // ----- Block-level undo / redo history -------------------------------
  // We snapshot the `blocks` array before each structural mutation (add /
  // remove / move / reorder). Per-character text edits inside a block live
  // inside Y.Text and are covered by the browser's native textarea undo,
  // so we deliberately do NOT track every keystroke here — only the
  // structural shape of the document.
  const HISTORY_LIMIT = 50;
  const blocksHistoryRef = useRef<{
    past: LocalBlock[][];
    future: LocalBlock[][];
  }>({ past: [], future: [] });
  // Mirror of history lengths kept in React state so the chrome
  // Undo/Redo buttons can reactively enable/disable.
  const [blocksHistoryLens, setBlocksHistoryLens] = useState({
    past: 0,
    future: 0,
  });
  const syncBlocksHistoryLens = useCallback(() => {
    const h = blocksHistoryRef.current;
    setBlocksHistoryLens((prev) =>
      prev.past === h.past.length && prev.future === h.future.length
        ? prev
        : { past: h.past.length, future: h.future.length },
    );
  }, []);
  const blocksRef = useRef<LocalBlock[]>(blocks);
  blocksRef.current = blocks;
  // Reset history when the editor switches to a different node.
  const historyKeyRef = useRef<string>(id);
  useEffect(() => {
    if (historyKeyRef.current !== id) {
      historyKeyRef.current = id;
      blocksHistoryRef.current = { past: [], future: [] };
      syncBlocksHistoryLens();
    }
  }, [id, syncBlocksHistoryLens]);
  const cloneBlocks = (bs: LocalBlock[]): LocalBlock[] =>
    bs.map((b) => ({ ...b }));
  const pushBlocksSnapshot = useCallback(() => {
    const h = blocksHistoryRef.current;
    const past = [...h.past, cloneBlocks(blocksRef.current)];
    while (past.length > HISTORY_LIMIT) past.shift();
    blocksHistoryRef.current = { past, future: [] };
    syncBlocksHistoryLens();
  }, [syncBlocksHistoryLens]);

  // ----- Block ops -----------------------------------------------------
  const addBlock = (type: LocalBlock["type"]) => {
    const blockId = makeBlockId();
    let block: LocalBlock;
    if (type === "text") block = { id: blockId, type: "text", text: "" };
    else if (type === "media") block = { id: blockId, type: "media", url: "" };
    else if (type === "map-ref") block = { id: blockId, type: "map-ref", nodeId: "" };
    else block = { id: blockId, type: "canvas-ref", nodeId: "" };
    pushBlocksSnapshot();
    setBlocks((prev) => [...prev, block]);
    setFocusedBlockId(blockId);
  };

  const updateBlock = useCallback((blockId: string, patch: Partial<LocalBlock>) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? ({ ...b, ...patch } as LocalBlock) : b,
      ),
    );
  }, []);

  const removeBlock = (blockId: string) => {
    pushBlocksSnapshot();
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    setFocusedBlockId((cur) => (cur === blockId ? null : cur));
    setActiveSelection((cur) => (cur && cur.blockId === blockId ? null : cur));
  };

  const moveBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === blockId);
        if (idx === -1) return prev;
        const target = idx + direction;
        if (target < 0 || target >= prev.length) return prev;
        pushBlocksSnapshot();
        const next = prev.slice();
        const [moved] = next.splice(idx, 1);
        next.splice(target, 0, moved!);
        return next;
      });
    },
    [pushBlocksSnapshot],
  );

  const reorderBlock = useCallback(
    (fromId: string, toId: string, position: "before" | "after") => {
      if (fromId === toId) return;
      setBlocks((prev) => {
        const from = prev.findIndex((b) => b.id === fromId);
        const to = prev.findIndex((b) => b.id === toId);
        if (from === -1 || to === -1) return prev;
        pushBlocksSnapshot();
        const next = prev.slice();
        const [moved] = next.splice(from, 1);
        const targetIdx = next.findIndex((b) => b.id === toId);
        const insertAt = position === "before" ? targetIdx : targetIdx + 1;
        next.splice(insertAt, 0, moved!);
        return next;
      });
    },
    [pushBlocksSnapshot],
  );

  // Register undo/redo with the per-pane shortcut registry so the global
  // Cmd/Ctrl+Z handler routes here when this pane is focused/last-active.
  const undoBlocks = useCallback(() => {
    const h = blocksHistoryRef.current;
    if (h.past.length === 0) return;
    const prev = h.past[h.past.length - 1]!;
    const cur = cloneBlocks(blocksRef.current);
    blocksHistoryRef.current = {
      past: h.past.slice(0, -1),
      future: [...h.future, cur],
    };
    syncBlocksHistoryLens();
    setBlocks(prev);
    setFocusedBlockId(null);
    setActiveSelection(null);
  }, [syncBlocksHistoryLens]);
  const redoBlocks = useCallback(() => {
    const h = blocksHistoryRef.current;
    if (h.future.length === 0) return;
    const next = h.future[h.future.length - 1]!;
    const cur = cloneBlocks(blocksRef.current);
    blocksHistoryRef.current = {
      past: [...h.past, cur],
      future: h.future.slice(0, -1),
    };
    syncBlocksHistoryLens();
    setBlocks(next);
    setFocusedBlockId(null);
    setActiveSelection(null);
  }, [syncBlocksHistoryLens]);
  useEffect(() => {
    return registerPaneShortcuts(paneId, { undo: undoBlocks, redo: redoBlocks });
  }, [paneId, undoBlocks, redoBlocks]);

  // Mark this document pane as the last-active pane on mount so the
  // global Cmd/Ctrl+Z handler can route to us even in fullscreen focus
  // mode (where the pane tree's `focusedPaneId` is unset). Pointer-down
  // interactions inside the editor also refresh this.
  useEffect(() => {
    notePaneActive(paneId);
  }, [paneId]);

  // ----- Compass (scoped to focused text block) -----------------------
  const focusedTextBlock = useMemo(
    () =>
      blocks.find(
        (b): b is Extract<LocalBlock, { type: "text" }> =>
          b.id === focusedBlockId && b.type === "text",
      ) ?? null,
    [blocks, focusedBlockId],
  );

  // ----- Pending search-match (jump-to-phrase, all occurrences) --------
  // When the user picks a content-search hit from the palette, the store
  // sets `pendingMatch`. We compute ALL occurrences of the phrase across
  // every text block so the editor can:
  //   - highlight each match in-line (overlay rects on the textarea),
  //   - select the "current" one in its textarea (browser handles scroll),
  //   - let the user step prev/next with on-screen chevrons, F3 / Shift+F3.
  const matchesByBlock = useMemo(() => {
    const byBlock = new Map<string, Array<{ start: number; end: number }>>();
    const flat: Array<{ blockId: string; start: number; end: number }> = [];
    let headingFallback: { blockId: string } | null = null;
    if (!pendingMatch || pendingMatch.nodeId !== id) {
      return { byBlock, flat, headingFallback };
    }
    const q = pendingMatch.query.toLowerCase();
    if (!q) return { byBlock, flat, headingFallback };
    for (const b of blocks) {
      if (b.type !== "text") continue;
      const lower = b.text.toLowerCase();
      const arr: Array<{ start: number; end: number }> = [];
      let from = 0;
      // Find every non-overlapping occurrence in this block. A zero-length
      // step (impossible since `q` is non-empty here) would loop forever,
      // so the step is at minimum 1.
      while (from <= lower.length) {
        const idx = lower.indexOf(q, from);
        if (idx < 0) break;
        arr.push({ start: idx, end: idx + pendingMatch.query.length });
        from = idx + Math.max(1, pendingMatch.query.length);
      }
      if (arr.length > 0) {
        byBlock.set(b.id, arr);
        for (const r of arr) flat.push({ blockId: b.id, ...r });
      } else if (
        !headingFallback &&
        b.heading &&
        b.heading.toLowerCase().includes(q)
      ) {
        headingFallback = { blockId: b.id };
      }
    }
    return { byBlock, flat, headingFallback };
  }, [pendingMatch, id, blocks]);

  // Which match in `matchesByBlock.flat` the user is currently sitting on.
  // Reset to 0 whenever the search intent changes (new phrase or new node).
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [pendingMatch?.nodeId, pendingMatch?.query]);
  // If the user edits the text and removes the trailing match(es), clamp.
  useEffect(() => {
    const total = matchesByBlock.flat.length;
    if (total > 0 && currentMatchIdx >= total) setCurrentMatchIdx(0);
  }, [matchesByBlock.flat.length, currentMatchIdx]);

  // Track which block (if any) should flash to draw the eye to the match.
  // Cleared after a short delay so the highlight is transient.
  const [flashBlockId, setFlashBlockId] = useState<string | null>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Scroll + flash the current match's block whenever the active match
  // changes (initial landing, prev/next nav, or pendingMatch identity).
  // Deliberately NOT keyed on `matchesByBlock` content so typing inside a
  // textarea doesn't re-scroll on every keystroke; we just look up the
  // current target via a ref at fire time.
  const flatMatchesRef = useRef(matchesByBlock.flat);
  flatMatchesRef.current = matchesByBlock.flat;
  useEffect(() => {
    if (!pendingMatch || pendingMatch.nodeId !== id) return;
    const flat = flatMatchesRef.current;
    if (flat.length === 0) return;
    const idx = Math.min(currentMatchIdx, flat.length - 1);
    const m = flat[idx]!;
    const el = blockRefs.current.get(m.blockId);
    if (el) {
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        el.scrollIntoView();
      }
    }
    setFocusedBlockId(m.blockId);
    setFlashBlockId(m.blockId);
    const t = window.setTimeout(() => setFlashBlockId(null), 1600);
    return () => window.clearTimeout(t);
  }, [pendingMatch?.nodeId, pendingMatch?.query, currentMatchIdx, id]);

  // Heading-only / no-match handling: if there are no body matches but the
  // phrase appears in a block heading, scroll+flash that block and consume
  // the intent (no body offsets to step through). If nothing matched at
  // all (e.g. the body has since been edited), just consume so it doesn't
  // linger in store state.
  useEffect(() => {
    if (!pendingMatch || pendingMatch.nodeId !== id) return;
    if (matchesByBlock.flat.length > 0) return;
    if (matchesByBlock.headingFallback) {
      const bId = matchesByBlock.headingFallback.blockId;
      const el = blockRefs.current.get(bId);
      if (el) {
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          el.scrollIntoView();
        }
      }
      setFocusedBlockId(bId);
      setFlashBlockId(bId);
      consumePendingMatch(id);
      const t = window.setTimeout(() => setFlashBlockId(null), 1600);
      return () => window.clearTimeout(t);
    }
    consumePendingMatch(id);
    return undefined;
  }, [pendingMatch, id, matchesByBlock, consumePendingMatch]);

  // F3 / Shift+F3 step through matches while the search intent is active.
  // Enter is deliberately not bound — it would clash with newlines inside
  // the textarea the user is reading.
  useEffect(() => {
    if (!pendingMatch || pendingMatch.nodeId !== id) return;
    const total = matchesByBlock.flat.length;
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F3") return;
      e.preventDefault();
      setCurrentMatchIdx((i) =>
        e.shiftKey ? (i - 1 + total) % total : (i + 1) % total,
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingMatch, id, matchesByBlock.flat.length]);

  const goPrevMatch = useCallback(() => {
    const total = flatMatchesRef.current.length;
    if (total === 0) return;
    setCurrentMatchIdx((i) => (i - 1 + total) % total);
  }, []);
  const goNextMatch = useCallback(() => {
    const total = flatMatchesRef.current.length;
    if (total === 0) return;
    setCurrentMatchIdx((i) => (i + 1) % total);
  }, []);
  const dismissMatches = useCallback(() => {
    consumePendingMatch(id);
  }, [consumePendingMatch, id]);

  const currentMatch =
    matchesByBlock.flat.length > 0
      ? matchesByBlock.flat[
          Math.min(currentMatchIdx, matchesByBlock.flat.length - 1)
        ]!
      : null;
  // Nonce that changes only when the active match changes (or query
  // changes). Passed to TextBlock so it can refocus + select the textarea
  // on navigation without re-firing on every keystroke.
  const selectNonce = `${pendingMatch?.query ?? ""}|${currentMatchIdx}`;

  // Honor a selection only when it belongs to the focused text block AND its
  // recorded text still matches the current block contents at those offsets.
  // This guards against the user (or a remote peer) editing the surrounding
  // text after highlighting.
  const compassSelection = useMemo(() => {
    if (!focusedTextBlock || !activeSelection) return null;
    if (activeSelection.blockId !== focusedTextBlock.id) return null;
    const t = focusedTextBlock.text;
    if (
      activeSelection.end <= t.length &&
      t.slice(activeSelection.start, activeSelection.end) === activeSelection.text
    ) {
      return activeSelection;
    }
    return null;
  }, [focusedTextBlock, activeSelection]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto"
      onPointerDownCapture={() => notePaneActive(paneId)}
    >
      <div className="relative mx-auto my-4 w-full max-w-3xl px-2">
        <div className="absolute top-1 right-3 z-30 flex items-center gap-1">
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  undoBlocks();
                }}
                disabled={blocksHistoryLens.past === 0}
                title="Undo (Cmd/Ctrl+Z)"
                aria-label="Undo"
                className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  redoBlocks();
                }}
                disabled={blocksHistoryLens.future === 0}
                title="Redo (Cmd/Ctrl+Shift+Z)"
                aria-label="Redo"
                className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFocusedNode(id);
            }}
            title={isNodeFocused ? "Exit focus mode" : "Focus mode"}
            aria-label={isNodeFocused ? "Exit focus mode" : "Focus mode"}
            className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {isNodeFocused ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toast.info("Edit history is coming soon");
            }}
            title="Edit history"
            aria-label="Edit history"
            className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
          </button>
          {onClosePane && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClosePane();
              }}
              title="Close pane"
              aria-label="Close pane"
              className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      <div
        className={`rounded-lg border border-border bg-card shadow-md overflow-hidden flex flex-col ${
          isFocusedPane ? "ring-1 ring-primary/40" : ""
        }`}
      >
      {/* Header: title (left) + tags + image portrait (right) */}
      <div className="px-4 pt-7 pb-2 border-b border-border bg-muted/10">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <input
              ref={titleInputRef}
              className="w-full bg-transparent border-none focus:ring-0 outline-none text-xl font-semibold tracking-tight text-foreground placeholder:text-foreground/30"
              value={title}
              placeholder="Untitled"
              onChange={(e) => setTitle(e.target.value)}
              readOnly={readOnly}
            />
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <span className="uppercase tracking-wider">Key</span>
              <input
                className="font-mono bg-transparent border-b border-transparent hover:border-border focus:border-primary/60 focus:ring-0 outline-none px-1 py-0.5 text-[11px] text-foreground/80 w-32"
                value={nodeKey}
                placeholder="key"
                spellCheck={false}
                onChange={(e) => setNodeKey(e.target.value)}
                readOnly={readOnly}
                title="Unique handle for this node within the realm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(node.tags ?? []).map((tag) =>
                readOnly ? (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                  >
                    #{tag}
                  </span>
                ) : (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="group px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-destructive/20 hover:text-destructive transition-colors"
                    title="Click to remove"
                  >
                    #{tag}
                    <span className="ml-1 opacity-0 group-hover:opacity-100">×</span>
                  </button>
                ),
              )}
              {!readOnly && (
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitTag();
                    }
                  }}
                  onBlur={commitTag}
                  placeholder="+ tag"
                  className="bg-transparent border-none focus:ring-0 outline-none text-xs text-muted-foreground placeholder:text-muted-foreground/60 w-16 min-w-0"
                />
              )}
            </div>
          </div>
          <PortraitInput
            value={imageUrl}
            onChange={(v) => {
              setImageUrl(v);
              // Flush immediately on upload so the URL isn't lost if the
              // user navigates away before the debounce timer fires.
              if (v && v.startsWith("/objects/")) bumpUrgentSave();
            }}
            readOnly={readOnly}
          />
        </div>
      </div>

      {/* Compass auto-link suggestions: scan every text block for the
          titles of other nodes in this realm and offer one-tap link
          conversions. Always-on, no AI call required — purely local
          string matching against the realm's node list. */}
      <CompassMentionSuggestionsForEditor
        nodeId={id}
        blocks={blocks}
        realmId={activeRealmId}
        readOnly={readOnly}
      />

      {/* Body: vertical block stack + Add field row.
          The whole editor is itself a centered paper card, so no
          inner max-width wrapper is needed here. */}
      <div className="px-6 py-6 space-y-5">
        {blocks.map((block, idx) => (
          <BlockShell
            key={block.id}
            readOnly={readOnly}
            blockId={block.id}
            blockType={block.type}
            blockSize={
              block.type === "text" ? "full" : (block.size ?? "full")
            }
            canMoveUp={idx > 0}
            canMoveDown={idx < blocks.length - 1}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            onReorder={reorderBlock}
            onRemove={() => removeBlock(block.id)}
            shellRef={(el) => {
              if (el) blockRefs.current.set(block.id, el);
              else blockRefs.current.delete(block.id);
            }}
            flash={flashBlockId === block.id}
          >
            {block.type === "text" && (
              <TextBlock
                nodeId={id}
                block={block}
                readOnly={readOnly}
                isFocused={focusedBlockId === block.id}
                collapsed={isBlockCollapsed(block)}
                onToggleCollapsed={() => toggleBlockCollapsed(block)}
                onFocus={() => setFocusedBlockIdKeepScroll(block.id)}
                onBlur={() =>
                  setFocusedBlockIdKeepScroll((cur) =>
                    cur === block.id ? null : cur,
                  )
                }
                onChangeText={(text) => updateBlock(block.id, { text })}
                onChangeHeading={(heading) =>
                  updateBlock(block.id, { heading })
                }
                onSelectionChange={(sel) => setActiveSelection(sel)}
                highlightMatches={matchesByBlock.byBlock.get(block.id) ?? null}
                currentHighlightRange={
                  currentMatch && currentMatch.blockId === block.id
                    ? { start: currentMatch.start, end: currentMatch.end }
                    : null
                }
                selectRange={
                  currentMatch && currentMatch.blockId === block.id
                    ? {
                        start: currentMatch.start,
                        end: currentMatch.end,
                        nonce: selectNonce,
                      }
                    : null
                }
              />
            )}
            {block.type === "media" && (
              <MediaBlock
                block={block}
                readOnly={readOnly}
                onChange={(patch) => {
                  updateBlock(block.id, patch);
                  // Flush immediately when a new image URL is set so the
                  // upload isn't lost on quick navigation away.
                  if (
                    typeof patch.url === "string" &&
                    patch.url.startsWith("/objects/")
                  ) {
                    bumpUrgentSave();
                  }
                }}
              />
            )}
            {block.type === "map-ref" && (
              <NodeRefBlock
                kind="map"
                block={block}
                readOnly={readOnly}
                realmId={activeRealmId ?? null}
                excludeNodeId={id}
                onChange={(patch) => updateBlock(block.id, patch)}
              />
            )}
            {block.type === "canvas-ref" && (
              <NodeRefBlock
                kind="canvas"
                block={block}
                readOnly={readOnly}
                realmId={activeRealmId ?? null}
                excludeNodeId={id}
                onChange={(patch) => updateBlock(block.id, patch)}
              />
            )}
          </BlockShell>
        ))}

        {!readOnly && (
          <AddFieldRow onAdd={addBlock} />
        )}
        {readOnly && blocks.length === 0 && (
          <div className="text-xs text-muted-foreground italic px-1">
            This node has no fields yet.
          </div>
        )}
      </div>

      {/* Compass strip (scoped to the focused text block) */}
      {!readOnly && focusedTextBlock && (
        <CompassStrip
          nodeId={id}
          focusedBlock={focusedTextBlock}
          selection={compassSelection}
          onClearSelection={() => setActiveSelection(null)}
          onAccept={(newText) =>
            updateBlock(focusedTextBlock.id, { text: newText })
          }
        />
      )}

      <ArcanaStatsSection node={node} readOnly={readOnly} />
      </div>
      {pendingMatch &&
        pendingMatch.nodeId === id &&
        matchesByBlock.flat.length > 0 && (
          <MatchNavBar
            query={pendingMatch.query}
            total={matchesByBlock.flat.length}
            current={Math.min(currentMatchIdx, matchesByBlock.flat.length - 1)}
            onPrev={goPrevMatch}
            onNext={goNextMatch}
            onClose={dismissMatches}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================
// MatchNavBar: floating chrome that shows "X of N" matches for the
// active search phrase, with prev/next chevrons and a dismiss button.
// Rendered inside the scroll container with `sticky bottom-*` so it
// stays glued to the bottom of the visible editor area as the user
// scrolls through long nodes.
// =============================================================

function MatchNavBar({
  query,
  total,
  current,
  onPrev,
  onNext,
  onClose,
}: {
  query: string;
  total: number;
  current: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-30 mx-auto mt-3 flex w-fit max-w-[90%] items-center gap-2 rounded-full border border-border bg-popover/95 px-3 py-1.5 shadow-lg backdrop-blur">
      <span className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{current + 1}</span>
        <span className="opacity-60"> of </span>
        <span className="font-medium text-foreground">{total}</span>
        <span className="opacity-60"> for </span>
        <span className="font-mono text-foreground truncate max-w-[12rem] align-bottom inline-block">
          “{query}”
        </span>
      </span>
      <div className="h-3 w-px bg-border" />
      <button
        type="button"
        onClick={onPrev}
        title="Previous match (Shift+F3)"
        aria-label="Previous match"
        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        title="Next match (F3)"
        aria-label="Next match"
        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Dismiss"
        aria-label="Dismiss search"
        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// =============================================================
// Add field row
// =============================================================

function AddFieldRow({ onAdd }: { onAdd: (type: LocalBlock["type"]) => void }) {
  const items: { type: LocalBlock["type"]; label: string; icon: React.ReactNode }[] = [
    { type: "text", label: "Text", icon: <TypeIcon className="h-3 w-3" /> },
    { type: "media", label: "Media", icon: <ImagePlus className="h-3 w-3" /> },
    { type: "map-ref", label: "Map", icon: <MapIcon className="h-3 w-3" /> },
    { type: "canvas-ref", label: "Canvas", icon: <LayoutGrid className="h-3 w-3" /> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1">
        <Plus className="h-3 w-3" /> Add field
      </span>
      {items.map((it) => (
        <Button
          key={it.type}
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-3 rounded-full gap-1.5 text-[11px]"
          onClick={() => onAdd(it.type)}
        >
          {it.icon}
          {it.label}
        </Button>
      ))}
    </div>
  );
}

// =============================================================
// Block shell (remove button, hover affordance)
// =============================================================

function BlockShell({
  children,
  readOnly,
  blockId,
  blockType,
  blockSize,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onReorder,
  onRemove,
  shellRef,
  flash,
}: {
  children: React.ReactNode;
  readOnly: boolean;
  blockId: string;
  blockType: LocalBlock["type"];
  blockSize: BlockSize;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onReorder: (fromId: string, toId: string, position: "before" | "after") => void;
  onRemove: () => void;
  shellRef?: (el: HTMLDivElement | null) => void;
  flash?: boolean;
}) {
  const [dragOver, setDragOver] = useState<null | "before" | "after">(null);
  const [isDragging, setIsDragging] = useState(false);

  const isText = blockType === "text";
  // Text blocks render borderless and full-width for a clean writing surface.
  // Non-text blocks (media / map / canvas) get a subtle hover border and
  // honor the user's chosen width (small/medium/full).
  const widthClass =
    blockSize === "small"
      ? "max-w-[50%]"
      : blockSize === "medium"
        ? "max-w-[75%]"
        : "";
  const chromeClass = isText
    ? `rounded-md ${dragOver ? "ring-1 ring-primary" : ""}`
    : `rounded-md border bg-background/40 transition-colors ${
        dragOver
          ? "border-primary"
          : "border-border/40 hover:border-border/70"
      }`;

  // When the user jumps to a search match in this block, briefly ring it
  // in the accent color so they can see where they landed. The transition
  // is on `box-shadow` so toggling `flash` produces a fade-in/out.
  const flashClass = flash
    ? "ring-2 ring-yellow-400/80 ring-offset-2 ring-offset-card shadow-[0_0_0_4px_rgba(250,204,21,0.15)]"
    : "ring-0";

  return (
    <div
      ref={shellRef}
      className={`group relative transition-shadow duration-500 ${flashClass} ${chromeClass} ${widthClass} ${isDragging ? "opacity-50" : ""}`}
      onDragOver={(e) => {
        if (readOnly) return;
        if (!e.dataTransfer.types.includes("application/x-block-id")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        setDragOver(before ? "before" : "after");
      }}
      onDragLeave={(e) => {
        const related = e.relatedTarget as globalThis.Node | null;
        if (!related || !e.currentTarget.contains(related)) {
          setDragOver(null);
        }
      }}
      onDrop={(e) => {
        if (readOnly) return;
        const fromId = e.dataTransfer.getData("application/x-block-id");
        const rect = e.currentTarget.getBoundingClientRect();
        const position: "before" | "after" =
          e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        setDragOver(null);
        if (fromId) {
          e.preventDefault();
          onReorder(fromId, blockId, position);
        }
      }}
    >
      {!readOnly && (
        <>
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full z-10 flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pr-1">
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-block-id", blockId);
                e.dataTransfer.effectAllowed = "move";
                setIsDragging(true);
              }}
              onDragEnd={() => {
                setIsDragging(false);
                setDragOver(null);
              }}
              title="Drag to reorder"
              className="h-5 w-5 rounded border border-border bg-background text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex items-center justify-center"
            >
              <GripVertical className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              title="Move up"
              className="h-5 w-5 rounded border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground disabled:cursor-not-allowed flex items-center justify-center"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              title="Move down"
              className="h-5 w-5 rounded border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground disabled:cursor-not-allowed flex items-center justify-center"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            title="Remove field"
            className="absolute -top-2 -right-2 z-10 h-5 w-5 rounded-full border border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
      {dragOver === "before" && (
        <div className="absolute left-0 right-0 -top-1.5 h-0.5 bg-primary rounded pointer-events-none" />
      )}
      {dragOver === "after" && (
        <div className="absolute left-0 right-0 -bottom-1.5 h-0.5 bg-primary rounded pointer-events-none" />
      )}
      <div className={isText ? "" : "p-2"}>{children}</div>
    </div>
  );
}

// =============================================================
// Text block: textarea + per-block formatting toolbar + Y.Text
// =============================================================

interface TextBlockProps {
  nodeId: string;
  block: Extract<LocalBlock, { type: "text" }>;
  readOnly: boolean;
  isFocused: boolean;
  /** Whether this block's body is currently hidden behind its heading.
   *  When true, only the heading row + chevron toggle render. */
  collapsed: boolean;
  /** Flip the collapsed state. Called when the user clicks the chevron. */
  onToggleCollapsed: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onChangeText: (text: string) => void;
  onChangeHeading: (heading: string) => void;
  onSelectionChange: (sel: ActiveBlockSelection | null) => void;
  /** Every occurrence of the active search phrase inside this block.
   *  Drives the persistent yellow highlight overlay. */
  highlightMatches?: Array<{ start: number; end: number }> | null;
  /** The currently-active match within this block (the one the user is
   *  navigating with prev/next). Drawn brighter than the rest. Null when
   *  the active match is in a different block. */
  currentHighlightRange?: { start: number; end: number } | null;
  /** When set, focus the textarea and select [start, end). `nonce` changes
   *  only when the active match changes, so editing the textarea doesn't
   *  re-fire the select. */
  selectRange?: { start: number; end: number; nonce: string } | null;
}

// Small button used for resolved [[Key]] references in a text block.
// Left-click opens the target in the current focused pane (onOpen);
// right-click on desktop or long-press on touch opens it in a new pane
// (onOpenInNext) without losing the current view.
function RefChipLink({
  onOpen,
  onOpenInNext,
  title,
  children,
}: {
  onOpen: () => void;
  onOpenInNext: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenInNext();
      }}
      onTouchStart={() => {
        longPressFired.current = false;
        if (longPressTimer.current !== null) {
          window.clearTimeout(longPressTimer.current);
        }
        longPressTimer.current = window.setTimeout(() => {
          longPressFired.current = true;
          onOpenInNext();
        }, 500);
      }}
      onTouchEnd={() => {
        if (longPressTimer.current !== null) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }}
      onTouchMove={() => {
        // Any finger movement (e.g. starting to scroll) should cancel
        // the pending long-press so we don't fire "open in new pane"
        // while the user is just scrolling the page.
        if (longPressTimer.current !== null) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        longPressFired.current = false;
      }}
      onTouchCancel={() => {
        if (longPressTimer.current !== null) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        longPressFired.current = false;
      }}
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20 transition-colors"
      title={title}
    >
      {children}
    </button>
  );
}

function TextBlock({
  nodeId,
  block,
  readOnly,
  isFocused,
  collapsed,
  onToggleCollapsed,
  onFocus,
  onBlur,
  onChangeText,
  onChangeHeading,
  onSelectionChange,
  highlightMatches,
  currentHighlightRange,
  selectRange,
}: TextBlockProps) {
  const { activeRealmId, openInFocused, openNewNode } = useAppStore();
  const { data: realmNodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });
  const nodesByKey = useMemo(() => {
    const m = new Map<string, Node>();
    (realmNodes ?? []).forEach((n) => m.set(n.key, n));
    return m;
  }, [realmNodes]);
  const [heading, setHeading] = useState(block.heading ?? "");
  const [headingFocused, setHeadingFocused] = useState(false);
  // Mention picker state. `start` is the index of the `@` trigger char,
  // `query` is the text typed after it. When non-null the popover is open.
  const [mention, setMention] = useState<{
    start: number;
    query: string;
    coords: { top: number; left: number; height: number };
  } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  useEffect(() => {
    setHeading(block.heading ?? "");
  }, [block.id, block.heading]);
  // When the user can edit, always show the heading input so they can click
  // and type a section header at any time — matching writer expectations
  // for how a header field should behave. In read-only mode, fall back to
  // rendering a static H2 only when a heading is actually set.
  const showHeadingInput = !readOnly;
  const yText = useNodeBlockYText(nodeId, block.id);
  const realtime = useRealtime();
  const selfColor = realtime?.color ?? "#7c5cff";
  const yOriginRef = useRef<symbol>(Symbol(`local-block-${block.id}`));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(block.text);
  const [localSelection, setLocalSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // ----- Co-edit presence: tell peers we're focused/typing in this block,
  // and read which peers are currently focused/typing here so we can show a
  // small "[name] is typing…" hint near the field.
  const fieldPresence = useFieldPresence();
  const peersHere = usePeersInBlock(nodeId, block.id);
  const presenceTimerRef = useRef<number | null>(null);
  const clearPresenceTimer = () => {
    if (presenceTimerRef.current != null) {
      window.clearTimeout(presenceTimerRef.current);
      presenceTimerRef.current = null;
    }
  };
  // Mark this block as the active field, and auto-clear after a few seconds
  // of no further activity. The clear is *conditional*: if focus has moved
  // to another block by the time the timer fires, that block is now the
  // active presence and we must not stomp it.
  const bumpPresence = useCallback(() => {
    // Read-only viewers shouldn't broadcast an editing presence — they
    // can't actually mutate the block.
    if (readOnly) return;
    const ta = textareaRef.current;
    let caret: { anchor: number; head: number } | null = null;
    if (ta && document.activeElement === ta) {
      const s = ta.selectionStart ?? 0;
      const e = ta.selectionEnd ?? 0;
      // selectionDirection tells us whether the head is at the start or end
      // of the range (e.g. selecting backwards with shift+left). Browsers
      // that don't support it report "none" — fall back to head=end.
      const dir = ta.selectionDirection;
      caret =
        dir === "backward"
          ? { anchor: e, head: s }
          : { anchor: s, head: e };
    }
    fieldPresence.set({ nodeId, blockId: block.id, caret });
    clearPresenceTimer();
    const f = { nodeId, blockId: block.id };
    presenceTimerRef.current = window.setTimeout(() => {
      fieldPresence.clearIfMatches(f);
      presenceTimerRef.current = null;
    }, 4000);
  }, [fieldPresence, nodeId, block.id, readOnly]);
  // Cleanup on unmount: clear our presence (only if it's still ours) so
  // peers' chips disappear.
  useEffect(() => {
    const f = { nodeId, blockId: block.id };
    return () => {
      clearPresenceTimer();
      fieldPresence.clearIfMatches(f);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset local state when the node block changes externally (e.g. node switch).
  useEffect(() => {
    setText(block.text);
  }, [block.id, block.text]);

  // Jump-to-phrase: when the parent says this block holds the active match,
  // focus the textarea and select the matched range (the browser scrolls
  // the textarea internally so the selection is visible). The effect is
  // keyed on `selectRange.nonce` so it fires once per navigation step and
  // not on every keystroke while the search bar is still active.
  const selectNonce = selectRange?.nonce ?? null;
  const selectStart = selectRange?.start ?? 0;
  const selectEnd = selectRange?.end ?? 0;
  useEffect(() => {
    if (selectNonce == null) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const raf = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const len = el.value.length;
      const start = Math.min(selectStart, len);
      const end = Math.min(selectEnd, len);
      try {
        el.focus({ preventScroll: true });
        el.setSelectionRange(start, end);
      } catch {
        // Some browsers throw if the textarea isn't yet visible — best-effort.
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [selectNonce, selectStart, selectEnd]);

  // Bind textarea <-> Y.Text. The realtime server is authoritative: it
  // hydrates each `node:<id>:block:<bid>` Y.Text from `nodes.blocks` on
  // first realm load and persists edits back on debounce. We deliberately
  // do NOT seed from `block.text` here — two clients connecting to a
  // brand-new field at the same moment would both seed and produce
  // duplicated text. If yText is still empty when we bind (server hasn't
  // synced yet), the textarea briefly shows the React-controlled
  // `block.text` value until the first sync overwrites it.
  useEffect(() => {
    if (!yText || !realtime) return;
    const el = textareaRef.current;
    if (!el) return;
    // If yText already has content (server pre-seeded or a peer already
    // typed), pull it into local state immediately. Otherwise leave React
    // showing block.text until sync lands.
    if (yText.length > 0) {
      const initial = yText.toString();
      if (initial !== text) {
        setText(initial);
        onChangeText(initial);
      }
    }
    const dispose = bindYTextToTextarea(
      yText,
      el,
      realtime.doc,
      yOriginRef.current,
    );
    return dispose;
    // Re-bind only when the underlying yText changes (block id / node id /
    // realm change). Don't re-run on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yText, realtime, nodeId, block.id]);

  const reportSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (end > start) {
      setLocalSelection({ start, end });
      onSelectionChange({
        blockId: block.id,
        start,
        end,
        text: ta.value.slice(start, end),
      });
    } else {
      setLocalSelection(null);
      onSelectionChange(null);
    }
  }, [block.id, onSelectionChange]);

  // Detect a `@` trigger to the left of the caret. Opens the mention
  // picker with the typed query so the user can pick a node by key/title.
  // Mention is anchored at the `@` index so we know what slice to replace
  // when the user picks a target.
  const detectMention = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (readOnly) return;
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) {
      setMention(null);
      return;
    }
    const t = ta.value;
    const minStart = Math.max(0, pos - 64);
    let i = pos - 1;
    while (i >= minStart) {
      const ch = t[i]!;
      if (ch === "@") {
        const prev = i === 0 ? " " : t[i - 1]!;
        if (i === 0 || /[\s([{>,;:!?\n]/.test(prev)) {
          const slice = t.slice(i + 1, pos);
          if (/^[\w-]*$/.test(slice)) {
            let coords = { top: 0, left: 0, height: 16 };
            try {
              coords = getCaretCoordinates(ta, i);
            } catch {
              // ignore; popover will fall back to (0,0)
            }
            setMention((prev) => {
              if (
                prev &&
                prev.start === i &&
                prev.query === slice &&
                prev.coords.top === coords.top &&
                prev.coords.left === coords.left
              ) {
                return prev;
              }
              return { start: i, query: slice, coords };
            });
            return;
          }
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i -= 1;
    }
    setMention(null);
  }, [readOnly]);

  const mentionMatches = useMemo(() => {
    if (!mention) return [] as Node[];
    const q = mention.query.toLowerCase();
    return (realmNodes ?? [])
      .filter((n) => n.id !== nodeId)
      .filter(
        (n) =>
          !q ||
          n.key.toLowerCase().includes(q) ||
          n.title.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [mention, realmNodes, nodeId]);

  // Keep the highlighted index inside the current matches range.
  useEffect(() => {
    if (!mention) return;
    if (mentionIdx >= mentionMatches.length) setMentionIdx(0);
  }, [mention, mentionMatches.length, mentionIdx]);

  const insertReference = useCallback(
    (target: Node) => {
      if (!mention) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const caret = ta.selectionStart;
      const before = text.slice(0, mention.start);
      const after = text.slice(caret);
      const insertion = `[[${target.key}]] `;
      const next = before + insertion + after;
      applyEdit(next);
      const pos = before.length + insertion.length;
      setMention(null);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    // applyEdit is defined just below; eslint can't see it but the value is
    // stable enough for our needs (closure over current `text` is intended).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mention, text],
  );

  // Parse [[KEY]] tokens to render the resolved-references chip row.
  // Dedupe keys so the row stays compact when the same node is referenced
  // multiple times in one block.
  const referencedKeys = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const re = /\[\[([^\]\s]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const k = m[1]!;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }, [text]);

  const applyEdit = (next: string) => {
    setText(next);
    onChangeText(next);
    setLocalSelection(null);
    onSelectionChange(null);
    if (yText && realtime) {
      realtime.doc.transact(() => {
        if (yText.length > 0) yText.delete(0, yText.length);
        if (next.length > 0) yText.insert(0, next);
      }, yOriginRef.current);
    }
  };

  const wrapSelection = (left: string, right: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = text.slice(start, end);
    const next = text.slice(0, start) + left + selected + right + text.slice(end);
    applyEdit(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + left.length, end + left.length);
    });
  };

  // Grow the textarea to fit its content so every line is visible without
  // an inner scrollbar. Replaces the previous newline-count heuristic
  // that capped at 40 rows and ignored wrapped lines. The hook returns
  // a callback ref so resizing rebinds whenever the textarea remounts
  // (e.g. when a collapsed heading block is expanded). Composed with
  // `textareaRef` so all the other handlers that read it still work.
  const setAutoGrowEl = useAutoGrowTextarea(text, 6);
  const setTextareaEl = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      setAutoGrowEl(el);
    },
    [setAutoGrowEl],
  );

  // Listen for cross-component "apply this mention" events (dispatched
  // by the per-node suggestions strip or by the Compass sidebar). We
  // only react to events targeted at THIS block, then reuse the
  // existing Y.Text-aware applyEdit so collaborators and the realtime
  // backend see the change. Guards:
  //   - readOnly: never apply edits when the user can't write.
  //   - stale span: only apply when `text.slice(start,end)` still equals
  //     the originally matched text (case-insensitive). Protects against
  //     events landing on a span the user has since edited (typed more
  //     text before the match, deleted characters, etc.).
  //   - no-op: skip if the splice would produce the identical string.
  useEffect(() => {
    if (readOnly) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ApplyMentionDetail>;
      const d = ce.detail;
      if (!d || d.nodeId !== nodeId || d.blockId !== block.id) return;
      const currentSlice = text.slice(d.start, d.end);
      if (currentSlice.toLowerCase() !== (d.expectedText || "").toLowerCase()) {
        return;
      }
      const next = text.slice(0, d.start) + d.replacement + text.slice(d.end);
      if (next === text) return;
      applyEdit(next);
    };
    window.addEventListener(APPLY_MENTION_EVENT, handler);
    return () => window.removeEventListener(APPLY_MENTION_EVENT, handler);
    // applyEdit is defined just above; closing over the latest `text`
    // is intentional so the splice uses the live value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, block.id, text, readOnly]);

  // Batch apply handler ("Apply all" in the suggestions strip + the
  // global top-bar "Auto-link everything" button). We splice from
  // end -> start in ONE applyEdit call so:
  //   (a) earlier edits don't invalidate later (start,end) positions, and
  //   (b) the change shows up as a single Y.Text transaction / undo step.
  // expectedText is still checked per-edit so a stale event won't
  // mangle the document.
  useEffect(() => {
    if (readOnly) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ApplyMentionsBatchDetail>;
      const d = ce.detail;
      if (!d || d.nodeId !== nodeId || d.blockId !== block.id) return;
      if (!d.edits || d.edits.length === 0) return;
      const ordered = [...d.edits].sort((a, b) => b.start - a.start);
      let next = text;
      for (const ed of ordered) {
        const slice = next.slice(ed.start, ed.end);
        if (slice.toLowerCase() !== (ed.expectedText || "").toLowerCase()) {
          continue;
        }
        next = next.slice(0, ed.start) + ed.replacement + next.slice(ed.end);
      }
      if (next === text) return;
      applyEdit(next);
    };
    window.addEventListener(APPLY_MENTIONS_BATCH_EVENT, handler);
    return () =>
      window.removeEventListener(APPLY_MENTIONS_BATCH_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, block.id, text, readOnly]);

  const prefixLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    const next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
    applyEdit(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos + prefix.length, pos + prefix.length);
    });
  };

  return (
    <div className="space-y-1 relative">
      {/* Heading row. When a heading is set we always show a chevron toggle
          next to it so the user can collapse/expand the body. In view mode,
          blocks with a heading start collapsed by default so the reader sees
          a tidy table of headings. */}
      {(() => {
        const hasHeading = heading.trim().length > 0;
        return (
          <div className="flex items-start gap-1">
            {hasHeading && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Expand section" : "Collapse section"}
                title={collapsed ? "Expand section" : "Collapse section"}
                className="mt-1 h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center shrink-0"
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            )}
            <div className="flex-1 min-w-0">
              {showHeadingInput ? (
                <input
                  value={heading}
                  onChange={(e) => {
                    setHeading(e.target.value);
                    onChangeHeading(e.target.value);
                  }}
                  onFocus={() => setHeadingFocused(true)}
                  onBlur={() => setHeadingFocused(false)}
                  placeholder="Header (optional)"
                  className="w-full bg-transparent border-none focus:ring-0 outline-none text-lg font-semibold tracking-tight text-foreground placeholder:text-foreground/30 px-0 py-0"
                />
              ) : (
                hasHeading && (
                  <h2
                    onClick={onToggleCollapsed}
                    className="text-lg font-semibold tracking-tight text-foreground cursor-pointer select-none"
                  >
                    {heading}
                  </h2>
                )
              )}
            </div>
          </div>
        );
      })()}
      {!collapsed && (<>
      {/* Show parsed prose (with [[key]] tokens turned into clickable
          accent-colored title links) whenever this block is NOT the
          one the user is actively editing. Clicking the prose calls
          onFocus, which switches this block into the textarea/edit
          UI below. Read-only viewers never see the textarea — they
          always see the parsed prose. */}
      {readOnly || !isFocused ? (
        <div
          onClick={onFocus}
          className="text-base text-foreground leading-7 whitespace-pre-wrap break-words py-1 cursor-text"
        >
          {(() => {
            const re = /\[\[([^\]\s]+)\]\]/g;
            const out: ReactNode[] = [];
            let last = 0;
            let m: RegExpExecArray | null;
            let key = 0;
            while ((m = re.exec(text))) {
              if (m.index > last) {
                out.push(
                  <span key={`t${key++}`}>{text.slice(last, m.index)}</span>,
                );
              }
              const k = m[1]!;
              const target = nodesByKey.get(k);
              if (target) {
                const tid = target.id;
                const label = target.title || target.key;
                // Left click: open in focused pane. Right click (desktop)
                // and long-press (touch) open in a new pane, matching the
                // RefChipLink behavior used for the bottom refs row.
                let pressTimer: number | null = null;
                let longPressed = false;
                out.push(
                  <button
                    key={`l${key++}`}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (longPressed) {
                        longPressed = false;
                        return;
                      }
                      openInFocused(tid);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openNewNode(tid);
                    }}
                    onTouchStart={() => {
                      longPressed = false;
                      if (pressTimer) window.clearTimeout(pressTimer);
                      pressTimer = window.setTimeout(() => {
                        longPressed = true;
                        openNewNode(tid);
                      }, 500);
                    }}
                    onTouchEnd={() => {
                      if (pressTimer) {
                        window.clearTimeout(pressTimer);
                        pressTimer = null;
                      }
                    }}
                    onTouchCancel={() => {
                      if (pressTimer) {
                        window.clearTimeout(pressTimer);
                        pressTimer = null;
                      }
                    }}
                    title={`Open ${label} (right-click or long-press to open in a new pane)`}
                    className="text-accent hover:underline font-medium px-0 py-0 bg-transparent border-0 cursor-pointer"
                  >
                    {label}
                  </button>,
                );
              } else {
                out.push(
                  <span
                    key={`b${key++}`}
                    className="text-destructive/80 font-mono text-sm"
                    title="No node with this key in this realm"
                  >
                    [[{k}]]
                  </span>,
                );
              }
              last = m.index + m[0].length;
            }
            if (last < text.length) {
              out.push(<span key={`t${key++}`}>{text.slice(last)}</span>);
            }
            if (out.length === 0) {
              return (
                <span className="text-muted-foreground/40 italic">
                  Empty
                </span>
              );
            }
            return out;
          })()}
        </div>
      ) : (<>
      {/* Peer "is editing" name chips removed at user request — peer
          presence is now indicated only by the caret overlay in the
          textarea and by the avatar on the sidebar node row. */}
      {isFocused && !readOnly && (
        <div className="flex items-center gap-0.5 -mx-1 px-1 pb-1 border-b border-border/40">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Bold" onMouseDown={(e) => { e.preventDefault(); wrapSelection("**", "**"); }}>
            <Bold className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Italic" onMouseDown={(e) => { e.preventDefault(); wrapSelection("_", "_"); }}>
            <Italic className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Heading" onMouseDown={(e) => { e.preventDefault(); prefixLine("## "); }}>
            <Heading2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="List" onMouseDown={(e) => { e.preventDefault(); prefixLine("- "); }}>
            <List className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Code" onMouseDown={(e) => { e.preventDefault(); wrapSelection("`", "`"); }}>
            <Code className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Link" onMouseDown={(e) => { e.preventDefault(); wrapSelection("[", "](url)"); }}>
            <LinkIcon className="h-3 w-3" />
          </Button>
        </div>
      )}
      <div className="relative">
      <textarea
        ref={setTextareaEl}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChangeText(e.target.value);
          reportSelection();
          bumpPresence();
          detectMention();
        }}
        onFocus={() => { onFocus(); reportSelection(); bumpPresence(); }}
        onBlur={() => {
          onBlur();
          // Close the mention picker on blur. The popover items use
          // onMouseDown(preventDefault) so a click on a suggestion fires
          // before this blur and still inserts.
          setMention(null);
          // Clear our presence shortly after blur so peers stop seeing the
          // hint when we move away from the field. Conditional clear: if
          // the user has refocused into a different block before the
          // timer fires, leave the new block's presence intact.
          clearPresenceTimer();
          const f = { nodeId, blockId: block.id };
          presenceTimerRef.current = window.setTimeout(() => {
            fieldPresence.clearIfMatches(f);
            presenceTimerRef.current = null;
          }, 1500);
        }}
        onSelect={() => { reportSelection(); bumpPresence(); detectMention(); }}
        onKeyUp={() => { reportSelection(); bumpPresence(); }}
        onMouseUp={() => { reportSelection(); bumpPresence(); detectMention(); }}
        onKeyDown={(e) => {
          // Mention picker keyboard nav takes precedence when the popover
          // is open, so the user can drive selection without the mouse.
          if (mention && mentionMatches.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMentionIdx((i) => (i + 1) % mentionMatches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setMentionIdx(
                (i) => (i - 1 + mentionMatches.length) % mentionMatches.length,
              );
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const target = mentionMatches[mentionIdx];
              if (target) insertReference(target);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMention(null);
              return;
            }
          }
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
            if (e.key === "b") { e.preventDefault(); wrapSelection("**", "**"); return; }
            if (e.key === "i") { e.preventDefault(); wrapSelection("_", "_"); return; }
          }
        }}
        readOnly={readOnly}
        rows={1}
        placeholder={readOnly ? "" : "Write here... (type @ to link a node)"}
        className="w-full bg-transparent border-0 border-none focus:ring-0 focus:outline-none outline-none resize-none overflow-hidden text-base text-foreground leading-7 px-0 py-1"
      />
      {/* Self selection overlay removed — the user only wants to see
          where OTHER people are typing, not a highlight of their own
          caret/selection. The native textarea selection (default browser
          color) still works for normal text-editing. */}
      <PeerCaretOverlay textareaRef={textareaRef} peers={peersHere} text={text} />
      {highlightMatches && highlightMatches.length > 0 && (
        <MatchHighlightOverlay
          textareaRef={textareaRef}
          matches={highlightMatches}
          current={currentHighlightRange ?? null}
          text={text}
        />
      )}
      {mention && !readOnly && mentionMatches.length > 0 && (
        <div
          className="absolute z-40 min-w-[14rem] max-w-xs rounded-md border border-border bg-popover shadow-lg overflow-hidden"
          style={{
            top: mention.coords.top + mention.coords.height + 2,
            left: mention.coords.left,
          }}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-border/60">
            Link a node
          </div>
          <div className="max-h-56 overflow-y-auto py-0.5">
            {mentionMatches.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertReference(n);
                }}
                onMouseEnter={() => setMentionIdx(i)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs ${
                  i === mentionIdx ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {n.key}
                </span>
                <span className="truncate text-foreground">
                  {n.title || "Untitled"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
      </>)}
      {isFocused && !readOnly && referencedKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mr-0.5">
            Refs
          </span>
          {referencedKeys.map((k) => {
            const target = nodesByKey.get(k);
            if (!target) {
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive"
                  title="No node with this key in this realm"
                >
                  <span className="font-mono">[[{k}]]</span>
                  <span className="opacity-70">broken</span>
                </span>
              );
            }
            return (
              <RefChipLink
                key={k}
                onOpen={() => openInFocused(target.id)}
                onOpenInNext={() => openNewNode(target.id)}
                title={`Open ${target.title || target.key} (right-click or long-press to open in a new pane)`}
              >
                <span className="font-mono opacity-70">{target.key}</span>
                <span className="truncate max-w-[10rem]">
                  {target.title || "Untitled"}
                </span>
              </RefChipLink>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}

// =============================================================
// Peer caret overlay: draw a thin colored caret (and optional faint
// selection highlight) for each peer currently focused in this textarea.
// Positions are computed via the mirror-div technique because <textarea>
// elements expose no per-character DOM nodes.
// =============================================================

interface PeerCaretOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  peers: PresenceFieldPeer[];
  /** Local text — only used as a re-render trigger when content changes. */
  text: string;
}

function PeerCaretOverlay({ textareaRef, peers, text }: PeerCaretOverlayProps) {
  const [, setTick] = useState(0);
  const carets = useMemo(
    () => peers.filter((p) => p.field.caret != null),
    [peers],
  );

  // Recompute caret positions whenever the textarea resizes (line wraps,
  // row count changes, container width). The text-change dep above also
  // forces a re-render via `text`, but ResizeObserver catches the cases
  // where wrapping shifts without a text change here (e.g. window resize).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const tick = () => setTick((n) => n + 1);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(tick);
      ro.observe(el);
    }
    // Keep peer carets aligned when the textarea scrolls internally — rare
    // today (rows auto-grow up to 20) but possible for long blocks.
    el.addEventListener("scroll", tick, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", tick);
    };
  }, [textareaRef]);

  const ta = textareaRef.current;
  if (!ta || carets.length === 0) return null;

  // Read live scroll offsets — the scroll listener above forces a re-render
  // so these stay in sync as the user scrolls inside the textarea.
  const scrollTop = ta.scrollTop;
  const scrollLeft = ta.scrollLeft;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {carets.map((p) => {
        const caret = p.field.caret!;
        const start = Math.min(caret.anchor, caret.head);
        const end = Math.max(caret.anchor, caret.head);
        // Clamp to current text length — peer's awareness may be slightly
        // stale relative to our local Y.Text view.
        const safeEnd = Math.min(end, text.length);
        const safeStart = Math.min(start, text.length);
        let startCoords;
        let endCoords;
        let selectionRects: ReturnType<typeof getSelectionRects> = [];
        try {
          startCoords = getCaretCoordinates(ta, safeStart);
          endCoords =
            safeEnd === safeStart
              ? startCoords
              : getCaretCoordinates(ta, safeEnd);
          if (safeEnd > safeStart) {
            selectionRects = getSelectionRects(ta, safeStart, safeEnd);
          }
        } catch {
          return null;
        }
        const headCoords = caret.head >= caret.anchor ? endCoords : startCoords;
        const items: React.ReactNode[] = [];
        // Faint selection highlight — one rectangle per visual line so that
        // wrapped or multi-line selections are fully covered, not just the
        // first line.
        selectionRects.forEach((rect, idx) => {
          items.push(
            <div
              key={`sel-${p.clientId}-${idx}`}
              className="absolute rounded-sm"
              style={{
                top: rect.top - scrollTop,
                left: rect.left - scrollLeft,
                width: Math.max(1, rect.width),
                height: rect.height,
                backgroundColor: `${p.color}33`,
              }}
            />,
          );
        });
        // The caret itself, with a small name flag floating above it so
        // viewers can tell which peer it belongs to.
        items.push(
          <div
            key={`caret-${p.clientId}`}
            className="absolute"
            style={{
              top: headCoords.top - scrollTop,
              left: headCoords.left - scrollLeft,
              width: 2,
              height: headCoords.height,
              backgroundColor: p.color,
            }}
          >
            <span
              className="absolute left-0 -top-[14px] whitespace-nowrap rounded-sm px-1 text-[9px] font-medium leading-[12px] text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.name}
            </span>
          </div>,
        );
        return <React.Fragment key={p.clientId}>{items}</React.Fragment>;
      })}
    </div>
  );
}

// =============================================================
// Self selection overlay: tint the local user's own selection in their
// awareness color, using the same per-visual-line rects we draw for peers.
// The browser's native selection rendering still applies; this overlay
// makes the selection easier to track against the editor's faint
// background and keeps the highlight visible after the textarea blurs
// (e.g. when the user clicks Compass to scope an action).
// =============================================================

interface SelfSelectionOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  selection: { start: number; end: number } | null;
  color: string;
  /** Local text — used as a re-render trigger when content changes. */
  text: string;
}

function SelfSelectionOverlay({
  textareaRef,
  selection,
  color,
  text,
}: SelfSelectionOverlayProps) {
  const [, setTick] = useState(0);
  // Keep rects aligned across resize / wrap / scroll, mirroring the peer
  // overlay's approach.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const tick = () => setTick((n) => n + 1);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(tick);
      ro.observe(el);
    }
    el.addEventListener("scroll", tick, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", tick);
    };
  }, [textareaRef]);

  const ta = textareaRef.current;
  if (!ta || !selection) return null;
  const safeStart = Math.min(selection.start, text.length);
  const safeEnd = Math.min(selection.end, text.length);
  if (safeEnd <= safeStart) return null;

  let rects: ReturnType<typeof getSelectionRects> = [];
  try {
    rects = getSelectionRects(ta, safeStart, safeEnd);
  } catch {
    rects = [];
  }
  if (rects.length === 0) return null;

  const scrollTop = ta.scrollTop;
  const scrollLeft = ta.scrollLeft;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {rects.map((r, i) => (
        <div
          key={`self-sel-${i}`}
          className="absolute rounded-sm"
          style={{
            top: r.top - scrollTop,
            left: r.left - scrollLeft,
            width: Math.max(1, r.width),
            height: r.height,
            backgroundColor: `${color}33`,
          }}
        />
      ))}
    </div>
  );
}

// =============================================================
// MatchHighlightOverlay: yellow-highlight every occurrence of the active
// search phrase inside this block's textarea. The "current" match (the
// one the user is sitting on, set in the textarea via setSelectionRange)
// is drawn with a brighter background and a thin border so it pops out
// of the field of highlights when there are many recurrences.
// Positions are computed via the mirror-div technique (getSelectionRects)
// since <textarea> exposes no per-character DOM nodes.
// =============================================================

interface MatchHighlightOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  matches: Array<{ start: number; end: number }>;
  current: { start: number; end: number } | null;
  /** Local text — used as a re-render trigger when content changes. */
  text: string;
}

function MatchHighlightOverlay({
  textareaRef,
  matches,
  current,
  text,
}: MatchHighlightOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const tick = () => setTick((n) => n + 1);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(tick);
      ro.observe(el);
    }
    el.addEventListener("scroll", tick, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", tick);
    };
  }, [textareaRef]);

  const ta = textareaRef.current;
  if (!ta || matches.length === 0) return null;

  const scrollTop = ta.scrollTop;
  const scrollLeft = ta.scrollLeft;
  const len = text.length;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {matches.map((m, mi) => {
        const s = Math.min(m.start, len);
        const e = Math.min(m.end, len);
        if (e <= s) return null;
        const isCurrent =
          current != null && current.start === m.start && current.end === m.end;
        let rects: ReturnType<typeof getSelectionRects> = [];
        try {
          rects = getSelectionRects(ta, s, e);
        } catch {
          rects = [];
        }
        return rects.map((r, ri) => (
          <div
            key={`m-${mi}-${ri}`}
            className="absolute rounded-sm"
            style={{
              top: r.top - scrollTop,
              left: r.left - scrollLeft,
              width: Math.max(1, r.width),
              height: r.height,
              backgroundColor: isCurrent
                ? "rgba(250, 204, 21, 0.55)"
                : "rgba(250, 204, 21, 0.28)",
              boxShadow: isCurrent
                ? "inset 0 0 0 1px rgba(202, 138, 4, 0.7)"
                : undefined,
            }}
          />
        ));
      })}
    </div>
  );
}

// =============================================================
// Media block
// =============================================================

function SizeControl({
  value,
  onChange,
}: {
  value: BlockSize;
  onChange: (next: BlockSize) => void;
}) {
  const opts: { v: BlockSize; label: string }[] = [
    { v: "small", label: "S" },
    { v: "medium", label: "M" },
    { v: "full", label: "Full" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background/60 p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2 h-6 text-[10px] uppercase tracking-wider rounded ${
            value === o.v
              ? "bg-primary/20 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={`Width: ${o.v}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MediaBlock({
  block,
  readOnly,
  onChange,
}: {
  block: Extract<LocalBlock, { type: "media" }>;
  readOnly: boolean;
  onChange: (patch: Partial<Extract<LocalBlock, { type: "media" }>>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const displayUrl = block.url
    ? block.url.startsWith("/objects/")
      ? objectUrl(block.url)
      : block.url
    : "";
  const size: BlockSize = block.size ?? "full";

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const path = await uploadImage(file);
      onChange({ url: path });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (displayUrl) {
    return (
      <div className="space-y-2">
        <img
          src={displayUrl}
          alt={block.alt ?? ""}
          className="w-full max-h-[28rem] rounded border border-border/40 object-contain bg-background/40"
        />
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={block.alt ?? ""}
              onChange={(e) => onChange({ alt: e.target.value })}
              placeholder="Alt text"
              className="flex-1 min-w-32 bg-background/60 border border-border rounded px-2 py-1 text-xs"
            />
            <SizeControl
              value={size}
              onChange={(next) => onChange({ size: next })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] gap-1"
              onClick={() => onChange({ url: "", alt: "" })}
            >
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="text-xs text-muted-foreground italic">No media set.</div>
    );
  }

  // Empty state: large, clearly clickable upload target so the user can
  // see exactly where the image will land in the document.
  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className="group w-full flex flex-col items-center justify-center gap-2 h-48 rounded-md border-2 border-dashed border-border/60 hover:border-primary/60 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
      >
        {busy ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <ImagePlus className="h-7 w-7 opacity-70 group-hover:opacity-100" />
        )}
        <span className="text-sm font-medium">
          {busy ? "Uploading…" : "Click to upload an image"}
        </span>
        <span className="text-[11px] text-muted-foreground/70">
          or drag a file here
        </span>
      </button>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowUrlInput((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          {showUrlInput ? "Hide URL input" : "Or paste image URL"}
        </button>
      </div>
      {showUrlInput && (
        <input
          autoFocus
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://…"
          className="w-full bg-background/60 border border-border rounded px-2 py-1 text-xs"
        />
      )}
    </div>
  );
}

// =============================================================
// Node-ref block (Map / Canvas)
// =============================================================

function NodeRefBlock({
  kind,
  block,
  readOnly,
  realmId,
  excludeNodeId,
  onChange,
}: {
  kind: "map" | "canvas";
  block: Extract<LocalBlock, { type: "map-ref" | "canvas-ref" }>;
  readOnly: boolean;
  realmId: string | null;
  excludeNodeId: string;
  onChange: (
    patch: Partial<Extract<LocalBlock, { type: "map-ref" | "canvas-ref" }>>,
  ) => void;
}) {
  const { data: realmNodes } = useListNodes(realmId || "", {
    query: {
      enabled: !!realmId,
      queryKey: getListNodesQueryKey(realmId || ""),
    },
  });
  const createNode = useCreateNode();
  const queryClient = useQueryClient();

  const candidates = useMemo(
    () =>
      (realmNodes ?? []).filter(
        (n) => n.kind === kind && n.id !== excludeNodeId,
      ),
    [realmNodes, kind, excludeNodeId],
  );
  const selected = useMemo(
    () => (realmNodes ?? []).find((n) => n.id === block.nodeId) ?? null,
    [realmNodes, block.nodeId],
  );

  const createAndLink = () => {
    if (!realmId) return;
    createNode.mutate(
      {
        realmId,
        data: {
          title: kind === "map" ? "New Map" : "New Canvas",
          kind: kind as "map" | "canvas",
          mode: "window",
          x: -100,
          y: -100,
          width: 320,
          height: 240,
          zIndex: 10,
          color: kind === "map" ? "#14b8a6" : "#06b6d4",
        },
      },
      {
        onSuccess: (created) => {
          onChange({ nodeId: created.id });
          queryClient.invalidateQueries({
            queryKey: getListNodesQueryKey(realmId),
          });
        },
      },
    );
  };

  const KindIcon = kind === "map" ? MapIcon : LayoutGrid;
  const label = kind === "map" ? "Map" : "Canvas";
  const size: BlockSize = block.size ?? "full";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <KindIcon className="h-3 w-3" /> {label} reference
        </div>
        {selected && !readOnly && (
          <div className="flex items-center gap-1.5">
            <SizeControl
              value={size}
              onChange={(next) => onChange({ size: next })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => onChange({ nodeId: "" })}
            >
              Change
            </Button>
          </div>
        )}
      </div>
      {selected ? (
        <div
          className="w-full flex flex-col items-center justify-center gap-2 h-40 rounded-md border border-border/60 bg-background/60 hover:bg-background/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: selected.color || "hsl(var(--primary))" }}
            />
            <KindIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-base font-medium">{selected.title}</span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-[11px] text-muted-foreground">
            Linked {label.toLowerCase()}
          </span>
        </div>
      ) : (
        !readOnly && (
          <div className="space-y-2">
            <div className="w-full flex flex-col items-center justify-center gap-2 h-40 rounded-md border-2 border-dashed border-border/60 text-muted-foreground">
              <KindIcon className="h-7 w-7 opacity-60" />
              <span className="text-sm">
                No {label.toLowerCase()} linked yet
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {candidates.length > 0 && (
                <select
                  value={block.nodeId}
                  onChange={(e) => onChange({ nodeId: e.target.value })}
                  className="flex-1 min-w-40 h-8 bg-background/60 border border-border rounded px-2 text-sm"
                >
                  <option value="">— Pick a {label.toLowerCase()} —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-3 text-[11px] gap-1"
                onClick={createAndLink}
                disabled={createNode.isPending}
              >
                {createNode.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Create new {label.toLowerCase()}
              </Button>
            </div>
          </div>
        )
      )}
      {readOnly && !selected && (
        <div className="text-xs text-muted-foreground italic">
          No {label.toLowerCase()} linked.
        </div>
      )}
    </div>
  );
}

// =============================================================
// Header portrait input
// =============================================================

function PortraitInput({
  value,
  onChange,
  readOnly,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  readOnly: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const displayUrl = value
    ? value.startsWith("/objects/")
      ? objectUrl(value)
      : value
    : "";

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const path = await uploadImage(file);
      onChange(path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-shrink-0">
      <div className="relative w-20 h-20 rounded-md border border-border bg-background/40 overflow-hidden flex items-center justify-center group">
        {displayUrl ? (
          <img src={displayUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground/40" />
        )}
        {!readOnly && (
          <button
            type="button"
            title={displayUrl ? "Change image" : "Add image"}
            onClick={() => {
              setShowUrlInput((v) => !v);
              setUrlDraft(value ?? "");
            }}
            className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100"
          >
            <span className="text-[10px] uppercase tracking-wider">Edit</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {!readOnly && showUrlInput && (
        <div className="mt-1.5 w-48 space-y-1.5">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              className="h-6 px-2 text-[11px] gap-1 flex-1"
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Upload
            </Button>
            {value && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  onChange(null);
                  setShowUrlInput(false);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex gap-1">
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="Image URL"
              className="flex-1 min-w-0 bg-background/60 border border-border rounded px-2 py-0.5 text-[11px]"
            />
            <Button
              size="sm"
              variant="default"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                onChange(urlDraft.trim() || null);
                setShowUrlInput(false);
              }}
            >
              Set
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// Compass strip — scoped to the focused text block, optionally to a
// selection within that block.
// =============================================================

type CompassProposal =
  | {
      scope: "block";
      action: CompassAction;
      proposedContent: string;
      baseContent: string;
    }
  | {
      scope: "selection";
      action: CompassAction;
      proposedContent: string;
      baseContent: string;
      selection: { start: number; end: number; originalText: string };
    };

function CompassStrip({
  nodeId,
  focusedBlock,
  selection,
  onClearSelection,
  onAccept,
}: {
  nodeId: string;
  focusedBlock: Extract<LocalBlock, { type: "text" }>;
  selection: ActiveBlockSelection | null;
  onClearSelection: () => void;
  onAccept: (newText: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<CompassProposal | null>(null);

  // Reset proposal when the focused block changes.
  useEffect(() => {
    setProposal(null);
    setError(null);
  }, [focusedBlock.id]);

  const request = async (action: CompassAction) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setProposal(null);
    // Re-validate the selection at request time against the live block text.
    const baseText = focusedBlock.text;
    const selectionForRequest =
      selection &&
      selection.blockId === focusedBlock.id &&
      selection.end <= baseText.length &&
      baseText.slice(selection.start, selection.end) === selection.text
        ? selection
        : null;
    try {
      const res = await fetch(`/api/nodes/${nodeId}/compass-edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          instruction: instruction.trim() || undefined,
          // Send the focused block's text as the body so the model rewrites
          // just this block, not the whole node.
          contentOverride: baseText,
          selection: selectionForRequest
            ? {
                start: selectionForRequest.start,
                end: selectionForRequest.end,
                text: selectionForRequest.text,
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        scope?: "node" | "block" | "selection";
        proposedContent: string;
        selection?: { start: number; end: number; originalText: string };
      };
      if (data.scope === "selection" && data.selection) {
        setProposal({
          scope: "selection",
          action,
          proposedContent: data.proposedContent,
          baseContent: baseText,
          selection: data.selection,
        });
      } else {
        setProposal({
          scope: "block",
          action,
          proposedContent: data.proposedContent,
          baseContent: baseText,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compass edit failed");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!proposal) return;
    let newText: string;
    if (proposal.scope === "selection") {
      const { start, end, originalText } = proposal.selection;
      const cur = focusedBlock.text;
      // Only splice when the exact original range still holds. Avoid any
      // substring fallback — repeated identical snippets would otherwise
      // make us replace the wrong occurrence and corrupt unrelated text.
      if (end <= cur.length && cur.slice(start, end) === originalText) {
        newText =
          cur.slice(0, start) +
          proposal.proposedContent +
          cur.slice(end);
      } else {
        setError(
          "The highlighted text changed since Compass started — discard and try again.",
        );
        return;
      }
    } else {
      newText = proposal.proposedContent;
    }
    onAccept(newText);
    setProposal(null);
    setInstruction("");
    onClearSelection();
    setOpen(false);
  };

  const hasSelection = !!(
    selection && selection.blockId === focusedBlock.id
  );

  return (
    <div className="border-t border-border bg-accent/5">
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-accent" />
          Compass · {hasSelection ? "selection in this block" : "this text block"}
        </div>
        <Button
          data-guide="document-compass"
          variant={open ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 gap-1 text-[11px]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Open"}
        </Button>
      </div>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {!proposal && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {hasSelection ? "Edit selection" : "Edit whole block"}
                </div>
                {hasSelection && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    onClick={onClearSelection}
                  >
                    Use whole block instead
                  </button>
                )}
              </div>
              {hasSelection && selection && (
                <div className="rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-foreground/80 max-h-16 overflow-auto whitespace-pre-wrap">
                  <span className="text-accent font-medium mr-1">“</span>
                  {selection.text.length > 240
                    ? `${selection.text.slice(0, 240)}…`
                    : selection.text}
                  <span className="text-accent font-medium ml-1">”</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="secondary" disabled={busy} className="h-6 px-2 text-[11px]" onClick={() => request("expand")}>Expand</Button>
                <Button size="sm" variant="secondary" disabled={busy} className="h-6 px-2 text-[11px]" onClick={() => request("rewrite")}>Rewrite</Button>
                <Button size="sm" variant="secondary" disabled={busy} className="h-6 px-2 text-[11px]" onClick={() => request("continue")}>Continue</Button>
                {busy && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Compass is writing...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && instruction.trim()) {
                      e.preventDefault();
                      void request("custom");
                    }
                  }}
                  placeholder={
                    hasSelection
                      ? "Tell Compass how to change the highlighted text..."
                      : "Or tell Compass exactly what to change..."
                  }
                  disabled={busy}
                  className="flex-1 bg-background/60 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                />
                <Button size="sm" variant="default" disabled={busy || !instruction.trim()} className="h-6 px-2 text-[11px]" onClick={() => request("custom")}>Send</Button>
              </div>
            </>
          )}
          {error && (
            <div className="text-[11px] text-destructive border border-destructive/30 rounded px-2 py-1 bg-destructive/10">
              {error}
            </div>
          )}
          {proposal && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Compass proposed{" "}
                  {proposal.scope === "selection" ? "selection edit" : "edit"}
                  {" · "}{proposal.action}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setProposal(null)}>Discard</Button>
                  <Button size="sm" variant="default" className="h-6 px-2 text-[11px] gap-1" onClick={accept}>
                    <Check className="h-3 w-3" />
                    Accept
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-64">
                <div className="flex flex-col min-h-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {proposal.scope === "selection" ? "Selected passage" : "Current"}
                  </div>
                  <div className="flex-1 overflow-auto rounded border border-border bg-background/40 p-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
                    {(proposal.scope === "selection"
                      ? proposal.selection.originalText
                      : proposal.baseContent) || "(empty)"}
                  </div>
                </div>
                <div className="flex flex-col min-h-0">
                  <div className="text-[10px] uppercase tracking-wider text-accent mb-1">
                    {proposal.scope === "selection" ? "Proposed replacement" : "Proposed"}
                  </div>
                  <div className="flex-1 overflow-auto rounded border border-accent/40 bg-accent/5 p-2 text-[11px] whitespace-pre-wrap text-foreground">
                    {proposal.proposedContent || "(empty)"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================
// Compass auto-link suggestions (per-node strip)
// =============================================================
//
// Sits at the top of the document body (between the header and the block
// stack) and scans every text block for words/phrases that match the
// title (or key) of another node in this realm. Each match becomes a
// chip the user can tap to convert the bare word into a [[ref]] link.
// The actual edit is dispatched as a window CustomEvent so the matching
// TextBlock can apply it via its existing Y.Text-aware path.

function CompassMentionSuggestionsForEditor({
  nodeId,
  blocks,
  realmId,
  readOnly,
}: {
  nodeId: string;
  blocks: LocalBlock[];
  realmId: string | null;
  readOnly: boolean;
}) {
  const { data: realmNodes } = useListNodes(realmId || "", {
    query: {
      enabled: !!realmId,
      queryKey: getListNodesQueryKey(realmId || ""),
    },
  });
  // Local dismissal: keyed by `${target.id}:${matchText}` so dismissing
  // "Aragorn" in one place hides it everywhere in this node, but coming
  // back later (after editing) re-surfaces it because the match position
  // resets — keeping the strip predictable rather than sticky-forever.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hideAll, setHideAll] = useState(false);
  // Reset dismissals when switching nodes so each node starts fresh.
  useEffect(() => {
    setDismissed(new Set());
    setHideAll(false);
  }, [nodeId]);

  const suggestions = useMemo<AggregatedSuggestion[]>(() => {
    if (readOnly || !realmNodes || realmNodes.length === 0) return [];
    const out: AggregatedSuggestion[] = [];
    for (const b of blocks) {
      if (b.type !== "text") continue;
      const text = b.text || "";
      if (!text) continue;
      const hits = scanForMentions(text, realmNodes, nodeId);
      for (const h of hits) {
        const ctxStart = Math.max(0, h.start - 16);
        const ctxEnd = Math.min(text.length, h.end + 16);
        const context = (ctxStart > 0 ? "..." : "")
          + text.slice(ctxStart, ctxEnd)
          + (ctxEnd < text.length ? "..." : "");
        out.push({ ...h, blockId: b.id, context });
      }
    }
    return out;
  }, [blocks, realmNodes, nodeId, readOnly]);

  const visible = useMemo(
    () =>
      suggestions.filter(
        (s) => !dismissed.has(`${s.target.id}:${s.matchText.toLowerCase()}`),
      ),
    [suggestions, dismissed],
  );

  if (hideAll || visible.length === 0) return null;

  return (
    <div className="px-6 pt-4">
      <MentionSuggestionsStrip
        suggestions={visible}
        nodeId={nodeId}
        variant="inline"
        onDismiss={(s) => {
          setDismissed((prev) => {
            const next = new Set(prev);
            next.add(`${s.target.id}:${s.matchText.toLowerCase()}`);
            return next;
          });
        }}
        onHideAll={() => setHideAll(true)}
      />
    </div>
  );
}
