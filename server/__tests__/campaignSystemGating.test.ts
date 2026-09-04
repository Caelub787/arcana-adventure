import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";

// ---------------------------------------------------------------------------
// The older systems (Arcana Adventure, A.A. V2, A.A. V3) are incomplete, so
// only admins may start a campaign in one. The creation dropdown hides them,
// but the server has to enforce it too - these tests cover that server rule,
// since a hand-rolled request never sees the dropdown.
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
    createCampaign: fn(),
    addCampaignMember: fn(),
    createScene: fn(),
    setActiveScene: fn(),
    getCampaignMembership: fn(),
    getCampaignMembers: fn(),
    isCampaignMember: fn(),
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

const player = "player1";
const admin = "admin1";

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.adminUserIds.clear();
  h.adminUserIds.add(admin);
  h.storage.getUser.mockImplementation(async (id: string) => ({
    id,
    username: `user-${id}`,
    email: `${id}@example.com`,
    isAdmin: h.adminUserIds.has(id),
    bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);
  h.storage.createCampaign.mockImplementation(async (data: any) => ({
    id: "camp-new",
    ...data,
  }));
  h.storage.addCampaignMember.mockResolvedValue({});
  h.storage.createScene.mockResolvedValue({ id: "scene-new" });
  h.storage.setActiveScene.mockResolvedValue({});
});

function createCampaign(user: string, system?: string) {
  return fetch(`${baseUrl}/api/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user": user },
    body: JSON.stringify({ name: "Test Campaign", ...(system ? { system } : {}) }),
  });
}

describe("POST /api/campaigns system gating", () => {
  it("lets a non-admin create a C.A. campaign", async () => {
    const res = await createCampaign(player, "ca");
    expect(res.status).toBe(200);
    expect(h.storage.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ system: "ca" }),
    );
  });

  it("lets a non-admin create a Swampy campaign", async () => {
    const res = await createCampaign(player, "swampy");
    expect(res.status).toBe(200);
    expect(h.storage.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ system: "swampy" }),
    );
  });

  it.each(["arcana-adventure", "aa-v2", "aa-v3"])(
    "refuses a non-admin the incomplete %s system",
    async (system) => {
      const res = await createCampaign(player, system);
      expect(res.status).toBe(400);
      expect(h.storage.createCampaign).not.toHaveBeenCalled();
    },
  );

  it("names the system it refused, so the client can say why", async () => {
    const res = await createCampaign(player, "aa-v3");
    const body = await res.json();
    expect(body.error).toContain("A.A. V3");
  });

  it.each(["arcana-adventure", "aa-v2", "aa-v3", "ca", "swampy"])(
    "lets an admin create a %s campaign",
    async (system) => {
      const res = await createCampaign(admin, system);
      expect(res.status).toBe(200);
      expect(h.storage.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ system }),
      );
    },
  );

  // The historical default is an admin-only system now, so an omitted
  // `system` must not become a back door into it.
  it("refuses a non-admin who omits the system entirely", async () => {
    const res = await createCampaign(player);
    expect(res.status).toBe(400);
    expect(h.storage.createCampaign).not.toHaveBeenCalled();
  });
});
