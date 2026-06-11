import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Mocks. The route handlers under test reach the database only through the
// `storage` facade, so we replace it wholesale with controllable spies. We also
// stub `./db`, `./email`, `./googleDrive`, and `./lib/library-acl` so
// registerRoutes can boot without a real database, Google credentials, or the
// sync worker. Mirrors the harness in v3SpellCensoring.test.ts.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  const query = () => {
    const p: any = Promise.resolve([]);
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return p.then.bind(p);
          if (prop === "catch") return p.catch.bind(p);
          if (prop === "finally") return p.finally.bind(p);
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  const storage: Record<string, any> = {
    getUser: fn(),
    getWorld: fn(),
    isWorldCollaborator: fn(),
    getCampaign: fn(),
    isCampaignMember: fn(),
    getEntityLink: fn(),
    createEntityLink: fn(),
    updateEntityLink: fn(),
    deleteEntityLink: fn(),
    deleteExpiredSpectatorTokens: fn(),
  };
  const adminUserIds = new Set<string>();
  return {
    storage,
    adminUserIds,
    db: {
      execute: async () => ({ rows: [] }),
      select: () => query(),
      update: () => query(),
      insert: () => query(),
      delete: () => query(),
    },
  };
});

vi.mock("../storage", () => ({ storage: h.storage }));
vi.mock("../db", () => ({ db: h.db, pool: {} }));
vi.mock("../email", () => ({ sendPasswordResetEmail: async () => {} }));
vi.mock("../googleDrive", () => ({
  listFolders: async () => [],
  listImages: async () => [],
  getImageBase64: async () => "",
  searchImages: async () => [],
  getGoogleDriveStatus: async () => ({ connected: false }),
}));
vi.mock("../lib/library-acl", () => ({
  ADMIN_EMAILS: [],
  isAdminUser: async (userId: string | undefined) =>
    !!userId && h.adminUserIds.has(userId),
  getLibraryScope: async () => undefined,
  enforceLibraryWrite: async () => true,
  enforceLibraryRead: async () => true,
  canReadLibraryRow: () => true,
  canWriteLibraryRow: () => true,
  requireLibraryAaV2: async () => true,
}));

import { registerRoutes } from "../routes";

let server: import("http").Server;
let baseUrl: string;

// A test-only session middleware. Its function name MUST be `session` so the
// WebSocket-upgrade path in registerRoutes (which locates the session
// middleware by layer name) can resolve a userId from the same header.
function makeSessionMiddleware() {
  return function session(req: any, _res: any, next: any) {
    const uid = req.headers["x-test-user"];
    req.session = uid ? { userId: String(uid) } : {};
    next();
  };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(makeSessionMiddleware());
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.adminUserIds.clear();
  h.storage.getUser.mockImplementation(async (id: string) => ({
    id,
    username: `user-${id}`,
    email: `${id}@example.com`,
    isAdmin: false,
    bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);
  // No campaign linkage by default; collaboration only via owner/collaborator.
  h.storage.isWorldCollaborator.mockResolvedValue(false);
  h.storage.isCampaignMember.mockResolvedValue(false);
});

function api(pathName: string, opts: { method?: string; user?: string; body?: any } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.user) headers["x-test-user"] = opts.user;
  return fetch(`${baseUrl}${pathName}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

// Connect a real WebSocket client and resolve the open socket (without joining
// anything). Useful for asserting that a join is rejected.
function connect(user: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`, {
      headers: { "x-test-user": user },
    });
    const timeout = setTimeout(() => reject(new Error("WS open timed out")), 8000);
    ws.on("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Connect a real WebSocket client and join a standalone world, resolving once
// the server confirms with `joined_world`, so the client will receive
// world-scoped broadcasts.
function connectAndJoinWorld(user: string, worldId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`, {
      headers: { "x-test-user": user },
    });
    const timeout = setTimeout(() => reject(new Error("WS join_world timed out")), 8000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_world", worldId }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "joined_world" && msg.worldId === worldId) {
        clearTimeout(timeout);
        resolve(ws);
      }
      if (msg.type === "error") {
        clearTimeout(timeout);
        reject(new Error(msg.message || "join_world error"));
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Wait for the next message of a given type on an open socket.
function waitForMessage(ws: WebSocket, type: string, ms = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${type}`)),
      ms,
    );
    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timeout);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

// Send a message and assert it is NOT received within a short window.
function expectNoMessage(ws: WebSocket, type: string, ms = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        ws.off("message", onMsg);
        reject(new Error(`Unexpectedly received ${type}`));
      }
    };
    ws.on("message", onMsg);
    setTimeout(() => {
      ws.off("message", onMsg);
      resolve();
    }, ms);
  });
}

function closeAll(...sockets: WebSocket[]) {
  for (const ws of sockets) {
    try {
      ws.removeAllListeners();
      ws.close();
    } catch {}
  }
}

