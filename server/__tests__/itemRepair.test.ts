import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Harness mirrors server/__tests__/v3TechniqueUse.test.ts: the repair route
// touches the database only through `storage`, so we replace it wholesale with
// controllable spies and stub `./db`, `./email`, `./googleDrive`, and
// `./lib/library-acl` so registerRoutes can boot without a real DB.
//
// These tests are the server-authoritative coverage for the AA V3 crafter
// item-repair flow: durability restore (capped at maxDurability), ingredient +
// energy/mana/hp consumption, and ownership / V3 / validation gating.
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
    getCraftRecipe: fn(),
    getItemsByCharacter: fn(),
    updateItem: fn(),
    deleteItem: fn(),
    createChatMessage: fn(),
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
  h.storage.updateItem.mockImplementation(async (id: string, patch: any) => ({ id, ...patch }));
  h.storage.deleteItem.mockResolvedValue(undefined);
  h.storage.updateCharacter.mockImplementation(async (id: string, patch: any) => ({ id, ...patch }));
  h.storage.createChatMessage.mockResolvedValue({ id: "chat1" });
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

const owner = "owner1";
const characterId = "char1";
const campaignId = "camp1";
const crafterId = "crafter1";
const recipeId = "recipe1";
const targetItemId = "target1";
const targetTypeId = "advType1";

type Ctx = {
  campaignSystem?: string;
  charUserId?: string;
  energy?: number;
  mana?: number;
  hp?: number;
  // crafter overrides
  crafterCharacterId?: string | null;
  crafterTemplateItemId?: string | null;
  // recipe overrides
  isRepairRecipe?: boolean;
  parentItemId?: string;
  repairTargetTypeId?: string | null;
  repairAmount?: number;
  ingredients?: any[];
  costEnergyEnabled?: boolean;
  costEnergy?: number;
  costManaEnabled?: boolean;
  costMana?: number;
  costHpEnabled?: boolean;
  costHp?: number;
  // target item overrides
  targetAdvancedTypeId?: string | null;
  durability?: number;
  maxDurability?: number;
  targetCharacterId?: string;
  // inventory
  inventory?: any[];
};

function mockContext(opts: Ctx = {}) {
  h.storage.getCharacter.mockResolvedValue({
    id: characterId,
    userId: opts.charUserId ?? owner,
    campaignId,
    energy: opts.energy ?? 10,
    mana: opts.mana ?? 10,
    hp: opts.hp ?? 10,
  });
  h.storage.getCampaign.mockResolvedValue({
    id: campaignId,
    system: opts.campaignSystem ?? "aa-v3",
  });

  const crafter = {
    id: crafterId,
    itemType: "crafter",
    characterId: opts.crafterCharacterId === undefined ? characterId : opts.crafterCharacterId,
    templateItemId: opts.crafterTemplateItemId ?? null,
    system: "aa-v3",
  };
  const targetItem = {
    id: targetItemId,
    characterId: opts.targetCharacterId ?? characterId,
    advancedItemTypeId:
      opts.targetAdvancedTypeId === undefined ? targetTypeId : opts.targetAdvancedTypeId,
    durability: opts.durability ?? 2,
    maxDurability: opts.maxDurability ?? 10,
    name: "Worn Blade",
  };
  h.storage.getItem.mockImplementation(async (id: string) => {
    if (id === crafterId) return crafter;
    if (id === targetItemId) return targetItem;
    return undefined;
  });

  h.storage.getCraftRecipe.mockResolvedValue({
    id: recipeId,
    isRepairRecipe: opts.isRepairRecipe ?? true,
    parentItemId: opts.parentItemId ?? crafterId,
    repairTargetTypeId:
      opts.repairTargetTypeId === undefined ? targetTypeId : opts.repairTargetTypeId,
    repairAmount: opts.repairAmount ?? 5,
    ingredients: opts.ingredients ?? [
      { itemId: "tpl-iron", itemName: "Iron", quantity: 2 },
    ],
    outcomes: [],
    costEnergyEnabled: opts.costEnergyEnabled ?? false,
    costEnergy: opts.costEnergy ?? 0,
    costManaEnabled: opts.costManaEnabled ?? false,
    costMana: opts.costMana ?? 0,
    costHpEnabled: opts.costHpEnabled ?? false,
    costHp: opts.costHp ?? 0,
  });

  h.storage.getItemsByCharacter.mockResolvedValue(
    opts.inventory ?? [{ id: "inv-iron", templateItemId: "tpl-iron", name: "Iron", quantity: 5 }],
  );
}

