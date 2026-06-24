import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// Harness mirrors server/__tests__/libraryItemDedup.test.ts: route handlers
// only touch the DB through `storage`, so we replace it with controllable
// spies and stub `./db`, `./email`, `./googleDrive`, and `./lib/library-acl`
// so registerRoutes can boot without a real DB.
//
// These tests cover the permission / system checks on
// POST /api/admin/crafter-recipe-templates/:id/add-item-recipe:
//   - the caller cannot READ the source item (enforceLibraryRead denies) -> 403
//   - the item and template belong to different systems -> 400
//   - the item has no build recipe -> 400
//   - the happy path snapshots the build recipe into a new crafter recipe -> 200
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
    getCrafterRecipeTemplate: fn(),
    getItem: fn(),
    getItemBuildRecipe: fn(),
    createCraftRecipe: fn(),
    getItemsLinkedToCrafterTemplate: fn(),
    deleteExpiredSpectatorTokens: fn(),
  };
  // Controls whether enforceLibraryRead allows the caller through.
  const acl = { readAllowed: true };
  return {
    storage,
    acl,
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
  isAdminUser: async () => true,
  getLibraryScope: async () => undefined,
  enforceLibraryWrite: async () => true,
  // Mirror the real helper: when it denies, it sends a 403 and returns false.
  enforceLibraryRead: async (_req: any, res: any) => {
    if (!h.acl.readAllowed) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }
    return true;
  },
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

const admin = "admin1";
const templateId = "tmpl1";

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.acl.readAllowed = true;

  h.storage.getUser.mockImplementation(async (id: string) => ({
    id,
    username: `user-${id}`,
    email: `${id}@example.com`,
    isAdmin: false,
    bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);

  // Default: an aa-v2 crafter template owned by the admin caller.
  h.storage.getCrafterRecipeTemplate.mockResolvedValue({
    id: templateId,
    ownerUserId: admin,
    system: "aa-v2",
  });
  h.storage.getItemsLinkedToCrafterTemplate.mockResolvedValue([]);
});

function addItemRecipe(body: any) {
  return fetch(`${baseUrl}/api/admin/crafter-recipe-templates/${templateId}/add-item-recipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user": admin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/crafter-recipe-templates/:id/add-item-recipe", () => {
  it("returns 400 when itemId is missing", async () => {
    const res = await addItemRecipe({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/itemId is required/i);
    expect(h.storage.createCraftRecipe).not.toHaveBeenCalled();
  });

  it("returns 404 when the template does not exist", async () => {
    h.storage.getCrafterRecipeTemplate.mockResolvedValue(undefined);
    const res = await addItemRecipe({ itemId: "item1" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/template not found/i);
  });

  it("returns 403 when the caller cannot READ the source item", async () => {
    h.acl.readAllowed = false;
    h.storage.getItem.mockResolvedValue({
      id: "item1",
      isTemplate: true,
      system: "aa-v2",
      name: "Iron Sword",
      createdByUserId: "someone-else",
    });

    const res = await addItemRecipe({ itemId: "item1" });

    expect(res.status).toBe(403);
    // We never reach the build-recipe read or the create when access is denied.
    expect(h.storage.getItemBuildRecipe).not.toHaveBeenCalled();
    expect(h.storage.createCraftRecipe).not.toHaveBeenCalled();
  });

  it("returns 404 when the item is missing or is not a library template", async () => {
    h.storage.getItem.mockResolvedValue({
      id: "item1",
      isTemplate: false,
      system: "aa-v2",
      name: "Inventory Copy",
    });
    const res = await addItemRecipe({ itemId: "item1" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/item not found/i);
    expect(h.storage.createCraftRecipe).not.toHaveBeenCalled();
  });

  it("returns 400 when the item and template belong to different systems", async () => {
    h.storage.getItem.mockResolvedValue({
      id: "item1",
      isTemplate: true,
      system: "aa-v3", // template is aa-v2
      name: "Iron Sword",
      createdByUserId: admin,
    });

    const res = await addItemRecipe({ itemId: "item1" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/different systems/i);
    expect(h.storage.getItemBuildRecipe).not.toHaveBeenCalled();
    expect(h.storage.createCraftRecipe).not.toHaveBeenCalled();
  });

  it("returns 400 when the item has no build recipe", async () => {
    h.storage.getItem.mockResolvedValue({
      id: "item1",
      isTemplate: true,
      system: "aa-v2",
      name: "Iron Sword",
      createdByUserId: admin,
    });
    h.storage.getItemBuildRecipe.mockResolvedValue(undefined);

    const res = await addItemRecipe({ itemId: "item1" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no build recipe/i);
    expect(h.storage.createCraftRecipe).not.toHaveBeenCalled();
  });

  it("snapshots the build recipe into a new crafter recipe on success", async () => {
    h.storage.getItem.mockResolvedValue({
      id: "item1",
      isTemplate: true,
      system: "aa-v2",
      name: "Iron Sword",
      createdByUserId: admin,
    });
    h.storage.getItemBuildRecipe.mockResolvedValue({
      id: "br1",
      outputQuantity: 2,
      ingredients: [
        { id: "ig1", recipeId: "br1", itemId: "ore1", itemName: "Iron Ore", quantity: 3, sortOrder: 0 },
      ],
    });
    h.storage.createCraftRecipe.mockResolvedValue({ id: "recipe1" });

    const res = await addItemRecipe({ itemId: "item1" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("recipe1");

    expect(h.storage.createCraftRecipe).toHaveBeenCalledTimes(1);
    const [recipeArg, ingredientsArg] = h.storage.createCraftRecipe.mock.calls[0];
    expect(recipeArg).toMatchObject({
      name: "Iron Sword",
      outputItemId: "item1",
      outputQuantity: 2,
      noRoll: true,
      parentTemplateId: templateId,
      parentItemId: null,
    });
    // Ingredients are copied with the recipe-local id/recipeId stripped.
    expect(ingredientsArg).toEqual([
      { itemId: "ore1", itemName: "Iron Ore", quantity: 3, sortOrder: 0 },
    ]);
  });

  it("fans the recipe out to every item already linked to the template", async () => {
    h.storage.getItem.mockResolvedValue({
      id: "item1",
      isTemplate: true,
      system: "aa-v2",
      name: "Iron Sword",
      createdByUserId: admin,
    });
    h.storage.getItemBuildRecipe.mockResolvedValue({
      id: "br1",
      outputQuantity: 1,
      ingredients: [],
    });
    h.storage.createCraftRecipe.mockResolvedValue({ id: "recipe1" });
    h.storage.getItemsLinkedToCrafterTemplate.mockResolvedValue(["linked1", "linked2"]);

    const res = await addItemRecipe({ itemId: "item1" });

    expect(res.status).toBe(200);
    // 1 template recipe + 1 per linked item.
    expect(h.storage.createCraftRecipe).toHaveBeenCalledTimes(3);
    const parentItemIds = h.storage.createCraftRecipe.mock.calls
      .map((c: any[]) => c[0]?.parentItemId)
      .filter(Boolean);
    expect(parentItemIds).toEqual(["linked1", "linked2"]);
  });
});
