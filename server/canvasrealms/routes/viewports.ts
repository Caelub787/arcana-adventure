import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, viewportsTable } from "@workspace/db";
import {
  GetViewportParams,
  GetViewportResponse,
  SetViewportParams,
  SetViewportBody,
  SetViewportResponse,
} from "@workspace/api-zod";
import { requireRealmAccess } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/realms/:realmId/viewport", requireRealmAccess("viewer"), async (req, res): Promise<void> => {
  const params = GetViewportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(viewportsTable)
    .where(eq(viewportsTable.realmId, params.data.realmId));
  if (!row) {
    const defaultVp = {
      realmId: params.data.realmId,
      x: 0,
      y: 0,
      zoom: 1,
      updatedAt: new Date().toISOString(),
    };
    res.json(GetViewportResponse.parse(defaultVp));
    return;
  }
  res.json(GetViewportResponse.parse(row));
});

router.put("/realms/:realmId/viewport", requireRealmAccess("editor"), async (req, res): Promise<void> => {
  const params = SetViewportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SetViewportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(viewportsTable)
    .values({
      realmId: params.data.realmId,
      x: parsed.data.x,
      y: parsed.data.y,
      zoom: parsed.data.zoom,
    })
    .onConflictDoUpdate({
      target: viewportsTable.realmId,
      set: {
        x: parsed.data.x,
        y: parsed.data.y,
        zoom: parsed.data.zoom,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(SetViewportResponse.parse(row));
});

export default router;
