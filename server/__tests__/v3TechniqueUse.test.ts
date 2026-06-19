import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Harness mirrors server/__tests__/v3SpellbookCapacity.test.ts: the route
// handlers touch the database only through `storage`, so we replace it wholesale
// with controllable spies and stub `./db`, `./email`, `./googleDrive`, and
// `./lib/library-acl` so registerRoutes can boot without a real DB.
//
// These tests are the server-authoritative replacement for the old client-only
// consume unit tests: they prove a modified client can't fire a V3 weapon
// technique without spending its consumed item and energy.
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
    getV3Technique: fn(),
    getV3TechniqueGroupMembers: fn(),
    getCharacterCustomSkills: fn(),
    getItemsByCharacter: fn(),
    updateItem: fn(),
    deleteItem: fn(),
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
  h.storage.getCharacterCustomSkills.mockResolvedValue([]);
  h.storage.getItemsByCharacter.mockResolvedValue([]);
  h.storage.updateItem.mockResolvedValue(undefined);
  h.storage.deleteItem.mockResolvedValue(undefined);
  h.storage.updateCharacter.mockImplementation(async (id: string, patch: any) => ({ id, ...patch }));
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
const weaponId = "weap1";
const groupId = "grp1";
const techniqueId = "tech1";

const CONSUMABLE_PEARL = {
  conditionType: "item" as const,
  itemId: "tpl-pearl",
  itemName: "Pearl",
  consumed: true,
};
const KNOWLEDGE_SWORD = {
  conditionType: "knowledge" as const,
  knowledgeName: "Swordsmanship",
};

// Wires up a happy-path V3 campaign where `char1` owns `weap1`, the weapon
// assigns group `grp1`, and `grp1` grants technique `tech1`.
function mockContext(opts: {
  energy?: number;
  energyCost?: number;
  requirements?: any[];
  inventory?: any[];
  knowledge?: string[];
  weaponGroupIds?: string[];
  groupMembers?: { groupId: string; techniqueId: string }[];
}) {
  h.storage.getCharacter.mockResolvedValue({
    id: characterId,
    userId: owner,
    campaignId,
    isTemplate: false,
    energy: opts.energy ?? 10,
  });
  h.storage.getCampaign.mockResolvedValue({
    id: campaignId,
    gmUserId: "gmX",
    system: "aa-v3",
    is18Plus: false,
  });
  h.storage.getCampaignMembers.mockResolvedValue([{ userId: owner, role: "player" }]);
  h.storage.getV3Technique.mockResolvedValue({
    id: techniqueId,
    name: "Cleave",
    energyCost: opts.energyCost ?? 0,
    requirements: opts.requirements ?? [],
  });
  h.storage.getItem.mockResolvedValue({
    id: weaponId,
    itemType: "weapon",
    characterId,
    v3TechniqueGroupIds: opts.weaponGroupIds ?? [groupId],
  });
  h.storage.getV3TechniqueGroupMembers.mockResolvedValue(
    opts.groupMembers ?? [{ groupId, techniqueId }],
  );
  h.storage.getCharacterCustomSkills.mockResolvedValue(
    (opts.knowledge ?? []).map((name) => ({ name })),
  );
  h.storage.getItemsByCharacter.mockResolvedValue(opts.inventory ?? []);
}