// A standalone world (no linked campaign) owned by `owner`.
function mockStandaloneWorld(worldId: string, owner: string) {
  h.storage.getWorld.mockResolvedValue({
    id: worldId,
    userId: owner,
    campaignId: null,
    system: "arcana-adventure",
  });
}

// ---------------------------------------------------------------------------
// Two collaborators viewing the same standalone world via join_world both
// receive entity_link_* broadcasts when those links are created/updated/deleted
// through the world-scoped routes. This is the core live-collaboration path.
// ---------------------------------------------------------------------------
describe("standalone world live sync — entity-link broadcasts", () => {
  const worldId = "world1";
  const owner = "owner1";
  const collaborator = "collab1";

  it("broadcasts entity_link_created to all clients in the world room", async () => {
    mockStandaloneWorld(worldId, owner);
    // Owner connects; collaborator is a registered world collaborator so they
    // pass checkWorldAccess for join_world (but not isOwner — read access).
    h.storage.isWorldCollaborator.mockImplementation(
      async (_wid: string, uid: string) => uid === collaborator,
    );

    const wsA = await connectAndJoinWorld(owner, worldId);
    const wsB = await connectAndJoinWorld(collaborator, worldId);
    try {
      const link = { id: "link1", worldId, fromEntityId: "e1", toEntityId: "e2", linkType: "ally" };
      h.storage.createEntityLink.mockResolvedValue(link);

      const gotA = waitForMessage(wsA, "entity_link_created");
      const gotB = waitForMessage(wsB, "entity_link_created");

      const res = await api(`/api/worlds/${worldId}/entity-links`, {
        method: "POST",
        user: owner,
        body: { fromEntityId: "e1", toEntityId: "e2", linkType: "ally" },
      });
      expect(res.status).toBe(201);

      const [msgA, msgB] = await Promise.all([gotA, gotB]);
      expect(msgA.link.id).toBe("link1");
      expect(msgB.link.id).toBe("link1");
    } finally {
      closeAll(wsA, wsB);
    }
  });

  it("broadcasts entity_link_updated to all clients in the world room", async () => {
    mockStandaloneWorld(worldId, owner);
    h.storage.isWorldCollaborator.mockImplementation(
      async (_wid: string, uid: string) => uid === collaborator,
    );

    const wsA = await connectAndJoinWorld(owner, worldId);
    const wsB = await connectAndJoinWorld(collaborator, worldId);
    try {
      h.storage.getEntityLink.mockResolvedValue({ id: "link1", worldId });
      const updated = { id: "link1", worldId, linkType: "rival" };
      h.storage.updateEntityLink.mockResolvedValue(updated);

      const gotA = waitForMessage(wsA, "entity_link_updated");
      const gotB = waitForMessage(wsB, "entity_link_updated");

      const res = await api(`/api/worlds/${worldId}/entity-links/link1`, {
        method: "PATCH",
        user: owner,
        body: { linkType: "rival" },
      });
      expect(res.status).toBe(200);

      const [msgA, msgB] = await Promise.all([gotA, gotB]);
      expect(msgA.link.linkType).toBe("rival");
      expect(msgB.link.linkType).toBe("rival");
    } finally {
      closeAll(wsA, wsB);
    }
  });

  it("broadcasts entity_link_deleted to all clients in the world room", async () => {
    mockStandaloneWorld(worldId, owner);
    h.storage.isWorldCollaborator.mockImplementation(
      async (_wid: string, uid: string) => uid === collaborator,
    );

    const wsA = await connectAndJoinWorld(owner, worldId);
    const wsB = await connectAndJoinWorld(collaborator, worldId);
    try {
      h.storage.getEntityLink.mockResolvedValue({ id: "link1", worldId });
      h.storage.deleteEntityLink.mockResolvedValue(undefined);

      const gotA = waitForMessage(wsA, "entity_link_deleted");
      const gotB = waitForMessage(wsB, "entity_link_deleted");

      const res = await api(`/api/worlds/${worldId}/entity-links/link1`, {
        method: "DELETE",
        user: owner,
      });
      expect(res.status).toBe(200);

      const [msgA, msgB] = await Promise.all([gotA, gotB]);
      expect(msgA.linkId).toBe("link1");
      expect(msgB.linkId).toBe("link1");
    } finally {
      closeAll(wsA, wsB);
    }
  });

  it("does NOT deliver broadcasts to a client in a different world room", async () => {
    mockStandaloneWorld(worldId, owner);
    // A second world the eavesdropper owns.
    const otherWorld = "world2";
    h.storage.getWorld.mockImplementation(async (id: string) =>
      id === worldId
        ? { id: worldId, userId: owner, campaignId: null, system: "arcana-adventure" }
        : { id: otherWorld, userId: "eaves", campaignId: null, system: "arcana-adventure" },
    );

    const wsOwner = await connectAndJoinWorld(owner, worldId);
    const wsOther = await connectAndJoinWorld("eaves", otherWorld);
    try {
      h.storage.createEntityLink.mockResolvedValue({
        id: "link1",
        worldId,
        fromEntityId: "e1",
        toEntityId: "e2",
        linkType: "ally",
      });

      const gotOwner = waitForMessage(wsOwner, "entity_link_created");
      const silent = expectNoMessage(wsOther, "entity_link_created");

      const res = await api(`/api/worlds/${worldId}/entity-links`, {
        method: "POST",
        user: owner,
        body: { fromEntityId: "e1", toEntityId: "e2", linkType: "ally" },
      });
      expect(res.status).toBe(201);

      await gotOwner;
      await silent;
    } finally {
      closeAll(wsOwner, wsOther);
    }
  });
});

