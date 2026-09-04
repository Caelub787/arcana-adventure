import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Swampy's three new surfaces: Warrens (library or campaign-authored), the
// Working Ledger (campaign precedents, GM-written and party-readable), and the
// Deck of Houses (library cards, drawn server-side).
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
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    getSwampyWarrens: fn(),
    getSwampyWarren: fn(),
    createSwampyWarren: fn(),
    updateSwampyWarren: fn(),
    deleteSwampyWarren: fn(),
    getSwampyWorkings: fn(),
    getSwampyWorking: fn(),
    createSwampyWorking: fn(),
    updateSwampyWorking: fn(),
    deleteSwampyWorking: fn(),
    getSwampyHouseCards: fn(),
    getSwampyHouseCard: fn(),
    createSwampyHouseCard: fn(),
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
  enforceLibraryWrite: async (_req: any, res: any, ownerUserId: any) => {
    // Mirrors the real rule: admins write anything, others only their own rows.
    const uid = _req.session?.userId;
    if (h.adminUserIds.has(uid)) return true;
    if (ownerUserId && ownerUserId === uid) return true;
    res.status(403).json({ error: "You can only modify your own library entries" });
    return false;
  },
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
const player = "player1";
const admin = "admin1";
const swampyCampaign = "camp-swampy";
const caCampaign = "camp-ca";

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.adminUserIds.clear();
  h.adminUserIds.add(admin);

  h.storage.getUser.mockImplementation(async (id: string) => ({
    id, username: `user-${id}`, email: `${id}@example.com`,
    isAdmin: h.adminUserIds.has(id), bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);
  h.storage.getCampaign.mockImplementation(async (id: string) =>
    id === swampyCampaign
      ? { id, gmUserId: gm, system: "swampy" }
      : id === caCampaign
        ? { id, gmUserId: gm, system: "ca" }
        : undefined,
  );
  h.storage.getCampaignMembers.mockResolvedValue([
    { userId: gm, role: "gm" },
    { userId: player, role: "player" },
    { userId: admin, role: "player" },
  ]);
  h.storage.getCampaignMembership.mockImplementation(async (uid: string) =>
    uid === gm ? { userId: uid, role: "gm" } : { userId: uid, role: "player" },
  );
  h.storage.getSwampyWarrens.mockResolvedValue([]);
  h.storage.getSwampyWorkings.mockResolvedValue([]);
  h.storage.getSwampyHouseCards.mockResolvedValue([]);
  h.storage.createSwampyWarren.mockImplementation(async (d: any) => ({ id: "w1", ...d }));
  h.storage.createSwampyWorking.mockImplementation(async (d: any) => ({ id: "k1", ...d }));
  h.storage.createSwampyHouseCard.mockImplementation(async (d: any) => ({ id: "c1", ...d }));
  h.storage.updateSwampyWarren.mockImplementation(async (id: string, d: any) => ({ id, ...d }));
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

describe("Warrens", () => {
  it("lets an admin create a global Warren", async () => {
    const res = await api("/api/swampy/warrens", {
      method: "POST", user: admin, body: { name: "The Ashfen", condition: "wounded" },
    });
    expect(res.status).toBe(200);
    expect(h.storage.createSwampyWarren).toHaveBeenCalledWith(
      expect.objectContaining({ system: "swampy", name: "The Ashfen", condition: "wounded", ownerUserId: null }),
    );
  });

  it("lets a non-admin create one only in their own library", async () => {
    const denied = await api("/api/swampy/warrens", {
      method: "POST", user: player, body: { name: "Mine" },
    });
    expect(denied.status).toBe(403);

    const ok = await api("/api/swampy/warrens", {
      method: "POST", user: player, body: { name: "Mine", personal: true },
    });
    expect(ok.status).toBe(200);
    expect(h.storage.createSwampyWarren).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: player }),
    );
  });

  it("defaults an unknown condition to Flourishing rather than storing junk", async () => {
    await api("/api/swampy/warrens", {
      method: "POST", user: admin, body: { name: "X", condition: "haunted" },
    });
    expect(h.storage.createSwampyWarren).toHaveBeenCalledWith(
      expect.objectContaining({ condition: "flourishing" }),
    );
  });

  it("refuses an unknown condition on update instead of silently ignoring it", async () => {
    h.storage.getSwampyWarren.mockResolvedValue({ id: "w1", ownerUserId: admin, campaignId: null });
    const res = await api("/api/swampy/warrens/w1", {
      method: "PATCH", user: admin, body: { condition: "haunted" },
    });
    expect(res.status).toBe(400);
  });

  it("only lets the GM author a Warren inside a campaign", async () => {
    const denied = await api("/api/swampy/warrens", {
      method: "POST", user: player, body: { name: "Theirs", campaignId: swampyCampaign },
    });
    expect(denied.status).toBe(403);

    const ok = await api("/api/swampy/warrens", {
      method: "POST", user: gm, body: { name: "Theirs", campaignId: swampyCampaign },
    });
    expect(ok.status).toBe(200);
  });

  it("refuses to touch a campaign that isn't Swampy", async () => {
    const res = await api("/api/swampy/warrens", {
      method: "POST", user: gm, body: { name: "Nope", campaignId: caCampaign },
    });
    expect(res.status).toBe(400);
    expect(h.storage.createSwampyWarren).not.toHaveBeenCalled();
  });
});

