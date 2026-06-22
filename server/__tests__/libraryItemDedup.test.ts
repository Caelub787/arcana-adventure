import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Harness mirrors server/__tests__/v3TechniqueUse.test.ts: the route handlers
// touch the database only through `storage`, so we replace it wholesale with
// controllable spies and stub `./db`, `./email`, `./googleDrive`, and
// `./lib/library-acl` so registerRoutes can boot without a real DB.
//
// These tests cover the library-item de-dup / template-linking logic on
// POST /api/characters/:characterId/items:
//   - a sourceTemplateId pointing at a SYSTEM library item links the new item
//     to that template (sets templateItemId) and does NOT auto-publish a
//     campaign duplicate.
//   - a sourceTemplateId pointing at a CAMPAIGN template from the same campaign
//     links correctly.
//   - an item created from scratch (no sourceTemplateId) by a GM auto-saves to
//     the campaign library exactly once, even when added twice by name.
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
    createItem: fn(),
    getRollEntries: fn(),
    createRollEntriesBulk: fn(),
    createRollEntry: fn(),
    getCampaignTemplateItems: fn(),
    getV3SpellsForSpellbook: fn(),
    createV3Spell: fn(),
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

const gm = "gm1";
const campaignId = "camp1";
const characterId = "char1";

// Tracks rows the route persists so the auto-save de-dup (which re-reads
// getCampaignTemplateItems before publishing) can see what it already wrote.
let createdItems: any[];
let campaignTemplates: any[];

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.adminUserIds.clear();

  createdItems = [];
  campaignTemplates = [];

  h.storage.getUser.mockImplementation(async (id: string) => ({
    id,
    username: `user-${id}`,
    email: `${id}@example.com`,
    isAdmin: false,
    bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);

  // Default: a V3 campaign whose GM is `gm1`, with `char1` owned by `gm1`.
  h.storage.getCharacter.mockResolvedValue({
    id: characterId,
    userId: gm,
    campaignId,
    system: "aa-v3",
    isTemplate: false,
  });
  h.storage.getCampaign.mockResolvedValue({
    id: campaignId,
    gmUserId: gm,
    system: "aa-v3",
    is18Plus: false,
  });
  h.storage.getCampaignMembers.mockResolvedValue([{ userId: gm, role: "gm" }]);
  h.storage.getCampaignMembership.mockResolvedValue({ userId: gm, role: "gm" });
  h.storage.getCharacterPermission.mockResolvedValue(undefined);

  h.storage.getRollEntries.mockResolvedValue([]);
  h.storage.createRollEntriesBulk.mockResolvedValue(undefined);
  h.storage.createRollEntry.mockResolvedValue(undefined);
  h.storage.getV3SpellsForSpellbook.mockResolvedValue([]);
  h.storage.createV3Spell.mockResolvedValue(undefined);
  h.storage.createChatMessage.mockResolvedValue({ id: "chat1" });

  h.storage.createItem.mockImplementation(async (data: any) => {
    const created = { id: `item-${createdItems.length + 1}`, ...data };
    createdItems.push(created);
    if (data.isTemplate) campaignTemplates.push(created);
    return created;
  });
  // Auto-save re-reads the campaign template library before publishing.
  h.storage.getCampaignTemplateItems.mockImplementation(async () => campaignTemplates);
});

