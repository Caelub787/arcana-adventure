import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, relationshipsTable, nodesTable } from "@workspace/db";
import {
  ListRelationshipsParams,
  ListRelationshipsResponse,
  ListRelationshipsResponseItem,
  CreateRelationshipParams,
  CreateRelationshipBody,
  DeleteRelationshipParams,
} from "@workspace/api-zod";
import {
  requireRealmAccess,
  requireRealmAccessByRelationship,
} from "../middlewares/auth";
import { bumpInvalidation } from "../realtime/doc-registry";

const router: IRouter = Router();

router.get(
  "/realms/:realmId/relationships",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const params = ListRelationshipsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(relationshipsTable)
      .where(eq(relationshipsTable.realmId, params.data.realmId));
    res.json(ListRelationshipsResponse.parse(rows));
  },
);

router.post(
  "/realms/:realmId/relationships",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const params = CreateRelationshipParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateRelationshipBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const endpoints = await db
      .select({ id: nodesTable.id })
      .from(nodesTable)
      .where(
        and(
          eq(nodesTable.realmId, params.data.realmId),
          inArray(nodesTable.id, [parsed.data.fromNodeId, parsed.data.toNodeId]),
        ),
      );
    const ids = new Set(endpoints.map((e) => e.id));
    if (!ids.has(parsed.data.fromNodeId) || !ids.has(parsed.data.toNodeId)) {
      res
        .status(400)
        .json({ error: "Both fromNodeId and toNodeId must belong to this realm" });
      return;
    }
    const [row] = await db
      .insert(relationshipsTable)
      .values({
        realmId: params.data.realmId,
        fromNodeId: parsed.data.fromNodeId,
        toNodeId: parsed.data.toNodeId,
        label: parsed.data.label,
      })
      .returning();
    bumpInvalidation(row.realmId, "relationships");
    res.status(201).json(ListRelationshipsResponseItem.parse(row));
  },
);

router.delete(
  "/relationships/:relationshipId",
  requireRealmAccessByRelationship("editor"),
  async (req, res): Promise<void> => {
    const params = DeleteRelationshipParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(relationshipsTable)
      .where(eq(relationshipsTable.id, params.data.relationshipId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Relationship not found" });
      return;
    }
    bumpInvalidation(row.realmId, "relationships");
    res.sendStatus(204);
  },
);

export default router;