// ---------------------------------------------------------------------------
// Access control + room lifecycle for join_world.
// ---------------------------------------------------------------------------
describe("standalone world live sync — join_world authorization", () => {
  const worldId = "worldZ";
  const owner = "ownerZ";

  it("rejects join_world for a user without world access", async () => {
    h.storage.getWorld.mockResolvedValue({
      id: worldId,
      userId: owner,
      campaignId: null,
      system: "arcana-adventure",
    });
    // Stranger is neither owner nor collaborator; no campaign linkage.
    h.storage.isWorldCollaborator.mockResolvedValue(false);

    const ws = await connect("stranger");
    try {
      const gotError = waitForMessage(ws, "error");
      ws.send(JSON.stringify({ type: "join_world", worldId }));
      const err = await gotError;
      expect(err.message).toMatch(/not authorized/i);

      // And no broadcast reaches the rejected client.
      h.storage.createEntityLink.mockResolvedValue({
        id: "link1",
        worldId,
        fromEntityId: "e1",
        toEntityId: "e2",
        linkType: "ally",
      });
      const silent = expectNoMessage(ws, "entity_link_created");
      await api(`/api/worlds/${worldId}/entity-links`, {
        method: "POST",
        user: owner,
        body: { fromEntityId: "e1", toEntityId: "e2", linkType: "ally" },
      });
      await silent;
    } finally {
      closeAll(ws);
    }
  });

  it("cleans up the world room on socket close (no leak)", async () => {
    mockStandaloneWorld(worldId, owner);

    // Join, then disconnect. After the close is processed, a broadcast must
    // find an empty/absent room — observable by a freshly joined second client
    // receiving its own broadcast while nothing errors from the stale socket.
    const ws1 = await connectAndJoinWorld(owner, worldId);
    await new Promise<void>((resolve) => {
      ws1.on("close", () => resolve());
      ws1.close();
    });
    // Give the server's close handler a tick to run room cleanup.
    await new Promise((r) => setTimeout(r, 200));

    // A new client joins the same world; if the room had leaked the old socket,
    // the server would attempt to send to a CLOSED socket (readyState !== 1) —
    // which is guarded — but more importantly the new client must still work.
    const ws2 = await connectAndJoinWorld(owner, worldId);
    try {
      h.storage.createEntityLink.mockResolvedValue({
        id: "link1",
        worldId,
        fromEntityId: "e1",
        toEntityId: "e2",
        linkType: "ally",
      });
      const got = waitForMessage(ws2, "entity_link_created");
      const res = await api(`/api/worlds/${worldId}/entity-links`, {
        method: "POST",
        user: owner,
        body: { fromEntityId: "e1", toEntityId: "e2", linkType: "ally" },
      });
      expect(res.status).toBe(201);
      const msg = await got;
      expect(msg.link.id).toBe("link1");
    } finally {
      closeAll(ws2);
    }
  });

  it("removes the socket from the room on leave_world", async () => {
    mockStandaloneWorld(worldId, owner);

    const ws = await connectAndJoinWorld(owner, worldId);
    try {
      // Leave the world; subsequent broadcasts must not reach this socket.
      ws.send(JSON.stringify({ type: "leave_world", worldId }));
      await new Promise((r) => setTimeout(r, 200));

      h.storage.createEntityLink.mockResolvedValue({
        id: "link1",
        worldId,
        fromEntityId: "e1",
        toEntityId: "e2",
        linkType: "ally",
      });
      const silent = expectNoMessage(ws, "entity_link_created");
      const res = await api(`/api/worlds/${worldId}/entity-links`, {
        method: "POST",
        user: owner,
        body: { fromEntityId: "e1", toEntityId: "e2", linkType: "ally" },
      });
      expect(res.status).toBe(201);
      await silent;
    } finally {
      closeAll(ws);
    }
  });
});
