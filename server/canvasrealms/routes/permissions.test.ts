import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";

// ===========================================================================
// Canvas Realms — per-node privacy & per-player edit-grant permission tests.
// ---------------------------------------------------------------------------
// These exercise the REAL middleware + route logic against the REAL Canvas
// Realms tables (realms / nodes / node_edit_grants / realm_collaborators). The
// only thing we stub is the host-side "shared world/campaign" bridge in
// server/worldAccess.ts, so the campaign-linked-member path is deterministic
// without provisioning host campaign rows. Every fixture is namespaced with a
// per-run UUID and torn down afterward, so the suite is self-contained.
// ===========================================================================

// Host bridge stub: resolveRealmRole() falls through to these for users that
// are neither the owner nor an accepted collaborator. Default: deny. Individual
// tests override checkCampaignAccessShared to model a campaign-linked member.
const worldAccessMock = vi.hoisted(() => ({
  checkWorldAccessShared: vi.fn(async () => ({
    allowed: false,
    isOwner: false,
  })),
  checkCampaignAccessShared: vi.fn(async () => ({
    allowed: false,
    isOwner: false,
  })),
}));

vi.mock("../../worldAccess", () => worldAccessMock);

// Imported after the mock is registered so auth.ts binds to the stub.
import { db, realmsTable, nodesTable, nodeEditGrantsTable, realmCollaboratorsTable } from "@workspace/db";
import realmsRouter from "./realms";
import nodesRouter from "./nodes";

const RUN = randomUUID().slice(0, 8);

// Distinct user ids for each role under test.
const OWNER = `u-owner-${RUN}`;
const EDITOR = `u-editor-${RUN}`;
const VIEWER = `u-viewer-${RUN}`;
const GRANTED = `u-granted-${RUN}`;
const OUTSIDER = `u-outsider-${RUN}`;
const CAMPAIGN_MEMBER = `u-campaign-${RUN}`;

const LINKED_CAMPAIGN_ID = `campaign-${RUN}`;

// Fixture ids, populated in beforeAll.
let realmId: string;
let linkedRealmId: string;
let publicNodeId: string;
let privateNodeId: string;
// A second private node used only by mutation tests, so toggling its state
// never contaminates the read-filtering assertions on privateNodeId.
let togglePrivateNodeId: string;

let server: Server;
let baseUrl: string;