describe("POST /api/v3/techniques/:id/use — server-side enforcement", () => {
  it("consumes the sole-path item and deducts energy on success", async () => {
    mockContext({
      energy: 10,
      energyCost: 3,
      requirements: [CONSUMABLE_PEARL],
      inventory: [{ id: "inv-pearl", templateItemId: "tpl-pearl", name: "Pearl", quantity: 3 }],
    });
    const res = await api(`/api/v3/techniques/${techniqueId}/use`, {
      method: "POST",
      user: owner,
      body: { characterId, weaponItemId: weaponId },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.energySpent).toBe(3);
    expect(body.consumedItem).toMatchObject({ id: "inv-pearl", name: "Pearl" });
    // qty > 1 decrements rather than deletes.
    expect(h.storage.updateItem).toHaveBeenCalledWith("inv-pearl", { quantity: 2 });
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).toHaveBeenCalledWith(characterId, { energy: 7 });
  });

  it("deletes the consumable when the sole-path stack is at quantity 1", async () => {
    mockContext({
      energyCost: 0,
      requirements: [CONSUMABLE_PEARL],
      inventory: [{ id: "inv-pearl", templateItemId: "tpl-pearl", name: "Pearl", quantity: 1 }],
    });
    const res = await api(`/api/v3/techniques/${techniqueId}/use`, {
      method: "POST",
      user: owner,
      body: { characterId, weaponItemId: weaponId },
    });
    expect(res.status).toBe(200);
    expect(h.storage.deleteItem).toHaveBeenCalledWith("inv-pearl");
    expect(h.storage.updateItem).not.toHaveBeenCalled();
  });

  it("rejects with reason 'energy' and spends nothing when energy is short", async () => {
    mockContext({
      energy: 1,
      energyCost: 5,
      requirements: [CONSUMABLE_PEARL],
      inventory: [{ id: "inv-pearl", templateItemId: "tpl-pearl", name: "Pearl", quantity: 3 }],
    });
    const res = await api(`/api/v3/techniques/${techniqueId}/use`, {
      method: "POST",
      user: owner,
      body: { characterId, weaponItemId: weaponId },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("energy");
    // No item consumed and no energy deducted.
    expect(h.storage.updateItem).not.toHaveBeenCalled();
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
  });

  it("rejects with reason 'locked' when the required consumable is missing", async () => {
    mockContext({
      energyCost: 3,
      requirements: [CONSUMABLE_PEARL],
      inventory: [{ id: "inv-rock", templateItemId: "tpl-rock", name: "Rock", quantity: 5 }],
    });
    const res = await api(`/api/v3/techniques/${techniqueId}/use`, {
      method: "POST",
      user: owner,
      body: { characterId, weaponItemId: weaponId },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe("locked");
    expect(h.storage.updateItem).not.toHaveBeenCalled();
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
  });

  it("charges no item when a Knowledge free path satisfies the requirement", async () => {
    mockContext({
      energy: 10,
      energyCost: 2,
      requirements: [KNOWLEDGE_SWORD, CONSUMABLE_PEARL],
      knowledge: ["Swordsmanship"],
      inventory: [{ id: "inv-pearl", templateItemId: "tpl-pearl", name: "Pearl", quantity: 3 }],
    });
    const res = await api(`/api/v3/techniques/${techniqueId}/use`, {
      method: "POST",
      user: owner,
      body: { characterId, weaponItemId: weaponId },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consumedItem).toBeNull();
    expect(h.storage.updateItem).not.toHaveBeenCalled();
    expect(h.storage.deleteItem).not.toHaveBeenCalled();
    // Energy is still spent.
    expect(h.storage.updateCharacter).toHaveBeenCalledWith(characterId, { energy: 8 });
  });

  it("rejects a technique not granted by the supplied weapon", async () => {
    mockContext({
      energyCost: 3,
      requirements: [],
      // The weapon's group does not contain this technique.
      groupMembers: [{ groupId, techniqueId: "other-tech" }],
    });
    const res = await api(`/api/v3/techniques/${techniqueId}/use`, {
      method: "POST",
      user: owner,
      body: { characterId, weaponItemId: weaponId },
    });
    expect(res.status).toBe(403);
    expect(h.storage.updateItem).not.toHaveBeenCalled();
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
  });

  it("rejects when the weapon belongs to another character", async () => {
    mockContext({ energyCost: 3, requirements: [] });
    h.storage.getItem.mockResolvedValue({
      id: weaponId,
      itemType: "weapon",
      characterId: "someone-else",
      v3TechniqueGroupIds: [groupId],
    });
    const res = await api(`/api/v3/techniques/${techniqueId}/use`, {
      method: "POST",
      user: owner,
      body: { characterId, weaponItemId: weaponId },
    });
    expect(res.status).toBe(403);
    expect(h.storage.updateCharacter).not.toHaveBeenCalled();
  });
});
