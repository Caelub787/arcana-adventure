import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding.js";
import * as decoding from "lib0/decoding.js";
import { toast } from "sonner";
import { useUser } from "@cr/lib/useUser";
import { getDisplayName } from "@cr/lib/displayName";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListNodesQueryKey,
  getListRelationshipsQueryKey,
  getGetRealmQueryKey,
  getListCollaboratorsQueryKey,
  getListRealmsQueryKey,
  getGetRealmSummaryQueryKey,
  getListRecentNodesQueryKey,
  getListTagCountsQueryKey,
  getListFoldersQueryKey,
} from "@workspace/api-client-react";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_DENIED = 2;

const COLOR_PALETTE = [
  "#7c5cff",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
];

function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

export interface PresenceUser {
  clientId: number;
  userId: string;
  name: string;
  imageUrl?: string;
  color: string;
}

export interface PresenceCaret {
  /** Selection anchor offset (where the selection started). */
  anchor: number;
  /** Selection head offset (where the cursor currently is). */
  head: number;
}

export interface PresenceField {
  nodeId: string;
  blockId: string;
  /** Optional caret/selection position inside the block's text. */
  caret?: PresenceCaret | null;
}

export interface PresenceFieldPeer extends PresenceUser {
  field: PresenceField;
}

export interface RealtimeContextValue {
  realmId: string;
  doc: Y.Doc;
  awareness: Awareness;
  status: RealtimeStatus;
  color: string;
  /** Other connected users (excluding self). */
  peers: PresenceUser[];
  /** Local user identity (clerk). */
  self: PresenceUser | null;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface ProviderProps {
  realmId: string;
  children: ReactNode;
}

export function RealmDocProvider({ realmId, children }: ProviderProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();

  // Stable doc / awareness for the lifetime of (realmId, user.id)
  const [, forceTick] = useState(0);
  const docRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [peers, setPeers] = useState<PresenceUser[]>([]);

  const selfColor = useMemo(
    () => (user ? colorForUser(user.id) : "#7c5cff"),
    [user],
  );

  // (Re)create doc when realm changes
  useEffect(() => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    docRef.current = doc;
    awarenessRef.current = awareness;
    forceTick((n) => n + 1);
    return () => {
      awareness.destroy();
      doc.destroy();
      docRef.current = null;
      awarenessRef.current = null;
    };
  }, [realmId]);

