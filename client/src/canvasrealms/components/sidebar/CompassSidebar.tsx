import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Check,
  X,
  Send,
  Plus,
  Link2,
  Loader2,
  Trash2,
  Globe,
  Compass as CompassIcon,
  ArrowRight,
  ChevronDown,
  MessageSquare,
  HelpCircle,
  Undo2,
  Redo2,
  PanelRightClose,
  PanelRightOpen,
  Mic,
  MicOff,
} from "lucide-react";
import { useCompassVoice } from "@cr/lib/useCompassVoice";
import {
  useAppStore,
  COMPASS_MAX_WIDTH,
  COMPASS_MIN_WIDTH,
} from "@cr/lib/store";
import { SidebarResizeHandle } from "@cr/components/sidebar/SidebarResizeHandle";
import { useIsMobile } from "@cr/hooks/use-mobile";
import { useRealmRole } from "@cr/lib/useRealmRole";
import { Button } from "@cr/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@cr/components/ui/dropdown-menu";
import { cn } from "@cr/lib/utils";
import {
  useCreateNode,
  useCreateRelationship,
  useCreateRealm,
  useUpdateNode,
  useDeleteNode,
  useDeleteRelationship,
  useListNodes,
  getListNodesQueryKey,
  getListRelationshipsQueryKey,
  getListRealmsQueryKey,
  getGetNodeQueryKey,
} from "@workspace/api-client-react";
import { scanForMentions } from "@cr/lib/mentionScan";
import {
  MentionSuggestionsStrip,
  type AggregatedSuggestion,
} from "@cr/components/workspace/MentionSuggestionsStrip";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getGuide } from "@cr/lib/guides";

// How long the "Undo batch" affordance stays available after a batch is
// accepted. Reset along with all per-batch state when the user switches
// chats or scopes (see the cleanup effect below).
const UNDO_BATCH_WINDOW_MS = 30_000;

type ParsedTextBlock = {
  id: string;
  type: "text";
  text: string;
  heading?: string;
};

function makeApplyBlockId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parse a Compass-proposed markdown body into a list of structured text
 * blocks. Each markdown heading (`#`, `##`, `###`, ...) becomes its own
 * text block with the heading text stored on `heading`, and the body
 * paragraphs that follow become the block's `text`. A leading H1 that
 * matches the node title is dropped (it duplicates the page title). Any
 * prose before the first heading becomes a heading-less text block.
 */
function parseMarkdownToBlocks(
  markdown: string,
  nodeTitle: string,
): ParsedTextBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: { heading?: string; bodyLines: string[] }[] = [];
  let current: { heading?: string; bodyLines: string[] } = { bodyLines: [] };
  sections.push(current);

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      current = { heading: m[2]!.trim(), bodyLines: [] };
      sections.push(current);
    } else {
      current.bodyLines.push(line);
    }
  }

  const out: ParsedTextBlock[] = [];
  const normalizedTitle = nodeTitle.trim().toLowerCase();
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]!;
    const text = sec.bodyLines.join("\n").replace(/^\s+|\s+$/g, "");
    // Drop a leading H1 that just repeats the node title.
    if (
      i === 1 &&
      sec.heading &&
      sec.heading.trim().toLowerCase() === normalizedTitle &&
      out.length === 0 &&
      sections[0]!.bodyLines.join("").trim() === ""
    ) {
      if (text.length > 0) {
        out.push({ id: makeApplyBlockId(), type: "text", text });
      }
      continue;
    }
    if (!sec.heading && text.length === 0) continue;
    out.push({
      id: makeApplyBlockId(),
      type: "text",
      text,
      ...(sec.heading ? { heading: sec.heading } : {}),
    });
  }
  if (out.length === 0) {
    out.push({ id: makeApplyBlockId(), type: "text", text: markdown });
  }
  return out;
}

type BatchCreated = {
  nodeIds: string[];
  relIds: string[];
  // Item keys (per-item Add markers) that were set as part of accepting
  // this batch. Cleared from `addedKeys` on undo so the user sees a fresh
  // batch card again.
  itemKeys: string[];
  acceptedAt: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  suggestions?: Suggestion[];
};

type SuggestedNode = {
  type: "node";
  title: string;
  kind: "character" | "location" | "lore" | "faction" | "event" | "item" | "note";
  content: string;
  tags?: string[];
  // Optional client-side temporary id Compass invented for this node so
  // that "relationship" suggestions in the same reply can reference it.
  // Always starts with "temp:". The client substitutes it with the real
  // database id once the node is created.
  tempId?: string;
};

type SuggestedRelationship = {
  type: "relationship";
  fromNodeId: string;
  toNodeId: string;
  label: string;
};

type SuggestedCreateRealm = {
  type: "create_realm";
  name: string;
  description?: string;
};

type SuggestedSwitchRealm = {
  type: "switch_realm";
  realmId: string;
  realmName: string;
};

type SuggestedStartGuide = {
  type: "start_guide";
  guideId: string;
  caption?: string;
  kindHint?: string;
};

type SuggestedEditNode = {
  type: "edit_node";
  nodeId: string;
  nodeTitle: string;
  proposedContent: string;
  summary?: string;
};

type SuggestedClarify = {
  type: "clarify";
  question: string;
  options: { label: string; prompt: string }[];
};

type Suggestion =
  | SuggestedNode
  | SuggestedRelationship
  | SuggestedCreateRealm
  | SuggestedSwitchRealm
  | SuggestedStartGuide
  | SuggestedEditNode
  | SuggestedClarify;

type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

type ConversationsByScope = Record<string, Conversation[]>;
type ActiveByScope = Record<string, string>;

// v2 storage: an array of named conversations per scope, with a separate
// "active conversation id" map. Conversations are never auto-truncated.
const CONV_STORAGE_KEY = "reborn:compass-conversations-v2";
const ACTIVE_STORAGE_KEY = "reborn:compass-active-chat-v2";
// Legacy v1 key — read once for migration, then left in place as a backup.
const LEGACY_CHAT_STORAGE_KEY = "reborn:compass-chats-by-realm";
// Sentinel key used to scope the no-realm "global" conversations alongside
// per-realm ones in the same map.
const GLOBAL_CHAT_KEY = "__global__";
const DEFAULT_CHAT_TITLE = "New chat";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeConversation(title = DEFAULT_CHAT_TITLE): Conversation {
  const now = Date.now();
  return {
    id: newId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function loadConversations(): ConversationsByScope {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONV_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as ConversationsByScope;
      }
    }
  } catch {
    // fall through to migration / empty
  }

  // One-time migration from the v1 "single chat per scope" shape.
  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_CHAT_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Record<string, ChatMessage[]>;
      if (legacy && typeof legacy === "object") {
        const out: ConversationsByScope = {};
        for (const [scope, msgs] of Object.entries(legacy)) {
          if (!Array.isArray(msgs) || msgs.length === 0) continue;
          out[scope] = [
            {
              id: newId(),
              title: deriveTitleFromMessages(msgs) ?? "Saved chat",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messages: msgs,
            },
          ];
        }
        // Persist immediately so the next load skips migration.
        window.localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(out));
        return out;
      }
    }
  } catch {
    // ignore — start fresh
  }
  return {};
}

function saveConversations(map: ConversationsByScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / privacy errors
  }
}