function repair(body: any, user = owner) {
  return api(`/api/items/${crafterId}/repair`, { method: "POST", user, body });
}

const goodBody = { recipeId, characterId, targetItemId };

describe("POST /api/items/:itemId/repair — AA V3 crafter repair", () => {
  it("restores durability, consuming ingredients on the happy path", async () => {
    mockContext({ durability: 2, maxDurability: 10, repairAmount: 5 });
    const res = await repair(goodBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.durability).toBe(7); // 2 + 5
    expect(body.restored).toBe(5);
    // 2 of a stack of 5 consumed -> decrement, not delete.
    expect(h.storage.updateItem).toHaveBeenCalledWith("inv-iron", { quantity: 3 });
    expect(h.storage.updateItem).toHaveBeenCalledWith(targetItemId, { durability: 7 });
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("caps restored durability at maxDurability", async () => {
    mockContext({ durability: 8, maxDurability: 10, repairAmount: 5 });
    const res = await repair(goodBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.durability).toBe(10); // not 13
    expect(body.restored).toBe(2);
    expect(h.storage.updateItem).toHaveBeenCalledWith(targetItemId, { durability: 10 });
  });

  it("deletes an ingredient stack consumed in full", async () => {
    mockContext({
      ingredients: [{ itemId: "tpl-iron", itemName: "Iron", quantity: 2 }],
      inventory: [{ id: "inv-iron", templateItemId: "tpl-iron", name: "Iron", quantity: 2 }],
    });
    const res = await repair(goodBody);
    expect(res.status).toBe(200);
    expect(h.storage.deleteItem).toHaveBeenCalledWith("inv-iron");
  });

  it("consumes energy, mana and hp when the recipe charges them", async () => {
    mockContext({
      energy: 10,
      mana: 10,
      hp: 10,
      costEnergyEnabled: true,
      costEnergy: 3,
      costManaEnabled: true,
      costMana: 4,
      costHpEnabled: true,
      costHp: 2,
    });
    const res = await repair(goodBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(h.storage.updateCharacter).toHaveBeenCalledWith(characterId, {
      energy: 7,
      mana: 6,
      hp: 8,
    });
    expect(body.resourceDeductions).toEqual(
      expect.arrayContaining([
        { stat: "energy", spent: 3 },
        { stat: "mana", spent: 4 },
        { stat: "hp", spent: 2 },
      ]),
    );
  });

  it("rejects and spends nothing when a resource is short", async () => {
    mockContext({ mana: 1, costManaEnabled: true, costMana: 5 });
    const res = await repair(goodBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not enough/i);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
  });

  it("rejects a non-owner of the character", async () => {
    mockContext({ charUserId: "someone-else" });
    const res = await repair(goodBody);
    expect(res.status).toBe(403);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
  });

  it("rejects when the campaign is not AA V3", async () => {
    mockContext({ campaignSystem: "aa-v2" });
    const res = await repair(goodBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/aa v3/i);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects an item already at full durability", async () => {
    mockContext({ durability: 10, maxDurability: 10 });
    const res = await repair(goodBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/full durability/i);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects an item whose type does not match the recipe", async () => {
    mockContext({ targetAdvancedTypeId: "other-type" });
    const res = await repair(goodBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be repaired/i);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects with the missing ingredients when inventory is short", async () => {
    mockContext({
      ingredients: [{ itemId: "tpl-iron", itemName: "Iron", quantity: 4 }],
      inventory: [{ id: "inv-iron", templateItemId: "tpl-iron", name: "Iron", quantity: 1 }],
    });
    const res = await repair(goodBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing ingredients/i);
    expect(body.missing).toEqual([{ name: "Iron", need: 4, have: 1 }]);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("rejects a non-repair recipe", async () => {
    mockContext({ isRepairRecipe: false });
    const res = await repair(goodBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not a repair recipe/i);
  });

  it("rejects a crafter that belongs to another character", async () => {
    mockContext({ crafterCharacterId: "someone-else" });
    const res = await repair(goodBody);
    expect(res.status).toBe(403);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("requires recipeId, characterId and targetItemId", async () => {
    mockContext();
    const res = await repair({ recipeId, characterId });
    expect(res.status).toBe(400);
  });
});