// Issue a request as a given user (or anonymous when userId is undefined).
async function asUser(
  userId: string | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (userId) headers["x-test-user"] = userId;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

async function seedNode(opts: {
  realmId: string;
  key: string;
  title: string;
  isPrivate: boolean;
  tags?: string[];
}): Promise<string> {
  const [row] = await db
    .insert(nodesTable)
    .values({
      realmId: opts.realmId,
      key: opts.key,
      title: opts.title,
      kind: "note",
      isPrivate: opts.isPrivate,
      tags: opts.tags ?? [],
    })
    .returning({ id: nodesTable.id });
  return row.id;
}

beforeAll(async () => {
  // --- realms ---
  const [realm] = await db
    .insert(realmsTable)
    .values({
      name: `Perm Test Realm ${RUN}`,
      slug: `perm-test-${RUN}`,
      ownerUserId: OWNER,
    })
    .returning({ id: realmsTable.id });
  realmId = realm.id;

  const [linked] = await db
    .insert(realmsTable)
    .values({
      name: `Perm Linked Realm ${RUN}`,
      slug: `perm-linked-${RUN}`,
      ownerUserId: OWNER,
      linkedCampaignId: LINKED_CAMPAIGN_ID,
    })
    .returning({ id: realmsTable.id });
  linkedRealmId = linked.id;

  // --- collaborators on the main realm ---
  await db.insert(realmCollaboratorsTable).values([
    {
      realmId,
      userId: EDITOR,
      role: "editor",
      acceptedAt: new Date(),
    },
    {
      realmId,
      userId: VIEWER,
      role: "viewer",
      acceptedAt: new Date(),
    },
    {
      realmId,
      userId: GRANTED,
      role: "viewer",
      acceptedAt: new Date(),
    },
  ]);

  // --- nodes on the main realm ---
  publicNodeId = await seedNode({
    realmId,
    key: "PUBLIC1",
    title: "Public Node",
    isPrivate: false,
    tags: ["shared", "lore"],
  });
  privateNodeId = await seedNode({
    realmId,
    key: "PRIVATE1",
    title: "Private Node",
    isPrivate: true,
    tags: ["secret", "lore"],
  });
  togglePrivateNodeId = await seedNode({
    realmId,
    key: "TOGGLE1",
    title: "Toggle Node",
    isPrivate: true,
    tags: ["gm-only"],
  });

  // --- nodes on the linked realm (for the campaign-bridge tests) ---
  await seedNode({
    realmId: linkedRealmId,
    key: "LPUB1",
    title: "Linked Public",
    isPrivate: false,
  });
  await seedNode({
    realmId: linkedRealmId,
    key: "LPRIV1",
    title: "Linked Private",
    isPrivate: true,
  });

  // --- per-node edit grant: GRANTED viewer can edit the private node ---
  await db.insert(nodeEditGrantsTable).values({
    nodeId: privateNodeId,
    userId: GRANTED,
  });

  // --- express app wiring the real routers ---
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { error: () => {}, warn: () => {} };
    const u = req.headers["x-test-user"];
    if (typeof u === "string" && u) {
      (req as any).userId = u;
      (req as any).session = { userId: u };
    }
    next();
  });
  app.use(realmsRouter);
  app.use(nodesRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  // Cascade deletes nodes / grants / collaborators via FK onDelete: cascade.
  if (realmId || linkedRealmId) {
    const ids = [realmId, linkedRealmId].filter(Boolean) as string[];
    await db.delete(realmsTable).where(inArray(realmsTable.id, ids));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  worldAccessMock.checkWorldAccessShared.mockResolvedValue({
    allowed: false,
    isOwner: false,
  });
  worldAccessMock.checkCampaignAccessShared.mockReset();
  worldAccessMock.checkCampaignAccessShared.mockResolvedValue({
    allowed: false,
    isOwner: false,
  });
});

describe("CR node privacy — list / get filtering for viewers", () => {
  it("hides a private node from a plain viewer when listing", async () => {
    const { status, json } = await asUser(VIEWER, "GET", `/realms/${realmId}/nodes`);
    expect(status).toBe(200);
    const ids = json.map((n: any) => n.id);
    expect(ids).toContain(publicNodeId);
    expect(ids).not.toContain(privateNodeId);
    expect(ids).not.toContain(togglePrivateNodeId);
  });

  it("returns 404 (not 403) when a viewer GETs a private node directly", async () => {
    const { status } = await asUser(VIEWER, "GET", `/nodes/${privateNodeId}`);
    expect(status).toBe(404);
  });

  it("lets a viewer GET a public node", async () => {
    const { status, json } = await asUser(VIEWER, "GET", `/nodes/${publicNodeId}`);
    expect(status).toBe(200);
    expect(json.id).toBe(publicNodeId);
  });

  it("denies an outsider (no role) any realm read", async () => {
    const { status } = await asUser(OUTSIDER, "GET", `/realms/${realmId}/nodes`);
    expect(status).toBe(403);
  });

  it("rejects an anonymous request with 401", async () => {
    const { status } = await asUser(undefined, "GET", `/realms/${realmId}/nodes`);
    expect(status).toBe(401);
  });
});

describe("CR node privacy — granted viewer sees the granted private node", () => {
  it("includes the granted private node in the list", async () => {
    const { status, json } = await asUser(GRANTED, "GET", `/realms/${realmId}/nodes`);
    expect(status).toBe(200);
    const ids = json.map((n: any) => n.id);
    expect(ids).toContain(publicNodeId);
    expect(ids).toContain(privateNodeId);
    // The grant is node-specific: a different private node stays hidden.
    expect(ids).not.toContain(togglePrivateNodeId);
  });

  it("lets the granted viewer GET the granted private node", async () => {
    const { status, json } = await asUser(GRANTED, "GET", `/nodes/${privateNodeId}`);
    expect(status).toBe(200);
    expect(json.id).toBe(privateNodeId);
  });
});

describe("CR node write — granted viewer is content-only", () => {
  it("lets a granted viewer edit content fields", async () => {
    const newTitle = `Edited by grantee ${RUN}`;
    const { status, json } = await asUser(GRANTED, "PATCH", `/nodes/${privateNodeId}`, {
      title: newTitle,
      content: "grantee content",
    });
    expect(status).toBe(200);
    expect(json.title).toBe(newTitle);
    expect(json.content).toBe("grantee content");
  });

  it("ignores a granted viewer's attempt to flip isPrivate", async () => {
    const { status, json } = await asUser(GRANTED, "PATCH", `/nodes/${privateNodeId}`, {
      isPrivate: false,
      title: "still private",
    });
    expect(status).toBe(200);
    // isPrivate must be stripped from the patch — node stays private.
    expect(json.isPrivate).toBe(true);
    expect(json.title).toBe("still private");
  });

  it("ignores a granted viewer's attempt to move the node to another realm", async () => {
    const { status, json } = await asUser(GRANTED, "PATCH", `/nodes/${privateNodeId}`, {
      realmId: linkedRealmId,
      content: "no realm move",
    });
    expect(status).toBe(200);
    // realmId must be stripped — node stays in the original realm.
    expect(json.realmId).toBe(realmId);
    expect(json.content).toBe("no realm move");
  });

  it("denies a plain viewer (no grant) any node write", async () => {
    const { status } = await asUser(VIEWER, "PATCH", `/nodes/${publicNodeId}`, {
      title: "viewer should not write",
    });
    expect(status).toBe(403);
  });
});

describe("CR node write — editor / owner are unaffected", () => {
  it("lets an editor toggle a node's privacy", async () => {
    const { status, json } = await asUser(EDITOR, "PATCH", `/nodes/${togglePrivateNodeId}`, {
      isPrivate: false,
    });
    expect(status).toBe(200);
    expect(json.isPrivate).toBe(false);
    // Restore so other assertions on this node's privacy stay valid.
    await db
      .update(nodesTable)
      .set({ isPrivate: true })
      .where(eq(nodesTable.id, togglePrivateNodeId));
  });

  it("lets an editor see every node including private ones", async () => {
    const { status, json } = await asUser(EDITOR, "GET", `/realms/${realmId}/nodes`);
    expect(status).toBe(200);
    const ids = json.map((n: any) => n.id);
    expect(ids).toContain(publicNodeId);
    expect(ids).toContain(privateNodeId);
    expect(ids).toContain(togglePrivateNodeId);
  });

  it("lets the owner see every node and GET a private node", async () => {
    const list = await asUser(OWNER, "GET", `/realms/${realmId}/nodes`);
    expect(list.status).toBe(200);
    const ids = list.json.map((n: any) => n.id);
    expect(ids).toContain(privateNodeId);

    const get = await asUser(OWNER, "GET", `/nodes/${privateNodeId}`);
    expect(get.status).toBe(200);
    expect(get.json.id).toBe(privateNodeId);
  });
});

describe("CR campaign-linked member resolves to viewer", () => {
  it("grants read-only viewer access via the campaign bridge (private hidden)", async () => {
    worldAccessMock.checkCampaignAccessShared.mockImplementation(
      async (_userId: string, campaignId: string) => ({
        allowed: campaignId === LINKED_CAMPAIGN_ID,
        isOwner: false,
      }),
    );
    const { status, json } = await asUser(
      CAMPAIGN_MEMBER,
      "GET",
      `/realms/${linkedRealmId}/nodes`,
    );
    expect(status).toBe(200);
    const titles = json.map((n: any) => n.title);
    expect(titles).toContain("Linked Public");
    // Campaign member is only a viewer — private linked node is hidden.
    expect(titles).not.toContain("Linked Private");
  });

  it("denies a campaign-linked viewer any node write", async () => {
    worldAccessMock.checkCampaignAccessShared.mockImplementation(
      async (_userId: string, campaignId: string) => ({
        allowed: campaignId === LINKED_CAMPAIGN_ID,
        isOwner: false,
      }),
    );
    const list = await asUser(CAMPAIGN_MEMBER, "GET", `/realms/${linkedRealmId}/nodes`);
    const target = list.json.find((n: any) => n.title === "Linked Public");
    const { status } = await asUser(CAMPAIGN_MEMBER, "PATCH", `/nodes/${target.id}`, {
      title: "member cannot write",
    });
    expect(status).toBe(403);
  });
});

describe("CR aggregations respect grants", () => {
  it("tag-counts exclude private nodes for a plain viewer", async () => {
    const { status, json } = await asUser(VIEWER, "GET", `/realms/${realmId}/tag-counts`);
    expect(status).toBe(200);
    const tags = Object.fromEntries(json.map((t: any) => [t.tag, t.count]));
    // "secret" only lives on the private node — must not appear for a viewer.
    expect(tags["secret"]).toBeUndefined();
    expect(tags["gm-only"]).toBeUndefined();
    // The public node's tags are counted.
    expect(tags["shared"]).toBe(1);
    // "lore" is on both public + private; the viewer only counts the public one.
    expect(tags["lore"]).toBe(1);
  });

  it("tag-counts include a granted viewer's granted private node", async () => {
    const { status, json } = await asUser(GRANTED, "GET", `/realms/${realmId}/tag-counts`);
    expect(status).toBe(200);
    const tags = Object.fromEntries(json.map((t: any) => [t.tag, t.count]));
    expect(tags["secret"]).toBe(1);
    // "lore" now counts both the public and the granted private node.
    expect(tags["lore"]).toBe(2);
    // Still no access to the un-granted private node's tag.
    expect(tags["gm-only"]).toBeUndefined();
  });

  it("tag-counts include every node for an editor", async () => {
    const { status, json } = await asUser(EDITOR, "GET", `/realms/${realmId}/tag-counts`);
    expect(status).toBe(200);
    const tags = Object.fromEntries(json.map((t: any) => [t.tag, t.count]));
    expect(tags["secret"]).toBe(1);
    expect(tags["gm-only"]).toBe(1);
    expect(tags["lore"]).toBe(2);
  });

  it("summary node count excludes private nodes for a plain viewer", async () => {
    const { status, json } = await asUser(VIEWER, "GET", `/realms/${realmId}/summary`);
    expect(status).toBe(200);
    // Only the public node is visible to a plain viewer.
    expect(json.nodeCount).toBe(1);
  });

  it("summary node count includes a granted viewer's granted node", async () => {
    const { status, json } = await asUser(GRANTED, "GET", `/realms/${realmId}/summary`);
    expect(status).toBe(200);
    // Public + the one granted private node.
    expect(json.nodeCount).toBe(2);
  });

  it("summary node count includes every node for the owner", async () => {
    const { status, json } = await asUser(OWNER, "GET", `/realms/${realmId}/summary`);
    expect(status).toBe(200);
    expect(json.nodeCount).toBe(3);
  });
});
