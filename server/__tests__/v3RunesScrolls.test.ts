import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

import {
  v3RuneSlotCount,
  aggregateRuneStatEffects,
  aggregateRuneWeaponDamageLevelBonus,
  v3RuneStatTargetLabel,
} from "@shared/v3";

// ---------------------------------------------------------------------------
// Unit tests for the shared rune math helpers. These have no DB dependency, so
// they import directly from @shared/v3.
// ---------------------------------------------------------------------------

describe("v3RuneSlotCount", () => {
  it("maps each rarity tier to its slot count", () => {
    expect(v3RuneSlotCount("common")).toBe(0);
    expect(v3RuneSlotCount("uncommon")).toBe(1);
    expect(v3RuneSlotCount("rare")).toBe(2);
    expect(v3RuneSlotCount("epic")).toBe(3);
    expect(v3RuneSlotCount("legendary")).toBe(4);
  });

  it("is case-insensitive", () => {
    expect(v3RuneSlotCount("RARE")).toBe(2);
    expect(v3RuneSlotCount("Legendary")).toBe(4);
  });

  it("defaults to common (0 slots) for null/undefined/empty", () => {
    expect(v3RuneSlotCount(null)).toBe(0);
    expect(v3RuneSlotCount(undefined)).toBe(0);
    expect(v3RuneSlotCount("")).toBe(0);
  });

  it("returns 0 for an unknown rarity", () => {
    expect(v3RuneSlotCount("mythic")).toBe(0);
  });
});

describe("aggregateRuneWeaponDamageLevelBonus", () => {
  it("sums the per-rune weapon damage level bonus (stacks)", () => {
    expect(
      aggregateRuneWeaponDamageLevelBonus([
        { weaponDamageLevelBonus: 1 },
        { weaponDamageLevelBonus: 2 },
        { weaponDamageLevelBonus: 3 },
      ]),
    ).toBe(6);
  });

  it("truncates fractional values and treats missing/invalid as 0", () => {
    expect(
      aggregateRuneWeaponDamageLevelBonus([
        { weaponDamageLevelBonus: 2.9 },
        { weaponDamageLevelBonus: null },
        {},
        null,
        undefined,
        { weaponDamageLevelBonus: NaN as any },
      ]),
    ).toBe(2);
  });

  it("returns 0 for a non-array / empty input", () => {
    expect(aggregateRuneWeaponDamageLevelBonus(null)).toBe(0);
    expect(aggregateRuneWeaponDamageLevelBonus(undefined)).toBe(0);
    expect(aggregateRuneWeaponDamageLevelBonus([])).toBe(0);
  });
});

describe("aggregateRuneStatEffects", () => {
  it("sums the same target across multiple runes", () => {
    expect(
      aggregateRuneStatEffects([
        { statEffects: [{ target: "mod", amount: 2 }] },
        { statEffects: [{ target: "mod", amount: 3 }] },
        { statEffects: [{ target: "mod", amount: 1 }] },
      ]),
    ).toEqual({ mod: 6 });
  });

  it("keeps different targets separate and sums them independently", () => {
    expect(
      aggregateRuneStatEffects([
        {
          statEffects: [
            { target: "mod", amount: 2 },
            { target: "carryCapacity", amount: 10 },
          ],
        },
        {
          statEffects: [
            { target: "mod", amount: 1 },
            { target: "damageReduction", amount: 4 },
            { target: "carryCapacity", amount: 5 },
          ],
        },
      ]),
    ).toEqual({ mod: 3, carryCapacity: 15, damageReduction: 4 });
  });

  it("truncates fractional amounts toward zero before summing", () => {
    expect(
      aggregateRuneStatEffects([
        { statEffects: [{ target: "mod", amount: 2.9 }] },
        { statEffects: [{ target: "mod", amount: -1.9 }] },
      ]),
    ).toEqual({ mod: 1 }); // trunc(2.9)=2 + trunc(-1.9)=-1
  });

  it("skips entries with a missing/zero amount or a missing target", () => {
    expect(
      aggregateRuneStatEffects([
        {
          statEffects: [
            { target: "mod", amount: 5 },
            { target: "mod", amount: 0 },
            { target: "mod" } as any,
            { target: "mod", amount: NaN as any },
            { amount: 7 } as any,
            { target: "", amount: 3 },
          ],
        },
      ]),
    ).toEqual({ mod: 5 });
  });

  it("ignores runes whose statEffects is missing or not an array", () => {
    expect(
      aggregateRuneStatEffects([
        { statEffects: [{ target: "mod", amount: 2 }] },
        {},
        { statEffects: null },
        { statEffects: "nope" as any },
        null,
        undefined,
      ]),
    ).toEqual({ mod: 2 });
  });

  it("returns an empty map for null / non-array input", () => {
    expect(aggregateRuneStatEffects(null)).toEqual({});
    expect(aggregateRuneStatEffects(undefined)).toEqual({});
    expect(aggregateRuneStatEffects("nope" as any)).toEqual({});
    expect(aggregateRuneStatEffects([])).toEqual({});
  });
});

