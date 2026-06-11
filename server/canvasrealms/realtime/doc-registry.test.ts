import { describe, it, expect, beforeEach, vi } from "vitest";
import * as Y from "yjs";

/**
 * In-memory stand-in for the `nodes` table that the doc-registry persists
 * into. Keyed by node id. The registry queries by realmId (list) and by id
 * (single), and updates `content` and `blocks`. We mock just enough of the
 * drizzle query builder + the schema sentinels to support those calls.
 */
type FakeNodeRow = {
  id: string;
  realmId: string;
  kind: string;
  content: string;
  blocks: unknown[];
};

const nodeStore = new Map<string, FakeNodeRow>();
const memberStore = new Map<string, unknown[]>(); // canvasNodeId -> rows

const NODES_TABLE = { __table: "nodes" } as const;
const CANVAS_MEMBERS_TABLE = { __table: "canvas_members" } as const;

type Cond =
  | { __op: "eq"; col: string; val: unknown }
  | { __op: "and"; conds: Cond[] };

function evalCond(row: Record<string, unknown>, cond: Cond): boolean {
  if (cond.__op === "eq") return row[cond.col] === cond.val;
  return cond.conds.every((c) => evalCond(row, c));
}

function selectFrom(table: { __table: string }) {
  return {
    where: async (cond: Cond) => {
      if (table.__table === "nodes") {
        return Array.from(nodeStore.values()).filter((r) =>
          evalCond(r as unknown as Record<string, unknown>, cond),
        );
      }
      if (table.__table === "canvas_members") {
        const all: Record<string, unknown>[] = [];
        for (const rows of memberStore.values()) {
          all.push(...(rows as Record<string, unknown>[]));
        }
        return all.filter((r) => evalCond(r, cond));
      }
      return [];
    },
  };
}

const fakeDb = {
  select: () => ({ from: (table: { __table: string }) => selectFrom(table) }),
  update: (table: { __table: string }) => ({
    set: (values: Record<string, unknown>) => ({
      where: async (cond: Cond) => {
        if (table.__table !== "nodes") return;
        for (const row of nodeStore.values()) {
          if (evalCond(row as unknown as Record<string, unknown>, cond)) {
            Object.assign(row, values);
          }
        }
      },
    }),
  }),
};

vi.mock("@workspace/db", () => ({
  db: fakeDb,
  nodesTable: new Proxy(NODES_TABLE, {
    get(target, prop) {
      if (prop === "__table") return target.__table;
      return prop;
    },
  }),
  canvasMembersTable: new Proxy(CANVAS_MEMBERS_TABLE, {
    get(target, prop) {
      if (prop === "__table") return target.__table;
      return prop;
    },
  }),
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({
    __op: "eq",
    col: String(col),
    val,
  }),
  and: (...conds: Cond[]) => ({ __op: "and", conds }),
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// Import AFTER mocks are registered.
const registry = await import("./doc-registry");
const {
  getOrCreateRealmDoc,
  ensureNodeWatched,
  syncBlocksWatched,
  __resetForTests,
} = registry;

const REALM_ID = "11111111-1111-1111-1111-111111111111";
const NODE_ID = "22222222-2222-2222-2222-222222222222";
const BLOCK_ID = "block-aaa";

/** Mirror y-websocket-style sync: copy state vector across two docs. */
function sync(a: Y.Doc, b: Y.Doc) {
  const svA = Y.encodeStateVector(a);
  const svB = Y.encodeStateVector(b);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, svB));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, svA));
}

/** Wait long enough for the registry's debounced flush to fire and the
 * fake db updates to settle. The registry uses an 800ms debounce. */
function waitForFlush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 1100));
}

beforeEach(() => {
  __resetForTests();
  nodeStore.clear();
  memberStore.clear();
});

