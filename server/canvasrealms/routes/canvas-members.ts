import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, canvasMembersTable, nodesTable } from "@workspace/db";
import { z } from "zod";
import { requireRealmAccessByNode } from "../middlewares/auth";
import {
  bumpInvalidation,
  applyMemberInsert,
  applyMemberUpdate,
  applyMemberDelete,
} from "../realtime/doc-registry";

const router: IRouter = Router();

const ListParams = z.object({ canvasNodeId: z.string().uuid() });
const AddParams = z.object({ canvasNodeId: z.string().uuid() });
const AddBody = z.object({
  // Optional explicit id, used by undo to restore a previously-deleted
  // member with its original id (so peers and history references stay
  // consistent). When omitted, the DB allocates a fresh UUID.
  id: z.string().uuid().optional(),
  memberNodeId: z.string().uuid(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  zIndex: z.number().int().optional(),
});
const MemberParams = z.object({
  canvasNodeId: z.string().uuid(),
  memberId: z.string().uuid(),
});
const UpdateBody = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  zIndex: z.number().int().optional(),
});

async function assertIsCanvas(canvasNodeId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [n] = await db.select().from(nodesTable).where(eq(nodesTable.id, canvasNodeId));
  if (!n) return { ok: false, status: 404, error: "Canvas node not found" };
  if (n.kind !== "canvas") return { ok: false, status: 400, error: "Target node is not a canvas" };
  return { ok: true };
}

router.get("/nodes/:canvasNodeId/members", requireRealmAccessByNode("viewer", "canvasNodeId"), async (req, res): Promise<void> => {
  const params = ListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const guard = await assertIsCanvas(params.data.canvasNodeId);
  if (!guard.ok) {
    res.status(guard.status).json({ error: guard.error });
    return;
  }
  const rows = await db
    .select()
    .from(canvasMembersTable)
    .where(eq(canvasMembersTable.canvasNodeId, params.data.canvasNodeId))
    .orderBy(canvasMembersTable.createdAt);
  res.json(rows);
});

router.post("/nodes/:canvasNodeId/members", requireRealmAccessByNode("editor", "canvasNodeId"), async (req, res): Promise<void> => {
  const params = AddParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [canvasNode] = await db
    .select()
    .from(nodesTable)
    .where(eq(nodesTable.id, params.data.canvasNodeId));
  if (!canvasNode) {
    res.status(404).json({ error: "Canvas node not found" });
    return;
  }
  if (canvasNode.kind !== "canvas") {
    res.status(400).json({ error: "Target node is not a canvas" });
    return;
  }

  const [memberNode] = await db
    .select()
    .from(nodesTable)
    .where(eq(nodesTable.id, body.data.memberNodeId));
  if (!memberNode) {
    res.status(404).json({ error: "Member node not found" });
    return;
  }
  if (memberNode.realmId !== canvasNode.realmId) {
    res.status(400).json({ error: "Member must belong to the same realm" });
    return;
  }
  if (memberNode.id === canvasNode.id) {
    res.status(400).json({ error: "A canvas cannot contain itself" });
    return;
  }

  try {
    const [row] = await db
      .insert(canvasMembersTable)
      .values({
        // Honor a caller-supplied id (used by undo-restore) so the member
        // keeps its original UUID. Omitting it falls back to defaultRandom().
        ...(body.data.id ? { id: body.data.id } : {}),
        canvasNodeId: params.data.canvasNodeId,
        memberNodeId: body.data.memberNodeId,
        x: body.data.x ?? 0,
        y: body.data.y ?? 0,
        width: body.data.width ?? 320,
        height: body.data.height ?? 240,
        zIndex: body.data.zIndex ?? 1,
      })
      .returning();
    applyMemberInsert(canvasNode.realmId, params.data.canvasNodeId, row.id, {
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      zIndex: row.zIndex,
      memberNodeId: row.memberNodeId,
    });
    bumpInvalidation(canvasNode.realmId, "members");
    res.status(201).json(row);
  } catch (e) {
    // Postgres unique-violation = "23505". Only map that case to 409;
    // anything else is a real server error and should surface as 500
    // rather than be silently masked as "already a member".
    const code = (e as { code?: string } | null)?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Node is already a member of this canvas" });
      return;
    }
    console.error("[canvas-members] insert failed", e);
    res.status(500).json({ error: "Failed to add canvas member" });
  }
});

router.patch("/nodes/:canvasNodeId/members/:memberId", requireRealmAccessByNode("editor", "canvasNodeId"), async (req, res): Promise<void> => {
  const params = MemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const guard = await assertIsCanvas(params.data.canvasNodeId);
  if (!guard.ok) {
    res.status(guard.status).json({ error: guard.error });
    return;
  }
  const [existing] = await db
    .select()
    .from(canvasMembersTable)
    .where(eq(canvasMembersTable.id, params.data.memberId));
  if (!existing) {
    res.status(404).json({ error: "Canvas member not found" });
    return;
  }
  if (existing.canvasNodeId !== params.data.canvasNodeId) {
    res.status(404).json({ error: "Canvas member does not belong to this canvas" });
    return;
  }
  const [row] = await db
    .update(canvasMembersTable)
    .set(body.data)
    .where(eq(canvasMembersTable.id, params.data.memberId))
    .returning();
  // Find the realm via the canvas node so we can bump invalidations.
  const [canvas] = await db
    .select({ realmId: nodesTable.realmId })
    .from(nodesTable)
    .where(eq(nodesTable.id, params.data.canvasNodeId));
  if (canvas) {
    applyMemberUpdate(
      canvas.realmId,
      params.data.canvasNodeId,
      params.data.memberId,
      body.data,
    );
    bumpInvalidation(canvas.realmId, "members");
  }
  res.json(row);
});

router.delete("/nodes/:canvasNodeId/members/:memberId", requireRealmAccessByNode("editor", "canvasNodeId"), async (req, res): Promise<void> => {
  const params = MemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const guard = await assertIsCanvas(params.data.canvasNodeId);
  if (!guard.ok) {
    res.status(guard.status).json({ error: guard.error });
    return;
  }
  const [existing] = await db
    .select()
    .from(canvasMembersTable)
    .where(eq(canvasMembersTable.id, params.data.memberId));
  if (!existing) {
    res.status(404).json({ error: "Canvas member not found" });
    return;
  }
  if (existing.canvasNodeId !== params.data.canvasNodeId) {
    res.status(404).json({ error: "Canvas member does not belong to this canvas" });
    return;
  }
  await db.delete(canvasMembersTable).where(eq(canvasMembersTable.id, params.data.memberId));
  const [canvas] = await db
    .select({ realmId: nodesTable.realmId })
    .from(nodesTable)
    .where(eq(nodesTable.id, params.data.canvasNodeId));
  if (canvas) {
    applyMemberDelete(
      canvas.realmId,
      params.data.canvasNodeId,
      params.data.memberId,
    );
    bumpInvalidation(canvas.realmId, "members");
  }
  res.sendStatus(204);
});

export default router;
