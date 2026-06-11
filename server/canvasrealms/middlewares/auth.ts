import type { Request, Response, NextFunction, RequestHandler } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  realmsTable,
  realmCollaboratorsTable,
  nodesTable,
  nodeEditGrantsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  checkWorldAccessShared,
  checkCampaignAccessShared,
} from "../../worldAccess";

export type RealmRole = "owner" | "editor" | "viewer";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      realmRole?: RealmRole;
      // Set by requireNodeWriteAccess when a realm *viewer* is allowed to write
      // a specific node only because they hold an explicit per-node edit grant
      // (not realm-wide editor access). Routes use this to restrict what such a
      // user may change (content only — never privacy or realm-move).
      nodeEditGranted?: boolean;
      log: typeof logger;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

/**
 * Resolve the caller's role on a given realm.
 * Returns "owner" if the realm's owner_user_id matches, otherwise the role on
 * an accepted collaborator row, otherwise null.
 */
export async function resolveRealmRole(
  realmId: string,
  userId: string,
): Promise<RealmRole | null> {
  const [realm] = await db
    .select({
      ownerUserId: realmsTable.ownerUserId,
      linkedCampaignId: realmsTable.linkedCampaignId,
    })
    .from(realmsTable)
    .where(eq(realmsTable.id, realmId));
  if (!realm) return null;
  if (realm.ownerUserId === userId) return "owner";
  // Only consider rows that have actually been accepted — pending invites
  // (userId may match if the row was attached but never accepted) must not
  // grant access at the authz boundary.
  const [collab] = await db
    .select({ role: realmCollaboratorsTable.role })
    .from(realmCollaboratorsTable)
    .where(
      and(
        eq(realmCollaboratorsTable.realmId, realmId),
        eq(realmCollaboratorsTable.userId, userId),
        isNotNull(realmCollaboratorsTable.acceptedAt),
      ),
    );
  if (collab) return collab.role as RealmRole;
  // Shared-world bridge: a standalone realm linked to a host campaign grants
  // read-only (viewer) access to every member of that campaign — including the
  // campaign's GM, unless they are the realm owner (handled above). This lets a
  // GM share one of their own worlds with their players.
  if (realm.linkedCampaignId) {
    const linkedAccess = await checkCampaignAccessShared(
      userId,
      realm.linkedCampaignId,
    );
    if (linkedAccess.allowed) return "viewer";
  }
  // Host bridge: the campaign-embedded World Builder realm reuses the host
  // campaign id as the realm id, so campaign GMs/players inherit access from
  // campaign membership without an explicit CR collaborator row. Full-authority
  // host users (GM / assistant GM / admin) map to "editor"; plain members to
  // "viewer". A legacy world-id bridge is kept for defensiveness. For standalone
  // CR realms (no matching campaign or world) both return not-allowed → null.
  const campaignAccess = await checkCampaignAccessShared(userId, realmId);
  if (campaignAccess.allowed) {
    return campaignAccess.isOwner ? "editor" : "viewer";
  }
  const access = await checkWorldAccessShared(userId, realmId);
  if (access.allowed) return access.isOwner ? "editor" : "viewer";
  return null;
}

const ROLE_RANK: Record<RealmRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function roleAtLeast(role: RealmRole, min: RealmRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Build a middleware that extracts realmId from the route params and asserts
 * the caller has at least the requested role on that realm.
 */
export function requireRealmAccess(
  minRole: RealmRole,
  paramName = "realmId",
): RequestHandler {
  return async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const realmId = req.params[paramName];
    if (!realmId) {
      res.status(400).json({ error: `Missing ${paramName}` });
      return;
    }
    try {
      const role = await resolveRealmRole(realmId, userId);
      if (!role) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!roleAtLeast(role, minRole)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.realmRole = role;
      next();
    } catch (err) {
      logger.error({ err }, "requireRealmAccess failed");
      res.status(500).json({ error: "Authorization failed" });
    }
  };
}

/**
 * Variant that resolves realmId by looking up a node first.
 */
export function requireRealmAccessByNode(
  minRole: RealmRole,
  paramName = "nodeId",
): RequestHandler {
  return async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const nodeId = req.params[paramName];
    if (!nodeId) {
      res.status(400).json({ error: `Missing ${paramName}` });
      return;
    }
    try {
      const { nodesTable } = await import("@workspace/db");
      const [node] = await db
        .select({ realmId: nodesTable.realmId })
        .from(nodesTable)
        .where(eq(nodesTable.id, nodeId));
      if (!node) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const role = await resolveRealmRole(node.realmId, userId);
      if (!role || !roleAtLeast(role, minRole)) {
        res.status(role ? 403 : 403).json({ error: "Forbidden" });
        return;
      }
      req.realmRole = role;
      next();
    } catch (err) {
      logger.error({ err }, "requireRealmAccessByNode failed");
      res.status(500).json({ error: "Authorization failed" });
    }
  };
}