describe("the Working Ledger", () => {
  it("is readable by the whole party - that is the point of it", async () => {
    h.storage.getSwampyWorkings.mockResolvedValue([{ id: "k1", name: "Lanternlight" }]);
    const res = await api(`/api/campaigns/${swampyCampaign}/swampy/workings`, { user: player });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it("is written only by the GM - a precedent is a ruling", async () => {
    const denied = await api(`/api/campaigns/${swampyCampaign}/swampy/workings`, {
      method: "POST", user: player, body: { name: "Mine now" },
    });
    expect(denied.status).toBe(403);
    expect(h.storage.createSwampyWorking).not.toHaveBeenCalled();
  });

  it("records every field the brief lists", async () => {
    h.storage.getSwampyWarren.mockResolvedValue({ id: "w1", name: "The Ashfen" });
    const res = await api(`/api/campaigns/${swampyCampaign}/swampy/workings`, {
      method: "POST", user: gm,
      body: {
        name: "Lanternlight", warrenId: "w1", method: "Open a shutter",
        effect: "A light that does not gutter", cost: "1 Strain",
        limits: "One room, one hour", conditionInteraction: "Wounded: half the room",
        risk: "It shows what is already watching",
      },
    });
    expect(res.status).toBe(200);
    expect(h.storage.createSwampyWorking).toHaveBeenCalledWith(expect.objectContaining({
      name: "Lanternlight", warrenId: "w1", method: "Open a shutter",
      effect: "A light that does not gutter", cost: "1 Strain",
      limits: "One room, one hour", conditionInteraction: "Wounded: half the room",
      risk: "It shows what is already watching",
    }));
  });

  // A precedent should still read correctly after its Warren is gone.
  it("snapshots the Warren's name alongside its id", async () => {
    h.storage.getSwampyWarren.mockResolvedValue({ id: "w1", name: "The Ashfen" });
    await api(`/api/campaigns/${swampyCampaign}/swampy/workings`, {
      method: "POST", user: gm, body: { name: "Lanternlight", warrenId: "w1" },
    });
    expect(h.storage.createSwampyWorking).toHaveBeenCalledWith(
      expect.objectContaining({ warrenName: "The Ashfen" }),
    );
  });

  it("stays out of non-Swampy campaigns", async () => {
    const res = await api(`/api/campaigns/${caCampaign}/swampy/workings`, { user: gm });
    expect(res.status).toBe(400);
  });
});

describe("the Deck of Houses", () => {
  const deck = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`, name: `Card ${i}`, house: "Ash",
    uprightMeaning: `up ${i}`, reversedMeaning: `rev ${i}`, image: null,
  }));

  it("draws the number of cards the spread calls for", async () => {
    h.storage.getSwampyHouseCards.mockResolvedValue(deck);
    const res = await api(`/api/campaigns/${swampyCampaign}/swampy/reading`, {
      method: "POST", user: player, body: { spread: "three" },
    });
    expect(res.status).toBe(200);
    const reading = await res.json();
    expect(reading.cards).toHaveLength(3);
    expect(reading.cards.map((c: any) => c.position))
      .toEqual(["What Moves", "What Presses", "What Watches"]);
  });

  it("never repeats a card inside one reading", async () => {
    h.storage.getSwampyHouseCards.mockResolvedValue(deck);
    for (let attempt = 0; attempt < 20; attempt++) {
      const res = await api(`/api/campaigns/${swampyCampaign}/swampy/reading`, {
        method: "POST", user: gm, body: { spread: "house" },
      });
      const ids = (await res.json()).cards.map((c: any) => c.cardId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives each card a meaning matching the orientation it was drawn in", async () => {
    h.storage.getSwampyHouseCards.mockResolvedValue(deck);
    const res = await api(`/api/campaigns/${swampyCampaign}/swampy/reading`, {
      method: "POST", user: gm, body: { spread: "house" },
    });
    for (const card of (await res.json()).cards) {
      const source = deck.find((d) => d.id === card.cardId)!;
      expect(card.meaning).toBe(
        card.orientation === "upright" ? source.uprightMeaning : source.reversedMeaning,
      );
    }
  });

  it("falls back to a single card for an unknown spread", async () => {
    h.storage.getSwampyHouseCards.mockResolvedValue(deck);
    const res = await api(`/api/campaigns/${swampyCampaign}/swampy/reading`, {
      method: "POST", user: gm, body: { spread: "nonsense" },
    });
    expect((await res.json()).cards).toHaveLength(1);
  });

  it("says so plainly when the deck is empty", async () => {
    h.storage.getSwampyHouseCards.mockResolvedValue([]);
    const res = await api(`/api/campaigns/${swampyCampaign}/swampy/reading`, {
      method: "POST", user: gm, body: { spread: "single" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/empty/i);
  });

  it("never draws more cards than the deck holds", async () => {
    h.storage.getSwampyHouseCards.mockResolvedValue(deck.slice(0, 2));
    const res = await api(`/api/campaigns/${swampyCampaign}/swampy/reading`, {
      method: "POST", user: gm, body: { spread: "house" },
    });
    expect((await res.json()).cards).toHaveLength(2);
  });
});
