import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Mocks. The free-hotbar route reaches the database only through the `storage`
// facade, so we replace it wholesale with controllable spies. Mirrors the
// harness in v3SpellAccess.test.ts.
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
    isCampaignMember: fn(),
    getFreeHotbarEntries: fn(),
    getFreeHotbarEntry: fn(),
    upsertFreeHotbarEntry: fn(),
    deleteFreeHotbarEntry: fn(),
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
const player = "player1";
const otherOwner = "owner2";
const campaignId = "camp1";
const campaign = { id: campaignId, gmUserId: gm, system: "aa-v3", is18Plus: false };

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
  h.storage.getCampaign.mockResolvedValue(campaign);
  h.storage.isCampaignMember.mockResolvedValue(true);
  h.storage.getCampaignMembership.mockImplementation(async (userId: string) =>
    userId === player || userId === otherOwner
      ? { userId, campaignId, role: "player", trustedPlayer: false }
      : null,
  );
  h.storage.getCampaignMembers.mockResolvedValue([
    { userId: player, role: "player", trustedPlayer: false },
    { userId: otherOwner, role: "player", trustedPlayer: false },
  ]);
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

const getHotbar = (user: string) =>
  api(`/api/campaigns/${campaignId}/free-hotbar`, { user });

// A character owned by another player; access is controlled purely by the
// explicit character_permissions row, so revoking it must hide the entry.
const foreignChar = {
  id: "char1",
  name: "Borrowed Hero",
  portrait: "hero.png",
  userId: otherOwner,
  campaignId,
  isTemplate: false,
};

const charEntry = {
  id: "entry-char",
  userId: player,
  campaignId,
  loadoutIndex: 0,
  slotIndex: 0,
  characterId: foreignChar.id,
  itemId: null,
};

const foreignItem = {
  id: "item1",
  name: "Borrowed Sword",
  characterId: foreignChar.id,
};

const itemEntry = {
  id: "entry-item",
  userId: player,
  campaignId,
  loadoutIndex: 0,
  slotIndex: 1,
  characterId: null,
  itemId: foreignItem.id,
};

const libraryItem = { id: "libitem1", name: "GM Library Wand", characterId: null };

const libraryEntry = {
  id: "entry-lib",
  userId: player,
  campaignId,
  loadoutIndex: 0,
  slotIndex: 2,
  characterId: null,
  itemId: libraryItem.id,
};

describe("GET /api/campaigns/:campaignId/free-hotbar — revoked access is hidden", () => {
  it("returns the character entry while the player still has view permission", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([charEntry]);
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue({
      characterId: foreignChar.id,
      userId: player,
      accessLevel: "view",
    });

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].character).toMatchObject({ id: foreignChar.id, name: foreignChar.name });
  });

  it("hides the character entry after the permission is revoked (no row)", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([charEntry]);
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue(null);

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("hides the character entry when the permission is downgraded below view", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([charEntry]);
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue({
      characterId: foreignChar.id,
      userId: player,
      accessLevel: "name",
    });

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("hides the character entry when the user is no longer a campaign member", async () => {
    // Route-level membership check passes via GM/isCampaignMember; simulate a
    // user who is a member of the campaign but was removed from the member
    // list the character-access check consults.
    h.storage.getFreeHotbarEntries.mockResolvedValue([charEntry]);
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCampaignMembers.mockResolvedValue([]);
    h.storage.getCharacterPermission.mockResolvedValue({
      characterId: foreignChar.id,
      userId: player,
      accessLevel: "edit",
    });

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("hides a dangling entry whose character was deleted", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([charEntry]);
    h.storage.getCharacter.mockResolvedValue(undefined);

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("hides a character-owned item entry after access to the owning character is revoked", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([itemEntry]);
    h.storage.getItem.mockResolvedValue(foreignItem);
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue(null);

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("still returns the character-owned item entry while view access exists", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([itemEntry]);
    h.storage.getItem.mockResolvedValue(foreignItem);
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue({
      characterId: foreignChar.id,
      userId: player,
      accessLevel: "view",
    });

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].item).toMatchObject({ id: foreignItem.id });
    expect(body[0].sourceCharacter).toMatchObject({ id: foreignChar.id });
  });

  it("hides a dangling item entry whose item was deleted", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([itemEntry]);
    h.storage.getItem.mockResolvedValue(undefined);

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /api/campaigns/:campaignId/free-hotbar — library items are GM-only", () => {
  it("returns library-item entries to the GM", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([
      { ...libraryEntry, userId: gm },
    ]);
    h.storage.getItem.mockResolvedValue(libraryItem);

    const res = await getHotbar(gm);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].item).toMatchObject({ id: libraryItem.id });
    expect(body[0].sourceCharacter).toBeNull();
  });

  it("hides library-item entries from a non-GM player (e.g. after GM role was revoked)", async () => {
    h.storage.getFreeHotbarEntries.mockResolvedValue([libraryEntry]);
    h.storage.getItem.mockResolvedValue(libraryItem);

    const res = await getHotbar(player);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns library-item entries to an assistant GM", async () => {
    const assistant = "assist1";
    h.storage.getCampaignMembership.mockImplementation(async (userId: string) =>
      userId === assistant
        ? { userId: assistant, campaignId, role: "assistant_gm" }
        : null,
    );
    h.storage.getFreeHotbarEntries.mockResolvedValue([
      { ...libraryEntry, userId: assistant },
    ]);
    h.storage.getItem.mockResolvedValue(libraryItem);

    const res = await getHotbar(assistant);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].item).toMatchObject({ id: libraryItem.id });
  });
});