function loadActive(): ActiveByScope {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ACTIVE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as ActiveByScope;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveActive(map: ActiveByScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function deriveTitleFromMessages(msgs: ChatMessage[]): string | null {
  const first = msgs.find((m) => m.role === "user" && m.content.trim());
  if (!first) return null;
  const oneLine = first.content.replace(/\s+/g, " ").trim();
  return oneLine.length > 48 ? oneLine.slice(0, 45) + "..." : oneLine;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

function isTempId(id: string): boolean {
  return id.startsWith("temp:");
}

// A reply counts as a "batch" — and is rendered as one grouped card with a
// single "Add all" button — when it would create more than one new node, or
// when at least one relationship in the same reply links a brand-new node
// (referenced by tempId) to anything else. Single-suggestion replies and
// replies that only link two existing nodes still use the per-item cards.
function isBatchSuggestions(suggestions: Suggestion[]): boolean {
  const nodes = suggestions.filter((s): s is SuggestedNode => s.type === "node");
  const rels = suggestions.filter(
    (s): s is SuggestedRelationship => s.type === "relationship",
  );
  if (nodes.length >= 2) return true;
  if (
    nodes.length >= 1 &&
    rels.some((r) => isTempId(r.fromNodeId) || isTempId(r.toNodeId))
  )
    return true;
  return false;
}

// Lay out a batch of new nodes around the given canvas center so they
// don't pile up on top of each other and so linked nodes end up
// adjacent. We do a tiny BFS over the in-batch tempId graph to order
// nodes by connectivity, then drop them into a roughly-square grid in
// that order. Pass `{x:0,y:0}` for "drop near the canvas origin" when
// no canvas is currently focused.
function layoutBatchNodes(
  nodes: SuggestedNode[],
  rels: SuggestedRelationship[],
  center: { x: number; y: number } = { x: 0, y: 0 },
): Map<SuggestedNode, { x: number; y: number }> {
  const positions = new Map<SuggestedNode, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  const byTempId = new Map<string, SuggestedNode>();
  for (const n of nodes) {
    if (n.tempId) byTempId.set(n.tempId, n);
  }
  const adj = new Map<SuggestedNode, Set<SuggestedNode>>();
  for (const n of nodes) adj.set(n, new Set());
  for (const r of rels) {
    const a = isTempId(r.fromNodeId) ? byTempId.get(r.fromNodeId) : undefined;
    const b = isTempId(r.toNodeId) ? byTempId.get(r.toNodeId) : undefined;
    if (a && b && a !== b) {
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
  }

  // Order: BFS from the most-connected node, repeating across components.
  const ordered: SuggestedNode[] = [];
  const seen = new Set<SuggestedNode>();
  const remaining = [...nodes].sort(
    (a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0),
  );
  for (const start of remaining) {
    if (seen.has(start)) continue;
    const queue: SuggestedNode[] = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      ordered.push(cur);
      const neighbors = [...(adj.get(cur) ?? [])].sort(
        (a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0),
      );
      for (const nb of neighbors) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const colW = 360;
  const rowH = 300;
  const rows = Math.ceil(ordered.length / cols);
  // Anchor the grid so its visual midpoint sits on `center`. Each cell is
  // 320x260 (the node default), so subtracting half of that aligns the
  // center of the topleft cell with `center` minus half the grid extent.
  const offsetX = center.x - ((cols - 1) * colW) / 2;
  const offsetY = center.y - ((rows - 1) * rowH) / 2;
  ordered.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(node, {
      x: Math.round(offsetX + col * colW),
      y: Math.round(offsetY + row * rowH),
    });
  });
  return positions;
}

const KIND_COLORS: Record<SuggestedNode["kind"], string> = {
  character: "#7c5cff",
  location: "#22c55e",
  lore: "#eab308",
  faction: "#ef4444",
  event: "#06b6d4",
  item: "#f97316",
  note: "#94a3b8",
};

export function CompassSidebar({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    isCompassOpen,
    setCompassOpen,
    compassWidth,
    setCompassWidth,
    compassCollapsed,
    setCompassCollapsed,
    activeRealmId,
    setActiveRealmId,
    openNewNode,
    startGuide,
    currentNodeId,
    canvasCenterRef,
  } = useAppStore();
  const isMobile = useIsMobile();

  // Embedded (campaign-hosted) mode starts the Compass collapsed so the host
  // panel has room. This override is session-local and never persists, so the
  // standalone /app Compass keeps its own remembered collapse state.
  const [embeddedCollapsed, setEmbeddedCollapsed] = useState(true);
  const effCompassCollapsed = embedded ? embeddedCollapsed : compassCollapsed;
  const setEffCompassCollapsed = embedded ? setEmbeddedCollapsed : setCompassCollapsed;

  const [conversationsByScope, setConversationsByScope] =
    useState<ConversationsByScope>(() => loadConversations());
  const [activeByScope, setActiveByScope] = useState<ActiveByScope>(() =>
    loadActive(),
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  // Per-batch notice (e.g. "2 link(s) skipped because their nodes were
  // dismissed or failed to create"). Keyed by the batch render key.
  const [batchNotices, setBatchNotices] = useState<Record<string, string>>({});
  const [batchPending, setBatchPending] = useState<Set<string>>(new Set());
  // Per-batch map from Compass-invented `temp:...` ids to the real
  // database ids of nodes that have been created during that batch.
  // Populated both by the per-item "Add" button on a batched node and by
  // "Add all", so dependent relationships can still resolve their
  // endpoints regardless of the order in which the user accepts items.
  const [tempIdRealsByBatch, setTempIdRealsByBatch] = useState<
    Record<string, Record<string, string>>
  >({});
  // Per-batch ledger of database ids that were created from accepting that
  // batch — both via the per-item "Add" buttons and via "Add all". Used by
  // the "Undo batch" affordance to delete exactly what was created (and
  // nothing else). Entries auto-expire after UNDO_BATCH_WINDOW_MS via a
  // setTimeout scheduled in the same setter that records them.
  const [batchCreated, setBatchCreated] = useState<
    Record<string, BatchCreated>
  >({});
  // Per-batch ledger of recently-undone batches. After the user clicks
  // "Undo batch", we stash the original message index + suggestions here
  // so a "Redo batch" affordance can re-run handleAddBatch and recreate
  // the same nodes and links (per-item Added markers included). Entries
  // auto-expire after UNDO_BATCH_WINDOW_MS via the same tick effect that
  // handles batchCreated, and are cleared when the chat/scope changes.
  type UndoneBatch = {
    msgIdx: number;
    suggestions: Suggestion[];
    undoneAt: number;
  };
  const [undoneBatches, setUndoneBatches] = useState<
    Record<string, UndoneBatch>
  >({});
  const [batchRedoing, setBatchRedoing] = useState<Set<string>>(new Set());
  // Tick state used purely to re-render once the undo window has elapsed
  // for any visible batch. Simpler than a per-batch timeout that has to
  // reach into stale render state.
  const [, setUndoTick] = useState(0);
  const [batchUndoing, setBatchUndoing] = useState<Set<string>>(new Set());
  // Voice mode: enabled once the server reports ELEVENLABS_API_KEY is
  // configured. When the user toggles the mic on, the useCompassVoice
  // hook owns recording, VAD, and playback; everything below the hook
  // just orchestrates the STT → Compass → TTS → confirm loop.
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Auto-grow the composer textarea to fit the typed message. We reset
  // height to 'auto' first so it can shrink when text is deleted, then
  // size it to scrollHeight. The CSS max-height caps it and re-enables
  // the scrollbar past that point.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);
  // Refs that mirror addedKeys/dismissedKeys so async mutation callbacks
  // (which close over the addedKeys snapshot from the render that fired
  // them) can still see the latest accepted/dismissed sets when deciding
  // whether the per-item Add that just completed was the last one in its
  // batch.
  const addedKeysRef = useRef(addedKeys);
  const dismissedKeysRef = useRef(dismissedKeys);
  // Mirrors batchCreated/batchUndoing so the Undo action inside the
  // post-acceptance toast — which captures the handleUndoBatch closure
  // from the render that fired the toast — still sees the latest ledger
  // entry recorded by recordBatchCreation (whose setState had not flushed
  // yet at toast time) when the user clicks Undo seconds later.
  const batchCreatedRef = useRef(batchCreated);
  const batchUndoingRef = useRef(batchUndoing);
  useEffect(() => {
    addedKeysRef.current = addedKeys;
  }, [addedKeys]);
  useEffect(() => {
    dismissedKeysRef.current = dismissedKeys;
  }, [dismissedKeys]);
  useEffect(() => {
    batchCreatedRef.current = batchCreated;
  }, [batchCreated]);
  useEffect(() => {
    batchUndoingRef.current = batchUndoing;
  }, [batchUndoing]);

  const createNode = useCreateNode();
  const createRelationship = useCreateRelationship();
  const createRealm = useCreateRealm();
  const updateNode = useUpdateNode();
  const deleteNode = useDeleteNode();
  const deleteRelationship = useDeleteRelationship();
  const queryClient = useQueryClient();
  const { canEdit } = useRealmRole(activeRealmId);

  const scopeKey = activeRealmId ?? GLOBAL_CHAT_KEY;
  const isGlobal = !activeRealmId;
  const conversations = conversationsByScope[scopeKey] ?? [];

  // Sorted view: most recently updated first. Used by the picker dropdown.
  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  // Resolve the active conversation. Falls back to the most recent existing
  // chat in this scope when the stored active id no longer points anywhere
  // valid (e.g. after a delete or a migration). This is a render-only
  // fallback — we deliberately do NOT mirror it back into `activeByScope`
  // from inside an effect, which used to fight with newChat/deleteChat and
  // re-select stale ids. State transitions that need to update the active
  // pointer (newChat, deleteChat, send) do so explicitly and atomically.
  const activeId = activeByScope[scopeKey];
  const activeConversation =
    conversations.find((c) => c.id === activeId) ??
    sortedConversations[0] ??
    null;
  const messages: ChatMessage[] = activeConversation?.messages ?? [];

  // Persist whenever either map changes.
  useEffect(() => {
    saveConversations(conversationsByScope);
  }, [conversationsByScope]);
  useEffect(() => {
    saveActive(activeByScope);
  }, [activeByScope]);

  // Pin the resolved active conversation back into `activeByScope` whenever
  // the stored pointer is missing or stale (e.g. fallback resolution after a
  // fresh load with no prior interaction in this scope, or after a migration
  // that dropped the previously active id). Without this, reloading always
  // re-resolves to the most-recently-updated chat regardless of what the
  // user was actually viewing in the previous session.
  //
  // Care is taken to avoid the regression Task #65 fixed: we only write when
  // the stored id is *absent or invalid*, never to "correct" a valid id back
  // to the fallback. This means newChat/deleteChat/send (which all set
  // activeByScope explicitly to a real existing conversation) are not fought
  // by this effect, and a deleted chat cannot be resurrected.
  useEffect(() => {
    if (!activeConversation) return;
    const stored = activeByScope[scopeKey];
    if (stored && conversations.some((c) => c.id === stored)) return;
    if (stored === activeConversation.id) return;
    setActiveByScope((prev) => {
      const cur = prev[scopeKey];
      if (cur && conversations.some((c) => c.id === cur)) return prev;
      return { ...prev, [scopeKey]: activeConversation.id };
    });
  }, [activeConversation, activeByScope, scopeKey, conversations]);

  // Reset ephemeral state (errors, "added" markers) when switching scope or
  // active chat. Persisted message history stays intact.
  useEffect(() => {
    setError(null);
    setAddedKeys(new Set());
    setDismissedKeys(new Set());
    setBatchNotices({});
    setBatchPending(new Set());
    setTempIdRealsByBatch({});
    // Per task: the "Undo batch" affordance disappears when the chat is
    // closed (i.e. the user navigates away from this conversation/scope).
    setBatchCreated({});
    setBatchUndoing(new Set());
    setUndoneBatches({});
    setBatchRedoing(new Set());
  }, [scopeKey, activeConversation?.id]);

  // Re-render once the undo window has elapsed for the soonest-expiring
  // batch so the "Undo batch" button hides itself without needing a click.
  useEffect(() => {
    const expiries: number[] = [
      ...Object.values(batchCreated).map(
        (e) => e.acceptedAt + UNDO_BATCH_WINDOW_MS,
      ),
      ...Object.values(undoneBatches).map(
        (e) => e.undoneAt + UNDO_BATCH_WINDOW_MS,
      ),
    ];
    if (expiries.length === 0) return;
    const now = Date.now();
    const nextExpiry = Math.min(...expiries);
    const delay = Math.max(0, nextExpiry - now);
    const t = window.setTimeout(() => setUndoTick((x) => x + 1), delay + 50);
    return () => window.clearTimeout(t);
  }, [batchCreated, undoneBatches]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  // Mutate the messages of a specific conversation by id. The caller is
  // responsible for ensuring the conversation exists (see `send` below) so
  // we never auto-create phantom conversations from inside a render path.
  const updateMessagesById = (
    targetId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => {
    setConversationsByScope((prev) => {
      const list = prev[scopeKey] ?? [];
      const idx = list.findIndex((c) => c.id === targetId);
      // Conversation was deleted mid-stream — drop the update silently.
      if (idx === -1) return prev;
      const current = list[idx]!;
      const nextMessages = updater(current.messages);
      const nextTitle =
        current.title === DEFAULT_CHAT_TITLE
          ? deriveTitleFromMessages(nextMessages) ?? current.title
          : current.title;
      const next: Conversation = {
        ...current,
        messages: nextMessages,
        title: nextTitle,
        updatedAt: Date.now(),
      };
      const nextList = [...list];
      nextList[idx] = next;
      return { ...prev, [scopeKey]: nextList };
    });
  };

  const newChat = () => {
    const fresh = makeConversation();
    // Atomic transition: insert the fresh conversation AND move the active
    // pointer to it in the same render pass. Both setters are batched by
    // React 18 so the next render sees a consistent (conversation, active)
    // pair and no fallback resolution kicks in.
    setConversationsByScope((prev) => {
      const list = prev[scopeKey] ?? [];
      return { ...prev, [scopeKey]: [fresh, ...list] };
    });
    setActiveByScope((prev) => ({ ...prev, [scopeKey]: fresh.id }));
    setError(null);
    setAddedKeys(new Set());
    setInput("");
  };

  const switchChat = (id: string) => {
    if (id === activeConversation?.id) return;
    setActiveByScope((prev) => ({ ...prev, [scopeKey]: id }));
  };

  const deleteChat = (id: string) => {
    // Pick the successor inside the conversations updater (using the latest
    // list) and propagate it into activeByScope in the same batch. We never
    // leave activeByScope pointing at a deleted id, and we never let the
    // render-only fallback kick in to "resurrect" the deleted chat.
    let successorId: string | undefined;
    let scopeBecameEmpty = false;
    setConversationsByScope((prev) => {
      const list = prev[scopeKey] ?? [];
      const nextList = list.filter((c) => c.id !== id);
      if (nextList.length === list.length) return prev;
      const successor = [...nextList].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      )[0];
      successorId = successor?.id;
      scopeBecameEmpty = nextList.length === 0;
      const next = { ...prev };
      if (scopeBecameEmpty) {
        delete next[scopeKey];
      } else {
        next[scopeKey] = nextList;
      }
      return next;
    });
    setActiveByScope((prev) => {
      const wasActive = prev[scopeKey] === id;
      if (!wasActive && !scopeBecameEmpty) return prev;
      const next = { ...prev };
      if (successorId) {
        next[scopeKey] = successorId;
      } else {
        delete next[scopeKey];
      }
      return next;
    });
  };

  // Voice-mode batch confirmation: when the previous assistant turn
  // included a "batch" of node/relationship suggestions, the loop asks the
  // user out loud whether to add them. The next user utterance is then
  // classified as yes/no/ambiguous instead of being routed back through
  // Compass. We stash the pending batch context here across loop turns.
  const pendingBatchConfirmRef = useRef<{
    batchKey: string;
    msgIdx: number;
    suggestions: Suggestion[];
  } | null>(null);

  const send = async (
    override?: string,
    options?: {
      // Fires once the assistant turn is fully streamed in. Used by voice
      // mode to grab the final reply text + suggestions (so it can speak
      // them and decide whether to ask for batch confirmation) without
      // having to re-derive them from the persisted messages list.
      onFinal?: (
        reply: string,
        suggestions: Suggestion[],
        assistantMsgIdx: number,
      ) => void;
    },
  ) => {
    const text = (override ?? input).trim();
    if (!text || isSending) return;
    if (!override) setInput("");
    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    // Pin a single target conversation id for the entire request lifecycle
    // so streaming callbacks (appendDelta, setFinal) always land in the same
    // chat, even if the user switches chats mid-stream. If there is no
    // active conversation yet (e.g. fresh empty realm), create one upfront
    // in the same batch as the first message append.
    let targetId = activeConversation?.id;
    if (!targetId) {
      const fresh = makeConversation();
      targetId = fresh.id;
      setConversationsByScope((prev) => {
        const list = prev[scopeKey] ?? [];
        // Idempotent under StrictMode double-invocation.
        if (list.some((c) => c.id === fresh.id)) return prev;
        return { ...prev, [scopeKey]: [fresh, ...list] };
      });
      setActiveByScope((prev) => ({ ...prev, [scopeKey]: fresh.id }));
    } else if (activeByScope[scopeKey] !== targetId) {
      // The render-only fallback resolved to this conversation but storage
      // still points elsewhere. Pin it now so the persisted active id
      // matches what the user is actually talking to.
      setActiveByScope((prev) => ({ ...prev, [scopeKey]: targetId! }));
    }
    const pinnedId = targetId;

    // Capture the index of the assistant turn the moment we push it so
    // voice mode can hand the same msgIdx to handleAddBatch later. React
    // 18 StrictMode runs setState updaters twice in dev, but both runs
    // receive the same `prev`, so `assistantMsgIdx` is computed
    // deterministically.
    let assistantMsgIdx = -1;
    updateMessagesById(pinnedId, (prev) => {
      assistantMsgIdx = prev.length + 1;
      return [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "" },
      ];
    });
    setIsSending(true);

    // Latest reply/suggestions snapshot for the onFinal callback. The
    // server may stream a single "final" event, but we keep these around
    // through the whole stream so the callback always fires with the
    // most up-to-date values.
    let finalReply = "";
    let finalSuggestions: Suggestion[] = [];

    const appendDelta = (delta: string) => {
      updateMessagesById(pinnedId, (prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1]!;
        if (last.role !== "assistant") return prev;
        const updated: ChatMessage = { ...last, content: last.content + delta };
        return [...prev.slice(0, -1), updated];
      });
    };

    const setFinal = (suggestions: Suggestion[], reply: string) => {
      finalReply = reply;
      finalSuggestions = suggestions;
      updateMessagesById(pinnedId, (prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1]!;
        if (last.role !== "assistant") return prev;
        const updated: ChatMessage = {
          ...last,
          content: reply || last.content,
          suggestions,
        };
        return [...prev.slice(0, -1), updated];
      });
    };

    try {
      const url = isGlobal
        ? `/api/compass`
        : `/api/realms/${activeRealmId}/compass`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          message: text,
          history,
          ...(currentNodeId ? { currentNodeId } : {}),
          viewport: {
            isMobile,
            ...(typeof window !== "undefined"
              ? {
                  width: window.innerWidth,
                  height: window.innerHeight,
                  // On mobile (<lg) the library drawer is hidden by default
                  // unless the user has opened it. On desktop (lg+) it's
                  // always pinned visible regardless of state.
                  librarySidebarOpen: window.innerWidth >= 1024,
                }
              : {}),
          },
        }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let streamError: string | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sepIdx = buf.indexOf("\n\n");
        while (sepIdx >= 0) {
          const rawEvent = buf.slice(0, sepIdx);
          buf = buf.slice(sepIdx + 2);
          sepIdx = buf.indexOf("\n\n");
          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) continue;
          let payload: unknown;
          try {
            payload = JSON.parse(dataLines.join("\n"));
          } catch {
            continue;
          }
          if (eventName === "reply_delta") {
            const d = (payload as { delta?: string }).delta ?? "";
            if (d) appendDelta(d);
          } else if (eventName === "final") {
            const p = payload as { reply: string; suggestions: Suggestion[] };
            setFinal(p.suggestions ?? [], p.reply ?? "");
          } else if (eventName === "error") {
            streamError =
              (payload as { error?: string }).error ?? "Compass request failed";
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (options?.onFinal) {
        try {
          options.onFinal(finalReply, finalSuggestions, assistantMsgIdx);
        } catch {
          // ignore callback errors so they don't trip the catch below
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compass is unavailable");
      updateMessagesById(pinnedId, (prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1]!;
        if (last.role === "assistant" && !last.content && !last.suggestions) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsSending(false);
    }
  };

  // Add a single suggested node. Optional `batchCtx` carries the parent
  // batch's render key and a precomputed grid position; when present, the
  // newly-created real id is recorded into `tempIdRealsByBatch` so any
  // dependent relationships (whether accepted individually right after,
  // or via the same batch's later "Add all") can resolve their endpoints.
  const addNode = async (
    key: string,
    s: SuggestedNode,
    batchCtx?: {
      batchKey: string;
      position: { x: number; y: number };
      msgIdx: number;
      suggestions: Suggestion[];
    },
  ) => {
    if (!activeRealmId || addedKeys.has(key)) return;
    setAddedKeys((prev) => new Set(prev).add(key));
    const pos = batchCtx?.position ?? {
      x: Math.round(
        (canvasCenterRef.current?.x ?? 0) + Math.random() * 240 - 120,
      ),
      y: Math.round(
        (canvasCenterRef.current?.y ?? 0) + Math.random() * 240 - 120,
      ),
    };
    // Split the proposed markdown into one text block per heading so
    // the structured editor renders each section as its own collapsible
    // field, matching how `handleApplyEdit` treats edits to existing
    // nodes. Without this, a brand-new Compass node lands as a single
    // text block containing raw "## Heading" markdown.
    const newNodeBlocks = parseMarkdownToBlocks(s.content, s.title);
    createNode.mutate(
      {
        realmId: activeRealmId,
        data: {
          title: s.title,
          content: "",
          blocks: newNodeBlocks,
          tags: s.tags ?? [],
          kind: s.kind,
          mode: "window",
          x: pos.x,
          y: pos.y,
          width: 320,
          height: 260,
          zIndex: 10,
          color: KIND_COLORS[s.kind] ?? "#7c5cff",
        } as Parameters<typeof createNode.mutate>[0]["data"],
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({
            queryKey: getListNodesQueryKey(activeRealmId),
          });
          // Seed the per-node cache so the editor that opens this id
          // renders immediately from the just-returned row, and any
          // peers already subscribed to the node refresh without a
          // manual reload. Both together cover the case where the
          // editor mounts BEFORE the list query has settled.
          queryClient.setQueryData(getGetNodeQueryKey(created.id), created);
          queryClient.invalidateQueries({
            queryKey: getGetNodeQueryKey(created.id),
          });
          if (batchCtx && s.tempId) {
            setTempIdRealsByBatch((prev) => ({
              ...prev,
              [batchCtx.batchKey]: {
                ...(prev[batchCtx.batchKey] ?? {}),
                [s.tempId!]: created.id,
              },
            }));
          }
          if (batchCtx) {
            recordBatchCreation(batchCtx.batchKey, {
              nodeIds: [created.id],
              relIds: [],
              itemKeys: [key],
            });
            maybeShowBatchCompleteToast(
              batchCtx.batchKey,
              batchCtx.msgIdx,
              batchCtx.suggestions,
              key,
            );
          }
          // Don't auto-focus when adding as part of a batch — opening a
          // new pane per node would be jarring during multi-add.
          if (!batchCtx) openNewNode(created.id);
        },
        onError: () =>
          setAddedKeys((prev) => {
            const n = new Set(prev);
            n.delete(key);
            return n;
          }),
      },
    );
  };

  // Merge fresh creations into the per-batch ledger and (re)stamp
  // `acceptedAt` so the undo window starts (or restarts) from the most
  // recent acceptance. This means clicking individual "Add" buttons and
  // then "Add all" still gives the user a full UNDO_BATCH_WINDOW_MS to
  // back out of the whole batch.
  const recordBatchCreation = (
    batchKey: string,
    add: { nodeIds: string[]; relIds: string[]; itemKeys: string[] },
  ) => {
    setBatchCreated((prev) => {
      const existing = prev[batchKey];
      const merged: BatchCreated = {
        nodeIds: Array.from(
          new Set([...(existing?.nodeIds ?? []), ...add.nodeIds]),
        ),
        relIds: Array.from(
          new Set([...(existing?.relIds ?? []), ...add.relIds]),
        ),
        itemKeys: Array.from(
          new Set([...(existing?.itemKeys ?? []), ...add.itemKeys]),
        ),
        acceptedAt: Date.now(),
      };
      return { ...prev, [batchKey]: merged };
    });
  };

  // Undo a previously-accepted batch: delete every node and relationship
  // that was created from this batch (and only those — we never touch
  // nodes/links that pre-existed or came from other batches). On success,
  // clear the per-item "Added" markers so the batch card visually resets,
  // and forget the per-batch tempId map (so a subsequent re-accept starts
  // fresh).
  const handleUndoBatch = async (
    batchKey: string,
    msgIdx: number,
    suggestions: Suggestion[],
  ) => {
    if (!activeRealmId) return;
    // Read from refs so an Undo click on the post-acceptance toast (whose
    // onClick captured this closure right after recordBatchCreation queued
    // its state update) still sees the just-recorded ledger entry.
    const entry =
      batchCreatedRef.current[batchKey] ?? batchCreated[batchKey];
    if (!entry || batchUndoingRef.current.has(batchKey)) return;
    setBatchUndoing((prev) => new Set(prev).add(batchKey));

    // Track exactly which ids were successfully deleted so that if some
    // deletions fail, we leave the corresponding "Added" markers and
    // ledger entries in place. The user can then click "Undo batch"
    // again to retry the survivors instead of accidentally re-creating
    // duplicates by clicking "Add" on items whose underlying rows were
    // never actually removed.
    const remainingNodeIds: string[] = [];
    const remainingRelIds: string[] = [];
    let failed = 0;

    // Delete relationships first to avoid the cascading-delete-from-node
    // path doing extra work, but tolerate either order: the API cascades
    // node deletes anyway and relationship deletion of an already-removed
    // row simply returns an error we record as failed.
    for (const relId of entry.relIds) {
      try {
        await deleteRelationship.mutateAsync({ relationshipId: relId });
      } catch {
        remainingRelIds.push(relId);
        failed += 1;
      }
    }
    for (const nodeId of entry.nodeIds) {
      try {
        await deleteNode.mutateAsync({ nodeId });
      } catch {
        remainingNodeIds.push(nodeId);
        failed += 1;
      }
    }
    const deletedRels = entry.relIds.length - remainingRelIds.length;
    const deletedNodes = entry.nodeIds.length - remainingNodeIds.length;

    queryClient.invalidateQueries({
      queryKey: getListNodesQueryKey(activeRealmId),
    });
    queryClient.invalidateQueries({
      queryKey: getListRelationshipsQueryKey(activeRealmId),
    });

    // Item keys that map to ids we *did* successfully delete. A best
    // effort: itemKeys aren't 1:1 with ids in the ledger (Add all batches
    // them together), so when there are failures we conservatively only
    // clear keys if everything succeeded. Otherwise the survivors retain
    // their "Added" state and the undo button stays available for retry.
    const allSucceeded = remainingNodeIds.length === 0 &&
      remainingRelIds.length === 0;
    if (allSucceeded) {
      setAddedKeys((prev) => {
        const next = new Set(prev);
        for (const k of entry.itemKeys) next.delete(k);
        return next;
      });
      setBatchCreated((prev) => {
        const next = { ...prev };
        delete next[batchKey];
        return next;
      });
      setTempIdRealsByBatch((prev) => {
        const next = { ...prev };
        delete next[batchKey];
        return next;
      });
      setBatchNotices((prev) => {
        const next = { ...prev };
        delete next[batchKey];
        return next;
      });
      // Open a 30s redo window: stash the original suggestions so the
      // user can recreate the same nodes and links with one click.
      setUndoneBatches((prev) => ({
        ...prev,
        [batchKey]: { msgIdx, suggestions, undoneAt: Date.now() },
      }));
    } else {
      // Keep the ledger entry around (with only the survivors) and
      // refresh acceptedAt so the user gets another full undo window
      // to retry. The per-item Added markers stay untouched.
      setBatchCreated((prev) => ({
        ...prev,
        [batchKey]: {
          nodeIds: remainingNodeIds,
          relIds: remainingRelIds,
          itemKeys: entry.itemKeys,
          acceptedAt: Date.now(),
        },
      }));
    }
    setBatchUndoing((prev) => {
      const next = new Set(prev);
      next.delete(batchKey);
      return next;
    });

    const parts: string[] = [];
    if (deletedNodes > 0)
      parts.push(`${deletedNodes} node${deletedNodes === 1 ? "" : "s"}`);
    if (deletedRels > 0)
      parts.push(`${deletedRels} link${deletedRels === 1 ? "" : "s"}`);
    const summary = parts.length > 0 ? parts.join(" and ") : "nothing";
    if (failed > 0) {
      toast(
        `Undid batch: removed ${summary} (${failed} couldn't be removed; click Undo batch again to retry)`,
      );
    } else {
      toast(`Undid batch: removed ${summary}`);
    }
  };

  // Re-apply a batch the user just undid. Replays handleAddBatch with the
  // same suggestions, which recreates every node and link (and restores
  // the per-item "Added" markers because handleAddBatch sets them as it
  // creates each row). The redo entry is removed up front so a second
  // click can't double-create. Positions are recomputed from the current
  // canvas center, matching how the user originally accepted the batch.
  const handleRedoBatch = async (batchKey: string) => {
    const undone = undoneBatches[batchKey];
    if (!undone || batchRedoing.has(batchKey)) return;
    setBatchRedoing((prev) => new Set(prev).add(batchKey));
    setUndoneBatches((prev) => {
      const next = { ...prev };
      delete next[batchKey];
      return next;
    });
    try {
      await handleAddBatch(batchKey, undone.msgIdx, undone.suggestions);
    } finally {
      setBatchRedoing((prev) => {
        const next = new Set(prev);
        next.delete(batchKey);
        return next;
      });
    }
  };

  // Show a transient toast with an "Undo" action mirroring the in-card
  // "Undo batch" button. Used right after a batch is fully accepted —
  // either via "Add all" or after the last per-item Add lands — so the
  // safety net is visible at the moment it matters most. Auto-dismisses
  // after the same window the in-card affordance uses.
  const showBatchUndoToast = (
    batchKey: string,
    msgIdx: number,
    suggestions: Suggestion[],
    summary: string,
  ) => {
    toast(summary, {
      duration: UNDO_BATCH_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => void handleUndoBatch(batchKey, msgIdx, suggestions),
      },
    });
  };

  // Compute the per-item keys (nodes + relationships only) for a batch.
  const batchItemKeys = (msgIdx: number, suggestions: Suggestion[]): string[] =>
    suggestions
      .map((s, j) => ({
        s,
        k: `${activeConversation?.id ?? "x"}:${msgIdx}:${j}`,
      }))
      .filter(({ s }) => s.type === "node" || s.type === "relationship")
      .map(({ k }) => k);

  // Called from the per-item Add success paths. Fires the undo toast iff
  // the just-added item was the final outstanding one in its batch (every
  // other node/relationship is already accepted or dismissed).
  const maybeShowBatchCompleteToast = (
    batchKey: string,
    msgIdx: number,
    suggestions: Suggestion[],
    justAddedKey: string,
  ) => {
    const allKeys = batchItemKeys(msgIdx, suggestions);
    if (allKeys.length === 0) return;
    const accepted = new Set(addedKeysRef.current);
    accepted.add(justAddedKey);
    const dismissed = dismissedKeysRef.current;
    const remaining = allKeys.filter(
      (k) => !accepted.has(k) && !dismissed.has(k),
    );
    if (remaining.length === 0) {
      showBatchUndoToast(batchKey, msgIdx, suggestions, "Batch added");
    }
  };

  // Accept a whole grouped batch in one click: create all nodes that are
  // not already added or dismissed, build a tempId -> real id map, then
  // create the relationships substituting temp ids with real ids. Skip any
  // relationship whose endpoints couldn't be resolved (because the node
  // failed to create or was individually dismissed) and surface a brief
  // notice explaining what was skipped.
  const handleAddBatch = async (
    batchKey: string,
    msgIdx: number,
    suggestions: Suggestion[],
  ) => {
    if (!activeRealmId || batchPending.has(batchKey)) return;
    // The user is resolving this batch manually — any pending verbal
    // "yes/no" prompt for the same batch is no longer meaningful. Clear
    // it so the next spoken utterance flows to Compass as a normal turn.
    if (pendingBatchConfirmRef.current?.batchKey === batchKey) {
      pendingBatchConfirmRef.current = null;
    }
    setBatchPending((prev) => new Set(prev).add(batchKey));
    setBatchNotices((prev) => {
      const next = { ...prev };
      delete next[batchKey];
      return next;
    });
    // Re-accepting closes any open redo window for this batch — the
    // user is reapplying the batch right now, so the "Redo batch"
    // affordance no longer means anything.
    setUndoneBatches((prev) => {
      if (!prev[batchKey]) return prev;
      const next = { ...prev };
      delete next[batchKey];
      return next;
    });

    const nodeEntries: { idx: number; node: SuggestedNode; key: string }[] = [];
    const relEntries: {
      idx: number;
      rel: SuggestedRelationship;
      key: string;
    }[] = [];
    suggestions.forEach((s, j) => {
      const k = `${activeConversation?.id ?? "x"}:${msgIdx}:${j}`;
      if (s.type === "node") nodeEntries.push({ idx: j, node: s, key: k });
      else if (s.type === "relationship")
        relEntries.push({ idx: j, rel: s, key: k });
    });

    const center = canvasCenterRef.current ?? { x: 0, y: 0 };
    const positions = layoutBatchNodes(
      nodeEntries.map((e) => e.node),
      relEntries.map((e) => e.rel),
      center,
    );

    // tempId -> real database id. Seed from anything the user already
    // accepted individually inside this batch (so dependent relationships
    // can still resolve their endpoints). Mutated in place as more nodes
    // get created below; we mirror it back into React state at the end so
    // any lingering individual "Add link" buttons see the latest map.
    const tempToReal: Record<string, string> = {
      ...(tempIdRealsByBatch[batchKey] ?? {}),
    };
    const failedTempIds = new Set<string>();
    let createdCount = 0;
    let failedCount = 0;
    const newlyCreatedNodeIds: string[] = [];
    const newlyCreatedRelIds: string[] = [];
    const newlyAcceptedKeys: string[] = [];

    for (const entry of nodeEntries) {
      // Skip nodes the user explicitly dismissed.
      if (dismissedKeys.has(entry.key)) {
        if (entry.node.tempId) failedTempIds.add(entry.node.tempId);
        continue;
      }
      // Already accepted individually. If we recorded the real id when
      // they clicked "Add" (the normal path), reuse it. Only fall back
      // to "skip dependent rels" if the map somehow doesn't have it
      // (e.g. the click landed before tempIdRealsByBatch was wired up).
      if (addedKeys.has(entry.key)) {
        if (entry.node.tempId && !tempToReal[entry.node.tempId]) {
          failedTempIds.add(entry.node.tempId);
        }
        continue;
      }
      const pos = positions.get(entry.node) ?? center;
      try {
        // Same split-into-blocks treatment as the single-node Add path
        // so batched Compass creations also render as one editor field
        // per heading instead of a single block full of "## Heading"
        // markdown.
        const entryBlocks = parseMarkdownToBlocks(
          entry.node.content,
          entry.node.title,
        );
        const created = await createNode.mutateAsync({
          realmId: activeRealmId,
          data: {
            title: entry.node.title,
            content: "",
            blocks: entryBlocks,
            tags: entry.node.tags ?? [],
            kind: entry.node.kind,
            mode: "window",
            x: pos.x,
            y: pos.y,
            width: 320,
            height: 260,
            zIndex: 10,
            color: KIND_COLORS[entry.node.kind] ?? "#7c5cff",
          } as Parameters<typeof createNode.mutateAsync>[0]["data"],
        });
        if (entry.node.tempId) tempToReal[entry.node.tempId] = created.id;
        setAddedKeys((prev) => new Set(prev).add(entry.key));
        newlyCreatedNodeIds.push(created.id);
        newlyAcceptedKeys.push(entry.key);
        createdCount += 1;
      } catch {
        failedCount += 1;
        if (entry.node.tempId) failedTempIds.add(entry.node.tempId);
      }
    }

    // Persist the merged tempId map so per-item "Add link" buttons that
    // appear alongside the batch can keep resolving endpoints.
    setTempIdRealsByBatch((prev) => ({
      ...prev,
      [batchKey]: { ...(prev[batchKey] ?? {}), ...tempToReal },
    }));

    queryClient.invalidateQueries({
      queryKey: getListNodesQueryKey(activeRealmId),
    });
    // Make sure every newly-created node has a fresh per-node cache so
    // any pane that opens one immediately renders its content without
    // requiring a manual reload (issue #4 from the user: live update of
    // node body after Compass apply).
    for (const nodeId of newlyCreatedNodeIds) {
      queryClient.invalidateQueries({ queryKey: getGetNodeQueryKey(nodeId) });
    }

    let linkedCount = 0;
    let skippedRelCount = 0;
    for (const entry of relEntries) {
      if (dismissedKeys.has(entry.key) || addedKeys.has(entry.key)) continue;
      const resolveSide = (id: string): string | null => {
        if (isTempId(id)) {
          if (failedTempIds.has(id)) return null;
          return tempToReal[id] ?? null;
        }
        return id;
      };
      const fromId = resolveSide(entry.rel.fromNodeId);
      const toId = resolveSide(entry.rel.toNodeId);
      if (!fromId || !toId || fromId === toId) {
        skippedRelCount += 1;
        continue;
      }
      try {
        const createdRel = await createRelationship.mutateAsync({
          realmId: activeRealmId,
          data: { fromNodeId: fromId, toNodeId: toId, label: entry.rel.label },
        });
        setAddedKeys((prev) => new Set(prev).add(entry.key));
        newlyCreatedRelIds.push(createdRel.id);
        newlyAcceptedKeys.push(entry.key);
        linkedCount += 1;
      } catch {
        skippedRelCount += 1;
      }
    }

    queryClient.invalidateQueries({
      queryKey: getListRelationshipsQueryKey(activeRealmId),
    });

    const noticeParts: string[] = [];
    if (createdCount > 0)
      noticeParts.push(
        `Created ${createdCount} node${createdCount === 1 ? "" : "s"}`,
      );
    if (linkedCount > 0)
      noticeParts.push(
        `linked ${linkedCount} relationship${linkedCount === 1 ? "" : "s"}`,
      );
    if (failedCount > 0)
      noticeParts.push(
        `${failedCount} node${failedCount === 1 ? "" : "s"} failed`,
      );
    if (skippedRelCount > 0)
      noticeParts.push(
        `${skippedRelCount} link${skippedRelCount === 1 ? "" : "s"} skipped (missing endpoint)`,
      );
    if (noticeParts.length > 0) {
      const notice = noticeParts.join(", ") + ".";
      setBatchNotices((prev) => ({ ...prev, [batchKey]: notice }));
    }

    if (newlyCreatedNodeIds.length > 0 || newlyCreatedRelIds.length > 0) {
      recordBatchCreation(batchKey, {
        nodeIds: newlyCreatedNodeIds,
        relIds: newlyCreatedRelIds,
        itemKeys: newlyAcceptedKeys,
      });
      const summaryParts: string[] = [];
      if (createdCount > 0)
        summaryParts.push(
          `${createdCount} node${createdCount === 1 ? "" : "s"}`,
        );
      if (linkedCount > 0)
        summaryParts.push(
          `${linkedCount} link${linkedCount === 1 ? "" : "s"}`,
        );
      const summary =
        summaryParts.length > 0
          ? `Added ${summaryParts.join(" and ")}`
          : "Batch added";
      showBatchUndoToast(batchKey, msgIdx, suggestions, summary);
    }

    setBatchPending((prev) => {
      const next = new Set(prev);
      next.delete(batchKey);
      return next;
    });
  };

  const dismissItem = (key: string) => {
    setDismissedKeys((prev) => new Set(prev).add(key));
  };

  // Dismiss every node + relationship in a grouped batch in one click.
  // Items that have already been individually accepted (in addedKeys) are
  // left alone — dismissal only applies to suggestions the user hasn't
  // already acted on. Other suggestion types in the same reply
  // (clarify, start_guide, ...) render outside the batch card and are
  // not touched.
  const dismissBatch = (msgIdx: number, suggestions: Suggestion[]) => {
    // Same as handleAddBatch: a manual dismiss resolves the batch, so
    // any verbal-confirm prompt waiting on it should be retired.
    const batchKey = `${activeConversation?.id ?? "x"}:${msgIdx}:batch`;
    if (pendingBatchConfirmRef.current?.batchKey === batchKey) {
      pendingBatchConfirmRef.current = null;
    }
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      suggestions.forEach((s, j) => {
        if (s.type !== "node" && s.type !== "relationship") return;
        const k = `${activeConversation?.id ?? "x"}:${msgIdx}:${j}`;
        if (!addedKeys.has(k)) next.add(k);
      });
      return next;
    });
  };

  // Resolve a relationship endpoint id against the per-batch tempId map
  // (for `temp:...` ids invented by Compass) or pass it through (for real
  // node ids that already exist). Returns null when a tempId hasn't been
  // realized yet — callers should disable their Add button in that case.
  const resolveBatchEndpoint = (
    batchKey: string,
    id: string,
  ): string | null => {
    if (!isTempId(id)) return id;
    return tempIdRealsByBatch[batchKey]?.[id] ?? null;
  };

  // Per-item Add button for a relationship inside a grouped batch card.
  // Mirrors `addRelationship` but resolves tempId endpoints through the
  // per-batch map so users can accept individual links one at a time
  // without having to click "Add all".
  const addRelationshipFromBatch = (
    key: string,
    s: SuggestedRelationship,
    batchKey: string,
    msgIdx: number,
    suggestions: Suggestion[],
  ) => {
    if (!activeRealmId || addedKeys.has(key)) return;
    const fromId = resolveBatchEndpoint(batchKey, s.fromNodeId);
    const toId = resolveBatchEndpoint(batchKey, s.toNodeId);
    if (!fromId || !toId || fromId === toId) return;
    setAddedKeys((prev) => new Set(prev).add(key));
    createRelationship.mutate(
      {
        realmId: activeRealmId,
        data: { fromNodeId: fromId, toNodeId: toId, label: s.label },
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({
            queryKey: getListRelationshipsQueryKey(activeRealmId),
          });
          recordBatchCreation(batchKey, {
            nodeIds: [],
            relIds: [created.id],
            itemKeys: [key],
          });
          maybeShowBatchCompleteToast(batchKey, msgIdx, suggestions, key);
        },
        onError: () =>
          setAddedKeys((prev) => {
            const n = new Set(prev);
            n.delete(key);
            return n;
          }),
      },
    );
  };

  const addRelationship = (key: string, s: SuggestedRelationship) => {
    if (!activeRealmId || addedKeys.has(key)) return;
    setAddedKeys((prev) => new Set(prev).add(key));
    createRelationship.mutate(
      {
        realmId: activeRealmId,
        data: {
          fromNodeId: s.fromNodeId,
          toNodeId: s.toNodeId,
          label: s.label,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListRelationshipsQueryKey(activeRealmId),
          });
        },
        onError: () =>
          setAddedKeys((prev) => {
            const n = new Set(prev);
            n.delete(key);
            return n;
          }),
      },
    );
  };

  const handleCreateRealm = (key: string, s: SuggestedCreateRealm) => {
    if (addedKeys.has(key) || createRealm.isPending) return;
    setAddedKeys((prev) => new Set(prev).add(key));
    createRealm.mutate(
      {
        data: {
          name: s.name,
          ...(s.description ? { description: s.description } : {}),
        },
      },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
          setActiveRealmId(res.id);
        },
        onError: () =>
          setAddedKeys((prev) => {
            const n = new Set(prev);
            n.delete(key);
            return n;
          }),
      },
    );
  };

  const handleApplyEdit = async (key: string, s: SuggestedEditNode) => {
    if (!activeRealmId || addedKeys.has(key)) return;
    setAddedKeys((prev) => new Set(prev).add(key));
    // The structured editor renders from node.blocks and ignores the
    // legacy `content` field whenever any blocks exist. Parse the
    // proposed markdown into one text block per heading (with the
    // heading stored on its own field, not inside the text), and
    // preserve any non-text blocks (images, embedded maps/canvases)
    // already on the node so applying an edit only rewrites prose.
    const cached = queryClient.getQueryData<{
      title?: string;
      blocks?: Array<Record<string, unknown> & { type?: string }>;
    }>(getGetNodeQueryKey(s.nodeId));
    const existing = Array.isArray(cached?.blocks) ? cached!.blocks! : [];
    const preserved = existing.filter((b) => b && b.type && b.type !== "text");
    const parsed = parseMarkdownToBlocks(
      s.proposedContent,
      cached?.title ?? s.nodeTitle,
    );
    const blocks = [...parsed, ...preserved];
    // Use mutateAsync so callers (e.g. the master "Apply all" button)
    // can await this edit before starting the next dependent step.
    await updateNode.mutateAsync(
      {
        nodeId: s.nodeId,
        data: { blocks, content: "" } as Parameters<typeof updateNode.mutate>[0]["data"],
      },
      {
        // Write the server's authoritative response straight into the
        // cache instead of invalidating + refetching. Invalidation
        // produced a visible "teleport" — the editor would re-render
        // with stale (old) blocks while the refetch was in flight, then
        // re-render again when the refetch landed with the new blocks,
        // remounting every textarea twice.
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetNodeQueryKey(s.nodeId), updated);
          queryClient.setQueryData(
            getListNodesQueryKey(activeRealmId),
            (old: Array<{ id: string }> | undefined) =>
              old?.map((n) => (n.id === s.nodeId ? (updated as typeof n) : n)),
          );
          // Do NOT invalidate here. setQueryData synchronously publishes
          // the authoritative server row to every React Query subscriber
          // of these keys, so any open document pane re-renders with the
          // new blocks immediately. Calling invalidateQueries on top
          // kicks off a refetch that races with the open editor's own
          // 500ms debounced autosave (DocumentEditor): the editor sees
          // the new blocks, schedules a no-op save with the same data,
          // and meanwhile the in-flight refetch can briefly resolve to
          // an intermediate cache value — which is exactly the glitch
          // where the open node flips back and forth between "empty"
          // and "with the changes" until the user refreshes. The
          // earlier in-code comment on this block already warned about
          // a "teleport" caused by invalidation; the invalidation calls
          // re-introduced that regression and are removed here.
        },
        onError: () =>
          setAddedKeys((prev) => {
            const n = new Set(prev);
            n.delete(key);
            return n;
          }),
      },
    );
  };

  const handleSwitchRealm = (s: SuggestedSwitchRealm) => {
    setActiveRealmId(s.realmId);
    setCompassOpen(false);
  };

  const handleStartGuide = (s: SuggestedStartGuide) => {
    if (!getGuide(s.guideId)) return;
    const params = s.kindHint ? { kindHint: s.kindHint } : undefined;
    // On <lg viewports the Compass panel is `fixed` and slides off-screen
    // via a 200ms `translate-x` transition when we close it. If we start
    // the guide immediately, the highlight appears while the panel is
    // still mid-flight at z-50 — and the user's very first tap on the
    // highlighted target lands on the still-animating Compass panel
    // (visible at the right edge of the screen) instead of the target
    // underneath. The guide's capture-phase click handler then sees an
    // event target that isn't inside the highlighted button and the
    // overlay area, so it treats the tap as off-target and cancels.
    //
    // Wait for the slide-out transition to fully finish before starting
    // the guide, so the panel is no longer intercepting pointer events
    // when the highlight goes live. On lg+ the panel is in normal flow
    // (`lg:relative`, always translate-x-0) so there's nothing to wait
    // for — start immediately.
    const needsClose =
      typeof window !== "undefined" &&
      window.innerWidth < 1024 &&
      isCompassOpen;
    if (needsClose) {
      setCompassOpen(false);
      // 200ms transition + a small frame buffer.
      window.setTimeout(() => startGuide(s.guideId, params), 240);
    } else {
      // Still flip the state for consistency, though on desktop it has
      // no visual effect (the panel is always rendered).
      setCompassOpen(false);
      startGuide(s.guideId, params);
    }
  };

  // -------------------------------------------------------------------------
  // Voice mode wiring
  // -------------------------------------------------------------------------

  // One-time check: does the server have an ElevenLabs key? If not, the
  // mic button stays hidden. Failure to reach the endpoint is treated as
  // "voice unavailable" — better than rendering a button that can never
  // work.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/compass/voice/status")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => {
        if (!cancelled) setVoiceAvailable(Boolean(j?.enabled));
      })
      .catch(() => {
        if (!cancelled) setVoiceAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refs that mirror the latest helpers / state the voice loop needs.
  // The hook captures its onSpeechEnd callback at construction time and
  // never re-binds; reading through these refs lets every loop iteration
  // see the freshest send(), handleAddBatch, isGlobal flag, etc.
  const sendRef = useRef(send);
  // Initialize with the live handler instead of a null-cast — the
  // function is in scope here and has the right signature, so the ref
  // is type-safe from the first render without an `unknown` cast.
  const handleAddBatchRef = useRef<typeof handleAddBatch>(handleAddBatch);
  const activeRealmIdRef = useRef(activeRealmId);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    handleAddBatchRef.current = handleAddBatch;
  });
  useEffect(() => {
    activeRealmIdRef.current = activeRealmId;
  }, [activeRealmId]);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const speakAndResumeRef = useRef<(text: string) => Promise<void>>(
    async () => {},
  );

  // Hand-tuned yes/no classifier for batch confirmation utterances. We
  // intentionally keep this tiny and explicit instead of asking the LLM
  // again — the answer arrives mid-conversation when the user expects
  // the next thing they hear to be either confirmation or the next
  // question, not another network round-trip to Compass. Ambiguous
  // utterances fall through to a re-prompt instead of guessing.
  const classifyYesNo = (text: string): "yes" | "no" | "ambiguous" => {
    const t = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return "ambiguous";
    const yesPatterns = [
      /\byes\b/,
      /\byeah\b/,
      /\byep\b/,
      /\byup\b/,
      /\bsure\b/,
      /\bplease do\b/,
      /\bgo ahead\b/,
      /\bdo it\b/,
      /\b(add|create|apply) (it|them|all|those|these)\b/,
      /\bsounds good\b/,
      /\bperfect\b/,
      /\bconfirmed?\b/,
      /\bok(ay)?\b/,
      /\baccept\b/,
    ];
    const noPatterns = [
      /\bno\b/,
      /\bnope\b/,
      /\bdon'?t\b/,
      /\bdo not\b/,
      /\bnever mind\b/,
      /\bnevermind\b/,
      /\bnot (now|yet)\b/,
      /\bcancel\b/,
      /\bskip\b/,
      /\bstop\b/,
      /\babort\b/,
      /\bdismiss\b/,
      /\bdecline\b/,
      /\breject\b/,
      /\bhold (on|off)\b/,
      /\bwait\b/,
    ];
    const yes = yesPatterns.some((re) => re.test(t));
    const no = noPatterns.some((re) => re.test(t));
    if (yes && !no) return "yes";
    if (no && !yes) return "no";
    return "ambiguous";
  };

  const voice = useCompassVoice({
    onSpeechEnd: async (audioBlob, mimeType) => {
      try {
        // 1) Speech → text via ElevenLabs Scribe (server proxy).
        const sttRes = await fetch("/api/compass/voice/stt", {
          method: "POST",
          headers: { "content-type": mimeType || "audio/webm" },
          body: audioBlob,
        });
        if (!sttRes.ok) {
          const body = (await sttRes
            .json()
            .catch(() => ({}))) as { error?: string };
          setError(body.error || `Speech-to-text failed (${sttRes.status})`);
          await speakAndResumeRef.current("");
          return;
        }
        const stt = (await sttRes.json()) as { transcript?: string };
        const transcript = (stt.transcript ?? "").trim();
        if (!transcript) {
          // Nothing useful in the audio — just loop back to listening.
          await speakAndResumeRef.current("");
          return;
        }

        // 2) If we asked the user to confirm a batch on the previous turn,
        //    classify this utterance instead of routing it through
        //    Compass. Yes → apply the batch. No → drop it. Ambiguous →
        //    re-ask without burning a Compass turn.
        // If the user already resolved the batch via the UI between
        // turns (Add all, Dismiss all, or the conversation moved on),
        // the pending confirm is stale. Clear it so this utterance
        // routes to Compass as a normal turn instead of being eaten by
        // the yes/no classifier.
        if (pendingBatchConfirmRef.current) {
          const pk = pendingBatchConfirmRef.current.batchKey;
          const alreadyAdded = !!batchCreatedRef.current[pk];
          if (alreadyAdded) {
            pendingBatchConfirmRef.current = null;
          }
        }
        const pending = pendingBatchConfirmRef.current;
        if (pending) {
          // Persist the spoken yes/no turn into chat history so the
          // transcript matches what was actually said. Voice exchanges
          // must show up in scrollback exactly like typed ones.
          const appendVoiceTurn = (userText: string, assistantText: string) => {
            const convId = activeConversation?.id;
            if (!convId) return;
            updateMessagesById(convId, (prev) => [
              ...prev,
              { role: "user", content: userText },
              { role: "assistant", content: assistantText },
            ]);
          };

          const verdict = classifyYesNo(transcript);
          if (verdict === "yes") {
            pendingBatchConfirmRef.current = null;
            let assistantReply: string;
            try {
              await handleAddBatchRef.current(
                pending.batchKey,
                pending.msgIdx,
                pending.suggestions,
              );
              assistantReply = "Done. I added them to the realm.";
            } catch {
              assistantReply =
                "I couldn't add them, there was an error on my side. You can try the Add all button on the card.";
            }
            appendVoiceTurn(transcript, assistantReply);
            await speakAndResumeRef.current(assistantReply);
            return;
          }
          if (verdict === "no") {
            pendingBatchConfirmRef.current = null;
            const assistantReply =
              "Got it, I'll leave them as suggestions. What's next?";
            appendVoiceTurn(transcript, assistantReply);
            await speakAndResumeRef.current(assistantReply);
            return;
          }
          // Ambiguous: re-arm and ask again.
          const assistantReply =
            "Sorry, I didn't catch that. Should I add the suggestions to the realm? Please say yes or no.";
          appendVoiceTurn(transcript, assistantReply);
          await speakAndResumeRef.current(assistantReply);
          return;
        }

        // 3) Normal Compass turn. Capture final reply/suggestions via
        //    the onFinal callback so we can speak them and decide
        //    whether to ask for batch confirmation next.
        let finalReply = "";
        let finalSuggestions: Suggestion[] = [];
        let assistantMsgIdx = -1;
        await sendRef.current(transcript, {
          onFinal: (reply, suggestions, msgIdx) => {
            finalReply = reply;
            finalSuggestions = suggestions;
            assistantMsgIdx = msgIdx;
          },
        });

        let speakText = finalReply;
        const batchPresent =
          finalSuggestions.length > 0 &&
          isBatchSuggestions(finalSuggestions);
        if (
          batchPresent &&
          canEditRef.current &&
          activeRealmIdRef.current &&
          assistantMsgIdx >= 0
        ) {
          const batchKey = `${activeConversation?.id ?? "x"}:${assistantMsgIdx}:batch`;
          pendingBatchConfirmRef.current = {
            batchKey,
            msgIdx: assistantMsgIdx,
            suggestions: finalSuggestions,
          };
          const promptSuffix =
            "Want me to add these to the realm? Say yes or no.";
          speakText = (speakText ? speakText + " " : "") + promptSuffix;
          // Mirror the spoken-only suffix into the assistant's chat
          // message so transcript parity holds: every spoken sentence
          // the assistant produces must also appear in scrollback.
          const convId = activeConversation?.id;
          if (convId) {
            updateMessagesById(convId, (prev) => {
              const target = prev[assistantMsgIdx];
              if (!target || target.role !== "assistant") return prev;
              const updated: ChatMessage = {
                ...target,
                content:
                  (target.content ? target.content + "\n\n" : "") +
                  promptSuffix,
              };
              return [
                ...prev.slice(0, assistantMsgIdx),
                updated,
                ...prev.slice(assistantMsgIdx + 1),
              ];
            });
          }
        }
        await speakAndResumeRef.current(speakText);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Voice mode hit an error",
        );
        await speakAndResumeRef.current("");
      }
    },
    onError: (msg) => setError(msg),
  });

  // Convert text → ElevenLabs audio (server proxy) and feed it into the
  // hook's playback + resume-listening step. Wrapped through a ref so the
  // onSpeechEnd closure above can call it without circular dependency.
  speakAndResumeRef.current = async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) {
      await voice.speakAndResume(null);
      return;
    }
    try {
      const res = await fetch("/api/compass/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: cleaned }),
      });
      if (!res.ok) {
        // Don't surface a hard error — playback failure just means the
        // user reads the reply from the transcript and keeps talking.
        await voice.speakAndResume(null);
        return;
      }
      const audioBlob = await res.blob();
      await voice.speakAndResume(audioBlob);
    } catch {
      await voice.speakAndResume(null);
    }
  };

  // Stopping voice mode tears down the mic + playback and clears any
  // pending confirmation so the next time the user toggles it on they
  // start fresh.
  const stopVoiceMode = () => {
    voice.stop();
    pendingBatchConfirmRef.current = null;
    setVoiceMode(false);
  };

  const toggleVoiceMode = async () => {
    if (voiceMode) {
      stopVoiceMode();
      return;
    }
    setVoiceMode(true);
    await voice.start();
  };

  // When the chat scope or active conversation changes, drop voice mode
  // along with the rest of the per-chat ephemeral state. Otherwise the
  // user could be mid-conversation in realm A, switch to realm B, and
  // suddenly have their utterances reaching Compass in B's context.
  useEffect(() => {
    stopVoiceMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, activeConversation?.id]);

  // Tear down voice mode whenever the sidebar leaves the screen. The
  // component itself stays mounted across mobile drawer close and
  // desktop collapse, so without this the mic and TTS playback would
  // keep running in the background with no visible controls.
  useEffect(() => {
    if (!isCompassOpen || effCompassCollapsed) {
      stopVoiceMode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompassOpen, effCompassCollapsed]);

  // When voice falls into the error state from inside the hook (e.g.
  // permission denied mid-session), surface the message and untoggle the
  // button so the next click can re-prompt for mic permission.
  useEffect(() => {
    if (voice.status === "error" && voice.errorMessage) {
      setError(voice.errorMessage);
      setVoiceMode(false);
    }
  }, [voice.status, voice.errorMessage]);

  const activeTitle = activeConversation?.title ?? DEFAULT_CHAT_TITLE;

  // Skip the collapsed rail on mobile so the drawer toggle keeps working
  // even if collapse was set during a previous desktop session.
  if (effCompassCollapsed && !isMobile) {
    return (
      <div className="hidden lg:flex w-9 shrink-0 flex-col items-center py-2 bg-sidebar border-l border-sidebar-border safe-pr">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Expand Compass"
          aria-label="Expand Compass"
          onClick={() => setEffCompassCollapsed(false)}
        >
          <PanelRightOpen className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        data-guide="compass-panel"
        style={{ "--reborn-compass-w": `${compassWidth}px` } as React.CSSProperties}
        className={cn(
          // Mobile: full-screen overlay (chat-app style).
          // Desktop (lg+): in-flow sidebar with resizable width.
          "flex flex-col bg-sidebar border-l border-sidebar-border z-50 transition-transform duration-200 safe-pr",
          // Mobile: full-screen overlay (chat-app style), respecting iOS safe areas.
          "fixed inset-0 w-screen h-[100dvh] max-w-none safe-pt safe-pb",
          // Desktop: in-flow sidebar at the configured width.
          "lg:static lg:inset-auto lg:w-[var(--reborn-compass-w)] lg:h-full lg:pt-0 lg:pb-0",
          isCompassOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="p-4 border-b border-sidebar-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-accent shrink-0" />
              <h2 className="font-medium text-sidebar-foreground">Compass</h2>
              {isGlobal && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  global
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="New chat"
                aria-label="New chat"
                disabled={isSending}
                onClick={newChat}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 lg:hidden -mr-2"
                title="Close Compass"
                aria-label="Close Compass"
                onClick={() => setCompassOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hidden lg:inline-flex"
                title="Collapse Compass"
                aria-label="Collapse Compass"
                onClick={() => setEffCompassCollapsed(true)}
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Always-on Compass auto-link helper for the focused node.
              Scans the node's blocks for mentions of other nodes in this
              realm and offers one-tap link conversions. Apply dispatches
              a window event the open document editor listens for. */}
          <CompassMentionSuggestionsForSidebar
            nodeId={currentNodeId}
            realmId={activeRealmId}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar/60 px-2 py-1.5 text-left text-xs text-sidebar-foreground hover:bg-sidebar/80 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                disabled={isSending && sortedConversations.length === 0}
                title="Switch chats"
              >
                <MessageSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate flex-1">{activeTitle}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {sortedConversations.length || 1}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-72 max-h-80 overflow-y-auto"
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {isGlobal ? "Global chats" : "Realm chats"}
              </DropdownMenuLabel>
              {sortedConversations.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  No saved chats yet.
                </div>
              )}
              {sortedConversations.map((c) => {
                const isActive = c.id === activeConversation?.id;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-start gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent/10",
                      isActive && "bg-accent/15",
                    )}
                    onClick={() => switchChat(c.id)}
                  >
                    <MessageSquare className="mt-0.5 w-3.5 h-3.5 text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-sidebar-foreground truncate">
                        {c.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {c.messages.length} msg · {formatRelativeTime(c.updatedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Delete this chat"
                      aria-label="Delete this chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(c.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  newChat();
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                <span className="text-xs">Start a new chat</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !isSending && (
            <div className="h-full flex flex-col items-center justify-center text-center pt-8">
              <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-3">
                <Sparkles className="w-7 h-7 text-accent" />
              </div>
              <h3 className="font-medium text-sidebar-foreground mb-1">
                AI Companion
              </h3>
              <p className="text-xs text-muted-foreground max-w-[14rem]">
                {isGlobal
                  ? "Ask me anything about Canvas Realms. I can show you around or spin up a new realm."
                  : "Ask Compass to brainstorm characters, lore, or connections in this realm."}
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-md text-sm leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary/15 text-foreground px-3 py-2 ml-6"
                  : "text-sidebar-foreground/90",
              )}
            >
              {m.content}
              {m.suggestions && m.suggestions.length > 0 && (() => {
                const allSuggestions = m.suggestions;
                const isBatch = isBatchSuggestions(allSuggestions);
                const batchKey = `${activeConversation?.id ?? "x"}:${i}:batch`;
                const batchPendingNow = batchPending.has(batchKey);
                const batchNotice = batchNotices[batchKey];
                // In batch mode, node + relationship suggestions render
                // inside the grouped card. Everything else (clarify,
                // start_guide, edit_node, ...) still renders individually
                // below it.
                const inBatch = (s: Suggestion) =>
                  isBatch && (s.type === "node" || s.type === "relationship");
                const batchedItems = allSuggestions
                  .map((s, j) => ({ s, j }))
                  .filter(({ s }) => inBatch(s));
                const batchNodes = batchedItems.filter(
                  (e): e is { s: SuggestedNode; j: number } => e.s.type === "node",
                );
                const batchRels = batchedItems.filter(
                  (e): e is { s: SuggestedRelationship; j: number } =>
                    e.s.type === "relationship",
                );
                const allBatchAdded =
                  batchedItems.length > 0 &&
                  batchedItems.every(
                    ({ j }) =>
                      addedKeys.has(
                        `${activeConversation?.id ?? "x"}:${i}:${j}`,
                      ) ||
                      dismissedKeys.has(
                        `${activeConversation?.id ?? "x"}:${i}:${j}`,
                      ),
                  );
                const undoEntry = batchCreated[batchKey];
                const undoExpiresAt = undoEntry
                  ? undoEntry.acceptedAt + UNDO_BATCH_WINDOW_MS
                  : 0;
                const canUndoBatch =
                  !!undoEntry &&
                  Date.now() < undoExpiresAt &&
                  (undoEntry.nodeIds.length > 0 ||
                    undoEntry.relIds.length > 0);
                const undoingNow = batchUndoing.has(batchKey);
                const redoEntry = undoneBatches[batchKey];
                const canRedoBatch =
                  !!redoEntry &&
                  Date.now() < redoEntry.undoneAt + UNDO_BATCH_WINDOW_MS;
                const redoingNow = batchRedoing.has(batchKey);

                // Collect every still-pending suggestion in this turn so
                // we can offer ONE master "Apply all" button covering
                // rewrites + new nodes + new links in dependency order.
                const turnKey = (j: number) =>
                  `${activeConversation?.id ?? "x"}:${i}:${j}`;
                const pendingEditEntries = allSuggestions
                  .map((s, j) => ({ s, j }))
                  .filter(
                    (e): e is { s: SuggestedEditNode; j: number } =>
                      e.s.type === "edit_node",
                  )
                  .filter(
                    ({ j }) =>
                      !addedKeys.has(turnKey(j)) &&
                      !dismissedKeys.has(turnKey(j)),
                  );
                const standaloneNodeOrRelEntries = isBatch
                  ? []
                  : allSuggestions
                      .map((s, j) => ({ s, j }))
                      .filter(
                        ({ s }) =>
                          s.type === "node" || s.type === "relationship",
                      )
                      .filter(
                        ({ j }) =>
                          !addedKeys.has(turnKey(j)) &&
                          !dismissedKeys.has(turnKey(j)),
                      );
                const hasBatchPending =
                  isBatch && batchedItems.length > 0 && !allBatchAdded;
                const hasStandalonePending =
                  standaloneNodeOrRelEntries.length > 0;
                const hasEditsPending = pendingEditEntries.length > 0;
                // Only show the master button when more than one kind of
                // action is pending — otherwise the per-card "Apply edit"
                // or "Add all" button already covers it.
                const kindsPending =
                  (hasEditsPending ? 1 : 0) +
                  (hasBatchPending ? 1 : 0) +
                  (hasStandalonePending ? 1 : 0);
                const showMasterApply = kindsPending >= 2;
                const masterPending =
                  batchPendingNow || updateNode.isPending;

                return (
                <div className="mt-3 space-y-2">
                  {showMasterApply && canEdit && activeRealmId && (
                    <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 flex items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wide text-primary flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" />
                        Apply everything in this reply
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={masterPending}
                        onClick={async () => {
                          // 1) Rewrites of existing nodes go first so the
                          //    edited content is in place before any new
                          //    nodes/links get added to the realm. Await
                          //    each edit so the dependency order is real,
                          //    not just intended.
                          for (const { s, j } of pendingEditEntries) {
                            try {
                              await handleApplyEdit(turnKey(j), s);
                            } catch {
                              // handleApplyEdit clears the addedKey on
                              // error; keep going so the rest of the
                              // batch still applies.
                            }
                          }
                          // 2) Then the grouped batch (nodes then links,
                          //    handled internally in dependency order).
                          if (hasBatchPending) {
                            await handleAddBatch(
                              batchKey,
                              i,
                              allSuggestions,
                            );
                          }
                          // 3) Then any non-batched standalone node /
                          //    relationship suggestions in this turn.
                          for (const {
                            s,
                            j,
                          } of standaloneNodeOrRelEntries) {
                            const k = turnKey(j);
                            if (s.type === "node") {
                              addNode(k, s);
                            } else if (s.type === "relationship") {
                              addRelationship(k, s);
                            }
                          }
                        }}
                      >
                        {masterPending ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3 mr-1" />
                        )}
                        Apply all changes
                      </Button>
                    </div>
                  )}
                  {isBatch && batchedItems.length > 0 && (
                    <div className="rounded-md border border-accent/40 bg-accent/5 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-accent">
                          <Sparkles className="w-3 h-3" />
                          Batch · {batchNodes.length} node
                          {batchNodes.length === 1 ? "" : "s"}
                          {batchRels.length > 0 &&
                            `, ${batchRels.length} link${batchRels.length === 1 ? "" : "s"}`}
                        </div>
                        {canEdit && activeRealmId && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={batchPendingNow || allBatchAdded}
                              className="h-6 px-2 text-[11px] gap-1"
                              onClick={() =>
                                void handleAddBatch(
                                  batchKey,
                                  i,
                                  allSuggestions,
                                )
                              }
                            >
                              {batchPendingNow ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              {allBatchAdded ? "Added" : "Add all"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={batchPendingNow || allBatchAdded}
                              title="Dismiss this batch"
                              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                dismissBatch(i, allSuggestions)
                              }
                            >
                              <X className="w-3 h-3" />
                              Dismiss all
                            </Button>
                            {canUndoBatch && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={undoingNow}
                                title="Delete every node and link this batch just created"
                                className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  void handleUndoBatch(
                                    batchKey,
                                    i,
                                    allSuggestions,
                                  )
                                }
                              >
                                {undoingNow ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Undo2 className="w-3 h-3" />
                                )}
                                Undo batch
                              </Button>
                            )}
                            {canRedoBatch && !canUndoBatch && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={redoingNow || batchPendingNow}
                                title="Recreate the nodes and links you just undid"
                                className="h-6 px-2 text-[11px] gap-1 text-accent hover:text-accent"
                                onClick={() => void handleRedoBatch(batchKey)}
                              >
                                {redoingNow ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Redo2 className="w-3 h-3" />
                                )}
                                Redo batch
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {batchNodes.map(({ s, j }) => {
                          const key = `${activeConversation?.id ?? "x"}:${i}:${j}`;
                          const added = addedKeys.has(key);
                          const dismissed = dismissedKeys.has(key);
                          return (
                            <div
                              key={key}
                              className={cn(
                                "rounded-sm border border-sidebar-border bg-sidebar/60 p-2",
                                dismissed && "opacity-50",
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className="mt-1 w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: KIND_COLORS[s.kind],
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-xs text-sidebar-foreground truncate">
                                      {s.title}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                      {s.kind}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                    {s.content}
                                  </p>
                                  {canEdit && (
                                    <div className="flex items-center gap-1 mt-1.5">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={
                                          added || dismissed || batchPendingNow
                                        }
                                        className="h-5 px-1.5 text-[10px] gap-1"
                                        onClick={() =>
                                          addNode(key, s, {
                                            batchKey,
                                            position:
                                              layoutBatchNodes(
                                                batchNodes.map((e) => e.s),
                                                batchRels.map((e) => e.s),
                                                canvasCenterRef.current ?? {
                                                  x: 0,
                                                  y: 0,
                                                },
                                              ).get(s) ??
                                              canvasCenterRef.current ?? {
                                                x: 0,
                                                y: 0,
                                              },
                                            msgIdx: i,
                                            suggestions: allSuggestions,
                                          })
                                        }
                                      >
                                        <Plus className="w-3 h-3" />
                                        {added ? "Added" : "Add"}
                                      </Button>
                                      {!added && !dismissed && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={batchPendingNow}
                                          className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                                          onClick={() => dismissItem(key)}
                                        >
                                          <X className="w-3 h-3" />
                                          Dismiss
                                        </Button>
                                      )}
                                      {dismissed && (
                                        <span className="text-[10px] text-muted-foreground">
                                          Dismissed
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {batchRels.length > 0 && (
                          <div className="pt-1 mt-1 border-t border-sidebar-border/60 space-y-1">
                            {batchRels.map(({ s, j }) => {
                              const key = `${activeConversation?.id ?? "x"}:${i}:${j}`;
                              const added = addedKeys.has(key);
                              const dismissed = dismissedKeys.has(key);
                              const labelFor = (id: string): string => {
                                if (isTempId(id)) {
                                  const node = batchNodes.find(
                                    (e) => e.s.tempId === id,
                                  );
                                  return node ? node.s.title : "(new node)";
                                }
                                return "(existing node)";
                              };
                              // The per-item Add button is only enabled
                              // once both endpoints exist. Real ids are
                              // always ready; tempIds need their owning
                              // node to have been accepted (either via
                              // its own Add button or via Add all) so we
                              // know the real database id to wire to.
                              const fromReady =
                                !isTempId(s.fromNodeId) ||
                                Boolean(
                                  tempIdRealsByBatch[batchKey]?.[s.fromNodeId],
                                );
                              const toReady =
                                !isTempId(s.toNodeId) ||
                                Boolean(
                                  tempIdRealsByBatch[batchKey]?.[s.toNodeId],
                                );
                              const canAdd =
                                canEdit &&
                                !added &&
                                !dismissed &&
                                !batchPendingNow &&
                                fromReady &&
                                toReady;
                              return (
                                <div
                                  key={key}
                                  className={cn(
                                    "flex items-center gap-2 text-[11px] text-sidebar-foreground/90",
                                    dismissed && "opacity-50",
                                  )}
                                >
                                  <Link2 className="w-3 h-3 text-accent shrink-0" />
                                  <span className="truncate flex-1">
                                    <span className="text-muted-foreground">
                                      {labelFor(s.fromNodeId)}
                                    </span>
                                    {" → "}
                                    <span className="text-muted-foreground">
                                      {labelFor(s.toNodeId)}
                                    </span>
                                    {s.label && (
                                      <span className="ml-1">({s.label})</span>
                                    )}
                                  </span>
                                  {canEdit && !added && !dismissed && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={!canAdd}
                                        title={
                                          !fromReady || !toReady
                                            ? "Add the linked node first"
                                            : "Add this link"
                                        }
                                        className="h-5 px-1.5 text-[10px] gap-1"
                                        onClick={() =>
                                          addRelationshipFromBatch(
                                            key,
                                            s,
                                            batchKey,
                                            i,
                                            allSuggestions,
                                          )
                                        }
                                      >
                                        <Plus className="w-3 h-3" />
                                        Add
                                      </Button>
                                      <button
                                        type="button"
                                        className="text-muted-foreground hover:text-destructive"
                                        title="Dismiss this link"
                                        onClick={() => dismissItem(key)}
                                        disabled={batchPendingNow}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                  {added && (
                                    <span className="text-[10px] text-accent">
                                      added
                                    </span>
                                  )}
                                  {dismissed && (
                                    <span className="text-[10px] text-muted-foreground">
                                      dismissed
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {batchNotice && (
                        <p className="text-[11px] text-muted-foreground border-t border-sidebar-border/60 pt-2">
                          {batchNotice}
                        </p>
                      )}
                    </div>
                  )}
                  {allSuggestions.map((s, j) => {
                    if (inBatch(s)) return null;
                    const key = `${activeConversation?.id ?? "x"}:${i}:${j}`;
                    const added = addedKeys.has(key);
                    if (s.type === "node") {
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-sidebar-border bg-sidebar/60 p-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className="mt-1 w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: KIND_COLORS[s.kind] }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-xs text-sidebar-foreground truncate">
                                  {s.title}
                                </span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {s.kind}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                                {s.content}
                              </p>
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={added}
                                  className="h-6 px-2 mt-2 text-[11px] gap-1"
                                  onClick={() => addNode(key, s)}
                                >
                                  <Plus className="w-3 h-3" />
                                  {added ? "Added" : "Add node"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    if (s.type === "relationship") {
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-sidebar-border bg-sidebar/60 p-2.5"
                        >
                          <div className="flex items-center gap-2 text-xs text-sidebar-foreground">
                            <Link2 className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span className="truncate">{s.label}</span>
                          </div>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={added}
                              className="h-6 px-2 mt-2 text-[11px] gap-1"
                              onClick={() => addRelationship(key, s)}
                            >
                              <Plus className="w-3 h-3" />
                              {added ? "Linked" : "Add link"}
                            </Button>
                          )}
                        </div>
                      );
                    }
                    if (s.type === "create_realm") {
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-sidebar-border bg-sidebar/60 p-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <Globe className="mt-0.5 w-3.5 h-3.5 text-accent shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs text-sidebar-foreground truncate">
                                {s.name}
                              </div>
                              {s.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                                  {s.description}
                                </p>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={added || createRealm.isPending}
                                className="h-6 px-2 mt-2 text-[11px] gap-1"
                                onClick={() => handleCreateRealm(key, s)}
                              >
                                {added && createRealm.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Plus className="w-3 h-3" />
                                )}
                                {added ? "Created" : "Create realm"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    if (s.type === "switch_realm") {
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-sidebar-border bg-sidebar/60 p-2.5"
                        >
                          <div className="flex items-center gap-2 text-xs text-sidebar-foreground">
                            <Globe className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span className="truncate flex-1">{s.realmName}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 mt-2 text-[11px] gap-1"
                            onClick={() => handleSwitchRealm(s)}
                          >
                            <ArrowRight className="w-3 h-3" />
                            Switch
                          </Button>
                        </div>
                      );
                    }
                    if (s.type === "edit_node") {
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-sidebar-border bg-sidebar/60 p-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles className="mt-0.5 w-3.5 h-3.5 text-accent shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs text-sidebar-foreground truncate">
                                Rewrite "{s.nodeTitle}"
                              </div>
                              {s.summary && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                  {s.summary}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-4 whitespace-pre-wrap">
                                {s.proposedContent}
                              </p>
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={added || updateNode.isPending}
                                  className="h-6 px-2 mt-2 text-[11px] gap-1"
                                  onClick={() => handleApplyEdit(key, s)}
                                >
                                  {added && updateNode.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ArrowRight className="w-3 h-3" />
                                  )}
                                  {added ? "Applied" : "Apply edit"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    if (s.type === "clarify") {
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-sidebar-border bg-sidebar/60 p-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <HelpCircle className="mt-0.5 w-3.5 h-3.5 text-accent shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-sidebar-foreground">
                                {s.question}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {s.options.map((opt, k) => (
                                  <Button
                                    key={k}
                                    size="sm"
                                    variant="secondary"
                                    disabled={isSending}
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => void send(opt.prompt)}
                                    title={opt.prompt}
                                  >
                                    {opt.label}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    if (s.type === "start_guide") {
                      const guide = getGuide(s.guideId);
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-sidebar-border bg-sidebar/60 p-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <CompassIcon className="mt-0.5 w-3.5 h-3.5 text-accent shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs text-sidebar-foreground">
                                {guide?.title ?? "Show me how"}
                              </div>
                              {s.caption && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {s.caption}
                                </p>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!guide}
                                className="h-6 px-2 mt-2 text-[11px] gap-1"
                                onClick={() => handleStartGuide(s)}
                              >
                                <ArrowRight className="w-3 h-3" />
                                Show me
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
                );
              })()}
            </div>
          ))}

          {isSending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Compass is thinking...
            </div>
          )}

          {error && (
            <div className="text-xs text-destructive border border-destructive/30 rounded-md p-2 bg-destructive/10">
              {error}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          {!isGlobal && canEdit && messages.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isSending}
              className="w-full h-7 text-[11px] gap-1"
              onClick={() =>
                void send(
                  "Take everything we've discussed so far and turn it into a single new node in this realm. Pick the right kind, give it a concise title, and write the content from the details we agreed on. Emit it as a node suggestion now.",
                )
              }
              title="Create a node from this discussion"
            >
              <Plus className="w-3 h-3" />
              Create node from chat
            </Button>
          )}
          {voiceMode && (
            <div
              className="flex items-center gap-2 text-[11px] text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <span
                className={cn(
                  "inline-block w-2 h-2 rounded-full",
                  voice.status === "listening" &&
                    "bg-emerald-500 animate-pulse",
                  voice.status === "thinking" &&
                    "bg-amber-500 animate-pulse",
                  voice.status === "speaking" &&
                    "bg-sky-500 animate-pulse",
                  voice.status === "idle" && "bg-muted-foreground/40",
                  voice.status === "error" && "bg-destructive",
                )}
              />
              <span>
                {voice.status === "listening" && "Listening, go ahead."}
                {voice.status === "thinking" && "Thinking..."}
                {voice.status === "speaking" &&
                  "Speaking, talk to interrupt."}
                {voice.status === "idle" && "Voice mode starting..."}
                {voice.status === "error" &&
                  (voice.errorMessage ?? "Voice error")}
              </span>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSending}
              rows={1}
              placeholder={
                voiceMode
                  ? "Voice mode is on, just talk, or type to send a message"
                  : isGlobal
                    ? "Ask Compass anything..."
                    : "Ask Compass..."
              }
              className={cn(
              "flex-1 resize-none bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 overflow-y-auto transition-opacity",
              // Voice mode is the primary input path while it's on, so
              // de-emphasize (but don't hide) the typing composer. It
              // springs back to full opacity on focus so typing a
              // message instead of talking is still possible.
              voiceMode && "opacity-50 focus:opacity-100",
            )}
              style={{ maxHeight: "12rem" }}
            />
            {voiceAvailable && (
              <Button
                type="button"
                size="icon"
                variant={voiceMode ? "default" : "secondary"}
                onClick={() => void toggleVoiceMode()}
                className={cn(
                  "h-9 w-9 shrink-0",
                  voiceMode && "bg-accent hover:bg-accent/90 text-accent-foreground",
                )}
                title={voiceMode ? "Turn off voice mode" : "Talk to Compass"}
                aria-label={
                  voiceMode ? "Turn off voice mode" : "Turn on voice mode"
                }
                aria-pressed={voiceMode}
              >
                {voiceMode ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>
            )}
            <Button
              type="submit"
              size="icon"
              disabled={isSending || !input.trim()}
              className="h-9 w-9 shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
        <SidebarResizeHandle
          edge="left"
          current={compassWidth}
          min={COMPASS_MIN_WIDTH}
          max={COMPASS_MAX_WIDTH}
          onResize={setCompassWidth}
          hideBelow="lg"
        />
      </div>
    </>
  );
}

// =============================================================
// Compass auto-link suggestions (sidebar header strip)
// =============================================================
//
// Renders a compact suggestions strip at the top of the Compass panel
// for the currently focused node. Apply dispatches a window event that
// the open DocumentEditor's TextBlock listens for. If the focused node
// doesn't currently have an open document editor (e.g. it's a canvas or
// map node), the apply is a silent no-op — the suggestion stays visible
// so the user can apply once the node is opened.

function CompassMentionSuggestionsForSidebar({
  nodeId,
  realmId,
}: {
  nodeId: string | null;
  realmId: string | null;
}) {
  const { data: realmNodes } = useListNodes(realmId || "", {
    query: {
      enabled: !!realmId,
      queryKey: getListNodesQueryKey(realmId || ""),
    },
  });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hideAll, setHideAll] = useState(false);
  // Reset dismissals when the focused node changes.
  useEffect(() => {
    setDismissed(new Set());
    setHideAll(false);
  }, [nodeId]);

  const suggestions = useMemo<AggregatedSuggestion[]>(() => {
    if (!nodeId || !realmNodes || realmNodes.length === 0) return [];
    const target = realmNodes.find((n) => n.id === nodeId);
    if (!target) return [];
    // node.blocks comes from the list endpoint and may be missing on
    // ultra-light projections — fall back to legacy `content` when empty.
    type TextBlockLite = { id: string; type: "text"; text: string };
    const rawBlocks = (target as { blocks?: Array<{ id: string; type?: string; text?: string }> })
      .blocks ?? [];
    const blocks: TextBlockLite[] = rawBlocks
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => ({ id: b.id, type: "text", text: b.text || "" }));
    if (blocks.length === 0 && typeof (target as { content?: string }).content === "string") {
      const content = (target as { content?: string }).content ?? "";
      if (content.trim()) {
        blocks.push({ id: "legacy", type: "text", text: content });
      }
    }
    const out: AggregatedSuggestion[] = [];
    for (const b of blocks) {
      const hits = scanForMentions(b.text, realmNodes, nodeId);
      for (const h of hits) {
        const ctxStart = Math.max(0, h.start - 16);
        const ctxEnd = Math.min(b.text.length, h.end + 16);
        const context = (ctxStart > 0 ? "..." : "")
          + b.text.slice(ctxStart, ctxEnd)
          + (ctxEnd < b.text.length ? "..." : "");
        out.push({ ...h, blockId: b.id, context });
      }
    }
    return out;
  }, [nodeId, realmNodes]);

  const visible = useMemo(
    () =>
      suggestions.filter(
        (s) => !dismissed.has(`${s.target.id}:${s.matchText.toLowerCase()}`),
      ),
    [suggestions, dismissed],
  );

  if (!nodeId || hideAll || visible.length === 0) return null;

  return (
    <MentionSuggestionsStrip
      suggestions={visible}
      nodeId={nodeId}
      variant="compact"
      onDismiss={(s) => {
        setDismissed((prev) => {
          const next = new Set(prev);
          next.add(`${s.target.id}:${s.matchText.toLowerCase()}`);
          return next;
        });
      }}
      onHideAll={() => setHideAll(true)}
    />
  );
}
