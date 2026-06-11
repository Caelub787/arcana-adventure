import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { db, nodesTable, canvasMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Per-realm Yjs document registry. Each realm has at most one in-memory Y.Doc
 * shared by all connected clients. The doc is hydrated lazily from Postgres
 * on first access and persisted back debounced on every observed change.
 *
 * Doc layout per realm:
 *   - Y.Text  "node:<nodeId>"                       body of a document/sticky/etc node
 *   - Y.Text  "node:<nodeId>:block:<blockId>"       per-block body for the structured editor
 *   - Y.Map   "canvas:<canvasNodeId>"               canvas member map
 *       memberId -> { x, y, width, height, zIndex, memberNodeId }
 *   - Y.Map   "meta"                                invalidation counters
 *       "nodes" -> number, "realms" -> number, "relationships" -> number,
 *       "members" -> number, "collaborators" -> number
 */

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  pendingNodes: Set<string>;
  pendingMembers: Set<string>; // canvas node ids
  /** Node ids whose `blocks` jsonb needs a write because one or more of
   * their per-block Y.Texts changed. */
  pendingBlockNodes: Set<string>;
  saveTimer: NodeJS.Timeout | null;
  hydratedNodes: Set<string>;
  hydratedCanvases: Set<string>;
  /** nodeId -> blockId -> unobserve callback for the per-block Y.Text. */
  hydratedBlocks: Map<string, Map<string, () => void>>;
  /** Suppress observe-driven persistence while hydrating from DB. */
  hydrating: boolean;
}

const rooms = new Map<string, Room>();

const SAVE_DEBOUNCE_MS = 800;

const BLOCK_TEXT_RE = /^node:([^:]+):block:(.+)$/;

interface TextBlockShape {
  id: string;
  type: "text";
  text: string;
}

type AnyBlock = { id?: string; type?: string; text?: unknown; [k: string]: unknown };

function isTextBlock(b: AnyBlock): b is TextBlockShape & AnyBlock {
  return (
    !!b &&
    b.type === "text" &&
    typeof b.id === "string" &&
    typeof b.text === "string"
  );
}

export function getOrCreateRealmDoc(
  realmId: string,
): Y.Doc & { awareness?: awarenessProtocol.Awareness } {
  let room = rooms.get(realmId);
  if (room) return room.doc as Y.Doc & { awareness: awarenessProtocol.Awareness };

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  // Stash on the doc for the WS handler to find without a separate map.
  (doc as Y.Doc & { awareness: awarenessProtocol.Awareness }).awareness = awareness;
  room = {
    doc,
    awareness,
    pendingNodes: new Set(),
    pendingMembers: new Set(),
    pendingBlockNodes: new Set(),
    saveTimer: null,
    hydratedNodes: new Set(),
    hydratedCanvases: new Set(),
    hydratedBlocks: new Map(),
    hydrating: false,
  };
  rooms.set(realmId, room);
  // After every transaction (local or remote), pick up any newly-instantiated
  // per-block Y.Text shared types so peer-driven block creation gets
  // observed and persisted back to the DB.
  const capturedRoom = room;
  doc.on("afterTransaction", () => {
    pickUpNewBlockTexts(realmId, capturedRoom);
  });
  void hydrateRealm(realmId, room).catch((err) =>
    logger.error({ err, realmId }, "hydrateRealm failed"),
  );
  return doc as Y.Doc & { awareness: awarenessProtocol.Awareness };
}

export function releaseRealmDoc(realmId: string, remaining: number): void {
  if (remaining > 0) return;
  const room = rooms.get(realmId);
  if (!room) return;
  // Best-effort final flush of any debounced edits, but keep the room alive.
  // Tearing it down here races with reconnects: a new WS handler may have
  // already grabbed `room.doc` via getOrCreateRealmDoc before our flush
  // resolves, and destroying it underneath them corrupts state. Realms are
  // bounded so the memory cost of holding empty rooms is acceptable for v1.
  void flushNow(realmId, room).catch((err) =>
    logger.warn({ err, realmId }, "final flush failed"),
  );
}

function scheduleSave(realmId: string, room: Room) {
  if (room.hydrating) return;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => {
    void flushNow(realmId, room).catch((err) =>
      logger.error({ err, realmId }, "flushNow failed"),
    );
  }, SAVE_DEBOUNCE_MS);
}