describe("realtime text co-editing (doc-registry)", () => {
  it("does not double-seed when two server entry points race to seed the same brand-new text block", async () => {
    // The server has three places that can seed a per-block Y.Text from
    // the DB-backed `blocks` payload: hydrateRealm (on first WS connect),
    // ensureNodeWatched (REST POST /nodes), and syncBlocksWatched (REST
    // PATCH /nodes/:id). The registry's "no double-seed" contract is
    // that only the FIRST one to touch an empty Y.Text inserts the seed
    // — the others must observe length>0 and skip. Without the guard,
    // two simultaneous server entry points would each insert the seed
    // and the merged length would be 2x SEED.length.
    const SEED = "hello world";
    nodeStore.set(NODE_ID, {
      id: NODE_ID,
      realmId: REALM_ID,
      kind: "note",
      content: "",
      blocks: [{ id: BLOCK_ID, type: "text", text: SEED }],
    });

    // Entry point #1: a WS connection arrives and we boot a realm doc,
    // which kicks off hydrateRealm against the DB.
    const serverDoc = getOrCreateRealmDoc(REALM_ID);
    await waitForFlush();

    // Entry point #2: a near-simultaneous REST POST (or a stale PATCH)
    // calls ensureNodeWatched / syncBlocksWatched with the same blocks
    // payload. If either one ignored the length guard, the seeded text
    // would be inserted twice into the same Y.Text.
    ensureNodeWatched(REALM_ID, NODE_ID, "note", "", [
      { id: BLOCK_ID, type: "text", text: SEED },
    ]);
    syncBlocksWatched(REALM_ID, NODE_ID, [
      { id: BLOCK_ID, type: "text", text: SEED },
    ]);

    // Two clients connect after all server-side seeding has settled.
    const clientA = new Y.Doc();
    const clientB = new Y.Doc();
    sync(serverDoc, clientA);
    sync(serverDoc, clientB);

    const textA = clientA.getText(`node:${NODE_ID}:block:${BLOCK_ID}`);
    const textB = clientB.getText(`node:${NODE_ID}:block:${BLOCK_ID}`);
    const serverText = serverDoc.getText(`node:${NODE_ID}:block:${BLOCK_ID}`);

    // Exactly one copy of SEED on every peer. A double-seed regression
    // would surface here as "hello worldhello world".
    expect(serverText.toString()).toBe(SEED);
    expect(textA.toString()).toBe(SEED);
    expect(textB.toString()).toBe(SEED);

    // The debounced flush must not write a duplicated value back to the
    // DB either.
    await waitForFlush();
    const persistedBlock = (nodeStore.get(NODE_ID)!.blocks as Array<{
      id: string;
      type: string;
      text: string;
    }>)[0];
    expect(persistedBlock.text).toBe(SEED);
  });

  it("persists edits from two clients and recovers them after a server restart", async () => {
    nodeStore.set(NODE_ID, {
      id: NODE_ID,
      realmId: REALM_ID,
      kind: "note",
      content: "",
      blocks: [{ id: BLOCK_ID, type: "text", text: "" }],
    });

    // --- Session 1: two clients edit concurrently ---
    const serverDoc = getOrCreateRealmDoc(REALM_ID);
    // Make sure the watcher for this block is attached from the REST
    // create-node path equivalent.
    ensureNodeWatched(REALM_ID, NODE_ID, "note", "", [
      { id: BLOCK_ID, type: "text", text: "" },
    ]);
    await waitForFlush();

    const clientA = new Y.Doc();
    const clientB = new Y.Doc();
    sync(serverDoc, clientA);
    sync(serverDoc, clientB);

    const textA = clientA.getText(`node:${NODE_ID}:block:${BLOCK_ID}`);
    const textB = clientB.getText(`node:${NODE_ID}:block:${BLOCK_ID}`);

    // Concurrent inserts at offset 0 from each client.
    textA.insert(0, "AAA");
    textB.insert(0, "BBB");

    // Bidirectional sync: client -> server -> client.
    sync(clientA, serverDoc);
    sync(clientB, serverDoc);
    sync(serverDoc, clientA);
    sync(serverDoc, clientB);

    // Yjs CRDT guarantees both clients (and the server) converge to the
    // same string, with all 6 characters present.
    const serverText = serverDoc.getText(`node:${NODE_ID}:block:${BLOCK_ID}`);
    const merged = serverText.toString();
    expect(merged.length).toBe(6);
    expect(merged.split("").sort().join("")).toBe("AAABBB");
    expect(textA.toString()).toBe(merged);
    expect(textB.toString()).toBe(merged);

    // Wait for the debounced flush to write nodes.blocks back to the DB.
    await waitForFlush();
    const persisted = nodeStore.get(NODE_ID)!;
    const persistedBlock = (persisted.blocks as Array<{
      id: string;
      type: string;
      text: string;
    }>)[0];
    expect(persistedBlock.text).toBe(merged);

    // --- "Restart" the server ---
    __resetForTests();
    clientA.destroy();
    clientB.destroy();

    // --- Session 2: a fresh client reconnects ---
    const serverDoc2 = getOrCreateRealmDoc(REALM_ID);
    await waitForFlush();

    const clientC = new Y.Doc();
    sync(serverDoc2, clientC);
    const textC = clientC.getText(`node:${NODE_ID}:block:${BLOCK_ID}`);
    expect(textC.toString()).toBe(merged);

    // And the server's hydrated copy matches what the DB had after flush —
    // i.e. nothing got lost across the restart.
    const serverTextAfter = serverDoc2.getText(
      `node:${NODE_ID}:block:${BLOCK_ID}`,
    );
    expect(serverTextAfter.toString()).toBe(merged);

    // syncBlocksWatched (the REST PATCH path) must also be a no-op when the
    // persisted block text already matches the live Y.Text — i.e. it must
    // not re-seed and double the content.
    syncBlocksWatched(REALM_ID, NODE_ID, persisted.blocks);
    expect(serverTextAfter.toString()).toBe(merged);
  });
});
