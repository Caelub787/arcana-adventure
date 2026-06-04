import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";
import type { V3SpellComposition } from "@shared/v3spells";

// ---------------------------------------------------------------------------
// Harness mirrors server/__tests__/v3SpellAccess.test.ts: the route handlers
// touch the database only through `storage`, so we replace it wholesale with
// controllable spies and stub `./db`, `./sync`, `./email`, `./googleDrive`, and
// `./lib/library-acl` so registerRoutes can boot without a real DB.
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
    createItem: fn(),
    getCharacter: fn(),
    updateCharacter: fn(),
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    getCharacterPermission: fn(),
    getCampaignCharacters: fn(),
    getCampaignTemplateItems: fn(),
    getV3Spell: fn(),
    updateV3Spell: fn(),
    createV3Spell: fn(),
    getCanonicalV3SpellByHash: fn(),
    getCampaignAuthoredV3SpellByHash: fn(),
    getV3SpellsForSpellbook: fn(),
    getV3SpellsForCharacter: fn(),
    deleteV3Spell: fn(),
    listV3Spells: fn(),
    getRollEntries: fn(),
    createRollEntry: fn(),
    createRollEntriesBulk: fn(),
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
  // Sensible empty defaults for the auxiliary lookups that grant/auto-save touch.
  h.storage.getCampaignCharacters.mockResolvedValue([]);
  h.storage.getCampaignTemplateItems.mockResolvedValue([]);
  h.storage.getRollEntries.mockResolvedValue([]);
  h.storage.createRollEntriesBulk.mockResolvedValue([]);
  h.storage.getCampaignAuthoredV3SpellByHash.mockResolvedValue(undefined);
  h.storage.getCanonicalV3SpellByHash.mockResolvedValue(undefined);
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

// A minimal, valid single-element composition: mana cost 1, craft DC 0 (which
// is an automatic success so craft outcomes don't depend on the d20 roll).
const SIMPLE_COMP: V3SpellComposition = {
  core: "fire",
  secondaries: [],
  intent: "destroy",
  delivery: "projectile",
  reach: "self",
  duration: "instant",
};