async function flushNow(realmId: string, room: Room) {
  const nodeIds = Array.from(room.pendingNodes);
  const canvasIds = Array.from(room.pendingMembers);
  const blockNodeIds = Array.from(room.pendingBlockNodes);
  room.pendingNodes.clear();
  room.pendingMembers.clear();
  room.pendingBlockNodes.clear();
  if (room.saveTimer) {
    clearTimeout(room.saveTimer);
    room.saveTimer = null;
  }

  for (const nodeId of nodeIds) {
    const text = room.doc.getText(`node:${nodeId}`);
    const content = text.toString();
    try {
      await db
        .update(nodesTable)
        .set({ content })
        .where(eq(nodesTable.id, nodeId));
    } catch (err) {
      logger.warn({ err, nodeId }, "node persist failed");
    }
  }

  for (const nodeId of blockNodeIds) {
    try {
      const [row] = await db
        .select()
        .from(nodesTable)
        .where(eq(nodesTable.id, nodeId));
      if (!row) continue;
      const rowBlocks = (row as { blocks?: unknown }).blocks;
      const blocks = Array.isArray(rowBlocks) ? (rowBlocks as AnyBlock[]) : [];
      let mutated = false;
      const next = blocks.map((b) => {
        if (!isTextBlock(b)) return b;
        const yText = room.doc.getText(`node:${nodeId}:block:${b.id}`);
        const live = yText.toString();
        if (live === b.text) return b;
        mutated = true;
        return { ...b, text: live };
      });
      if (mutated) {
        await db
          .update(nodesTable)
          .set({ blocks: next })
          .where(eq(nodesTable.id, nodeId));
      }
    } catch (err) {
      logger.warn({ err, nodeId }, "node blocks persist failed");
    }
  }

  for (const canvasId of canvasIds) {
    const map = room.doc.getMap<{
      x: number;
      y: number;
      width: number;
      height: number;
      zIndex: number;
      memberNodeId: string;
    }>(`canvas:${canvasId}`);
    for (const [memberId, val] of map.entries()) {
      try {
        await db
          .update(canvasMembersTable)
          .set({
            x: val.x,
            y: val.y,
            width: val.width,
            height: val.height,
            zIndex: val.zIndex,
          })
          .where(
            and(
              eq(canvasMembersTable.id, memberId),
              eq(canvasMembersTable.canvasNodeId, canvasId),
            ),
          );
      } catch (err) {
        logger.warn({ err, memberId }, "member persist failed");
      }
    }
  }

  if (nodeIds.length > 0 || blockNodeIds.length > 0 || canvasIds.length > 0) {
    bumpInvalidation(
      realmId,
      nodeIds.length > 0 || blockNodeIds.length > 0 ? "nodes" : "members",
    );
  }
}

function watchNodeText(realmId: string, room: Room, nodeId: string) {
  if (room.hydratedNodes.has(nodeId)) return;
  room.hydratedNodes.add(nodeId);
  const text = room.doc.getText(`node:${nodeId}`);
  text.observe(() => {
    if (room.hydrating) return;
    room.pendingNodes.add(nodeId);
    scheduleSave(realmId, room);
  });
}

function watchBlockText(
  realmId: string,
  room: Room,
  nodeId: string,
  blockId: string,
) {
  let map = room.hydratedBlocks.get(nodeId);
  if (!map) {
    map = new Map();
    room.hydratedBlocks.set(nodeId, map);
  }
  if (map.has(blockId)) return;
  const text = room.doc.getText(`node:${nodeId}:block:${blockId}`);
  const handler = () => {
    if (room.hydrating) return;
    room.pendingBlockNodes.add(nodeId);
    scheduleSave(realmId, room);
  };
  text.observe(handler);
  map.set(blockId, () => text.unobserve(handler));
}

function watchCanvasMap(realmId: string, room: Room, canvasNodeId: string) {
  if (room.hydratedCanvases.has(canvasNodeId)) return;
  room.hydratedCanvases.add(canvasNodeId);
  const map = room.doc.getMap(`canvas:${canvasNodeId}`);
  map.observeDeep(() => {
    if (room.hydrating) return;
    room.pendingMembers.add(canvasNodeId);
    scheduleSave(realmId, room);
  });
}

