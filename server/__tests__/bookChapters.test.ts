import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// A Book is a note whose body is an ordered list of other notes. The whole
// point of it is that a GM can assemble one out of notes the party can't open
// and share the book: a reader gets every chapter in full, and no way back to
// the note it came from. That is a permissions promise, so it is pinned here.
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
    updateNote: fn(),
    getNoteReferences: fn(),
    getNoteShares: fn(),
    canAccessNote: fn(),
    getCharacter: fn(),
    getCharacterPermission: fn(),
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    getBacklinks: fn(),
    getBookChapters: fn(),
    getBookChapter: fn(),
    createBookChapter: fn(),
    updateBookChapter: fn(),
    deleteBookChapter: fn(),
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
const outsider = "nobody";
const campaignId = "camp1";
const bookId = "book1";
const secretNoteId = "secret-note";

const SECRET_TEXT = "The duke's own hand signed the writ.";
const GM_ONLY_LINE = "and he paid for it in Tallow gold";

let bookNote: any;
let secretNote: any;
let chapters: any[];

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.adminUserIds.clear();

  bookNote = {
    id: bookId, userId: gm, campaignId, folderId: null,
    title: "What the Party Knows", content: "", type: "book",
    visibility: "party", visiblePlayerIds: null, bookLiveSync: false,
  };
  // A note the players cannot open on their own: GM-only.
  secretNote = {
    id: secretNoteId, userId: gm, campaignId, folderId: null,
    title: "The Writ", content: `${SECRET_TEXT}\n#${GM_ONLY_LINE}#`, type: "note",
    visibility: "gm", visiblePlayerIds: null,
  };
  chapters = [{
    id: "ch1", bookNoteId: bookId, sourceType: "note", sourceId: secretNoteId,
    sourceNoteId: secretNoteId, title: "The Writ",
    content: `${SECRET_TEXT}\n#${GM_ONLY_LINE}#`, sortOrder: 0,
  }];

  h.storage.getUser.mockImplementation(async (id: string) => ({
    id, username: `user-${id}`, email: `${id}@example.com`, isAdmin: false, bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);
  h.storage.getNote.mockImplementation(async (id: string) =>
    id === bookId ? bookNote : id === secretNoteId ? secretNote : undefined);
  h.storage.updateNote.mockImplementation(async (id: string, patch: any) => {
    if (id === secretNoteId) secretNote = { ...secretNote, ...patch };
    return id === secretNoteId ? secretNote : bookNote;
  });
  h.storage.canAccessNote.mockImplementation(async (uid: string, id: string) =>
    uid === gm && id === bookId ? { canAccess: true, permission: "owner" } : { canAccess: false, permission: null });
  h.storage.getNoteReferences.mockResolvedValue([]);
  h.storage.getNoteShares.mockResolvedValue([]);
  h.storage.getBacklinks.mockResolvedValue([]);
  h.storage.getCampaign.mockResolvedValue({ id: campaignId, gmUserId: gm });
  h.storage.getCampaignMembers.mockResolvedValue([
    { userId: gm, role: "gm", username: "gm1" },
    { userId: player, role: "player", username: "player1" },
  ]);
  h.storage.getBookChapters.mockImplementation(async () => chapters);
  h.storage.getBookChapter.mockImplementation(async (id: string) => chapters.find((c) => c.id === id));
  h.storage.updateBookChapter.mockImplementation(async (id: string, patch: any) => {
    const i = chapters.findIndex((c) => c.id === id);
    if (i >= 0) chapters[i] = { ...chapters[i], ...patch };
    return chapters[i];
  });
  h.storage.createBookChapter.mockImplementation(async (c: any) => ({ id: "ch-new", ...c }));
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

describe("reading a book", () => {
  it("gives a player the full text of a chapter whose source note is GM-only", async () => {
    const res = await api(`/api/notes/${bookId}/book`, { user: player });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toHaveLength(1);
    expect(body.chapters[0].content).toContain(SECRET_TEXT);
  });

  it("never tells that player which note the chapter came from", async () => {
    const res = await api(`/api/notes/${bookId}/book`, { user: player });
    const body = await res.json();
    expect(body.canEdit).toBe(false);
    expect(body.chapters[0].sourceId).toBeUndefined();
    expect(body.chapters[0].sourceNoteId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(secretNoteId);
  });

  it("still redacts GM secrets inside a chapter", async () => {
    const res = await api(`/api/notes/${bookId}/book`, { user: player });
    const body = await res.json();
    expect(body.chapters[0].content).not.toContain(GM_ONLY_LINE);
    expect(body.chapters[0].content).toMatch(/█+/);
  });

  it("tells the GM where each chapter came from", async () => {
    const res = await api(`/api/notes/${bookId}/book`, { user: gm });
    const body = await res.json();
    expect(body.canEdit).toBe(true);
    expect(body.chapters[0].sourceNoteId).toBe(secretNoteId);
    expect(body.chapters[0].content).toContain(GM_ONLY_LINE);
  });

  it("refuses someone who isn't in the campaign", async () => {
    const res = await api(`/api/notes/${bookId}/book`, { user: outsider });
    expect(res.status).toBe(403);
  });
});

describe("a book that follows its sources", () => {
  it("reads the live source note rather than the chapter's copy", async () => {
    bookNote.bookLiveSync = true;
    secretNote.content = "Rewritten entirely.";
    const res = await api(`/api/notes/${bookId}/book`, { user: gm });
    const body = await res.json();
    expect(body.liveSync).toBe(true);
    expect(body.chapters[0].content).toBe("Rewritten entirely.");
  });

  it("writes an edited chapter back to the source note", async () => {
    bookNote.bookLiveSync = true;
    const res = await api(`/api/notes/${bookId}/book/chapters/ch1`, {
      method: "PATCH", user: gm, body: { content: "A new draft." },
    });
    expect(res.status).toBe(200);
    expect(secretNote.content).toBe("A new draft.");
    // The chapter's own copy is left alone - in sync mode it isn't the store.
    expect(chapters[0].content).toContain(SECRET_TEXT);
  });

  it("keeps an edit to itself when it isn't following sources", async () => {
    const res = await api(`/api/notes/${bookId}/book/chapters/ch1`, {
      method: "PATCH", user: gm, body: { content: "Book-only rewrite." },
    });
    expect(res.status).toBe(200);
    expect(chapters[0].content).toBe("Book-only rewrite.");
    expect(secretNote.content).toContain(SECRET_TEXT);
  });
});

describe("editing a book", () => {
  it("won't let a player add chapters to someone else's book", async () => {
    const res = await api(`/api/notes/${bookId}/book/chapters`, {
      method: "POST", user: player, body: { sourceType: "note", sourceId: secretNoteId },
    });
    expect(res.status).toBe(403);
    expect(h.storage.createBookChapter).not.toHaveBeenCalled();
  });

  it("won't let a book be a chapter of itself", async () => {
    const res = await api(`/api/notes/${bookId}/book/chapters`, {
      method: "POST", user: gm, body: { sourceType: "note", sourceId: bookId },
    });
    expect(res.status).toBe(400);
    expect(h.storage.createBookChapter).not.toHaveBeenCalled();
  });

  it("takes the chapter's title and text from the note when the GM adds one", async () => {
    const res = await api(`/api/notes/${bookId}/book/chapters`, {
      method: "POST", user: gm, body: { sourceType: "note", sourceId: secretNoteId },
    });
    expect(res.status).toBe(201);
    expect(h.storage.createBookChapter).toHaveBeenCalledWith(expect.objectContaining({
      bookNoteId: bookId, sourceType: "note", sourceId: secretNoteId,
      sourceNoteId: secretNoteId, title: "The Writ",
    }));
  });
});
