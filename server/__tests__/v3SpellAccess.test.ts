import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Mocks. The route handlers under test reach the database only through the
// `storage` facade, so we replace it wholesale with controllable spies. We also
// stub `./db`, `./sync`, `./email`, `./googleDrive`, and `./lib/library-acl` so
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
    getItem: fn(),
    getCharacter: fn(),
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    getCharacterPermission: fn(),
    getV3Spell: fn(),
    updateV3Spell: fn(),
    getCanonicalV3SpellByHash: fn(),
    getV3SpellsForSpellbook: fn(),
    getV3SpellsForCharacter: fn(),
    listV3Spells: fn(),
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
vi.mock("../sync", () => ({
  registerSync: async () => {},
  emitLibraryChange: () => {},
  getRecentJobsSummary: async () => [],
  retryFailedJobs: async () => 0,
}));
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

// ---------------------------------------------------------------------------
// Ownerless (library/template) spellbook reads must be restricted to the
// creator, the campaign GM, or an admin — never an unrelated user (IDOR guard).
// ---------------------------------------------------------------------------
describe("GET /api/v3/spellbooks/:itemId/spells — ownerless access control", () => {
  const itemId = "book1";
  const creator = "creator1";
  const gm = "gm1";
  const campaignId = "camp1";

  function mockOwnerlessBook() {
    // No characterId => library/template spellbook.
    h.storage.getItem.mockResolvedValue({
      id: itemId,
      itemType: "spellbook",
      characterId: null,
      createdByUserId: creator,
      campaignId,
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: gm,
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getCampaignMembership.mockResolvedValue(null);
    h.storage.getV3SpellsForSpellbook.mockResolvedValue([
      { id: "s1", name: "Magic Missile", flagged: false },
    ]);
  }

  it("returns 403 for an unrelated user", async () => {
    mockOwnerlessBook();
    const res = await api(`/api/v3/spellbooks/${itemId}/spells`, { user: "stranger" });
    expect(res.status).toBe(403);
    expect(h.storage.getV3SpellsForSpellbook).not.toHaveBeenCalled();
  });

  it("returns 200 for the creator", async () => {
    mockOwnerlessBook();
    const res = await api(`/api/v3/spellbooks/${itemId}/spells`, { user: creator });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Magic Missile");
  });

  it("returns 200 for the campaign GM", async () => {
    mockOwnerlessBook();
    const res = await api(`/api/v3/spellbooks/${itemId}/spells`, { user: gm });
    expect(res.status).toBe(200);
    expect(h.storage.getV3SpellsForSpellbook).toHaveBeenCalledWith(itemId);
  });

  it("returns 200 for an admin", async () => {
    mockOwnerlessBook();
    h.adminUserIds.add("admin1");
    const res = await api(`/api/v3/spellbooks/${itemId}/spells`, { user: "admin1" });
    expect(res.status).toBe(200);
    expect(h.storage.getV3SpellsForSpellbook).toHaveBeenCalledWith(itemId);
  });

  it("censors flagged spell names for an ownerless book (no campaign 18+ context)", async () => {
    h.storage.getItem.mockResolvedValue({
      id: itemId,
      itemType: "spellbook",
      characterId: null,
      createdByUserId: creator,
      campaignId,
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: gm,
      system: "aa-v3",
      is18Plus: true, // even an 18+ campaign: ownerless reads don't pass that context
    });
    h.storage.getCampaignMembership.mockResolvedValue(null);
    h.storage.getV3SpellsForSpellbook.mockResolvedValue([
      { id: "s1", name: "Damn Bolt", flagged: true },
    ]);
    const res = await api(`/api/v3/spellbooks/${itemId}/spells`, { user: creator });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].name).toBe("*darn* Bolt");
  });
});