  // Set local awareness state when user is known
  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness || !user) return;
    awareness.setLocalState({
      user: {
        id: user.id,
        name: getDisplayName(user, "Anonymous"),
        imageUrl: user.imageUrl,
        color: selfColor,
      },
      cursor: null,
    });
  }, [
    user,
    user?.username,
    user?.fullName,
    user?.unsafeMetadata,
    selfColor,
    realmId,
  ]);

  // Maintain WebSocket connection with reconnect/backoff
  useEffect(() => {
    const doc = docRef.current;
    const awareness = awarenessRef.current;
    if (!doc || !awareness || !user) return;

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;
    // Track whether we have ever connected so we only toast on a true
    // *re*connection, not the first successful connect.
    let hasEverConnected = false;
    let wasDisconnected = false;
    // Avoid spamming a denied toast on every keystroke if a viewer somehow
    // ends up trying to write — rate-limit to once per 5s.
    let lastDeniedAt = 0;

    const send = (buf: Uint8Array) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(buf);
        } catch {
          // ignore
        }
      }
    };

    const docUpdateHandler = (update: Uint8Array, origin: unknown) => {
      // Don't echo updates we received from the server back.
      if (origin === "remote") return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      encoding.writeVarUint(enc, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(enc, update);
      send(encoding.toUint8Array(enc));
    };
    doc.on("update", docUpdateHandler);

    const awarenessUpdateHandler = (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === "remote") return;
      const ids = [...changes.added, ...changes.updated, ...changes.removed];
      if (ids.length === 0) return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(awareness, ids),
      );
      send(encoding.toUint8Array(enc));
    };
    awareness.on("update", awarenessUpdateHandler);

    // Recompute peers on awareness change
    const refreshPeers = () => {
      const out: PresenceUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const s = state as {
          user?: {
            id: string;
            name: string;
            imageUrl?: string;
            color: string;
          };
        };
        const u = s.user;
        if (!u) return;
        out.push({
          clientId,
          userId: u.id,
          name: u.name,
          imageUrl: u.imageUrl,
          color: u.color,
        });
      });
      setPeers(out);
    };
    awareness.on("change", refreshPeers);

    const connect = () => {
      if (closed) return;
      setStatus(attempt === 0 ? "connecting" : "connecting");
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${window.location.host}/api/realtime/${encodeURIComponent(realmId)}`;
      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        attempt = 0;
        setStatus("connected");
        if (hasEverConnected && wasDisconnected) {
          // Reconnect-success: any debounced edits buffered locally during
          // the outage will now flush via the normal doc.update path.
          toast.success("Reconnected", {
            description: "Live collaboration restored.",
          });
        }
        hasEverConnected = true;
        wasDisconnected = false;
        // Send initial SyncStep1 to negotiate state with the server.
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(enc, doc);
        send(encoding.toUint8Array(enc));
        // Re-broadcast our awareness state (in case server cleared it on
        // reconnect / for new peers).
        const local = awareness.getLocalState();
        if (local) {
          const a = encoding.createEncoder();
          encoding.writeVarUint(a, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            a,
            awarenessProtocol.encodeAwarenessUpdate(awareness, [
              awareness.clientID,
            ]),
          );
          send(encoding.toUint8Array(a));
        }
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        try {
          const buf = new Uint8Array(event.data as ArrayBuffer);
          const decoder = decoding.createDecoder(buf);
          const messageType = decoding.readVarUint(decoder);
          if (messageType === MESSAGE_SYNC) {
            const replyEncoder = encoding.createEncoder();
            encoding.writeVarUint(replyEncoder, MESSAGE_SYNC);
            const syncMessageType = syncProtocol.readSyncMessage(
              decoder,
              replyEncoder,
              doc,
              "remote",
            );
            // If the response wrote anything (e.g. a SyncStep2 reply), ship
            // it back.
            if (
              syncMessageType === syncProtocol.messageYjsSyncStep1 &&
              encoding.length(replyEncoder) > 1
            ) {
              send(encoding.toUint8Array(replyEncoder));
            }
          } else if (messageType === MESSAGE_AWARENESS) {
            const update = decoding.readVarUint8Array(decoder);
            awarenessProtocol.applyAwarenessUpdate(
              awareness,
              update,
              "remote",
            );
          } else if (messageType === MESSAGE_DENIED) {
            // Server rejected our last write because the realm role doesn't
            // permit mutations. Surface a single toast (rate-limited) so the
            // viewer knows their edit didn't propagate.
            let reason = "denied";
            try {
              reason = decoding.readVarString(decoder);
            } catch {}
            const now = Date.now();
            if (now - lastDeniedAt > 5000) {
              lastDeniedAt = now;
              toast.error("Read-only access", {
                description:
                  reason === "viewer-cannot-write"
                    ? "Your role on this realm does not allow live edits."
                    : reason,
              });
            }
          }
        } catch {
          // ignore decode errors
        }
      });

      const onCloseOrError = () => {
        if (closed) return;
        setStatus("disconnected");
        wasDisconnected = true;
        wsRef.current = null;
        // Drop awareness states from peers we lost contact with on reconnect.
        // (We'll rebuild them as they re-broadcast.)
        const others = Array.from(awareness.getStates().keys()).filter(
          (id) => id !== awareness.clientID,
        );
        if (others.length > 0) {
          awarenessProtocol.removeAwarenessStates(awareness, others, "remote");
        }
        attempt = Math.min(attempt + 1, 6);
        const delay = Math.min(500 * 2 ** attempt, 10_000);
        reconnectTimer = window.setTimeout(connect, delay);
      };
      ws.addEventListener("close", onCloseOrError);
      ws.addEventListener("error", onCloseOrError);
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      doc.off("update", docUpdateHandler);
      awareness.off("update", awarenessUpdateHandler);
      awareness.off("change", refreshPeers);
      try {
        // Clear our awareness state so peers immediately drop our avatar.
        awareness.setLocalState(null);
      } catch {}
      try {
        ws?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [realmId, user]);

  // Subscribe to `meta` invalidation counters
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const meta = doc.getMap<number>("meta");
    const handler = (event: Y.YMapEvent<number>, _tx: Y.Transaction) => {
      // Only react to remote bumps (don't loop on our own invalidations).
      if (_tx.local) return;
      event.changes.keys.forEach((_change, key) => {
        switch (key) {
          case "nodes":
            queryClient.invalidateQueries({
              queryKey: getListNodesQueryKey(realmId),
            });
            queryClient.invalidateQueries({
              queryKey: getListRecentNodesQueryKey(realmId),
            });
            queryClient.invalidateQueries({
              queryKey: getListTagCountsQueryKey(realmId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetRealmSummaryQueryKey(realmId),
            });
            // Per-node queries (e.g. the open MapNodeView reads node.content
            // via getGetNode). A key rename cascade rewrites OTHER nodes'
            // content/blocks server-side, so we must re-fetch each open
            // node query too — not just the realm-wide list — otherwise the
            // map view's pin notes and text-annotation labels stay stale.
            queryClient.invalidateQueries({
              predicate: (q) => {
                const key = q.queryKey;
                return (
                  Array.isArray(key) &&
                  typeof key[0] === "string" &&
                  /^\/api\/nodes\/[^/]+$/.test(key[0])
                );
              },
            });
            break;
          case "relationships":
            queryClient.invalidateQueries({
              queryKey: getListRelationshipsQueryKey(realmId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetRealmSummaryQueryKey(realmId),
            });
            break;
          case "realms":
            queryClient.invalidateQueries({
              queryKey: getGetRealmQueryKey(realmId),
            });
            queryClient.invalidateQueries({
              queryKey: getListRealmsQueryKey(),
            });
            break;
          case "collaborators":
            queryClient.invalidateQueries({
              queryKey: getListCollaboratorsQueryKey(realmId),
            });
            break;
          case "members":
            // Canvas membership lists are fetched ad-hoc via raw fetch in
            // CanvasPaneBody (no react-query key) — that view also subscribes
            // to the canvas Y.Map directly, so nothing to invalidate here.
            break;
          case "folders":
            queryClient.invalidateQueries({
              queryKey: getListFoldersQueryKey(realmId),
            });
            queryClient.invalidateQueries({
              queryKey: getListNodesQueryKey(realmId),
            });
            break;
          default:
            break;
        }
      });
    };
    meta.observe(handler);
    return () => meta.unobserve(handler);
  }, [realmId, queryClient]);

  const self: PresenceUser | null = user
    ? {
        clientId: awarenessRef.current?.clientID ?? 0,
        userId: user.id,
        name: getDisplayName(user, "You"),
        imageUrl: user.imageUrl,
        color: selfColor,
      }
    : null;

  const value: RealtimeContextValue | null =
    docRef.current && awarenessRef.current
      ? {
          realmId,
          doc: docRef.current,
          awareness: awarenessRef.current,
          status,
          color: selfColor,
          peers,
          self,
        }
      : null;

  if (!value) return <>{children}</>;

  return (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}

/** Get the Y.Text shared type for a node body (or null when no realtime). */
export function useNodeYText(nodeId: string): Y.Text | null {
  const ctx = useRealtime();
  return useMemo(() => {
    if (!ctx) return null;
    return ctx.doc.getText(`node:${nodeId}`);
  }, [ctx, nodeId]);
}

/**
 * Get the Y.Text shared type for a single text block within a node body
 * (or null when no realtime). Used by the structured node editor where
 * each text block is its own collaboratively-edited textarea.
 */
export function useNodeBlockYText(
  nodeId: string,
  blockId: string,
): Y.Text | null {
  const ctx = useRealtime();
  return useMemo(() => {
    if (!ctx) return null;
    return ctx.doc.getText(`node:${nodeId}:block:${blockId}`);
  }, [ctx, nodeId, blockId]);
}

export interface FieldPresenceApi {
  /** Set (or clear) which text block the local user is editing. */
  set: (field: PresenceField | null) => void;
  /**
   * Clear the local field presence ONLY if the current value still matches
   * `field`. Used by per-block clear timers so a stale blur-timeout from
   * block A doesn't wipe out block B after the user has moved focus.
   */
  clearIfMatches: (field: PresenceField) => void;
}

/**
 * Publish (or clear) which text field the local user is currently editing
 * via awareness. Peers can subscribe with `usePeersInBlock` to render a
 * "[name] is typing…" hint near the matching block.
 */
export function useFieldPresence(): FieldPresenceApi {
  const ctx = useRealtime();
  const set = useCallback(
    (field: PresenceField | null) => {
      if (!ctx) return;
      const cur = ctx.awareness.getLocalState() as
        | { field?: PresenceField | null }
        | null;
      const prev = cur?.field ?? null;
      const sameBlock =
        prev?.nodeId === field?.nodeId && prev?.blockId === field?.blockId;
      const sameCaret =
        (prev?.caret?.anchor ?? null) === (field?.caret?.anchor ?? null) &&
        (prev?.caret?.head ?? null) === (field?.caret?.head ?? null);
      if (sameBlock && sameCaret) {
        return;
      }
      ctx.awareness.setLocalStateField("field", field);
    },
    [ctx],
  );
  const clearIfMatches = useCallback(
    (field: PresenceField) => {
      if (!ctx) return;
      const cur = ctx.awareness.getLocalState() as
        | { field?: PresenceField | null }
        | null;
      const prev = cur?.field ?? null;
      if (
        prev &&
        prev.nodeId === field.nodeId &&
        prev.blockId === field.blockId
      ) {
        ctx.awareness.setLocalStateField("field", null);
      }
    },
    [ctx],
  );
  return useMemo(() => ({ set, clearIfMatches }), [set, clearIfMatches]);
}

/**
 * Subscribe to peers (excluding self) currently editing the given text
 * block. The list updates whenever any peer's awareness `field` changes.
 */
export function usePeersInBlock(
  nodeId: string,
  blockId: string,
): PresenceFieldPeer[] {
  const ctx = useRealtime();
  const [peers, setPeers] = useState<PresenceFieldPeer[]>([]);

  useEffect(() => {
    if (!ctx) {
      setPeers([]);
      return;
    }
    const { awareness } = ctx;
    const compute = () => {
      const out: PresenceFieldPeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const s = state as {
          user?: {
            id: string;
            name: string;
            imageUrl?: string;
            color: string;
          };
          field?: PresenceField | null;
        };
        const u = s.user;
        const f = s.field;
        if (!u || !f) return;
        if (f.nodeId !== nodeId || f.blockId !== blockId) return;
        out.push({
          clientId,
          userId: u.id,
          name: u.name,
          imageUrl: u.imageUrl,
          color: u.color,
          field: f,
        });
      });
      setPeers(out);
    };
    compute();
    awareness.on("change", compute);
    return () => awareness.off("change", compute);
  }, [ctx, nodeId, blockId]);

  return peers;
}

/**
 * Subscribe to peers (excluding self) currently focused on any text block
 * inside the given node. Used by the sidebar to show a peer's avatar on
 * the row of the node they're editing.
 */
export function usePeersInNode(nodeId: string): PresenceFieldPeer[] {
  const ctx = useRealtime();
  const [peers, setPeers] = useState<PresenceFieldPeer[]>([]);

  useEffect(() => {
    if (!ctx) {
      setPeers([]);
      return;
    }
    const { awareness } = ctx;
    const compute = () => {
      const out: PresenceFieldPeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const s = state as {
          user?: {
            id: string;
            name: string;
            imageUrl?: string;
            color: string;
          };
          field?: PresenceField | null;
        };
        const u = s.user;
        const f = s.field;
        if (!u || !f) return;
        if (f.nodeId !== nodeId) return;
        out.push({
          clientId,
          userId: u.id,
          name: u.name,
          imageUrl: u.imageUrl,
          color: u.color,
          field: f,
        });
      });
      // De-dupe by userId so a user with multiple open clients only shows once.
      const byUser = new Map<string, PresenceFieldPeer>();
      for (const p of out) {
        if (!byUser.has(p.userId)) byUser.set(p.userId, p);
      }
      setPeers(Array.from(byUser.values()));
    };
    compute();
    awareness.on("change", compute);
    return () => awareness.off("change", compute);
  }, [ctx, nodeId]);

  return peers;
}

/** Get the canvas Y.Map for a canvas node. */
export function useCanvasYMap(canvasNodeId: string): Y.Map<{
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  memberNodeId: string;
}> | null {
  const ctx = useRealtime();
  return useMemo(() => {
    if (!ctx) return null;
    return ctx.doc.getMap(`canvas:${canvasNodeId}`);
  }, [ctx, canvasNodeId]);
}