describe("v3RuneStatTargetLabel", () => {
  it("returns the human label for a known stat target", () => {
    expect(v3RuneStatTargetLabel("carryCapacity")).toBe("Carry Capacity");
    expect(v3RuneStatTargetLabel("range")).toBe("Range (ft)");
    expect(v3RuneStatTargetLabel("price")).toBe("Price");
    expect(v3RuneStatTargetLabel("itemWeight")).toBe("Weight (lb)");
  });

  it("falls back to the raw key when unknown", () => {
    expect(v3RuneStatTargetLabel("bogusKey")).toBe("bogusKey");
  });
});

// ---------------------------------------------------------------------------
// Integration harness mirrors server/__tests__/v3TechniqueUse.test.ts: route
// handlers touch the DB only through `storage`, so we replace it wholesale with
// controllable spies and stub `./db`, `./email`, `./googleDrive`, and
// `./lib/library-acl` so registerRoutes can boot without a real DB.
//
// These tests lock in the validate-then-write behavior of the V3 rune/scroll
// endpoints: socketing consumes the rune, removal reverts stats and lowers max
// durability, and scroll use consumes in all three modes.
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
    updateCharacter: fn(),
    getCampaign: fn(),
    getCampaignMembers: fn(),
    getCampaignMembership: fn(),
    getCharacterPermission: fn(),
    isGM: fn(),
    updateItem: fn(),
    deleteItem: fn(),
    addCharacterCustomSkill: fn(),
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

const owner = "owner1";
const characterId = "char1";
const campaignId = "camp1";

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
  h.storage.isGM.mockResolvedValue(false);
  h.storage.getCharacterPermission.mockResolvedValue(null);
  // Default: char1 is owned by owner1 in an AA V3 campaign.
  h.storage.getCharacter.mockResolvedValue({
    id: characterId,
    userId: owner,
    campaignId,
    isTemplate: false,
    v3SkillBoosts: {},
  });
  h.storage.getCampaign.mockResolvedValue({
    id: campaignId,
    gmUserId: "gmX",
    system: "aa-v3",
    is18Plus: false,
  });
  h.storage.getCampaignMembers.mockResolvedValue([{ userId: owner, role: "player" }]);
  h.storage.getCampaignMembership.mockResolvedValue({ userId: owner, role: "player" });
  h.storage.updateItem.mockImplementation(async (id: string, patch: any) => ({ id, ...patch }));
  h.storage.deleteItem.mockResolvedValue(undefined);
  h.storage.updateCharacter.mockImplementation(async (id: string, patch: any) => ({
    id,
    campaignId,
    ...patch,
  }));
  h.storage.addCharacterCustomSkill.mockImplementation(async (skill: any) => ({
    id: "skill-new",
    ...skill,
  }));
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

const hostId = "host1";
const runeId = "rune1";

// Register getItem responses keyed by id for a single test.
function mockItems(items: Record<string, any>) {
  h.storage.getItem.mockImplementation(async (id: string) => items[id] ?? undefined);
}

// ---------------------------------------------------------------------------
// socket-rune
// ---------------------------------------------------------------------------

