import { Router, type IRouter } from "express";
import { eq, desc, or, and, isNotNull } from "drizzle-orm";
import {
  db,
  realmsTable,
  nodesTable,
  relationshipsTable,
  realmCollaboratorsTable,
} from "@workspace/db";
import {
  CreateRealmBody,
  GetRealmParams,
  GetRealmResponse,
  UpdateRealmParams,
  UpdateRealmBody,
  UpdateRealmResponse,
  DeleteRealmParams,
  ListRealmsResponse,
  GetRealmSummaryParams,
  GetRealmSummaryResponse,
} from "@workspace/api-zod";
import { requireRealmAccess } from "../middlewares/auth";
import { bumpInvalidation } from "../realtime/doc-registry";
import { toRealmDto } from "../lib/realm-dto";

const router: IRouter = Router();

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `realm-${Date.now()}`
  );
}

router.get("/realms", async (req, res): Promise<void> => {
  const userId = req.userId!;
  // Realms the user owns OR has an accepted collaborator row on.
  const owned = await db
    .select()
    .from(realmsTable)
    .where(eq(realmsTable.ownerUserId, userId));
  const shared = await db
    .select({ realm: realmsTable })
    .from(realmCollaboratorsTable)
    .innerJoin(
      realmsTable,
      eq(realmsTable.id, realmCollaboratorsTable.realmId),
    )
    .where(
      and(
        eq(realmCollaboratorsTable.userId, userId),
        isNotNull(realmCollaboratorsTable.acceptedAt),
      ),
    );
  const all = [...owned, ...shared.map((s) => s.realm)];
  // De-dupe (just in case) and sort by updatedAt desc.
  const seen = new Set<string>();
  const uniq = all
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => +b.updatedAt - +a.updatedAt);
  res.json(ListRealmsResponse.parse(uniq.map(toRealmDto)));
});

router.post("/realms", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateRealmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const baseSlug = slugify(parsed.data.name);
  let slug = baseSlug;
  let attempt = 1;
  while (attempt < 100) {
    const existing = await db
      .select({ id: realmsTable.id })
      .from(realmsTable)
      .where(eq(realmsTable.slug, slug));
    if (existing.length === 0) break;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }
  const [row] = await db
    .insert(realmsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      accent: parsed.data.accent,
      arcanaSystem: parsed.data.arcanaSystem ?? "aa-v2",
      slug,
      ownerUserId: userId,
    })
    .returning();
  res.status(201).json(GetRealmResponse.parse(toRealmDto(row)));
});

router.get(
  "/realms/:realmId",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const params = GetRealmParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .select()
      .from(realmsTable)
      .where(eq(realmsTable.id, params.data.realmId));
    if (!row) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    res.json(GetRealmResponse.parse(toRealmDto(row)));
  },
);

router.patch(
  "/realms/:realmId",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const params = UpdateRealmParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateRealmBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // NOTE on wiki public URLs: realm slugs are assigned at creation from
    // the initial name and are NOT mutable via this endpoint (UpdateRealmBody
    // intentionally does not expose `slug`). Renaming a realm therefore does
    // NOT change `/wiki/:slug` — the published URL stays stable forever
    // once the realm exists. To change the public URL, the user must
    // recreate the realm.
    const [row] = await db
      .update(realmsTable)
      .set(parsed.data)
      .where(eq(realmsTable.id, params.data.realmId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    bumpInvalidation(row.id, "realms");
    res.json(UpdateRealmResponse.parse(toRealmDto(row)));
  },
);

router.delete(
  "/realms/:realmId",
  requireRealmAccess("owner"),
  async (req, res): Promise<void> => {
    const params = DeleteRealmParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(realmsTable)
      .where(eq(realmsTable.id, params.data.realmId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/realms/:realmId/summary",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const params = GetRealmSummaryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const realmId = params.data.realmId;
    const nodes = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.realmId, realmId));
    const rels = await db
      .select()
      .from(relationshipsTable)
      .where(eq(relationshipsTable.realmId, realmId));
    const kindMap = new Map<string, number>();
    let lastUpdated: Date | null = null;
    for (const n of nodes) {
      kindMap.set(n.kind, (kindMap.get(n.kind) ?? 0) + 1);
      if (!lastUpdated || n.updatedAt > lastUpdated) lastUpdated = n.updatedAt;
    }
    const out = {
      realmId,
      nodeCount: nodes.length,
      relationshipCount: rels.length,
      kindCounts: Array.from(kindMap.entries()).map(([kind, count]) => ({
        kind,
        count,
      })),
      lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
    };
    res.json(GetRealmSummaryResponse.parse(out));
  },
);

export default router;