/** Walk doc.share for any per-block Y.Text we're not yet observing and start
 * watching it. Called after every transaction so peers can introduce new
 * text blocks without us missing their edits. */
function pickUpNewBlockTexts(realmId: string, room: Room) {
  // doc.share is a Map<string, AbstractType<any>> exposed by Y.Doc.
  for (const key of room.doc.share.keys()) {
    const m = BLOCK_TEXT_RE.exec(key);
    if (!m) continue;
    const nodeId = m[1];
    const blockId = m[2];
    const map = room.hydratedBlocks.get(nodeId);
    if (map && map.has(blockId)) continue;
    watchBlockText(realmId, room, nodeId, blockId);
    // If a peer just created this block via Yjs ops, the change observer
    // already queued a save on the same transaction. If a peer connected and
    // sync'd in an existing block we hadn't seen, we don't need to re-save
    // because the DB already has the text. Either way, no extra work here.
  }
}

/** Seed every text block's Y.Text from the persisted blocks json (if the
 * Y.Text is empty) and attach the observer. Safe to call repeatedly. */
function hydrateBlocksForNode(
  realmId: string,
  room: Room,
  nodeId: string,
  blocks: unknown,
) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks as AnyBlock[]) {
    if (!isTextBlock(b)) continue;
    const yText = room.doc.getText(`node:${nodeId}:block:${b.id}`);
    if (yText.length === 0 && b.text.length > 0) {
      yText.insert(0, b.text);
    }
    watchBlockText(realmId, room, nodeId, b.id);
  }
}

async function hydrateRealm(realmId: string, room: Room) {
  room.hydrating = true;
  try {
    const nodes = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.realmId, realmId));

    room.doc.transact(() => {
      for (const n of nodes) {
        const text = room.doc.getText(`node:${n.id}`);
        if (text.length === 0 && n.content) text.insert(0, n.content);
        watchNodeText(realmId, room, n.id);
        const nBlocks = (n as { blocks?: unknown }).blocks;
        hydrateBlocksForNode(realmId, room, n.id, nBlocks);
        if (n.kind === "canvas") {
          watchCanvasMap(realmId, room, n.id);
        }
      }
    });

    // Hydrate canvas member maps
    const canvasIds = nodes.filter((n) => n.kind === "canvas").map((n) => n.id);
    for (const canvasId of canvasIds) {
      const members = await db
        .select()
        .from(canvasMembersTable)
        .where(eq(canvasMembersTable.canvasNodeId, canvasId));
      const map = room.doc.getMap<{
        x: number;
        y: number;
        width: number;
        height: number;
        zIndex: number;
        memberNodeId: string;
      }>(`canvas:${canvasId}`);
      room.doc.transact(() => {
        for (const m of members) {
          if (!map.has(m.id)) {
            map.set(m.id, {
              x: m.x,
              y: m.y,
              width: m.width,
              height: m.height,
              zIndex: m.zIndex,
              memberNodeId: m.memberNodeId,
            });
          }
        }
      });
    }
  } finally {
    room.hydrating = false;
  }
}

/**
 * Public API: bump a counter on the realm doc to nudge connected clients to
 * invalidate the matching React Query keys. Called from REST handlers on any
 * mutation.
 */
export function bumpInvalidation(
  realmId: string,
  scope:
    | "nodes"
    | "realms"
    | "relationships"
    | "members"
    | "collaborators"
    | "viewports"
    | "folders",
): void {
  const room = rooms.get(realmId);
  if (!room) return;
  const meta = room.doc.getMap<number>("meta");
  const cur = meta.get(scope) ?? 0;
  meta.set(scope, cur + 1);
}

/** Make sure a node's Y.Text is registered + observed (used when REST
 * creates a new node so future edits flow). */
export function ensureNodeWatched(
  realmId: string,
  nodeId: string,
  kind: string,
  initialContent?: string,
  initialBlocks?: unknown,
): void {
  const room = rooms.get(realmId);
  if (!room) return;
  room.hydrating = true;
  try {
    const text = room.doc.getText(`node:${nodeId}`);
    if (text.length === 0 && initialContent) text.insert(0, initialContent);
    watchNodeText(realmId, room, nodeId);
    if (initialBlocks !== undefined) {
      hydrateBlocksForNode(realmId, room, nodeId, initialBlocks);
    }
    if (kind === "canvas") watchCanvasMap(realmId, room, nodeId);
  } finally {
    room.hydrating = false;
  }
}