describe("POST /api/characters/:characterId/items/:itemId/socket-rune", () => {
  it("sockets a rune, consumes it (qty 1 → delete), and applies stat deltas", async () => {
    mockItems({
      [hostId]: {
        id: hostId,
        characterId,
        itemType: "weapon",
        rarity: "rare",
        socketedRunes: [],
        mod: 1,
      },
      [runeId]: {
        id: runeId,
        characterId,
        itemType: "rune",
        name: "Rune of Striking",
        runeTargetItemType: "weapon",
        runeStatEffects: [{ target: "mod", amount: 2 }],
        runeUseMode: "none",
        runeWeaponDamageLevelBonus: 1,
        runeRemoveDurabilityCost: 3,
        quantity: 1,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(200);
    // Rune at qty 1 is deleted, not decremented.
    expect(h.storage.deleteItem).toHaveBeenCalledWith(runeId);
    // Host gains the rune snapshot and the stat delta on its real column.
    const [calledId, patch] = h.storage.updateItem.mock.calls.at(-1)!;
    expect(calledId).toBe(hostId);
    expect(patch.mod).toBe(3);
    expect(patch.socketedRunes).toHaveLength(1);
    expect(patch.socketedRunes[0]).toMatchObject({
      slotIndex: 0,
      runeItemId: runeId,
      name: "Rune of Striking",
      weaponDamageLevelBonus: 1,
      removable: true,
      removeDurabilityCost: 3,
    });
  });

  it("decrements the rune stack instead of deleting when quantity > 1", async () => {
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", rarity: "uncommon", socketedRunes: [] },
      [runeId]: {
        id: runeId,
        characterId,
        itemType: "rune",
        name: "Rune",
        runeStatEffects: [],
        quantity: 3,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(200);
    expect(h.storage.updateItem).toHaveBeenCalledWith(runeId, { quantity: 2 });
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("picks the lowest free slot index when others are occupied", async () => {
    mockItems({
      [hostId]: {
        id: hostId,
        characterId,
        itemType: "weapon",
        rarity: "rare",
        socketedRunes: [{ slotIndex: 0, name: "Existing", statEffects: [] }],
      },
      [runeId]: { id: runeId, characterId, itemType: "rune", name: "Rune", runeStatEffects: [], quantity: 1 },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(200);
    const patch = h.storage.updateItem.mock.calls.at(-1)![1];
    expect(patch.socketedRunes).toHaveLength(2);
    expect(patch.socketedRunes[1].slotIndex).toBe(1);
  });

  it("rejects when the host has no free slots (common = 0)", async () => {
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", rarity: "common", socketedRunes: [] },
      [runeId]: { id: runeId, characterId, itemType: "rune", name: "Rune", runeStatEffects: [], quantity: 1 },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(400);
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects a rune targeted at a different item type", async () => {
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", rarity: "rare", socketedRunes: [] },
      [runeId]: {
        id: runeId,
        characterId,
        itemType: "rune",
        name: "Rune",
        runeTargetItemType: "armor",
        runeStatEffects: [],
        quantity: 1,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(400);
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects when the rune item is not actually a rune", async () => {
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", rarity: "rare", socketedRunes: [] },
      [runeId]: { id: runeId, characterId, itemType: "weapon", name: "Sword", quantity: 1 },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(400);
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("rejects when the rune belongs to another character (404)", async () => {
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", rarity: "rare", socketedRunes: [] },
      [runeId]: { id: runeId, characterId: "someone-else", itemType: "rune", runeStatEffects: [], quantity: 1 },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(404);
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("rejects with 400 in a non-V3 campaign", async () => {
    h.storage.getCampaign.mockResolvedValue({ id: campaignId, gmUserId: "gmX", system: "aa-v2" });
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", rarity: "rare", socketedRunes: [] },
      [runeId]: { id: runeId, characterId, itemType: "rune", runeStatEffects: [], quantity: 1 },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/socket-rune`, {
      method: "POST",
      user: owner,
      body: { runeItemId: runeId },
    });
    expect(res.status).toBe(400);
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// remove-rune
// ---------------------------------------------------------------------------

describe("POST /api/characters/:characterId/items/:itemId/remove-rune", () => {
  it("reverts stat effects and never touches durability (removal is free)", async () => {
    mockItems({
      [hostId]: {
        id: hostId,
        characterId,
        itemType: "weapon",
        mod: 3,
        maxDurability: 10,
        durability: 10,
        socketedRunes: [
          {
            slotIndex: 0,
            name: "Rune of Striking",
            statEffects: [{ target: "mod", amount: 2 }],
            removable: true,
            removeDurabilityCost: 3,
          },
        ],
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/remove-rune`, {
      method: "POST",
      user: owner,
      body: { slotIndex: 0 },
    });
    expect(res.status).toBe(200);
    const patch = h.storage.updateItem.mock.calls.at(-1)![1];
    expect(patch.socketedRunes).toHaveLength(0);
    expect(patch.mod).toBe(1); // 3 - 2
    // Removal no longer costs durability — even with a legacy removeDurabilityCost.
    expect(patch).not.toHaveProperty("maxDurability");
    expect(patch).not.toHaveProperty("durability");
  });

  it("does not touch durability when the rune has no remove cost", async () => {
    mockItems({
      [hostId]: {
        id: hostId,
        characterId,
        itemType: "weapon",
        maxDurability: 10,
        durability: 8,
        socketedRunes: [
          { slotIndex: 0, name: "Free Rune", statEffects: [], removable: true, removeDurabilityCost: 0 },
        ],
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/remove-rune`, {
      method: "POST",
      user: owner,
      body: { slotIndex: 0 },
    });
    expect(res.status).toBe(200);
    const patch = h.storage.updateItem.mock.calls.at(-1)![1];
    expect(patch).not.toHaveProperty("maxDurability");
    expect(patch).not.toHaveProperty("durability");
  });

  it("rejects removing an unremovable rune", async () => {
    mockItems({
      [hostId]: {
        id: hostId,
        characterId,
        itemType: "weapon",
        socketedRunes: [{ slotIndex: 0, name: "Bonded", statEffects: [], removable: false }],
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/remove-rune`, {
      method: "POST",
      user: owner,
      body: { slotIndex: 0 },
    });
    expect(res.status).toBe(400);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("returns 404 when no rune occupies the requested slot", async () => {
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", socketedRunes: [] },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/remove-rune`, {
      method: "POST",
      user: owner,
      body: { slotIndex: 0 },
    });
    expect(res.status).toBe(404);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects when slotIndex is missing", async () => {
    mockItems({
      [hostId]: { id: hostId, characterId, itemType: "weapon", socketedRunes: [] },
    });
    const res = await api(`/api/characters/${characterId}/items/${hostId}/remove-rune`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// use-scroll
// ---------------------------------------------------------------------------

const scrollId = "scroll1";

describe("POST /api/characters/:characterId/items/:itemId/use-scroll", () => {
  it("knowledge mode grants a custom skill and consumes the scroll", async () => {
    mockItems({
      [scrollId]: {
        id: scrollId,
        characterId,
        itemType: "scroll",
        scrollEffectMode: "knowledge",
        scrollKnowledgeName: "Arcana",
        scrollKnowledgeAttribute: "intelligence",
        scrollKnowledgeValue: 2,
        quantity: 1,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${scrollId}/use-scroll`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("knowledge");
    expect(body.grantedSkill).toMatchObject({ name: "Arcana", parentAttribute: "intelligence", value: 2 });
    expect(h.storage.addCharacterCustomSkill).toHaveBeenCalledWith(
      expect.objectContaining({ characterId, name: "Arcana", parentAttribute: "intelligence", value: 2 }),
    );
    // qty 1 → deleted.
    expect(h.storage.deleteItem).toHaveBeenCalledWith(scrollId);
  });

  it("skill mode bumps the character's v3SkillBoosts and consumes the scroll", async () => {
    h.storage.getCharacter.mockResolvedValue({
      id: characterId,
      userId: owner,
      campaignId,
      isTemplate: false,
      v3SkillBoosts: { athletics: 1 },
    });
    mockItems({
      [scrollId]: {
        id: scrollId,
        characterId,
        itemType: "scroll",
        scrollEffectMode: "skill",
        scrollSkillKey: "athletics",
        scrollSkillAmount: 2,
        quantity: 1,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${scrollId}/use-scroll`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("skill");
    expect(h.storage.updateCharacter).toHaveBeenCalledWith(
      characterId,
      expect.objectContaining({ v3SkillBoosts: { athletics: 3 } }),
    );
    expect(h.storage.deleteItem).toHaveBeenCalledWith(scrollId);
  });

  it("decrements a stacked scroll instead of deleting (qty > 1)", async () => {
    mockItems({
      [scrollId]: {
        id: scrollId,
        characterId,
        itemType: "scroll",
        scrollEffectMode: "knowledge",
        scrollKnowledgeName: "History",
        quantity: 4,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${scrollId}/use-scroll`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(200);
    expect(h.storage.updateItem).toHaveBeenCalledWith(scrollId, { quantity: 3 });
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("rejects spell-mode scrolls (cast from the spellbook) without consuming", async () => {
    mockItems({
      [scrollId]: {
        id: scrollId,
        characterId,
        itemType: "scroll",
        scrollEffectMode: "spell",
        quantity: 1,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${scrollId}/use-scroll`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(400);
    expect(h.storage.addCharacterCustomSkill).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects a knowledge scroll with no knowledge configured (no consume)", async () => {
    mockItems({
      [scrollId]: {
        id: scrollId,
        characterId,
        itemType: "scroll",
        scrollEffectMode: "knowledge",
        scrollKnowledgeName: "  ",
        quantity: 1,
      },
    });
    const res = await api(`/api/characters/${characterId}/items/${scrollId}/use-scroll`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(400);
    expect(h.storage.addCharacterCustomSkill).not.toHaveBeenCalled();
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("rejects when the item is not a scroll", async () => {
    mockItems({
      [scrollId]: { id: scrollId, characterId, itemType: "weapon", quantity: 1 },
    });
    const res = await api(`/api/characters/${characterId}/items/${scrollId}/use-scroll`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(400);
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("rejects a scroll owned by another character (404)", async () => {
    mockItems({
      [scrollId]: { id: scrollId, characterId: "someone-else", itemType: "scroll", scrollEffectMode: "knowledge", quantity: 1 },
    });
    const res = await api(`/api/characters/${characterId}/items/${scrollId}/use-scroll`, {
      method: "POST",
      user: owner,
      body: {},
    });
    expect(res.status).toBe(404);
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });
});
