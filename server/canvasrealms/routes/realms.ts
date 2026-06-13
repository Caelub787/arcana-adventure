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
import {
  requireRealmAccess,
  getGrantedNodeIds,
} from "../middlewares/auth";
import { bumpInvalidation } from "../realtime/doc-registry";
import { toRealmDto } from "../lib/realm-dto";
import { storage } from "../../storage";
import { checkCampaignAccessShared } from "../../worldAccess";
import { inArray } from "drizzle-orm";

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
  // Realms linked to a campaign the user belongs to (read-only viewer bridge):
  // the GM links one of their standalone realms to a campaign so every member
  // sees it in their realm list.
  let linked: (typeof realmsTable.$inferSelect)[] = [];
  try {
    const campaigns = await storage.getUserCampaigns(userId);
    const campaignIds = [...campaigns.created, ...campaigns.joined]
      .map((c) => c.id)
      .filter((id): id is string => typeof id === "string");
    if (campaignIds.length > 0) {
      linked = await db
        .select()
        .from(realmsTable)
        .where(inArray(realmsTable.linkedCampaignId, campaignIds));
    }
  } catch {
    // getUserCampaigns failed (no campaigns) — no linked realms to add.
  }
  // A realm is "shared by your GM" (read-only) only when the caller reaches it
  // SOLELY through the campaign-link bridge — not as owner, not as collaborator.
  const ownedOrCollabIds = new Set<string>([
    ...owned.map((r) => r.id),
    ...shared.map((s) => s.realm.id),
  ]);
  const campaignSharedIds = new Set<string>(
    linked.filter((r) => !ownedOrCollabIds.has(r.id)).map((r) => r.id),
  );
  const all = [...owned, ...shared.map((s) => s.realm), ...linked];
  // De-dupe (just in case) and sort by updatedAt desc.
  const seen = new Set<string>();
  const uniq = all
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => +b.updatedAt - +a.updatedAt);
  res.json(
    ListRealmsResponse.parse(
      uniq.map((r) =>
        toRealmDto(r, { campaignShared: campaignSharedIds.has(r.id) }),
      ),
    ),
  );
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
    let nodes = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.realmId, realmId));
    // Viewers must not see counts that include private nodes they can't access.
    if (req.realmRole === "viewer" && nodes.some((n) => n.isPrivate)) {
      const granted = req.userId
        ? await getGrantedNodeIds(realmId, req.userId)
        : new Set<string>();
      nodes = nodes.filter((n) => !n.isPrivate || granted.has(n.id));
    }
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

// Get the realm's campaign link plus the GM's linkable campaigns. Owner-only:
// only the realm owner (a GM) may link their standalone realm to a campaign.
router.get(
  "/realms/:realmId/campaign-link",
  requireRealmAccess("owner"),
  async (req, res): Promise<void> => {
    const realmId = req.params.realmId;
    const userId = req.userId!;
    const [realm] = await db
      .select({ linkedCampaignId: realmsTable.linkedCampaignId })
      .from(realmsTable)
      .where(eq(realmsTable.id, realmId));
    if (!realm) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    const campaigns = await storage.getUserCampaigns(userId);
    // Only campaigns where the user has GM authority can be linked.
    const linkable = campaigns.created.map((c: any) => ({
      id: c.id as string,
      name: c.name as string,
    }));
    res.json({
      linkedCampaignId: realm.linkedCampaignId ?? null,
      campaigns: linkable,
    });
  },
);

// Set or clear the realm's campaign link. Owner-only, and the target campaign
// must be one the caller GMs.
router.put(
  "/realms/:realmId/campaign-link",
  requireRealmAccess("owner"),
  async (req, res): Promise<void> => {
    const realmId = req.params.realmId;
    const userId = req.userId!;
    const campaignId = req.body?.campaignId ?? null;
    if (campaignId !== null) {
      if (typeof campaignId !== "string") {
        res.status(400).json({ error: "campaignId must be a string or null" });
        return;
      }
      const access = await checkCampaignAccessShared(userId, campaignId);
      if (!access.isOwner) {
        res
          .status(403)
          .json({ error: "You must be the GM of that campaign to link it" });
        return;
      }
    }
    const [row] = await db
      .update(realmsTable)
      .set({ linkedCampaignId: campaignId })
      .where(eq(realmsTable.id, realmId))
      .returning({ linkedCampaignId: realmsTable.linkedCampaignId });
    if (!row) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    res.json({ linkedCampaignId: row.linkedCampaignId ?? null });
  },
);

// Resolve the CR realm a GM has linked to a campaign, from the campaign's side.
// Returns the realm DTO the caller can access (campaign members + the realm
// owner), or null when none is linked. Used by the V3 campaign-embedded World
// Builder to open the shared world instead of the per-campaign auto-realm.
router.get(
  "/campaigns/:campaignId/linked-realm",
  async (req, res): Promise<void> => {
    const userId = req.userId!;
    const campaignId = req.params.campaignId;
    const access = await checkCampaignAccessShared(userId, campaignId);
    if (!access.allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [realm] = await db
      .select()
      .from(realmsTable)
      .where(eq(realmsTable.linkedCampaignId, campaignId))
      .orderBy(desc(realmsTable.updatedAt));
    res.json(realm ? GetRealmResponse.parse(toRealmDto(realm)) : null);
  },
);

export default router;