/**
 * Returns true if `userId` has an explicit per-node edit grant on `nodeId`.
 */
export async function userHasNodeGrant(
  nodeId: string,
  userId: string,
): Promise<boolean> {
  const [grant] = await db
    .select({ id: nodeEditGrantsTable.id })
    .from(nodeEditGrantsTable)
    .where(
      and(
        eq(nodeEditGrantsTable.nodeId, nodeId),
        eq(nodeEditGrantsTable.userId, userId),
      ),
    );
  return !!grant;
}

/**
 * Returns the set of node ids in `realmId` that `userId` holds an edit grant
 * for. Used to reveal private nodes (and enable inline editing) for granted
 * viewers when listing a realm's nodes.
 */
export async function getGrantedNodeIds(
  realmId: string,
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ nodeId: nodeEditGrantsTable.nodeId })
    .from(nodeEditGrantsTable)
    .innerJoin(nodesTable, eq(nodesTable.id, nodeEditGrantsTable.nodeId))
    .where(
      and(
        eq(nodesTable.realmId, realmId),
        eq(nodeEditGrantsTable.userId, userId),
      ),
    );
  return new Set(rows.map((r) => r.nodeId));
}

/**
 * Write-access middleware for a single node. Realm editors/owners always pass.
 * A realm *viewer* passes only when they hold an explicit per-node edit grant,
 * in which case `req.nodeEditGranted` is set so the route can restrict the
 * write to content fields (never privacy / realm-move). Everyone else gets 403.
 */
export function requireNodeWriteAccess(paramName = "nodeId"): RequestHandler {
  return async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const nodeId = req.params[paramName];
    if (!nodeId) {
      res.status(400).json({ error: `Missing ${paramName}` });
      return;
    }
    try {
      const [node] = await db
        .select({ realmId: nodesTable.realmId })
        .from(nodesTable)
        .where(eq(nodesTable.id, nodeId));
      if (!node) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const role = await resolveRealmRole(node.realmId, userId);
      if (!role) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (roleAtLeast(role, "editor")) {
        req.realmRole = role;
        next();
        return;
      }
      // Viewer: allowed only with an explicit per-node edit grant.
      if (await userHasNodeGrant(nodeId, userId)) {
        req.realmRole = role;
        req.nodeEditGranted = true;
        next();
        return;
      }
      res.status(403).json({ error: "Forbidden" });
    } catch (err) {
      logger.error({ err }, "requireNodeWriteAccess failed");
      res.status(500).json({ error: "Authorization failed" });
    }
  };
}

/**
 * Variant that resolves realmId by looking up a folder first.
 */
export function requireRealmAccessByFolder(
  minRole: RealmRole,
  paramName = "folderId",
): RequestHandler {
  return async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const folderId = req.params[paramName];
    if (!folderId) {
      res.status(400).json({ error: `Missing ${paramName}` });
      return;
    }
    try {
      const { foldersTable } = await import("@workspace/db");
      const [folder] = await db
        .select({ realmId: foldersTable.realmId })
        .from(foldersTable)
        .where(eq(foldersTable.id, folderId));
      if (!folder) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const role = await resolveRealmRole(folder.realmId, userId);
      if (!role || !roleAtLeast(role, minRole)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.realmRole = role;
      next();
    } catch (err) {
      logger.error({ err }, "requireRealmAccessByFolder failed");
      res.status(500).json({ error: "Authorization failed" });
    }
  };
}

/**
 * Variant for relationships routes — resolves realmId from a relationship row.
 */
export function requireRealmAccessByRelationship(
  minRole: RealmRole,
): RequestHandler {
  return async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = req.params["relationshipId"];
    if (!id) {
      res.status(400).json({ error: "Missing relationshipId" });
      return;
    }
    try {
      const { relationshipsTable } = await import("@workspace/db");
      const [rel] = await db
        .select({ realmId: relationshipsTable.realmId })
        .from(relationshipsTable)
        .where(eq(relationshipsTable.id, id));
      if (!rel) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const role = await resolveRealmRole(rel.realmId, userId);
      if (!role || !roleAtLeast(role, minRole)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.realmRole = role;
      next();
    } catch (err) {
      logger.error({ err }, "requireRealmAccessByRelationship failed");
      res.status(500).json({ error: "Authorization failed" });
    }
  };
}
