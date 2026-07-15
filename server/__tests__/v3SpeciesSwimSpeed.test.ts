import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Harness mirrors server/__tests__/addItemRecipe.test.ts: route handlers only
// touch the DB through `storage`, so we replace it with controllable spies and
// stub `./db`, `./email`, `./googleDrive`, and `./lib/library-acl` so
// registerRoutes can boot without a real database.
//
// These tests verify that a V3 species' swimSpeed flows onto the character:
//   - POST /api/campaigns/:campaignId/characters with a species that has
//     swimSpeed > 0 persists that swim speed onto the character.
//   - PATCH /api/characters/:id with a race change removes the old species'
//     swim speed and applies the new species' value (including back to 0 when
//     the new species has no swim speed).
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
    createCharacter: fn(),
    getCharacter: fn(),
    updateCharacter: fn(),
    getCampaignSpecies: fn(),
    getSpeciesByName: fn(),
    addCharacterCustomSkill: fn(),
    addCharacterTrait: fn(),
    getCharacterCustomSkills: fn(),
    getCharacterTraits: fn(),
    removeCharacterCustomSkill: fn(),
    removeCharacterTrait: fn(),
    getUniversalClasses: fn(),
    getCharacterClasses: fn(),
    createCharacterClass: fn(),
    getCharacterPermission: fn(),
    deleteExpiredSpectatorTokens: fn(),
  };
  return {
    storage,
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
  isAdminUser: async () => false,
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
const campaignId = "camp1";

// In-memory character row so sequential storage.updateCharacter calls compose
// (the create route follows species-defaults with several fixup updates).
let charRow: any;

const merfolk = {
  id: "sp-merfolk",
  name: "Merfolk",
  swimSpeed: 40,
  attributeBonuses: { might: 1 },
  skillBonuses: {},
  defaultCustomSkills: [],
  defaultTraits: [],
};
const landfolk = {
  id: "sp-landfolk",
  name: "Landfolk",
  swimSpeed: 0,
  attributeBonuses: {},
  skillBonuses: {},
  defaultCustomSkills: [],
  defaultTraits: [],
};
const riverkin = {
  id: "sp-riverkin",
  name: "Riverkin",
  swimSpeed: 25,
  attributeBonuses: {},
  skillBonuses: {},
  defaultCustomSkills: [],
  defaultTraits: [],
};

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();

  charRow = undefined;

  h.storage.getUser.mockImplementation(async (id: string) => ({
    id,
    username: `user-${id}`,
    email: `${id}@example.com`,
    isAdmin: false,
    bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);

  h.storage.getCampaign.mockResolvedValue({
    id: campaignId,
    system: "aa-v3",
    gmUserId: gm,
  });
  h.storage.getCampaignMembers.mockResolvedValue([]);
  h.storage.getCampaignMembership.mockResolvedValue(undefined);

  h.storage.getCampaignSpecies.mockResolvedValue([merfolk, landfolk, riverkin]);
  h.storage.getSpeciesByName.mockResolvedValue(undefined);

  h.storage.createCharacter.mockImplementation(async (data: any) => {
    charRow = {
      id: "char1",
      swimSpeed: 0,
      hp: 10,
      maxHp: 10,
      energy: 5,
      maxEnergy: 5,
      mana: 0,
      maxMana: 0,
      anemos: 0,
      spellCreationTokens: 0,
      might: 0,
      finesse: 0,
      constitution: 0,
      will: 0,
      intelligence: 0,
      v3SkillBoosts: {},
      isTemplate: false,
      ...data,
    };
    return charRow;
  });
  h.storage.getCharacter.mockImplementation(async () => charRow);
  h.storage.updateCharacter.mockImplementation(async (_id: string, updates: any) => {
    charRow = { ...charRow, ...updates };
    return charRow;
  });

  h.storage.addCharacterCustomSkill.mockResolvedValue({});
  h.storage.addCharacterTrait.mockResolvedValue({});
  h.storage.getCharacterCustomSkills.mockResolvedValue([]);
  h.storage.getCharacterTraits.mockResolvedValue([]);
  h.storage.getUniversalClasses.mockResolvedValue([]);
  h.storage.getCharacterClasses.mockResolvedValue([]);
});

function createCharacter(body: any) {
  return fetch(`${baseUrl}/api/campaigns/${campaignId}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user": gm },
    body: JSON.stringify(body),
  });
}

function patchCharacter(body: any) {
  return fetch(`${baseUrl}/api/characters/char1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-test-user": gm },
    body: JSON.stringify(body),
  });
}

describe("V3 species swim speed", () => {
  it("applies the species swimSpeed when a character is created with that species", async () => {
    const res = await createCharacter({ name: "Nami", race: "Merfolk" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.swimSpeed).toBe(40);
    // The persisted row got the swim speed too, not just the response.
    expect(charRow.swimSpeed).toBe(40);
    // And the attribute bonus still applied (swim speed didn't clobber it).
    expect(charRow.might).toBe(1);
  });

  it("leaves swimSpeed at 0 when the species has no swim speed", async () => {
    const res = await createCharacter({ name: "Bruno", race: "Landfolk" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.swimSpeed || 0).toBe(0);
  });

  it("swaps swim speed when the species changes to another swimming species", async () => {
    const createRes = await createCharacter({ name: "Nami", race: "Merfolk" });
    expect(createRes.status).toBe(200);
    expect(charRow.swimSpeed).toBe(40);

    const res = await patchCharacter({ race: "Riverkin" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.swimSpeed).toBe(25);
    expect(charRow.swimSpeed).toBe(25);
    // Old species' attribute bonus reverted.
    expect(charRow.might).toBe(0);
  });

  it("removes the old swim speed when changing to a species without one", async () => {
    const createRes = await createCharacter({ name: "Nami", race: "Merfolk" });
    expect(createRes.status).toBe(200);
    expect(charRow.swimSpeed).toBe(40);

    const res = await patchCharacter({ race: "Landfolk" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.swimSpeed).toBe(0);
    expect(charRow.swimSpeed).toBe(0);
  });
});
