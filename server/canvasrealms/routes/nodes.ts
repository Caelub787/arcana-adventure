import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq, desc, sql, and, isNotNull } from "drizzle-orm";
import {
  db,
  nodesTable,
  foldersTable,
  realmsTable,
  realmCollaboratorsTable,
  nodeEditGrantsTable,
} from "@workspace/db";
import {
  ListNodesParams,
  ListNodesResponse,
  CreateNodeParams,
  CreateNodeBody,
  GetNodeParams,
  GetNodeResponse,
  UpdateNodeParams,
  UpdateNodeBody,
  UpdateNodeResponse,
  DeleteNodeParams,
  ListRecentNodesParams,
  ListRecentNodesResponse,
  ListTagCountsParams,
  ListTagCountsResponse,
  DuplicateNodeUnlinkedParams,
} from "@workspace/api-zod";
import {
  requireRealmAccess,
  requireRealmAccessByNode,
  requireNodeWriteAccess,
  resolveRealmRole,
  roleAtLeast,
  getGrantedNodeIds,
  userHasNodeGrant,
} from "../middlewares/auth";
import { storage } from "../../storage";
import {
  bumpInvalidation,
  ensureNodeWatched,
  syncBlocksWatched,
  dropNode,
} from "../realtime/doc-registry";
import { notifyNodeGrant } from "../realtime/server";
import { isArcanaKind, pushNodeToArcana, loadRealmCreds, buildClient } from "../lib/arcana";
import { logger } from "../lib/logger";
import type { SyncKind } from "@arcana/aa-sync-sdk";

const router: IRouter = Router();

// Crockford-ish base32 alphabet: no I, L, O, U so generated keys stay readable.
const KEY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_LENGTH = 8;

function generateRandomKey(): string {
  const buf = randomBytes(KEY_LENGTH);
  let out = "";
  for (let i = 0; i < KEY_LENGTH; i += 1) {
    out += KEY_ALPHABET[buf[i]! % KEY_ALPHABET.length];
  }
  return out;
}

/**
 * Generate a key that doesn't collide with any existing node key in
 * `realmId`. Retries up to a small number of times before giving up.
 */
