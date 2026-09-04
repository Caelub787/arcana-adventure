import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "net";
import express from "express";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Every roll lands in the Adventure Log, not just the dice roller's and /roll.
// Attack, damage, skill and Duality rolls all arrive as `roll_notification`,
// which used to reach only the tracker's roll tray - and that keeps a handful
// of recent entries, so the roll left no lasting record anywhere.
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
    updateCampaign: fn(),
    createChatMessage: fn(),
    deleteExpiredSpectatorTokens: fn(),
    unbanUser: fn(),
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
let wsUrl: string;

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
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const gm = "gm1";
const player = "player1";
const campaignId = "camp1";

beforeEach(() => {
  for (const m of Object.values(h.storage)) (m as any).mockReset();
  h.storage.getUser.mockImplementation(async (id: string) => ({
    id, username: `user-${id}`, email: `${id}@example.com`, isAdmin: false, bannedAt: null,
  }));
  h.storage.deleteExpiredSpectatorTokens.mockResolvedValue(0);
  h.storage.getCampaign.mockResolvedValue({ id: campaignId, gmUserId: gm, system: "swampy", rollFeed: [] });
  h.storage.getCampaignMembers.mockResolvedValue([
    { userId: gm, role: "gm" },
    { userId: player, role: "player" },
  ]);
  h.storage.getCampaignMembership.mockImplementation(async (uid: string) =>
    uid === gm ? { userId: uid, role: "gm" } : { userId: uid, role: "player" },
  );
  h.storage.updateCampaign.mockResolvedValue({});
  h.storage.createChatMessage.mockImplementation(async (m: any) => ({ id: "chat1", ...m }));
});

async function connect(userId: string) {
  const ws = new WebSocket(wsUrl, { headers: { "x-test-user": userId } });
  const received: any[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
  ws.on("message", (raw) => {
    try { received.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  ws.send(JSON.stringify({ type: "join_campaign", campaignId }));
  await new Promise((r) => setTimeout(r, 150));
  return {
    ws,
    received,
    chats: () => received.filter((m) => m.type === "chat_message"),
    rolls: () => received.filter((m) => m.type === "roll_notification"),
    close: () => ws.close(),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 250));

describe("roll notifications reach chat", () => {
  it("logs an attack roll to the Adventure Log", async () => {
    const a = await connect(gm);
    const b = await connect(player);

    b.ws.send(JSON.stringify({
      type: "roll_notification",
      campaignId,
      notification: {
        type: "attack", dieType: "d20", label: "Longsword",
        result: 14, modifier: 3, total: 17, characterName: "Mara",
      },
    }));
    await settle();

    expect(h.storage.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      campaignId, type: "roll",
      sender: expect.stringContaining("Mara"),
    }));
    const logged = h.storage.createChatMessage.mock.calls[0][0].text;
    expect(logged).toContain("Longsword");
    expect(logged).toContain("17");

    a.close(); b.close();
  });

  // The roller doesn't get the notification back (they saw it locally), but
  // they do need the chat entry - otherwise the log reads differently for them.
  it("sends the chat entry to the roller as well as everyone else", async () => {
    const a = await connect(gm);
    const b = await connect(player);

    b.ws.send(JSON.stringify({
      type: "roll_notification",
      campaignId,
      notification: { type: "skill", dieType: "d20", label: "Stealth", result: 9, modifier: 1, total: 10 },
    }));
    await settle();

    expect(a.chats().length).toBe(1);
    expect(b.chats().length).toBe(1);
    // ...while the notification itself still skips the sender.
    expect(a.rolls().length).toBe(1);
    expect(b.rolls().length).toBe(0);

    a.close(); b.close();
  });

  it("logs a Swampy Duality roll with its outcome", async () => {
    const a = await connect(gm);
    const b = await connect(player);

    b.ws.send(JSON.stringify({
      type: "roll_notification",
      campaignId,
      notification: {
        type: "dice", dieType: "d12", label: "Agility — Success with Hope",
        result: 13, modifier: 2, total: 15, characterName: "Mara",
      },
    }));
    await settle();

    const logged = h.storage.createChatMessage.mock.calls[0][0].text;
    expect(logged).toContain("Success with Hope");
    expect(logged).toContain("15");

    a.close(); b.close();
  });

  // System notifications are UI chrome ("Not enough mana"), not rolls.
  it("does not log a system notification", async () => {
    const a = await connect(gm);
    const b = await connect(player);

    b.ws.send(JSON.stringify({
      type: "roll_notification",
      campaignId,
      notification: { type: "system", label: "Not Enough Mana", total: null },
    }));
    await settle();

    expect(h.storage.createChatMessage).not.toHaveBeenCalled();

    a.close(); b.close();
  });

  it("still reaches the table when the chat write fails", async () => {
    h.storage.createChatMessage.mockRejectedValue(new Error("db down"));
    const a = await connect(gm);
    const b = await connect(player);

    b.ws.send(JSON.stringify({
      type: "roll_notification",
      campaignId,
      notification: { type: "attack", dieType: "d20", label: "Longsword", result: 14, modifier: 3, total: 17 },
    }));
    await settle();

    expect(a.rolls().length).toBe(1);
    expect(a.chats().length).toBe(0);

    a.close(); b.close();
  });
});