describe("PUT /api/campaigns/:campaignId/free-hotbar — write-path guards", () => {
  const putHotbar = (user: string, body: any) =>
    api(`/api/campaigns/${campaignId}/free-hotbar`, { method: "PUT", user, body });

  const validBody = { loadoutIndex: 0, slotIndex: 0, characterId: foreignChar.id };

  it("rejects both characterId and itemId (400)", async () => {
    const res = await putHotbar(player, {
      loadoutIndex: 0, slotIndex: 0,
      characterId: foreignChar.id, itemId: foreignItem.id,
    });
    expect(res.status).toBe(400);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("rejects neither characterId nor itemId (400)", async () => {
    const res = await putHotbar(player, { loadoutIndex: 0, slotIndex: 0 });
    expect(res.status).toBe(400);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("rejects out-of-range loadoutIndex (400)", async () => {
    for (const loadoutIndex of [-1, 9, 1.5, "abc"]) {
      const res = await putHotbar(player, { ...validBody, loadoutIndex });
      expect(res.status).toBe(400);
    }
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("rejects out-of-range slotIndex (400)", async () => {
    for (const slotIndex of [-1, 10, 2.5, "abc"]) {
      const res = await putHotbar(player, { ...validBody, slotIndex });
      expect(res.status).toBe(400);
    }
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("allows assigning a character with only view access (teammate peek)", async () => {
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue({
      characterId: foreignChar.id,
      userId: player,
      accessLevel: "view", // view is enough to pin a read-only teammate tile
    });

    const res = await putHotbar(player, validBody);
    expect(res.status).toBe(200);
    expect(h.storage.upsertFreeHotbarEntry).toHaveBeenCalled();
  });

  it("rejects assigning a character the caller has no access to (403)", async () => {
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue(null);

    const res = await putHotbar(player, validBody);
    expect(res.status).toBe(403);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("rejects assigning a character from another campaign (400)", async () => {
    h.storage.getCharacter.mockResolvedValue({ ...foreignChar, campaignId: "other-camp" });
    h.storage.getCharacterPermission.mockResolvedValue({
      characterId: foreignChar.id,
      userId: player,
      accessLevel: "edit",
    });

    const res = await putHotbar(player, validBody);
    expect(res.status).toBe(400);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("rejects a missing character (404)", async () => {
    h.storage.getCharacter.mockResolvedValue(undefined);
    const res = await putHotbar(player, validBody);
    expect(res.status).toBe(404);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("rejects an item owned by a character the caller can't edit (403)", async () => {
    h.storage.getItem.mockResolvedValue(foreignItem);
    h.storage.getCharacter.mockResolvedValue(foreignChar);
    h.storage.getCharacterPermission.mockResolvedValue(null);

    const res = await putHotbar(player, {
      loadoutIndex: 0, slotIndex: 1, itemId: foreignItem.id,
    });
    expect(res.status).toBe(403);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("rejects a library item assigned by a non-GM (403)", async () => {
    h.storage.getItem.mockResolvedValue(libraryItem);

    const res = await putHotbar(player, {
      loadoutIndex: 0, slotIndex: 2, itemId: libraryItem.id,
    });
    expect(res.status).toBe(403);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });

  it("allows a GM to assign a library item", async () => {
    h.storage.getItem.mockResolvedValue(libraryItem);
    const saved = { ...libraryEntry, userId: gm };
    h.storage.upsertFreeHotbarEntry.mockResolvedValue(saved);

    const res = await putHotbar(gm, {
      loadoutIndex: 0, slotIndex: 2, itemId: libraryItem.id,
    });
    expect(res.status).toBe(200);
    expect(h.storage.upsertFreeHotbarEntry).toHaveBeenCalledWith({
      userId: gm,
      campaignId,
      loadoutIndex: 0,
      slotIndex: 2,
      characterId: null,
      itemId: libraryItem.id,
    });
    expect(await res.json()).toMatchObject({ id: saved.id });
  });

  it("allows a player to assign their own character (happy path)", async () => {
    const ownChar = { ...foreignChar, id: "char-own", userId: player };
    h.storage.getCharacter.mockResolvedValue(ownChar);
    const saved = { ...charEntry, id: "entry-own", characterId: ownChar.id };
    h.storage.upsertFreeHotbarEntry.mockResolvedValue(saved);

    const res = await putHotbar(player, {
      loadoutIndex: 3, slotIndex: 4, characterId: ownChar.id,
    });
    expect(res.status).toBe(200);
    expect(h.storage.upsertFreeHotbarEntry).toHaveBeenCalledWith({
      userId: player,
      campaignId,
      loadoutIndex: 3,
      slotIndex: 4,
      characterId: ownChar.id,
      itemId: null,
    });
    expect(await res.json()).toMatchObject({ id: saved.id });
  });

  it("rejects unauthenticated PUT requests (401)", async () => {
    const res = await api(`/api/campaigns/${campaignId}/free-hotbar`, {
      method: "PUT",
      body: validBody,
    });
    expect(res.status).toBe(401);
    expect(h.storage.upsertFreeHotbarEntry).not.toHaveBeenCalled();
  });
});

describe("GET /api/campaigns/:campaignId/free-hotbar — route-level guards", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await api(`/api/campaigns/${campaignId}/free-hotbar`);
    expect(res.status).toBe(401);
  });

  it("rejects users who are not campaign members at all", async () => {
    h.storage.isCampaignMember.mockResolvedValue(false);
    const res = await getHotbar("stranger1");
    expect(res.status).toBe(403);
  });

  it("404s for a missing campaign", async () => {
    h.storage.getCampaign.mockResolvedValue(undefined);
    const res = await getHotbar(player);
    expect(res.status).toBe(404);
  });
});
