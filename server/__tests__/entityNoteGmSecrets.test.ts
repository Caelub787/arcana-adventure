import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// A player with EDIT access on a character can edit that character's linked
// note. GM secrets (`#...#`) inside it are redacted on the way out and must
// survive that player's writes untouched - they can't be edited, deleted, or
// reordered by someone who was never allowed to read them.
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
    getKnowledgeRevisionsForEntity: fn(),
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
let baseUrl: string;

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

const gm = "gm1";
const editor = "player-editor";   // has 'edit' on the character
const viewer = "player-viewer";   // has 'view' only
const campaignId = "camp1";
const characterId = "char1";
const noteId = "note1";

const SECRET = "the vault code is 4821";
const ORIGINAL = `Mara's background.\n\n#${SECRET}#\n\nShe grew up in the docks.`;

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
    content: ORIGINAL,
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
  h.storage.getNoteReferences.mockResolvedValue([
    { noteId, entityType: "character-sheet", entityId: characterId },
  ]);
  h.storage.getNoteShares.mockResolvedValue([]);
  h.storage.canAccessNote.mockResolvedValue({ canAccess: false, permission: null });
  h.storage.getKnowledgeRevisionsForEntity.mockResolvedValue([]);
  h.storage.getCharacter.mockResolvedValue({
    id: characterId, campaignId, userId: "someone-else", isTemplate: false, name: "Mara",
  });
  h.storage.getCampaign.mockResolvedValue({ id: campaignId, gmUserId: gm });
  h.storage.getCampaignMembers.mockResolvedValue([
    { userId: gm, role: "gm" },
    { userId: editor, role: "player", trustedPlayer: false },
    { userId: viewer, role: "player", trustedPlayer: false },
  ]);
  h.storage.getCampaignMembership.mockImplementation(async (uid: string) =>
    uid === gm ? { userId: uid, role: "gm" } : { userId: uid, role: "player" },
  );
  h.storage.getCharacterPermission.mockImplementation(async (_cid: string, uid: string) =>
    uid === editor ? { accessLevel: "edit" } : uid === viewer ? { accessLevel: "view" } : null,
  );
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

describe("entity-linked note: read", () => {
  it("gives the GM the real secret text", async () => {
    const res = await api(`/api/notes/${noteId}`, { user: gm });
    expect(res.status).toBe(200);
    expect((await res.json()).content).toContain(SECRET);
  });

  it("redacts the secret for a player with edit access on the character", async () => {
    const res = await api(`/api/notes/${noteId}`, { user: editor });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).not.toContain(SECRET);
    expect(body.content).not.toContain("4821");
    expect(body.content).toMatch(/█+/);
  });
});

describe("entity-linked note: who may edit", () => {
  it("lets a player with EDIT access on the character save the note", async () => {
    const got = await (await api(`/api/notes/${noteId}`, { user: editor })).json();
    const res = await api(`/api/notes/${noteId}`, {
      method: "PUT", user: editor,
      body: { content: got.content + "\n\nShe owes money to the guild." },
    });
    expect(res.status).toBe(200);
  });

  it("refuses a player with only VIEW access on the character", async () => {
    const res = await api(`/api/notes/${noteId}`, {
      method: "PUT", user: viewer, body: { content: "hijacked" },
    });
    expect(res.status).toBe(403);
  });
});

describe("GM secrets survive a player's edit", () => {
  it("keeps the secret intact when the player appends around it", async () => {
    const got = await (await api(`/api/notes/${noteId}`, { user: editor })).json();
    const res = await api(`/api/notes/${noteId}`, {
      method: "PUT", user: editor,
      body: { content: got.content + "\n\nShe owes money to the guild." },
    });
    expect(res.status).toBe(200);

    // What actually got persisted must still hold the GM's real text...
    expect(noteRow.content).toContain(`#${SECRET}#`);
    // ...and must never have the redaction blocks baked into storage.
    expect(noteRow.content).not.toMatch(/█/);
    // ...while keeping the player's own addition.
    expect(noteRow.content).toContain("She owes money to the guild.");
  });

  it("restores the secret even if the player deletes the redaction block", async () => {
    const res = await api(`/api/notes/${noteId}`, {
      method: "PUT", user: editor,
      body: { content: "Mara's background.\n\nShe grew up in the docks." },
    });
    expect(res.status).toBe(200);
    expect(noteRow.content).toContain(`#${SECRET}#`);
  });

  // A player can't author a GM secret. Their words are kept - it's the
  // secret markup that gets defused - so nobody silently loses what they
  // wrote, they just can't hide it from their own party.
  it("does not let a player forge a new secret", async () => {
    const res = await api(`/api/notes/${noteId}`, {
      method: "PUT", user: editor,
      body: { content: "Mara. #I am secretly the king# done." },
    });
    expect(res.status).toBe(200);
    expect(noteRow.content).toContain("I am secretly the king");
    expect(noteRow.content).not.toContain("#I am secretly the king#");
    // and it stays readable to the rest of the party
    const asViewer = await (await api(`/api/notes/${noteId}`, { user: viewer })).json();
    expect(asViewer.content).toContain("I am secretly the king");
  });

  it("never echoes the real secret back in the PUT response", async () => {
    const got = await (await api(`/api/notes/${noteId}`, { user: editor })).json();
    const res = await api(`/api/notes/${noteId}`, {
      method: "PUT", user: editor, body: { content: got.content + " more" },
    });
    const body = await res.json();
    expect(body.content).not.toContain(SECRET);
    expect(body.content).toMatch(/█+/);
  });

  // "Deleting" an entity-linked note clears its content rather than removing
  // the row, so it is a content write and has to protect secrets like one.
  it("keeps the GM's secrets when a player clears the note", async () => {
    const res = await api(`/api/notes/${noteId}`, { method: "DELETE", user: editor });
    expect(res.status).toBe(200);
    expect(noteRow.content).toContain(`#${SECRET}#`);
    expect(noteRow.content).not.toContain("She grew up in the docks.");
    // and the player still doesn't get to read it back
    expect((await res.json()).content).not.toContain(SECRET);
  });

  it("still lets the GM clear the note completely", async () => {
    const res = await api(`/api/notes/${noteId}`, { method: "DELETE", user: gm });
    expect(res.status).toBe(200);
    expect(noteRow.content).toBe("");
  });

  it("keeps multiple secrets in their own places", async () => {
    noteRow.content = "A #one# B #two# C";
    const got = await (await api(`/api/notes/${noteId}`, { user: editor })).json();
    await api(`/api/notes/${noteId}`, {
      method: "PUT", user: editor, body: { content: got.content.replace(" C", " C!") },
    });
    expect(noteRow.content).toBe("A #one# B #two# C!");
  });

  it("still lets the GM edit their own secret", async () => {
    const res = await api(`/api/notes/${noteId}`, {
      method: "PUT", user: gm,
      body: { content: "Mara.\n\n#the vault code is 9999#\n\nDone." },
    });
    expect(res.status).toBe(200);
    expect(noteRow.content).toContain("#the vault code is 9999#");
    expect(noteRow.content).not.toContain("4821");
  });
});