/** Called from REST PATCH /nodes/:id when the caller updates the structured
 * `blocks` array. We mirror any new text-block text into the per-block Y.Text
 * (only if the Y.Text is currently empty, to avoid clobbering live edits) and
 * register an observer so future Y.Text edits get persisted back. We also drop
 * watchers + Y.Texts for blocks that disappeared from the array. */
export function syncBlocksWatched(
  realmId: string,
  nodeId: string,
  blocks: unknown,
): void {
  const room = rooms.get(realmId);
  if (!room) return;
  if (!Array.isArray(blocks)) return;
  const liveIds = new Set<string>();
  room.hydrating = true;
  try {
    for (const b of blocks as AnyBlock[]) {
      if (!isTextBlock(b)) continue;
      liveIds.add(b.id);
      const yText = room.doc.getText(`node:${nodeId}:block:${b.id}`);
      // Only seed when nobody (peer or server) has put anything in yet.
      if (yText.length === 0 && b.text.length > 0) {
        yText.insert(0, b.text);
      }
      watchBlockText(realmId, room, nodeId, b.id);
    }
    // Drop watchers for blocks that no longer exist.
    const map = room.hydratedBlocks.get(nodeId);
    if (map) {
      for (const [blockId, unobserve] of Array.from(map.entries())) {
        if (liveIds.has(blockId)) continue;
        try {
          unobserve();
        } catch {
          // ignore
        }
        map.delete(blockId);
        // Best-effort: clear the Y.Text content so peers see the deletion.
        const key = `node:${nodeId}:block:${blockId}`;
        if (room.doc.share.has(key)) {
          const yText = room.doc.getText(key);
          if (yText.length > 0) yText.delete(0, yText.length);
        }
      }
    }
  } finally {
    room.hydrating = false;
  }
}

/** Drop a node's Y.Text when REST deletes it. */
export function dropNode(realmId: string, nodeId: string): void {
  const room = rooms.get(realmId);
  if (!room) return;
  room.hydratedNodes.delete(nodeId);
  room.pendingNodes.delete(nodeId);
  room.hydratedBlocks.delete(nodeId);
  room.pendingBlockNodes.delete(nodeId);
}

type CanvasMemberValue = {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  memberNodeId: string;
};

/** Mirror a REST canvas-member insert into the per-realm Y.Map so other
 * connected clients see the change without a refetch. Runs with the
 * `hydrating` flag set so the observer doesn't try to persist it back. */
export function applyMemberInsert(
  realmId: string,
  canvasNodeId: string,
  memberId: string,
  value: CanvasMemberValue,
): void {
  const room = rooms.get(realmId);
  if (!room) return;
  room.hydrating = true;
  try {
    const map = room.doc.getMap<CanvasMemberValue>(`canvas:${canvasNodeId}`);
    map.set(memberId, value);
  } finally {
    room.hydrating = false;
  }
}

export function applyMemberUpdate(
  realmId: string,
  canvasNodeId: string,
  memberId: string,
  patch: Partial<CanvasMemberValue>,
): void {
  const room = rooms.get(realmId);
  if (!room) return;
  room.hydrating = true;
  try {
    const map = room.doc.getMap<CanvasMemberValue>(`canvas:${canvasNodeId}`);
    const cur = map.get(memberId);
    if (!cur) return;
    map.set(memberId, { ...cur, ...patch });
  } finally {
    room.hydrating = false;
  }
}

/**
 * TEST-ONLY: tear down all in-memory rooms. Used by automated tests to
 * simulate a server restart. Not exported via any production code path.
 */
export function __resetForTests(): void {
  for (const room of rooms.values()) {
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    try {
      room.doc.destroy();
    } catch {
      // ignore
    }
  }
  rooms.clear();
}

export function applyMemberDelete(
  realmId: string,
  canvasNodeId: string,
  memberId: string,
): void {
  const room = rooms.get(realmId);
  if (!room) return;
  room.hydrating = true;
  try {
    const map = room.doc.getMap<CanvasMemberValue>(`canvas:${canvasNodeId}`);
    map.delete(memberId);
  } finally {
    room.hydrating = false;
  }
}
