import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Sharing a folder shares what is in it - every note, and everything in every
// subfolder, however deep. That is the whole reason to share a folder rather
// than a note at a time, and it is the part that is easy to get half right:
// the folder arrives and looks empty, or the top level comes through and the
// subfolders don't.
//
// Same mocking harness as freeHotbarAccess.test.ts.
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
    getNoteFolder: fn(),
    getNoteShares: fn(),
    getFolderShares: fn(),
    createNoteShare: fn(),
    deleteNoteShare: fn(),
    updateNoteShare: fn(),
    getSharedWithUser: fn(),
    getSharedNotes: fn(),
    canAccessNote: fn(),
    areFriends: fn(),
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    getCampaignNotesRaw: fn(),
    getCampaignNoteFolders: fn(),
    getUserNoteFolders: fn(),
    getNoteReferences: fn(),
    createNoteFolder: fn(),
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
  isAdminUser: async (userId: string | undefined) => !!userId && h.adminUserIds.has(userId),
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

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    const uid = req.headers["x-test-user"];
    req.session = uid ? { userId: String(uid) } : {};
    next();
  });
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const gm = "gm1";
const player = "player1";
const other = "player2";
const campaignId = "camp1";

// Lore
//   └── Cities            (shared with player1)
//        └── Tallow       (nested under the shared folder)
//   └── Secrets           (not shared)
const folders = [
  { id: "lore", userId: gm, campaignId, parentId: null, name: "Lore", visibility: "gm", visiblePlayerIds: null },
  { id: "cities", userId: gm, campaignId, parentId: "lore", name: "Cities", visibility: "gm", visiblePlayerIds: null },
  { id: "tallow", userId: gm, campaignId, parentId: "cities", name: "Tallow", visibility: "gm", visiblePlayerIds: null },
  { id: "secrets", userId: gm, campaignId, parentId: "lore", name: "Secrets", visibility: "gm", visiblePlayerIds: null },
];
const notes = [
  { id: "n-cities", userId: gm, campaignId, folderId: "cities", title: "The Cities", content: "Nine of them.", type: "note", visibility: "gm", visiblePlayerIds: null },
  { id: "n-tallow", userId: gm, campaignId, folderId: "tallow", title: "Tallow", content: "A port.", type: "note", visibility: "gm", visiblePlayerIds: null },
  { id: "n-secret", userId: gm, campaignId, folderId: "secrets", title: "The Betrayal", content: "Not yet.", type: "note", visibility: "gm", visiblePlayerIds: null },
];

let shares: any[];

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.adminUserIds.clear();
  shares = [{ id: "s1", folderId: "cities", noteId: null, ownerId: gm, sharedWithId: player, permission: "view" }];

  h.storage.getUser.mockImplementation(async (id: string) => ({
    id, username: `user-${id}`, email: `${id}@example.com`, isAdmin: false, bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);
  h.storage.getCampaign.mockResolvedValue({ id: campaignId, gmUserId: gm });
  h.storage.getCampaignMembers.mockResolvedValue([
    { userId: gm, role: "gm", username: "gm1" },
    { userId: player, role: "player", username: "player1" },
    { userId: other, role: "player", username: "player2" },
  ]);
  h.storage.getCampaignNoteFolders.mockResolvedValue(folders);
  h.storage.getCampaignNotesRaw.mockResolvedValue(notes);
  h.storage.getSharedWithUser.mockImplementation(async (uid: string) =>
    shares.filter((s) => s.sharedWithId === uid));
  h.storage.getNoteFolder.mockImplementation(async (id: string) => folders.find((f) => f.id === id));
  h.storage.getFolderShares.mockImplementation(async (id: string) => shares.filter((s) => s.folderId === id));
  h.storage.createNoteShare.mockImplementation(async (row: any) => ({ id: "s-new", ...row }));
  h.storage.areFriends.mockResolvedValue(false);
  h.storage.getNoteReferences.mockResolvedValue([]);
});

function api(pathName: string, opts: { method?: string; user?: string; body?: any } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.user) headers["x-test-user"] = opts.user;
  return fetch(`${baseUrl}${pathName}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

describe("a shared folder", () => {
  it("brings its own notes with it", async () => {
    const res = await api(`/api/notes?campaignId=${campaignId}`, { user: player });
    expect(res.status).toBe(200);
    const ids = (await res.json()).map((n: any) => n.id);
    expect(ids).toContain("n-cities");
  });

  it("brings the notes in its subfolders too", async () => {
    const res = await api(`/api/notes?campaignId=${campaignId}`, { user: player });
    const ids = (await res.json()).map((n: any) => n.id);
    expect(ids).toContain("n-tallow");
  });

  it("brings nothing from a folder that wasn't shared", async () => {
    const res = await api(`/api/notes?campaignId=${campaignId}`, { user: player });
    const ids = (await res.json()).map((n: any) => n.id);
    expect(ids).not.toContain("n-secret");
  });

  it("shows the shared folder and its subfolders in the tree", async () => {
    const res = await api(`/api/notes/folders?campaignId=${campaignId}`, { user: player });
    expect(res.status).toBe(200);
    const ids = (await res.json()).map((f: any) => f.id);
    expect(ids).toContain("cities");
    expect(ids).toContain("tallow");
    // The parent is shown only so the tree can be walked down to the share.
    expect(ids).toContain("lore");
    expect(ids).not.toContain("secrets");
  });

  it("stays invisible to someone it wasn't shared with", async () => {
    const notesRes = await api(`/api/notes?campaignId=${campaignId}`, { user: other });
    expect((await notesRes.json()).map((n: any) => n.id)).toEqual([]);
    const folderRes = await api(`/api/notes/folders?campaignId=${campaignId}`, { user: other });
    expect((await folderRes.json()).map((f: any) => f.id)).toEqual([]);
  });
});

describe("managing a folder's shares", () => {
  it("lets the owner share it with a campaign member", async () => {
    const res = await api(`/api/notes/folders/cities/shares`, {
      method: "POST", user: gm, body: { friendId: other, permission: "edit" },
    });
    expect(res.status).toBe(201);
    expect(h.storage.createNoteShare).toHaveBeenCalledWith(expect.objectContaining({
      folderId: "cities", ownerId: gm, sharedWithId: other, permission: "edit",
    }));
  });

  it("won't let someone else share a folder they don't own", async () => {
    const res = await api(`/api/notes/folders/cities/shares`, {
      method: "POST", user: player, body: { friendId: other },
    });
    expect(res.status).toBe(403);
    expect(h.storage.createNoteShare).not.toHaveBeenCalled();
  });

  it("won't share with a stranger who is neither friend nor member", async () => {
    const res = await api(`/api/notes/folders/cities/shares`, {
      method: "POST", user: gm, body: { friendId: "nobody" },
    });
    expect(res.status).toBe(400);
    expect(h.storage.createNoteShare).not.toHaveBeenCalled();
  });

  it("only shows the owner who it is shared with", async () => {
    const mine = await api(`/api/notes/folders/cities/shares`, { user: gm });
    expect(mine.status).toBe(200);
    expect((await mine.json())).toHaveLength(1);
    const theirs = await api(`/api/notes/folders/cities/shares`, { user: player });
    expect(theirs.status).toBe(403);
  });
});