// ---------------------------------------------------------------------------
// Crafting into a FULL spellbook must be rejected BEFORE any resource is spent:
// no spell row is created and neither mana nor a token is consumed.
// ---------------------------------------------------------------------------
describe("POST /api/v3/spells/craft — spellbook capacity", () => {
  const characterId = "char1";
  const owner = "owner1";
  const campaignId = "camp1";
  const bookId = "book1";

  function mockCraftContext(opts: { maxSpells: number; existingCount: number; mana?: number; tokens?: number }) {
    h.storage.getCharacter.mockResolvedValue({
      id: characterId,
      userId: owner,
      campaignId,
      isTemplate: false,
      mana: opts.mana ?? 50,
      spellCreationTokens: opts.tokens ?? 5,
      anemos: 3,
      name: "Sorcerer",
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: "gmX",
      system: "aa-v3",
      is18Plus: false,
    });
    // Owner is a member (checkCharacterAccess membership lookup).
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: owner, role: "player" }]);
    h.storage.getItem.mockResolvedValue({
      id: bookId,
      itemType: "spellbook",
      characterId,
      maxSpells: opts.maxSpells,
    });
    h.storage.getV3SpellsForSpellbook.mockResolvedValue(
      Array.from({ length: opts.existingCount }, (_, i) => ({ id: `s${i}`, name: `S${i}` })),
    );
    h.storage.createV3Spell.mockImplementation(async (row: any) => ({ id: "newSpell", ...row }));
    h.storage.updateCharacter.mockImplementation(async (id: string, patch: any) => ({ id, ...patch }));
  }

  it("rejects crafting into a full spellbook without spending mana or a token", async () => {
    mockCraftContext({ maxSpells: 2, existingCount: 2 });
    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user: owner,
      body: { characterId, composition: SIMPLE_COMP, spellbookItemId: bookId },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("capacity");
    expect(body.cap).toBe(2);
    // Crucially: no spell created and no resources consumed.
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
  });

  it("allows crafting when the book has room (consumes mana + a token on success)", async () => {
    mockCraftContext({ maxSpells: 5, existingCount: 2, mana: 10, tokens: 3 });
    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user: owner,
      body: { characterId, composition: SIMPLE_COMP, spellbookItemId: bookId },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(h.storage.createV3Spell).toHaveBeenCalledTimes(1);
    // DC 0 auto-success: mana down by 1 (cost), one token consumed.
    expect(h.storage.updateCharacter).toHaveBeenCalledWith(characterId, {
      mana: 9,
      spellCreationTokens: 2,
    });
  });

  it("treats maxSpells = 0 as unlimited (never checks capacity)", async () => {
    mockCraftContext({ maxSpells: 0, existingCount: 99, mana: 10, tokens: 3 });
    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user: owner,
      body: { characterId, composition: SIMPLE_COMP, spellbookItemId: bookId },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // cap === 0 short-circuits the capacity block, so the count is never read.
    expect(h.storage.getV3SpellsForSpellbook).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Pre-loading a spell directly into a (library/template) spellbook enforces the
// same cap and requires a name.
// ---------------------------------------------------------------------------
describe("POST /api/v3/spellbooks/:itemId/spells — pre-load capacity + name", () => {
  const creator = "creator1";
  const campaignId = "camp2";
  const bookId = "book2";

  function mockOwnerlessBook(opts: { maxSpells: number; existingCount: number }) {
    h.storage.getItem.mockResolvedValue({
      id: bookId,
      itemType: "spellbook",
      characterId: null, // library/template spellbook
      createdByUserId: creator,
      campaignId,
      maxSpells: opts.maxSpells,
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: "gmY",
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getV3SpellsForSpellbook.mockResolvedValue(
      Array.from({ length: opts.existingCount }, (_, i) => ({ id: `s${i}`, name: `S${i}` })),
    );
    h.storage.createV3Spell.mockImplementation(async (row: any) => ({ id: "loaded", ...row }));
  }

  it("rejects a pre-load into a full book without creating a spell", async () => {
    mockOwnerlessBook({ maxSpells: 1, existingCount: 1 });
    const res = await api(`/api/v3/spellbooks/${bookId}/spells`, {
      method: "POST",
      user: creator,
      body: { composition: SIMPLE_COMP, name: "Firebolt" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("capacity");
    expect(body.cap).toBe(1);
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("requires a non-empty name", async () => {
    mockOwnerlessBook({ maxSpells: 10, existingCount: 0 });
    const res = await api(`/api/v3/spellbooks/${bookId}/spells`, {
      method: "POST",
      user: creator,
      body: { composition: SIMPLE_COMP, name: "   " },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("creates the pre-loaded spell when there is room and a name", async () => {
    mockOwnerlessBook({ maxSpells: 10, existingCount: 2 });
    const res = await api(`/api/v3/spellbooks/${bookId}/spells`, {
      method: "POST",
      user: creator,
      body: { composition: SIMPLE_COMP, name: "Firebolt", description: "A dart of flame" },
    });
    expect(res.status).toBe(200);
    expect(h.storage.createV3Spell).toHaveBeenCalledTimes(1);
    const row = h.storage.createV3Spell.mock.calls[0][0];
    expect(row.spellbookItemId).toBe(bookId);
    expect(row.name).toBe("Firebolt");
    expect(row.status).toBe("ready");
    expect(row.createdByCharacterId).toBeNull();
  });

  it("treats maxSpells = 0 as unlimited for pre-loads", async () => {
    mockOwnerlessBook({ maxSpells: 0, existingCount: 99 });
    const res = await api(`/api/v3/spellbooks/${bookId}/spells`, {
      method: "POST",
      user: creator,
      body: { composition: SIMPLE_COMP, name: "Firebolt" },
    });
    expect(res.status).toBe(200);
    // cap === 0 short-circuits the capacity block.
    expect(h.storage.getV3SpellsForSpellbook).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Granting a spellbook from a library item clones its pre-loaded v3_spells onto
// the new character-owned item, attributed to the receiving character.
// ---------------------------------------------------------------------------
describe("POST /api/characters/:characterId/items — clones pre-loaded spells on grant", () => {
  const characterId = "charG";
  const owner = "ownerG";
  const campaignId = "campG";
  const sourceBookId = "libBook";
  const newBookId = "grantedBook";

  it("clones each source spell onto the new spellbook for the receiving character", async () => {
    h.storage.getCharacter.mockResolvedValue({
      id: characterId,
      userId: owner,
      campaignId,
      isTemplate: false,
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: "gmG",
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: owner, role: "player" }]);

    // getItem(sourceBookId) is hit twice: once for the link-template check
    // (isTemplate false -> no link) and once inside the clone block.
    h.storage.getItem.mockResolvedValue({
      id: sourceBookId,
      itemType: "spellbook",
      isTemplate: false,
      characterId: null,
      campaignId,
      maxSpells: 10,
    });
    // The freshly-created character item.
    h.storage.createItem.mockResolvedValue({
      id: newBookId,
      itemType: "spellbook",
      characterId,
      name: "Granted Spellbook",
      isDetonatable: false,
      maxSpells: 10,
    });
    // Source spells pre-loaded in the library book.
    h.storage.getV3SpellsForSpellbook.mockResolvedValue([
      {
        id: "src1",
        name: "Firebolt",
        composition: SIMPLE_COMP,
        compositionHash: "hashF",
        description: "d",
        image: null,
        manaCost: 1,
        craftDc: 0,
        authoredByUserId: "gmG",
        status: "ready",
        flagged: false,
      },
      {
        id: "src2",
        name: "Frostbite",
        composition: SIMPLE_COMP,
        compositionHash: "hashG",
        description: "d2",
        image: null,
        manaCost: 1,
        craftDc: 0,
        authoredByUserId: "gmG",
        status: "awaiting_gm",
        flagged: false,
      },
    ]);
    h.storage.createV3Spell.mockImplementation(async (row: any) => ({ id: "clone", ...row }));

    const res = await api(`/api/characters/${characterId}/items`, {
      method: "POST",
      user: owner,
      body: {
        name: "Granted Spellbook",
        itemType: "spellbook",
        sourceTemplateId: sourceBookId,
      },
    });
    expect(res.status).toBe(200);

    expect(h.storage.createV3Spell).toHaveBeenCalledTimes(2);
    const clones = h.storage.createV3Spell.mock.calls.map((c: any[]) => c[0]);
    // Every clone is owned by the new item, attributed to the receiving
    // character, and never canonical.
    for (const c of clones) {
      expect(c.spellbookItemId).toBe(newBookId);
      expect(c.createdByCharacterId).toBe(characterId);
      expect(c.isCanonical).toBe(false);
      expect(c.campaignId).toBe(campaignId);
    }
    expect(clones.map((c: any) => c.name).sort()).toEqual(["Firebolt", "Frostbite"]);
    // 'awaiting_gm' source spells become 'ready' on the granted copy; others keep status.
    const frost = clones.find((c: any) => c.name === "Frostbite");
    expect(frost.status).toBe("ready");
    const fire = clones.find((c: any) => c.name === "Firebolt");
    expect(fire.status).toBe("ready");
  });

  it("grants a non-spellbook item without attempting to clone spells", async () => {
    h.storage.getCharacter.mockResolvedValue({
      id: characterId,
      userId: owner,
      campaignId,
      isTemplate: false,
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: "gmG",
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: owner, role: "player" }]);
    h.storage.createItem.mockResolvedValue({
      id: "sword1",
      itemType: "weapon",
      characterId,
      name: "Sword",
      isDetonatable: false,
    });

    const res = await api(`/api/characters/${characterId}/items`, {
      method: "POST",
      user: owner,
      body: { name: "Sword", itemType: "weapon" },
    });
    expect(res.status).toBe(200);
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });
});
