import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, foldersTable, nodesTable } from "@workspace/db";
import {
  ListFoldersParams,
  ListFoldersResponse,
  CreateFolderParams,
  CreateFolderBody,
  UpdateFolderParams,
  UpdateFolderBody,
  UpdateFolderResponse,
  DeleteFolderParams,
} from "@workspace/api-zod";
import {
  requireRealmAccess,
  requireRealmAccessByFolder,
  resolveRealmRole,
  roleAtLeast,
} from "../middlewares/auth";
import { bumpInvalidation } from "../realtime/doc-registry";

const router: IRouter = Router();

router.get(
  "/realms/:realmId/folders",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const params = ListFoldersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(foldersTable)
      .where(eq(foldersTable.realmId, params.data.realmId))
      .orderBy(foldersTable.sortIndex, foldersTable.createdAt);
    res.json(ListFoldersResponse.parse(rows));
  },
);

router.post(
  "/realms/:realmId/folders",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const params = CreateFolderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateFolderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // If a parent is supplied, ensure it belongs to the same realm.
    if (parsed.data.parentFolderId) {
      const [parent] = await db
        .select({ realmId: foldersTable.realmId })
        .from(foldersTable)
        .where(eq(foldersTable.id, parsed.data.parentFolderId));
      if (!parent || parent.realmId !== params.data.realmId) {
        res
          .status(400)
          .json({ error: "parentFolderId must belong to this realm" });
        return;
      }
    }
    const [row] = await db
      .insert(foldersTable)
      .values({
        realmId: params.data.realmId,
        name: parsed.data.name,
        parentFolderId: parsed.data.parentFolderId ?? null,
        sortIndex: parsed.data.sortIndex ?? 0,
      })
      .returning();
    bumpInvalidation(row.realmId, "folders");
    res.status(201).json(UpdateFolderResponse.parse(row));
  },
);

router.patch(
  "/folders/:folderId",
  requireRealmAccessByFolder("editor"),
  async (req, res): Promise<void> => {
    const params = UpdateFolderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateFolderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [current] = await db
      .select()
      .from(foldersTable)
      .where(eq(foldersTable.id, params.data.folderId));
    if (!current) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    const previousRealmId = current.realmId;
    // Resolve effective destination realm. Cross-realm moves require editor
    // access on the target realm.
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
    // If reparenting, ensure new parent is in same destination realm and is
    // not a descendant of this folder (would create a cycle).
    let parentToWrite: string | null | undefined = parsed.data.parentFolderId;
    if (parentToWrite !== undefined) {
      if (parentToWrite === params.data.folderId) {
        res.status(400).json({ error: "A folder cannot be its own parent" });
        return;
      }
      if (parentToWrite) {
        const [parent] = await db
          .select({ realmId: foldersTable.realmId })
          .from(foldersTable)
          .where(eq(foldersTable.id, parentToWrite));
        if (!parent || parent.realmId !== effectiveRealmId) {
          res
            .status(400)
            .json({ error: "parentFolderId must belong to this realm" });
          return;
        }
        // Walk ancestors of the new parent (within its realm). If we hit
        // ourselves, reject.
        const all = await db
          .select({
            id: foldersTable.id,
            parentFolderId: foldersTable.parentFolderId,
          })
          .from(foldersTable)
          .where(eq(foldersTable.realmId, effectiveRealmId));
        const byId = new Map(all.map((f) => [f.id, f.parentFolderId] as const));
        let cursor: string | null = parentToWrite;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === params.data.folderId) {
            res
              .status(400)
              .json({ error: "Cannot move a folder into its own descendant" });
            return;
          }
          if (seen.has(cursor)) break;
          seen.add(cursor);
          cursor = byId.get(cursor) ?? null;
        }
      }
    } else if (effectiveRealmId !== previousRealmId) {
      // Moving to a new realm without specifying a parent: drop to root.
      parentToWrite = null;
    }
    // For cross-realm moves, recursively reassign the realmId of every
    // descendant folder + node so the subtree stays inside the moved folder.
    if (effectiveRealmId !== previousRealmId) {
      const all = await db
        .select({
          id: foldersTable.id,
          parentFolderId: foldersTable.parentFolderId,
        })
        .from(foldersTable)
        .where(eq(foldersTable.realmId, previousRealmId));
      const childrenOf = new Map<string | null, string[]>();
      for (const f of all) {
        const arr = childrenOf.get(f.parentFolderId) ?? [];
        arr.push(f.id);
        childrenOf.set(f.parentFolderId, arr);
      }
      const subtree: string[] = [params.data.folderId];
      const stack = [params.data.folderId];
      while (stack.length) {
        const id = stack.pop()!;
        const kids = childrenOf.get(id) ?? [];
        for (const k of kids) {
          subtree.push(k);
          stack.push(k);
        }
      }
      // Re-assign realmId on the entire subtree (folders + nodes).
      await db
        .update(foldersTable)
        .set({ realmId: effectiveRealmId })
        .where(inArray(foldersTable.id, subtree));
      await db
        .update(nodesTable)
        .set({ realmId: effectiveRealmId })
        .where(inArray(nodesTable.folderId, subtree));
    }
    const setPayload: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) setPayload.name = parsed.data.name;
    if (parsed.data.sortIndex !== undefined)
      setPayload.sortIndex = parsed.data.sortIndex;
    if (parentToWrite !== undefined) setPayload.parentFolderId = parentToWrite;
    if (effectiveRealmId !== previousRealmId)
      setPayload.realmId = effectiveRealmId;
    const [row] = await db
      .update(foldersTable)
      .set(setPayload)
      .where(eq(foldersTable.id, params.data.folderId))
      .returning();
    bumpInvalidation(row.realmId, "folders");
    if (previousRealmId !== row.realmId) {
      bumpInvalidation(previousRealmId, "folders");
      bumpInvalidation(previousRealmId, "nodes");
      bumpInvalidation(row.realmId, "nodes");
    }
    res.json(UpdateFolderResponse.parse(row));
  },
);

router.delete(
  "/folders/:folderId",
  requireRealmAccessByFolder("editor"),
  async (req, res): Promise<void> => {
    const params = DeleteFolderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Detach nodes from this folder before deleting (DB has ON DELETE
    // SET NULL, but child folders cascade — those folders' nodes will
    // also become unfiled). We bump invalidation on both scopes.
    const [row] = await db
      .delete(foldersTable)
      .where(eq(foldersTable.id, params.data.folderId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    // Belt-and-suspenders: clear any leftover folderId on nodes that
    // still point at this folder (shouldn't happen with the FK, but
    // protects us if a migration ever drops the action).
    await db
      .update(nodesTable)
      .set({ folderId: null })
      .where(
        and(
          eq(nodesTable.realmId, row.realmId),
          eq(nodesTable.folderId, params.data.folderId),
        ),
      );
    bumpInvalidation(row.realmId, "folders");
    bumpInvalidation(row.realmId, "nodes");
    res.sendStatus(204);
  },
);

export default router;