// ---------------------------------------------------------------------------
// Character-owned spellbook list reads must still censor flagged names for
// non-18+ viewers, and surface raw names in an 18+ campaign.
// ---------------------------------------------------------------------------
describe("GET /api/v3/characters/:id/spells — list censoring", () => {
  const characterId = "char1";
  const owner = "owner1";
  const campaignId = "camp2";

  function mockCharacter(is18Plus: boolean) {
    h.storage.getCharacter.mockResolvedValue({
      id: characterId,
      userId: owner,
      campaignId,
      isTemplate: false,
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: "gmX",
      system: "aa-v3",
      is18Plus,
    });
    h.storage.getCampaignMembership.mockResolvedValue({ role: "player" });
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: owner, role: "player" }]);
  }

  it("censors flagged names for a non-18+ campaign", async () => {
    mockCharacter(false);
    h.storage.getV3SpellsForCharacter.mockResolvedValue([
      { id: "s1", name: "Damn Bolt", flagged: true },
      { id: "s2", name: "Ice Spike", flagged: false },
    ]);
    const res = await api(`/api/v3/characters/${characterId}/spells`, { user: owner });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].name).toBe("*darn* Bolt");
    expect(body[1].name).toBe("Ice Spike");
  });

  it("returns raw names in an 18+ campaign", async () => {
    mockCharacter(true);
    h.storage.getV3SpellsForCharacter.mockResolvedValue([
      { id: "s1", name: "Damn Bolt", flagged: true },
    ]);
    const res = await api(`/api/v3/characters/${characterId}/spells`, { user: owner });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].name).toBe("Damn Bolt");
  });

  it("returns 403 for a user with no access to the character", async () => {
    h.storage.getCharacter.mockResolvedValue({
      id: characterId,
      userId: owner,
      campaignId,
      isTemplate: false,
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: "gmX",
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getCampaignMembership.mockResolvedValue(null);
    h.storage.getCampaignMembers.mockResolvedValue([]); // intruder is not a member
    h.storage.getCharacterPermission.mockResolvedValue(undefined);
    const res = await api(`/api/v3/characters/${characterId}/spells`, { user: "intruder" });
    expect(res.status).toBe(403);
    expect(h.storage.getV3SpellsForCharacter).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Admin approval marks a spell canonical and demotes the prior canonical for
// the same composition hash; reject clears canonical. Both reject non-admins.
// ---------------------------------------------------------------------------
describe("POST /api/admin/v3-spells/:id/approve — canonical governance", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await api("/api/admin/v3-spells/x/approve", { method: "POST" });
    expect(res.status).toBe(401);
    expect(h.storage.updateV3Spell).not.toHaveBeenCalled();
  });

  it("rejects a non-admin with 403", async () => {
    const res = await api("/api/admin/v3-spells/x/approve", { method: "POST", user: "player1" });
    expect(res.status).toBe(403);
    expect(h.storage.updateV3Spell).not.toHaveBeenCalled();
  });

  it("marks the spell canonical and demotes the prior canonical for the same hash", async () => {
    h.adminUserIds.add("admin1");
    const hash = "hashA";
    h.storage.getV3Spell.mockResolvedValue({
      id: "new1",
      name: "Fireball",
      compositionHash: hash,
      isCanonical: false,
      status: "ready",
    });
    h.storage.getCanonicalV3SpellByHash.mockResolvedValue({
      id: "old1",
      name: "Fireball (old)",
      compositionHash: hash,
      isCanonical: true,
    });
    const calls: Array<{ id: string; patch: any }> = [];
    h.storage.updateV3Spell.mockImplementation(async (id: string, patch: any) => {
      calls.push({ id, patch });
      return { id, ...patch };
    });

    const res = await api("/api/admin/v3-spells/new1/approve", { method: "POST", user: "admin1" });
    expect(res.status).toBe(200);

    // Prior canonical demoted...
    expect(calls).toContainEqual({ id: "old1", patch: { isCanonical: false } });
    // ...and the approved spell promoted to canonical/approved.
    expect(calls).toContainEqual({
      id: "new1",
      patch: { isCanonical: true, status: "approved" },
    });
    const body = await res.json();
    expect(body.isCanonical).toBe(true);
    expect(body.status).toBe("approved");
  });

  it("does not demote when no prior canonical exists for the hash", async () => {
    h.adminUserIds.add("admin1");
    h.storage.getV3Spell.mockResolvedValue({
      id: "new1",
      name: "Fireball",
      compositionHash: "hashB",
      isCanonical: false,
    });
    h.storage.getCanonicalV3SpellByHash.mockResolvedValue(undefined);
    const calls: Array<{ id: string; patch: any }> = [];
    h.storage.updateV3Spell.mockImplementation(async (id: string, patch: any) => {
      calls.push({ id, patch });
      return { id, ...patch };
    });

    const res = await api("/api/admin/v3-spells/new1/approve", { method: "POST", user: "admin1" });
    expect(res.status).toBe(200);
    // Only the approval write, no demotion.
    expect(calls).toEqual([{ id: "new1", patch: { isCanonical: true, status: "approved" } }]);
  });

  it("does not self-demote when the spell is already the canonical for its hash", async () => {
    h.adminUserIds.add("admin1");
    const hash = "hashC";
    h.storage.getV3Spell.mockResolvedValue({
      id: "same1",
      name: "Fireball",
      compositionHash: hash,
      isCanonical: true,
    });
    // getCanonicalV3SpellByHash returns the SAME spell.
    h.storage.getCanonicalV3SpellByHash.mockResolvedValue({
      id: "same1",
      compositionHash: hash,
      isCanonical: true,
    });
    const calls: Array<{ id: string; patch: any }> = [];
    h.storage.updateV3Spell.mockImplementation(async (id: string, patch: any) => {
      calls.push({ id, patch });
      return { id, ...patch };
    });

    const res = await api("/api/admin/v3-spells/same1/approve", { method: "POST", user: "admin1" });
    expect(res.status).toBe(200);
    // No demotion of itself — only the promotion write.
    expect(calls).toEqual([{ id: "same1", patch: { isCanonical: true, status: "approved" } }]);
  });

  it("refuses to approve an unauthored (nameless) spell", async () => {
    h.adminUserIds.add("admin1");
    h.storage.getV3Spell.mockResolvedValue({
      id: "blank1",
      name: "   ",
      compositionHash: "hashD",
      isCanonical: false,
    });
    const res = await api("/api/admin/v3-spells/blank1/approve", { method: "POST", user: "admin1" });
    expect(res.status).toBe(400);
    expect(h.storage.updateV3Spell).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/v3-spells/:id/reject — clears canonical", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await api("/api/admin/v3-spells/x/reject", { method: "POST" });
    expect(res.status).toBe(401);
    expect(h.storage.updateV3Spell).not.toHaveBeenCalled();
  });

  it("rejects a non-admin with 403", async () => {
    const res = await api("/api/admin/v3-spells/x/reject", { method: "POST", user: "player1" });
    expect(res.status).toBe(403);
    expect(h.storage.updateV3Spell).not.toHaveBeenCalled();
  });

  it("clears canonical and sets status=rejected", async () => {
    h.adminUserIds.add("admin1");
    h.storage.getV3Spell.mockResolvedValue({
      id: "rej1",
      name: "Fireball",
      compositionHash: "hashE",
      isCanonical: true,
    });
    let captured: any;
    h.storage.updateV3Spell.mockImplementation(async (id: string, patch: any) => {
      captured = { id, patch };
      return { id, ...patch };
    });

    const res = await api("/api/admin/v3-spells/rej1/reject", { method: "POST", user: "admin1" });
    expect(res.status).toBe(200);
    expect(captured).toEqual({
      id: "rej1",
      patch: { isCanonical: false, status: "rejected" },
    });
    const body = await res.json();
    expect(body.isCanonical).toBe(false);
    expect(body.status).toBe("rejected");
  });

  it("returns 404 when the spell does not exist", async () => {
    h.adminUserIds.add("admin1");
    h.storage.getV3Spell.mockResolvedValue(undefined);
    const res = await api("/api/admin/v3-spells/missing/reject", { method: "POST", user: "admin1" });
    expect(res.status).toBe(404);
    expect(h.storage.updateV3Spell).not.toHaveBeenCalled();
  });
});