export async function generateUniqueKeyForRealm(realmId: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateRandomKey();
    const [hit] = await db
      .select({ id: nodesTable.id })
      .from(nodesTable)
      .where(
        and(eq(nodesTable.realmId, realmId), eq(nodesTable.key, candidate)),
      );
    if (!hit) return candidate;
  }
  // Astronomically unlikely fallback: append timestamp suffix to guarantee uniqueness.
  return `${generateRandomKey()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Returns true if `folderId` exists and belongs to `realmId`. A null/undefined
 * input is considered valid (means "library root" / no change).
 */
async function folderBelongsToRealm(
  folderId: string | null | undefined,
  realmId: string,
): Promise<boolean> {
  if (folderId === null || folderId === undefined) return true;
  const [row] = await db
    .select({ realmId: foldersTable.realmId })
    .from(foldersTable)
    .where(eq(foldersTable.id, folderId));
  return !!row && row.realmId === realmId;
}

/**
 * Hide private nodes from realm viewers. Owners/editors see everything; a
 * viewer sees a private node only when they hold an explicit per-node edit
 * grant. Non-private nodes are always returned.
 */
async function filterPrivateForViewer<T extends { id: string; isPrivate: boolean }>(
  rows: T[],
  role: string | undefined,
  realmId: string,
  userId: string | undefined,
): Promise<T[]> {
  if (role && role !== "viewer") return rows;
  if (!rows.some((r) => r.isPrivate)) return rows;
  const granted =
    userId !== undefined
      ? await getGrantedNodeIds(realmId, userId)
      : new Set<string>();
  return rows.filter((r) => !r.isPrivate || granted.has(r.id));
}

router.get(
  "/realms/:realmId/nodes",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const params = ListNodesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.realmId, params.data.realmId))
      .orderBy(nodesTable.createdAt);
    const visible = await filterPrivateForViewer(
      rows,
      req.realmRole,
      params.data.realmId,
      req.userId,
    );
    res.json(ListNodesResponse.parse(visible));
  },
);

router.post(
  "/realms/:realmId/nodes",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const params = CreateNodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateNodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (
      !(await folderBelongsToRealm(
        parsed.data.folderId,
        params.data.realmId,
      ))
    ) {
      res
        .status(400)
        .json({ error: "folderId must belong to this realm" });
      return;
    }
    // Resolve a unique key for this node within the realm. If the caller
    // supplied an explicit `key`, validate it; otherwise auto-generate.
    let nodeKey: string;
    if (parsed.data.key !== undefined) {
      const trimmed = parsed.data.key.trim();
      if (!trimmed) {
        res
          .status(400)
          .json({ error: "Key cannot be empty", code: "key_empty" });
        return;
      }
      const [hit] = await db
        .select({ id: nodesTable.id })
        .from(nodesTable)
        .where(
          and(
            eq(nodesTable.realmId, params.data.realmId),
            eq(nodesTable.key, trimmed),
          ),
        );
      if (hit) {
        res
          .status(409)
          .json({
            error: "That key is already used by another node",
            code: "key_conflict",
          });
        return;
      }
      nodeKey = trimmed;
    } else {
      nodeKey = await generateUniqueKeyForRealm(params.data.realmId);
    }
    const [row] = await db
      .insert(nodesTable)
      .values({
        realmId: params.data.realmId,
        key: nodeKey,
        title: parsed.data.title,
        content: parsed.data.content ?? "",
        tags: parsed.data.tags ?? [],
        kind: parsed.data.kind ?? "note",
        mode: parsed.data.mode ?? "window",
        minimized: parsed.data.minimized ?? false,
        x: parsed.data.x ?? 0,
        y: parsed.data.y ?? 0,
        width: parsed.data.width ?? 320,
        height: parsed.data.height ?? 240,
        zIndex: parsed.data.zIndex ?? 1,
        color: parsed.data.color ?? "#7c5cff",
        folderId: parsed.data.folderId ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        blocks: parsed.data.blocks ?? [],
        isPrivate: parsed.data.isPrivate ?? false,
      })
      .returning();
    ensureNodeWatched(
      row.realmId,
      row.id,
      row.kind,
      row.content,
      row.blocks,
    );
    bumpInvalidation(row.realmId, "nodes");
    // Fire-and-forget push to Arcana for mappable kinds.
    if (isArcanaKind(row.kind)) {
      void pushNodeToArcana(row.realmId, row);
    }
    res.status(201).json(GetNodeResponse.parse(row));
  },
);

router.get(
  "/nodes/:nodeId",
  requireRealmAccessByNode("viewer"),
  async (req, res): Promise<void> => {
    const params = GetNodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.id, params.data.nodeId));
    if (!row) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    // A private node must not be opened directly by a realm viewer unless they
    // hold an explicit per-node edit grant. Return 404 (not 403) so its very
    // existence isn't leaked.
    if (
      row.isPrivate &&
      req.realmRole === "viewer" &&
      req.userId &&
      !(await userHasNodeGrant(row.id, req.userId))
    ) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    res.json(GetNodeResponse.parse(row));
  },
);

router.patch(
  "/nodes/:nodeId",
  requireNodeWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateNodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateNodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // A viewer editing via a per-node grant may only change content fields —
    // never the privacy flag and never move the node to another realm.
    if (req.nodeEditGranted) {
      delete (parsed.data as Record<string, unknown>).isPrivate;
      delete (parsed.data as Record<string, unknown>).realmId;
    }
    const [existingNode] = await db
      .select({ realmId: nodesTable.realmId })
      .from(nodesTable)
      .where(eq(nodesTable.id, params.data.nodeId));
    if (!existingNode) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    const previousRealmId = existingNode.realmId;
    // Resolve the effective destination realm. If realmId is being changed,
    // require editor access on the target realm.
    let effectiveRealmId = previousRealmId;
    if (
      parsed.data.realmId !== undefined &&
      parsed.data.realmId !== previousRealmId
    ) {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const targetRole = await resolveRealmRole(parsed.data.realmId, userId);
      if (!targetRole || !roleAtLeast(targetRole, "editor")) {
        res
          .status(403)
          .json({ error: "Forbidden on target realm" });
        return;
      }
      effectiveRealmId = parsed.data.realmId;
    }
    // If the caller is moving the node into/out of a folder (or moving
    // realms), make sure the destination folder belongs to the destination
    // realm. When moving realms without specifying a folder, drop folderId.
    let folderIdToWrite: string | null | undefined = parsed.data.folderId;
    if (folderIdToWrite !== undefined) {
      if (!(await folderBelongsToRealm(folderIdToWrite, effectiveRealmId))) {
        res
          .status(400)
          .json({ error: "folderId must belong to this realm" });
        return;
      }
    } else if (effectiveRealmId !== previousRealmId) {
      folderIdToWrite = null;
    }
    const updatePayload: Record<string, unknown> = { ...parsed.data };
    if (effectiveRealmId !== previousRealmId) {
      updatePayload.realmId = effectiveRealmId;
    } else {
      delete updatePayload.realmId;
    }
    if (folderIdToWrite !== undefined) {
      updatePayload.folderId = folderIdToWrite;
    }
    // Validate `key` if it's part of this patch: must be non-empty and
    // unique within the destination realm. Returns 4xx on conflict so the
    // client can show a popup and revert the field.
    let keyToCheck: string | undefined;
    if (parsed.data.key !== undefined) {
      const trimmed = parsed.data.key.trim();
      if (!trimmed) {
        res
          .status(400)
          .json({ error: "Key cannot be empty", code: "key_empty" });
        return;
      }
      keyToCheck = trimmed;
      updatePayload.key = trimmed;
    } else if (effectiveRealmId !== previousRealmId) {
      // Realm move without an explicit key change: the existing key needs
      // to be unique in the destination realm too, otherwise the DB unique
      // index would throw a generic 500. Pre-validate so we can return a
      // structured 409.
      const [current] = await db
        .select({ key: nodesTable.key })
        .from(nodesTable)
        .where(eq(nodesTable.id, params.data.nodeId));
      if (current) keyToCheck = current.key;
    }
    if (keyToCheck !== undefined) {
      const [hit] = await db
        .select({ id: nodesTable.id })
        .from(nodesTable)
        .where(
          and(
            eq(nodesTable.realmId, effectiveRealmId),
            eq(nodesTable.key, keyToCheck),
          ),
        );
      if (hit && hit.id !== params.data.nodeId) {
        res
          .status(409)
          .json({
            error: "That key is already used by another node",
            code: "key_conflict",
          });
        return;
      }
    }
    // If the user is renaming this node's key, capture the previous value
    // so we can rewrite [[OLDKEY]] references in other nodes' text blocks.
    let oldKey: string | undefined;
    if (
      parsed.data.key !== undefined &&
      keyToCheck !== undefined &&
      effectiveRealmId === previousRealmId
    ) {
      const [current] = await db
        .select({ key: nodesTable.key })
        .from(nodesTable)
        .where(eq(nodesTable.id, params.data.nodeId));
      if (current && current.key !== keyToCheck) oldKey = current.key;
    }
    const [row] = await db
      .update(nodesTable)
      .set(updatePayload)
      .where(eq(nodesTable.id, params.data.nodeId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    if (parsed.data.blocks !== undefined) {
      syncBlocksWatched(row.realmId, row.id, row.blocks);
    }
    // Cascade key rename through other nodes' text blocks. We rewrite
    // [[oldKey]] occurrences in any text block to [[newKey]] so wiki-style
    // references stay live after a rename.
    if (oldKey && oldKey !== row.key) {
      const updatedRealmId = row.realmId;
      const others = await db
        .select({
          id: nodesTable.id,
          kind: nodesTable.kind,
          blocks: nodesTable.blocks,
          content: nodesTable.content,
        })
        .from(nodesTable)
        .where(eq(nodesTable.realmId, updatedRealmId));
      const needle = `[[${oldKey}]]`;
      const replacement = `[[${row.key}]]`;
      for (const other of others) {
        if (other.id === row.id) continue;
        const blocks = (other.blocks ?? []) as Array<Record<string, unknown>>;
        let blocksTouched = false;
        const nextBlocks = blocks.map((b) => {
          if (b && b.type === "text" && typeof b.text === "string" && b.text.includes(needle)) {
            blocksTouched = true;
            return { ...b, text: (b.text as string).split(needle).join(replacement) };
          }
          return b;
        });
        // Map nodes store their pin notes & text-annotation labels in
        // `content` as a JSON blob — wiki-style refs there must follow
        // the same cascade so the chips stay live after a key rename.
        let nextContent: string | undefined;
        if (
          other.kind === "map" &&
          typeof other.content === "string" &&
          other.content.includes(needle)
        ) {
          try {
            const parsed = JSON.parse(other.content) as {
              pins?: Array<Record<string, unknown>>;
              annotations?: Array<Record<string, unknown>>;
              [k: string]: unknown;
            };
            let mapTouched = false;
            if (Array.isArray(parsed.pins)) {
              parsed.pins = parsed.pins.map((p) => {
                if (
                  p &&
                  typeof p.note === "string" &&
                  (p.note as string).includes(needle)
                ) {
                  mapTouched = true;
                  return {
                    ...p,
                    note: (p.note as string).split(needle).join(replacement),
                  };
                }
                return p;
              });
            }
            if (Array.isArray(parsed.annotations)) {
              parsed.annotations = parsed.annotations.map((a) => {
                if (!a) return a;
                let next = a;
                // Text-annotation labels.
                if (
                  next.type === "text" &&
                  typeof next.text === "string" &&
                  (next.text as string).includes(needle)
                ) {
                  mapTouched = true;
                  next = {
                    ...next,
                    text: (next.text as string).split(needle).join(replacement),
                  };
                }
                // Optional captions on shape annotations
                // (rect / circle / polygon / freehand path).
                if (
                  (next.type === "rect" ||
                    next.type === "circle" ||
                    next.type === "polygon" ||
                    next.type === "path") &&
                  typeof next.caption === "string" &&
                  (next.caption as string).includes(needle)
                ) {
                  mapTouched = true;
                  next = {
                    ...next,
                    caption: (next.caption as string)
                      .split(needle)
                      .join(replacement),
                  };
                }
                return next;
              });
            }
            if (mapTouched) nextContent = JSON.stringify(parsed);
          } catch {
            // Malformed map content — skip the cascade for this node
            // rather than corrupting it further.
          }
        }
        if (blocksTouched || nextContent !== undefined) {
          const updateSet: Record<string, unknown> = {};
          if (blocksTouched) updateSet.blocks = nextBlocks;
          if (nextContent !== undefined) updateSet.content = nextContent;
          await db
            .update(nodesTable)
            .set(updateSet)
            .where(eq(nodesTable.id, other.id));
          if (blocksTouched) {
            syncBlocksWatched(updatedRealmId, other.id, nextBlocks);
          }
        }
      }
    }
    bumpInvalidation(row.realmId, "nodes");
    if (previousRealmId !== row.realmId) {
      bumpInvalidation(previousRealmId, "nodes");
    }
    if (isArcanaKind(row.kind)) {
      void pushNodeToArcana(row.realmId, row);
    }
    res.json(UpdateNodeResponse.parse(row));
  },
);

router.delete(
  "/nodes/:nodeId",
  requireRealmAccessByNode("editor"),
  async (req, res): Promise<void> => {
    const params = DeleteNodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(nodesTable)
      .where(eq(nodesTable.id, params.data.nodeId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    dropNode(row.realmId, row.id);
    bumpInvalidation(row.realmId, "nodes");
    // Best-effort cascade delete on the Arcana side.
    if (isArcanaKind(row.kind)) {
      void (async () => {
        try {
          const creds = await loadRealmCreds(row.realmId);
          if (!creds) return;
          await buildClient(creds).delete(row.kind as SyncKind, row.id);
        } catch (err) {
          logger.warn({ err, nodeId: row.id }, "Arcana delete failed");
        }
      })();
    }
    res.sendStatus(204);
  },
);

router.post(
  "/nodes/:nodeId/duplicate-unlinked",
  requireRealmAccessByNode("editor"),
  async (req, res): Promise<void> => {
    const params = DuplicateNodeUnlinkedParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [src] = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.id, params.data.nodeId));
    if (!src) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    const dupKey = await generateUniqueKeyForRealm(src.realmId);
    const [row] = await db
      .insert(nodesTable)
      .values({
        realmId: src.realmId,
        key: dupKey,
        title: src.title,
        content: src.content,
        tags: src.tags,
        kind: src.kind,
        mode: src.mode,
        minimized: src.minimized,
        x: src.x + 24,
        y: src.y + 24,
        width: src.width,
        height: src.height,
        zIndex: src.zIndex,
        color: src.color,
        arcanaSync: false,
        arcanaStats: null,
      })
      .returning();
    ensureNodeWatched(row.realmId, row.id, row.kind, row.content);
    bumpInvalidation(row.realmId, "nodes");
    res.status(201).json(GetNodeResponse.parse(row));
  },
);

router.get(
  "/realms/:realmId/recent-nodes",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const params = ListRecentNodesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.realmId, params.data.realmId))
      .orderBy(desc(nodesTable.updatedAt))
      .limit(40);
    const visible = (
      await filterPrivateForViewer(
        rows,
        req.realmRole,
        params.data.realmId,
        req.userId,
      )
    ).slice(0, 8);
    res.json(ListRecentNodesResponse.parse(visible));
  },
);

router.get(
  "/realms/:realmId/tag-counts",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const params = ListTagCountsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Viewers must not see tag counts that include private nodes they can't
    // access, so for them we count in JS over the visibility-filtered set.
    if (req.realmRole === "viewer") {
      const nodeRows = await db
        .select({
          id: nodesTable.id,
          tags: nodesTable.tags,
          isPrivate: nodesTable.isPrivate,
        })
        .from(nodesTable)
        .where(eq(nodesTable.realmId, params.data.realmId));
      const visible = await filterPrivateForViewer(
        nodeRows,
        req.realmRole,
        params.data.realmId,
        req.userId,
      );
      const counts = new Map<string, number>();
      for (const n of visible) {
        for (const tag of n.tags ?? []) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      const result = Array.from(counts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
      res.json(ListTagCountsResponse.parse(result));
      return;
    }
    const rows = await db
      .select({
        tag: sql<string>`unnest(${nodesTable.tags})`.as("tag"),
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(nodesTable)
      .where(eq(nodesTable.realmId, params.data.realmId))
      .groupBy(sql`tag`)
      .orderBy(sql`count desc`);
    res.json(ListTagCountsResponse.parse(rows));
  },
);

/**
 * Resolve the set of users who can be granted per-node edit access on a realm:
 * campaign players (when the realm is the campaign's auto-realm or is linked to
 * a campaign) plus accepted viewer collaborators. Owners/editors/GMs are
 * excluded since they already have write access.
 */
async function getGrantCandidates(
  realmId: string,
): Promise<Array<{ userId: string; name: string; source: string }>> {
  const [realm] = await db
    .select({
      id: realmsTable.id,
      linkedCampaignId: realmsTable.linkedCampaignId,
    })
    .from(realmsTable)
    .where(eq(realmsTable.id, realmId));
  const map = new Map<string, { userId: string; name: string; source: string }>();
  const campaignId = realm?.linkedCampaignId ?? realm?.id;
  if (campaignId) {
    try {
      const members = await storage.getCampaignMembers(campaignId);
      for (const m of members) {
        if (m.role === "player" && m.userId) {
          map.set(m.userId, {
            userId: m.userId,
            name: m.username ?? m.userId,
            source: "player",
          });
        }
      }
    } catch {
      // campaignId wasn't a real campaign — no campaign-based candidates.
    }
  }
  const collabs = await db
    .select({
      userId: realmCollaboratorsTable.userId,
      invitedEmail: realmCollaboratorsTable.invitedEmail,
    })
    .from(realmCollaboratorsTable)
    .where(
      and(
        eq(realmCollaboratorsTable.realmId, realmId),
        eq(realmCollaboratorsTable.role, "viewer"),
        isNotNull(realmCollaboratorsTable.acceptedAt),
        isNotNull(realmCollaboratorsTable.userId),
      ),
    );
  for (const c of collabs) {
    if (!c.userId) continue;
    if (map.has(c.userId)) continue;
    const u = await storage.getUser(c.userId);
    map.set(c.userId, {
      userId: c.userId,
      name: u?.username ?? c.invitedEmail ?? c.userId,
      source: "collaborator",
    });
  }
  return Array.from(map.values());
}

// List users who may be granted per-node edit access on this realm.
router.get(
  "/realms/:realmId/grant-candidates",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const realmId = req.params.realmId;
    if (!realmId) {
      res.status(400).json({ error: "Missing realmId" });
      return;
    }
    res.json(await getGrantCandidates(realmId));
  },
);

// List the per-node edit grants on a node (with display names).
router.get(
  "/nodes/:nodeId/grants",
  requireRealmAccessByNode("editor"),
  async (req, res): Promise<void> => {
    const nodeId = req.params.nodeId;
    const grants = await db
      .select({ userId: nodeEditGrantsTable.userId })
      .from(nodeEditGrantsTable)
      .where(eq(nodeEditGrantsTable.nodeId, nodeId));
    const withNames = await Promise.all(
      grants.map(async (g) => {
        const u = await storage.getUser(g.userId);
        return { userId: g.userId, name: u?.username ?? g.userId };
      }),
    );
    res.json(withNames);
  },
);

// Grant a user per-node edit access (idempotent).
router.put(
  "/nodes/:nodeId/grants/:userId",
  requireRealmAccessByNode("editor"),
  async (req, res): Promise<void> => {
    const { nodeId, userId } = req.params;
    const target = await storage.getUser(userId);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const inserted = await db
      .insert(nodeEditGrantsTable)
      .values({ nodeId, userId })
      .onConflictDoNothing()
      .returning({ id: nodeEditGrantsTable.id });
    // Only notify on a brand-new grant (idempotent re-grants stay quiet).
    if (inserted.length > 0) {
      const [node] = await db
        .select({ realmId: nodesTable.realmId, title: nodesTable.title })
        .from(nodesTable)
        .where(eq(nodesTable.id, nodeId));
      if (node) {
        try {
          notifyNodeGrant(node.realmId, userId, nodeId, node.title);
        } catch (err) {
          logger.warn({ err }, "notifyNodeGrant failed");
        }
      }
    }
    res.status(201).json({ nodeId, userId });
  },
);

// Revoke a user's per-node edit access.
router.delete(
  "/nodes/:nodeId/grants/:userId",
  requireRealmAccessByNode("editor"),
  async (req, res): Promise<void> => {
    const { nodeId, userId } = req.params;
    await db
      .delete(nodeEditGrantsTable)
      .where(
        and(
          eq(nodeEditGrantsTable.nodeId, nodeId),
          eq(nodeEditGrantsTable.userId, userId),
        ),
      );
    res.sendStatus(204);
  },
);

// Report the caller's effective access to a single node (used by the client to
// gate inline editing / privacy & grant controls).
router.get(
  "/nodes/:nodeId/my-access",
  requireRealmAccessByNode("viewer"),
  async (req, res): Promise<void> => {
    const nodeId = req.params.nodeId;
    const userId = req.userId!;
    const role = req.realmRole!;
    const [row] = await db
      .select({ isPrivate: nodesTable.isPrivate })
      .from(nodesTable)
      .where(eq(nodesTable.id, nodeId));
    if (!row) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    const canManage = roleAtLeast(role, "editor");
    const granted = canManage ? false : await userHasNodeGrant(nodeId, userId);
    res.json({
      role,
      isPrivate: row.isPrivate,
      canManage,
      canEdit: canManage || granted,
      canView: canManage || !row.isPrivate || granted,
      granted,
    });
  },
);

export default router;
