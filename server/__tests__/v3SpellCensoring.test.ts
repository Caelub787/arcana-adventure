import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Mocks. The route handlers under test reach the database only through the
// `storage` facade, so we replace it wholesale with controllable spies. We also
// stub `./db` (only used by a one-off startup migration), `./sync`, `./email`,
// `./googleDrive`, and `./lib/library-acl` so registerRoutes can boot without a
// real database, Google credentials, or the sync worker.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  // Minimal chainable query stub for the startup migration's direct db usage.
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
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    updateCampaign: fn(),
    getV3Spell: fn(),
    updateV3Spell: fn(),
    getCanonicalV3SpellByHash: fn(),
    deleteExpiredSpectatorTokens: fn(),
    unbanUser: fn(),
    // V3 spell-craft surface
    getCharacter: fn(),
    updateCharacter: fn(),
    getItem: fn(),
    getCampaignAuthoredV3SpellByHash: fn(),
    createV3Spell: fn(),
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
  // Default: any authenticated user exists and is not banned.
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

// Connect a real WebSocket client as a campaign GM and resolve once the client
// has joined the campaign room, so it will receive broadcasts.
function connectAndJoin(user: string, campaignId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`, {
      headers: { "x-test-user": user },
    });
    const timeout = setTimeout(() => reject(new Error("WS join timed out")), 8000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_campaign", campaignId }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "joined_campaign") {
        clearTimeout(timeout);
        resolve(ws);
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

describe("POST /api/v3/spells/:id/author — broadcast censoring", () => {
  it("broadcasts a CENSORED spell name in a non-18+ campaign", async () => {
    const gm = "gm1";
    const campaignId = "camp1";
    const spellId = "spell1";

    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: gm,
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getCampaignMembership.mockResolvedValue(null); // gm is owner
    h.storage.getV3Spell.mockResolvedValue({
      id: spellId,
      campaignId,
      name: "",
      isCanonical: false,
      status: "awaiting_gm",
      compositionHash: "abc",
    });
    h.storage.updateV3Spell.mockImplementation(async (id: string, patch: any) => ({
      id,
      campaignId,
      compositionHash: "abc",
      isCanonical: false,
      ...patch,
    }));

    const ws = await connectAndJoin(gm, campaignId);
    try {
      const broadcastPromise = waitForMessage(ws, "v3_spell_authored");
      const res = await api(`/api/v3/spells/${spellId}/author`, {
        method: "POST",
        user: gm,
        body: { name: "Damn Bolt", description: "ouch" },
      });
      expect(res.status).toBe(200);
      // The HTTP response itself returns the UNcensored, authored row.
      const body = await res.json();
      expect(body.name).toBe("Damn Bolt");
      expect(body.flagged).toBe(true);

      // The real-time broadcast to the campaign MUST be censored.
      const broadcast = await broadcastPromise;
      expect(broadcast.spell.name).toBe("*darn* Bolt");
    } finally {
      ws.close();
    }
  });

  it("broadcasts the RAW spell name in an 18+ campaign", async () => {
    const gm = "gm2";
    const campaignId = "camp2";
    const spellId = "spell2";

    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: gm,
      system: "aa-v3",
      is18Plus: true,
    });
    h.storage.getCampaignMembership.mockResolvedValue(null);
    h.storage.getV3Spell.mockResolvedValue({
      id: spellId,
      campaignId,
      name: "",
      isCanonical: false,
      status: "awaiting_gm",
      compositionHash: "def",
    });
    h.storage.updateV3Spell.mockImplementation(async (id: string, patch: any) => ({
      id,
      campaignId,
      compositionHash: "def",
      isCanonical: false,
      ...patch,
    }));

    const ws = await connectAndJoin(gm, campaignId);
    try {
      const broadcastPromise = waitForMessage(ws, "v3_spell_authored");
      const res = await api(`/api/v3/spells/${spellId}/author`, {
        method: "POST",
        user: gm,
        body: { name: "Damn Bolt", description: "ouch" },
      });
      expect(res.status).toBe(200);
      const broadcast = await broadcastPromise;
      expect(broadcast.spell.name).toBe("Damn Bolt");
    } finally {
      ws.close();
    }
  });

  it("refuses to let a non-GM author a spell", async () => {
    const gm = "gm3";
    const intruder = "player3";
    const campaignId = "camp3";
    const spellId = "spell3";

    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: gm,
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getCampaignMembership.mockResolvedValue({ role: "player" });
    h.storage.getV3Spell.mockResolvedValue({
      id: spellId,
      campaignId,
      name: "",
      isCanonical: false,
      status: "awaiting_gm",
      compositionHash: "ghi",
    });

    const res = await api(`/api/v3/spells/${spellId}/author`, {
      method: "POST",
      user: intruder,
      body: { name: "Anything" },
    });
    expect(res.status).toBe(403);
    expect(h.storage.updateV3Spell).not.toHaveBeenCalled();
  });
});

describe("POST /api/v3/spells/craft — resource accounting", () => {
  // A 2-element composition: mana cost = 2 (2 elements, Self reach, Instant
  // duration), craft DC = 6.
  const composition = {
    core: "fire",
    secondaries: [{ element: "water", role: "catalyst" }],
    intent: "destroy",
    delivery: "projectile",
    reach: "self",
    duration: "instant",
  };
  const MANA_COST = 2;

  // Force the route's `Math.floor(Math.random() * 20) + 1` d20 roll.
  // 0 -> d20 = 1 (guaranteed fail vs DC 6); 0.999 -> d20 = 20 (guaranteed pass).
  let randomSpy: ReturnType<typeof vi.spyOn> | undefined;
  function stubD20(value: number) {
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(value);
  }

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  // Wire up an owner-controlled character in an aa-v3 campaign with the given
  // mana/token balances. Returns the captured updateCharacter patches.
  function setupCharacter(opts: { mana: number; tokens: number; anemos?: number }) {
    const user = "owner1";
    const campaignId = "campCraft";
    const characterId = "char1";
    h.storage.getCharacter.mockResolvedValue({
      id: characterId,
      userId: user,
      campaignId,
      isTemplate: false,
      mana: opts.mana,
      spellCreationTokens: opts.tokens,
      anemos: opts.anemos ?? 0,
      name: "Mage",
    });
    h.storage.getCampaign.mockResolvedValue({
      id: campaignId,
      gmUserId: "someGm",
      system: "aa-v3",
      is18Plus: false,
    });
    h.storage.getCampaignMembership.mockResolvedValue(null);
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: user, role: "player" }]);
    h.storage.getCanonicalV3SpellByHash.mockResolvedValue(undefined);
    h.storage.getCampaignAuthoredV3SpellByHash.mockResolvedValue(undefined);
    const patches: any[] = [];
    h.storage.updateCharacter.mockImplementation(async (_id: string, patch: any) => {
      patches.push(patch);
      return { id: characterId, campaignId, ...patch };
    });
    h.storage.createV3Spell.mockImplementation(async (row: any) => ({
      id: "newspell",
      ...row,
    }));
    return { user, campaignId, characterId, patches };
  }

  it("success path consumes mana AND one token, and creates the spell", async () => {
    const { user, characterId, patches } = setupCharacter({ mana: 5, tokens: 3 });
    stubD20(0.999); // d20 = 20 -> success

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tokenSpent).toBe(true);
    expect(body.manaSpent).toBe(MANA_COST);

    // Exactly one update, debiting both mana and a token.
    expect(h.storage.updateCharacter).toHaveBeenCalledTimes(1);
    expect(patches[0]).toEqual({ mana: 5 - MANA_COST, spellCreationTokens: 3 - 1 });
    expect(h.storage.createV3Spell).toHaveBeenCalledTimes(1);
  });

  it("failed DC check consumes mana but NO token and creates no spell", async () => {
    const { user, characterId, patches } = setupCharacter({ mana: 5, tokens: 3 });
    stubD20(0); // d20 = 1 -> fail vs DC 6

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.tokenSpent).toBe(false);
    expect(body.manaSpent).toBe(MANA_COST);

    // Mana debited, token untouched, no spell row written.
    expect(h.storage.updateCharacter).toHaveBeenCalledTimes(1);
    expect(patches[0]).toEqual({ mana: 5 - MANA_COST });
    expect("spellCreationTokens" in patches[0]).toBe(false);
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("aborts with 400 when mana is insufficient and consumes nothing", async () => {
    const { user, characterId } = setupCharacter({ mana: 1, tokens: 3 });
    stubD20(0.999);

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("mana");

    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("aborts with 400 when no tokens remain and consumes nothing", async () => {
    const { user, characterId } = setupCharacter({ mana: 5, tokens: 0 });
    stubD20(0.999);

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("tokens");

    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("rejects crafting in a non-aa-v3 campaign", async () => {
    const { user, characterId } = setupCharacter({ mana: 5, tokens: 3 });
    h.storage.getCampaign.mockResolvedValue({
      id: "campCraft",
      gmUserId: "someGm",
      system: "aa-v2",
      is18Plus: false,
    });
    stubD20(0.999);

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition },
    });
    expect(res.status).toBe(400);
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  // Spellbook ownership/type guards: a player must only be able to drop a
  // crafted spell into a spellbook that exists, is actually a spellbook, and
  // belongs to the crafting character. All guards run BEFORE any resource
  // deduction or spell creation, so a rejected request consumes nothing.
  it("returns 404 and consumes nothing when the spellbook item is missing", async () => {
    const { user, characterId } = setupCharacter({ mana: 5, tokens: 3 });
    h.storage.getItem.mockResolvedValue(undefined);
    stubD20(0.999);

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition, spellbookItemId: "missing-book" },
    });
    expect(res.status).toBe(404);

    expect(h.storage.getItem).toHaveBeenCalledWith("missing-book");
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("returns 400 and consumes nothing when the target item is not a spellbook", async () => {
    const { user, characterId } = setupCharacter({ mana: 5, tokens: 3 });
    h.storage.getItem.mockResolvedValue({
      id: "sword1",
      itemType: "weapon",
      characterId,
    });
    stubD20(0.999);

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition, spellbookItemId: "sword1" },
    });
    expect(res.status).toBe(400);

    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("returns 403 and consumes nothing when the spellbook belongs to another character", async () => {
    const { user, characterId } = setupCharacter({ mana: 5, tokens: 3 });
    h.storage.getItem.mockResolvedValue({
      id: "book-other",
      itemType: "spellbook",
      characterId: "someoneElse",
    });
    stubD20(0.999);

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition, spellbookItemId: "book-other" },
    });
    expect(res.status).toBe(403);

    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
    expect(h.storage.createV3Spell).not.toHaveBeenCalled();
  });

  it("succeeds and stamps the spellbookItemId when the character owns the spellbook", async () => {
    const { user, characterId } = setupCharacter({ mana: 5, tokens: 3 });
    h.storage.getItem.mockResolvedValue({
      id: "my-book",
      itemType: "spellbook",
      characterId,
    });
    stubD20(0.999); // d20 = 20 -> success

    const res = await api("/api/v3/spells/craft", {
      method: "POST",
      user,
      body: { characterId, composition, spellbookItemId: "my-book" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // The spell row is created and carries the owned spellbook id.
    expect(h.storage.createV3Spell).toHaveBeenCalledTimes(1);
    expect(h.storage.createV3Spell.mock.calls[0][0].spellbookItemId).toBe("my-book");
    // Resources are consumed exactly once on success.
    expect(h.storage.updateCharacter).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/v3/spells/canonical/:hash — admin only", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await api("/api/v3/spells/canonical/somehash");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin with 403", async () => {
    const res = await api("/api/v3/spells/canonical/somehash", { user: "player9" });
    expect(res.status).toBe(403);
    expect(h.storage.getCanonicalV3SpellByHash).not.toHaveBeenCalled();
  });

  it("allows an admin and returns the canonical spell", async () => {
    h.adminUserIds.add("admin1");
    h.storage.getCanonicalV3SpellByHash.mockResolvedValue({
      id: "canon1",
      name: "Fireball",
      isCanonical: true,
    });
    const res = await api("/api/v3/spells/canonical/somehash", { user: "admin1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Fireball");
    expect(h.storage.getCanonicalV3SpellByHash).toHaveBeenCalledWith("somehash");
  });
});

describe("PATCH /api/campaigns/:id — is18Plus gating", () => {
  it("strips is18Plus on a non-V3 campaign", async () => {
    const gm = "gm5";
    const campaignId = "camp5";
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: gm, role: "gm" }]);
    h.storage.getCampaign.mockResolvedValue({ id: campaignId, system: "aa-v2" });
    let captured: any;
    h.storage.updateCampaign.mockImplementation(async (_id: string, patch: any) => {
      captured = patch;
      return { id: campaignId, system: "aa-v2", ...patch };
    });

    const res = await api(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      user: gm,
      body: { is18Plus: true },
    });
    expect(res.status).toBe(200);
    expect(captured).toBeDefined();
    expect("is18Plus" in captured).toBe(false);
  });

  it("keeps is18Plus (coerced to boolean) on a V3 campaign", async () => {
    const gm = "gm6";
    const campaignId = "camp6";
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: gm, role: "gm" }]);
    h.storage.getCampaign.mockResolvedValue({ id: campaignId, system: "aa-v3" });
    let captured: any;
    h.storage.updateCampaign.mockImplementation(async (_id: string, patch: any) => {
      captured = patch;
      return { id: campaignId, system: "aa-v3", ...patch };
    });

    const res = await api(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      user: gm,
      body: { is18Plus: true },
    });
    expect(res.status).toBe(200);
    expect(captured.is18Plus).toBe(true);
  });

  it("rejects a non-GM trying to change campaign settings", async () => {
    const player = "player7";
    const campaignId = "camp7";
    h.storage.getCampaignMembers.mockResolvedValue([{ userId: player, role: "player" }]);

    const res = await api(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      user: player,
      body: { is18Plus: true },
    });
    expect(res.status).toBe(403);
    expect(h.storage.updateCampaign).not.toHaveBeenCalled();
  });
});