function addItem(body: any) {
  return fetch(`${baseUrl}/api/characters/${characterId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user": gm },
    body: JSON.stringify(body),
  });
}

// Count only the auto-published campaign templates (isTemplate copies), not the
// character's own item rows.
function templateCreateCount() {
  return h.storage.createItem.mock.calls.filter((c: any[]) => c[0]?.isTemplate).length;
}

describe("POST /api/characters/:characterId/items — template linking & auto-save", () => {
  it("links to a SYSTEM library item and does NOT auto-publish a campaign duplicate", async () => {
    const systemTemplateId = "sys-tmpl-1";
    h.storage.getItem.mockResolvedValue({
      id: systemTemplateId,
      isTemplate: true,
      isLiveTemplate: false,
      campaignId: null,
      characterId: null,
      system: "aa-v3",
      name: "Iron Sword",
      itemType: "weapon",
    });

    const res = await addItem({
      name: "Iron Sword",
      itemType: "weapon",
      sourceTemplateId: systemTemplateId,
    });

    expect(res.status).toBe(200);

    // The created character item carries the template link.
    const charItemCall = h.storage.createItem.mock.calls.find((c: any[]) => !c[0]?.isTemplate);
    expect(charItemCall?.[0]?.templateItemId).toBe(systemTemplateId);

    // Auto-save is skipped: no campaign template published, and the de-dup
    // lookup never runs because the item already lives in the library.
    expect(templateCreateCount()).toBe(0);
    expect(h.storage.getCampaignTemplateItems).not.toHaveBeenCalled();
  });

  it("links to a CAMPAIGN template from the same campaign (sets templateItemId)", async () => {
    const campTemplateId = "camp-tmpl-1";
    h.storage.getItem.mockResolvedValue({
      id: campTemplateId,
      isTemplate: true,
      isLiveTemplate: false,
      campaignId,
      characterId: null,
      system: "aa-v3",
      name: "Health Potion",
      itemType: "consumable",
    });

    const res = await addItem({
      name: "Health Potion",
      itemType: "consumable",
      sourceTemplateId: campTemplateId,
    });

    expect(res.status).toBe(200);

    const charItemCall = h.storage.createItem.mock.calls.find((c: any[]) => !c[0]?.isTemplate);
    expect(charItemCall?.[0]?.templateItemId).toBe(campTemplateId);

    // Linked items never auto-publish.
    expect(templateCreateCount()).toBe(0);
  });

  it("does NOT link to a campaign template from a DIFFERENT campaign and skips auto-save", async () => {
    const otherCampTemplateId = "other-camp-tmpl";
    h.storage.getItem.mockResolvedValue({
      id: otherCampTemplateId,
      isTemplate: true,
      isLiveTemplate: false,
      campaignId: "some-other-campaign",
      characterId: null,
      system: "aa-v3",
      name: "Strange Relic",
      itemType: "utility",
    });

    const res = await addItem({
      name: "Strange Relic",
      itemType: "utility",
      sourceTemplateId: otherCampTemplateId,
    });

    expect(res.status).toBe(200);

    // Scope mismatch: no template link...
    const charItemCall = h.storage.createItem.mock.calls.find((c: any[]) => !c[0]?.isTemplate);
    expect(charItemCall?.[0]?.templateItemId).toBeUndefined();

    // ...but because a sourceTemplateId was supplied, auto-save is still skipped
    // so we never publish a campaign-local duplicate of an existing library row.
    expect(templateCreateCount()).toBe(0);
  });

  it("auto-saves a from-scratch GM item to the campaign library exactly once across two adds", async () => {
    // No sourceTemplateId: a brand-new item the GM typed in. getItem should
    // never be consulted for a template link in this flow.
    h.storage.getItem.mockResolvedValue(undefined);

    const first = await addItem({ name: "Custom Blade", itemType: "weapon" });
    expect(first.status).toBe(200);

    // First add publishes the template once.
    expect(templateCreateCount()).toBe(1);
    expect(campaignTemplates).toHaveLength(1);
    const published = campaignTemplates[0];
    expect(published.isTemplate).toBe(true);
    expect(published.campaignId).toBe(campaignId);
    expect(published.characterId).toBeNull();
    expect((published.name || "").toLowerCase()).toBe("custom blade");

    // Second add of the same-named item: the de-dup lookup finds the existing
    // template and does NOT publish again.
    const second = await addItem({ name: "Custom Blade", itemType: "weapon" });
    expect(second.status).toBe(200);

    expect(templateCreateCount()).toBe(1);
    expect(campaignTemplates).toHaveLength(1);
  });
});
