import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { resolveRealmRole, type RealmRole } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getOrCreateRealmDoc, releaseRealmDoc } from "./doc-registry";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
/** Sent server -> client when the client's write was rejected because their
 * realm role doesn't permit mutations (e.g. viewer). The client surfaces this
 * as a toast / read-only badge. */
const MESSAGE_DENIED = 2;
/** Sent server -> a specific client when a GM grants them per-node edit
 * access. The client surfaces this as a toast and refreshes its per-node
 * access query so editing unlocks live (no refresh). Frame layout:
 * [MESSAGE_GRANT, nodeId, nodeTitle]. */
const MESSAGE_GRANT = 3;

function makeDeniedFrame(reason: string): Uint8Array {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MESSAGE_DENIED);
  encoding.writeVarString(enc, reason);
  return encoding.toUint8Array(enc);
}

function makeGrantFrame(nodeId: string, nodeTitle: string): Uint8Array {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MESSAGE_GRANT);
  encoding.writeVarString(enc, nodeId);
  encoding.writeVarString(enc, nodeTitle);
  return encoding.toUint8Array(enc);
}

/**
 * Notify a specific user, connected to the given realm, that they've just been
 * granted per-node edit access. No-op if that user has no live connection to
 * the realm (they'll discover the grant via their next page load / access
 * query). Returns the number of sockets the notification reached.
 */
export function notifyNodeGrant(
  realmId: string,
  userId: string,
  nodeId: string,
  nodeTitle: string,
): number {
  const set = docClients.get(realmId);
  if (!set) return 0;
  const frame = makeGrantFrame(nodeId, nodeTitle);
  let sent = 0;
  for (const c of set) {
    if (c.userId !== userId) continue;
    send(c.ws, frame);
    sent++;
  }
  return sent;
}

const PATH_RE = /^\/api\/realtime\/([^/?]+)/;

interface RealtimeClient {
  ws: WebSocket;
  userId: string;
  role: RealmRole;
  realmId: string;
  awarenessIds: Set<number>;
}

const docClients = new Map<string, Set<RealtimeClient>>();

/**
 * Host express-session middleware, injected by initCanvasRealtime. We run it
 * over the raw upgrade request (with a mock response) to populate
 * `req.session.userId`, mirroring the host's own WS auth pattern.
 */
type SessionMiddleware = (
  req: IncomingMessage,
  res: unknown,
  next: () => void,
) => void;

let wss: WebSocketServer | null = null;
let sessionMiddleware: SessionMiddleware | null = null;

function send(ws: WebSocket, buf: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(buf, { binary: true });
  } catch (err) {
    logger.warn({ err }, "ws.send failed");
  }
}

function broadcast(realmId: string, buf: Uint8Array, except?: RealtimeClient) {
  const set = docClients.get(realmId);
  if (!set) return;
  for (const c of set) {
    if (c === except) continue;
    send(c.ws, buf);
  }
}

async function authenticate(
  req: IncomingMessage,
): Promise<{ userId: string } | null> {
  if (!sessionMiddleware) return null;
  try {
    const mockRes = {
      getHeader: () => undefined,
      setHeader: () => undefined,
      end: () => undefined,
    };
    await new Promise<void>((resolve) => {
      sessionMiddleware!(req, mockRes, () => resolve());
    });
    const userId = (req as unknown as { session?: { userId?: string } }).session
      ?.userId;
    if (userId) return { userId };
  } catch (err) {
    logger.debug({ err }, "ws auth failed");
  }
  return null;
}

function handleSyncMessage(
  client: RealtimeClient,
  decoder: decoding.Decoder,
  doc: Y.Doc,
): Uint8Array | null {
  const replyEncoder = encoding.createEncoder();
  encoding.writeVarUint(replyEncoder, MESSAGE_SYNC);
  // y-protocols/sync messages: SyncStep1=0, SyncStep2=1, Update=2.
  // Viewers may receive (SyncStep2 reply to their SyncStep1) but must not
  // mutate the doc — drop SyncStep2 / Update from viewers.
  const messageType = decoding.readVarUint(decoder);
  if (messageType === syncProtocol.messageYjsSyncStep1) {
    // writeSyncStep2 emits its own subtype byte (messageYjsSyncStep2) — do
    // NOT manually write the Step1 marker here, otherwise the client sees a
    // malformed frame ([SYNC, Step1, Step2, ...]) and either drops the
    // payload or applies it incorrectly.
    const sv = decoding.readVarUint8Array(decoder);
    syncProtocol.writeSyncStep2(replyEncoder, doc, sv);
    return encoding.toUint8Array(replyEncoder);
  }
  if (
    messageType === syncProtocol.messageYjsSyncStep2 ||
    messageType === syncProtocol.messageYjsUpdate
  ) {
    const update = decoding.readVarUint8Array(decoder);
    if (client.role === "viewer") {
      // Reject explicitly so the client knows the write didn't take. Mirrors
      // the REST 403 semantics: viewers may read + send awareness, but writes
      // are forbidden at the WS layer (defense-in-depth on top of the UI's
      // canEdit gate).
      send(client.ws, makeDeniedFrame("viewer-cannot-write"));
      return null;
    }
    Y.applyUpdate(doc, update, client);
    return null; // observer will broadcast to others
  }
  return null;
}

