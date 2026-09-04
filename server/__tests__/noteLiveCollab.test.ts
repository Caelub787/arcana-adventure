import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Live note editing. Every edit reaches every other viewer immediately, and a
// GM typing a `#...#` secret must never push the real characters to a player -
// not on save, and not while they are still typing it.
//
// The collaboration channel used to rebroadcast `content` verbatim to the whole
// note room, which drove straight through the read-side redaction. These tests
// drive real WebSockets against the real routes.
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
    getNote: fn(),
    updateNote: fn(),
    getNoteReferences: fn(),
    getNoteShares: fn(),
    canAccessNote: fn(),
    getCharacter: fn(),
    getCharacterPermission: fn(),
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    getKnowledgeRevisionsForEntity: fn(),
    getBacklinks: fn(),
    deleteExpiredSpectatorTokens: fn(),
    unbanUser: fn(),
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
let wsUrl: string;

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
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const gm = "gm1";
const player = "player1";
const campaignId = "camp1";
const noteId = "note1";

const SECRET = "the vault code is 4821";
let noteRow: any;

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.adminUserIds.clear();

  noteRow = {
    id: noteId,
    userId: gm,
    campaignId,
    folderId: null,
    title: "Mara",
    content: "Mara's background.",
    type: "note",
    visibility: "party",
    visiblePlayerIds: null,
  };

  h.storage.getUser.mockImplementation(async (id: string) => ({
    id, username: `user-${id}`, email: `${id}@example.com`, isAdmin: false, bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);
  h.storage.getNote.mockImplementation(async () => noteRow);
  h.storage.updateNote.mockImplementation(async (_id: string, patch: any) => {
    noteRow = { ...noteRow, ...patch };
    return noteRow;
  });
  h.storage.getNoteReferences.mockResolvedValue([]);
  h.storage.getBacklinks.mockResolvedValue([]);
  h.storage.getNoteShares.mockResolvedValue([]);
  h.storage.canAccessNote.mockResolvedValue({ canAccess: false, permission: null });
  h.storage.getKnowledgeRevisionsForEntity.mockResolvedValue([]);
  h.storage.getCampaign.mockResolvedValue({ id: campaignId, gmUserId: gm });
  h.storage.getCampaignMembers.mockResolvedValue([
    { userId: gm, role: "gm" },
    { userId: player, role: "player", trustedPlayer: false },
  ]);
  h.storage.getCampaignMembership.mockImplementation(async (uid: string) =>
    uid === gm ? { userId: uid, role: "gm" } : { userId: uid, role: "player" },
  );
});

/** Connect, join the note room, and collect every note_update that arrives. */
async function connect(userId: string) {
  const ws = new WebSocket(wsUrl, { headers: { "x-test-user": userId } });
  const received: any[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
  ws.on("message", (raw) => {
    try { received.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  ws.send(JSON.stringify({ type: "join_note", noteId }));
  // let join_note resolve its async authorization before anyone edits
  await new Promise((r) => setTimeout(r, 120));
  return {
    ws,
    received,
    edits: () => received.filter((m) => m.type === "note_update"),
    close: () => ws.close(),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 250));

describe("live note editing", () => {
  it("delivers a player's edit to the GM immediately, with no save step", async () => {
    const a = await connect(gm);
    const b = await connect(player);

    b.ws.send(JSON.stringify({
      type: "note_update", noteId, content: "Mara owes money to the guild.",
    }));
    await settle();

    expect(a.edits().at(-1)?.content).toBe("Mara owes money to the guild.");
    // the live edit is the save - it is already persisted
    expect(noteRow.content).toBe("Mara owes money to the guild.");

    a.close(); b.close();
  });

  it("never sends a GM's secret to a player, even mid-typing", async () => {
    const g = await connect(gm);
    const p = await connect(player);

    // the GM types the secret out one keystroke burst at a time
    const keystrokes = [
      "Mara. #",
      "Mara. #the vault",
      `Mara. #${SECRET}`,
      `Mara. #${SECRET}#`,
      `Mara. #${SECRET}# She lied.`,
    ];
    for (const content of keystrokes) {
      g.ws.send(JSON.stringify({ type: "note_update", noteId, content }));
      await new Promise((r) => setTimeout(r, 60));
    }
    await settle();

    // Nothing the player ever received may contain any part of the secret.
    const everythingThePlayerSaw = JSON.stringify(p.received);
    expect(everythingThePlayerSaw).not.toContain("vault");
    expect(everythingThePlayerSaw).not.toContain("4821");
    expect(everythingThePlayerSaw).not.toContain(SECRET);

    // ...but they do see the public part, live.
    expect(p.edits().at(-1)?.content).toContain("She lied.");
    expect(p.edits().at(-1)?.content).toMatch(/█+/);

    // and the GM's own copy is intact in storage
    expect(noteRow.content).toContain(`#${SECRET}#`);

    g.close(); p.close();
  });

  it("keeps the GM's secret when a player edits live", async () => {
    noteRow.content = `Mara. #${SECRET}# Done.`;
    const g = await connect(gm);
    const p = await connect(player);

    // the player echoes back the redacted copy they were given, plus an edit
    const theirCopy = p.edits().at(-1)?.content
      ?? "Mara. ██████████████████████ Done.";
    p.ws.send(JSON.stringify({
      type: "note_update", noteId, content: theirCopy + " She is broke.",
    }));
    await settle();

    expect(noteRow.content).toContain(`#${SECRET}#`);
    expect(noteRow.content).toContain("She is broke.");
    expect(noteRow.content).not.toMatch(/█/);
    // the GM sees the restored text live
    expect(g.edits().at(-1)?.content).toContain(SECRET);

    g.close(); p.close();
  });

  it("refuses a live edit from someone who may not edit the note", async () => {
    noteRow.visibility = "gm"; // players can neither see nor edit it
    const g = await connect(gm);
    const p = await connect(player);

    p.ws.send(JSON.stringify({ type: "note_update", noteId, content: "hijacked" }));
    await settle();

    expect(noteRow.content).toBe("Mara's background.");
    expect(g.edits().length).toBe(0);

    g.close(); p.close();
  });

  it("does not broadcast a GM-only note to a player who never got in", async () => {
    noteRow.visibility = "gm";
    const g = await connect(gm);
    const p = await connect(player);

    g.ws.send(JSON.stringify({ type: "note_update", noteId, content: "GM planning notes." }));
    await settle();

    expect(JSON.stringify(p.received)).not.toContain("GM planning notes.");

    g.close(); p.close();
  });
});