function attachClient(client: RealtimeClient, doc: Y.Doc) {
  let set = docClients.get(client.realmId);
  if (!set) {
    set = new Set();
    docClients.set(client.realmId, set);
  }
  set.add(client);

  // 1) Send initial SyncStep1 to request the client's state
  const enc1 = encoding.createEncoder();
  encoding.writeVarUint(enc1, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(enc1, doc);
  send(client.ws, encoding.toUint8Array(enc1));

  // 2) Send current awareness state
  const awareness = (doc as Y.Doc & { awareness?: awarenessProtocol.Awareness })
    .awareness;
  if (awareness && awareness.getStates().size > 0) {
    const enc2 = encoding.createEncoder();
    encoding.writeVarUint(enc2, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      enc2,
      awarenessProtocol.encodeAwarenessUpdate(
        awareness,
        Array.from(awareness.getStates().keys()),
      ),
    );
    send(client.ws, encoding.toUint8Array(enc2));
  }
}

function detachClient(client: RealtimeClient, doc: Y.Doc) {
  const set = docClients.get(client.realmId);
  if (set) {
    set.delete(client);
    if (set.size === 0) docClients.delete(client.realmId);
  }
  // Remove this client's awareness states
  const awareness = (doc as Y.Doc & { awareness?: awarenessProtocol.Awareness })
    .awareness;
  if (awareness && client.awarenessIds.size > 0) {
    awarenessProtocol.removeAwarenessStates(
      awareness,
      Array.from(client.awarenessIds),
      client,
    );
  }
  // Hand the room back to the registry; if the last writable client left it
  // may schedule a final flush.
  releaseRealmDoc(client.realmId, set?.size ?? 0);
}

function onConnection(
  ws: WebSocket,
  _req: IncomingMessage,
  meta: { userId: string; role: RealmRole; realmId: string },
) {
  const doc = getOrCreateRealmDoc(meta.realmId);
  const awareness = (doc as Y.Doc & { awareness?: awarenessProtocol.Awareness })
    .awareness;
  const client: RealtimeClient = {
    ws,
    userId: meta.userId,
    role: meta.role,
    realmId: meta.realmId,
    awarenessIds: new Set(),
  };

  // Local doc-update observer: broadcast every change (including ones from
  // this client's accepted writes) to the other peers as MESSAGE_SYNC /
  // Update.
  const docUpdateHandler = (update: Uint8Array, origin: unknown) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    encoding.writeVarUint(enc, syncProtocol.messageYjsUpdate);
    encoding.writeVarUint8Array(enc, update);
    const buf = encoding.toUint8Array(enc);
    // Don't echo back to origin
    broadcast(meta.realmId, buf, origin === client ? client : undefined);
  };
  doc.on("update", docUpdateHandler);

  const awarenessHandler = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (!awareness) return;
    const all = [...changes.added, ...changes.updated, ...changes.removed];
    if (all.length === 0) return;
    if (origin === client) {
      // Track which awareness ids this client owns so we can clean up
      // when they disconnect.
      for (const id of changes.added) client.awarenessIds.add(id);
      for (const id of changes.removed) client.awarenessIds.delete(id);
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(awareness, all),
    );
    const buf = encoding.toUint8Array(enc);
    broadcast(meta.realmId, buf, origin === client ? client : undefined);
  };
  awareness?.on("update", awarenessHandler);

  ws.on("message", (data: Buffer) => {
    try {
      const buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder);
      if (messageType === MESSAGE_SYNC) {
        const reply = handleSyncMessage(client, decoder, doc);
        if (reply) send(ws, reply);
      } else if (messageType === MESSAGE_AWARENESS) {
        if (!awareness) return;
        const update = decoding.readVarUint8Array(decoder);
        // Awareness updates are allowed for everyone (including viewers
        // — they should still appear as a presence + cursor).
        awarenessProtocol.applyAwarenessUpdate(awareness, update, client);
      }
    } catch (err) {
      logger.warn({ err }, "ws message decode failed");
    }
  });

  attachClient(client, doc);

  const cleanup = () => {
    doc.off("update", docUpdateHandler);
    awareness?.off("update", awarenessHandler);
    detachClient(client, doc);
  };
  ws.on("close", cleanup);
  ws.on("error", (err) => {
    logger.debug({ err }, "ws error");
    cleanup();
  });
}

/**
 * Initialize the Canvas Realms realtime WebSocket server. Created in
 * `noServer` mode because the host owns the single httpServer `upgrade`
 * event and dispatches matching paths to `handleRealtimeUpgrade` below.
 * `session` is the host express-session middleware used to authenticate the
 * upgrade request.
 */
export function initCanvasRealtime(session: SessionMiddleware): void {
  sessionMiddleware = session;
  wss = new WebSocketServer({ noServer: true });
  wss.on(
    "connection",
    (
      ws: WebSocket,
      req: IncomingMessage,
      meta: { userId: string; role: RealmRole; realmId: string },
    ) => onConnection(ws, req, meta),
  );
  logger.info("Realtime ws server initialized for /api/realtime/:realmId");
}

/**
 * Attempt to handle an httpServer `upgrade` event. Returns true if the request
 * path is a Canvas Realms realtime path (and was therefore consumed), false
 * otherwise so the host can route it to its own `/ws` server.
 */
export function handleRealtimeUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
): boolean {
  const url = req.url || "";
  const match = PATH_RE.exec(url);
  if (!match) return false;
  const realmId = match[1]!;
  if (!wss) {
    socket.destroy();
    return true;
  }
  const server = wss;
  void (async () => {
    const auth = await authenticate(req);
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const role = await resolveRealmRole(realmId, auth.userId);
    if (!role) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    server.handleUpgrade(req, socket, head, (ws) => {
      server.emit("connection", ws, req, {
        userId: auth.userId,
        role,
        realmId,
      });
    });
  })().catch((err) => {
    logger.error({ err }, "ws upgrade error");
    try {
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    } catch {}
    socket.destroy();
  });
  return true;
}
