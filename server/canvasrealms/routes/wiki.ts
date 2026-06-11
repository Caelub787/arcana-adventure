import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  realmsTable,
  nodesTable,
  wikiSnapshotsTable,
} from "@workspace/db";
import { z } from "zod";
import {
  GetWikiDraftParams,
  UpdateWikiDraftParams,
  ListWikiSnapshotsParams,
  PublishWikiParams,
  UnpublishWikiParams,
  RevertWikiSnapshotParams,
  GetPublicWikiParams,
} from "@workspace/api-zod";
import { requireRealmAccess } from "../middlewares/auth";

const router: IRouter = Router();

const ThemeEnum = z.enum(["light", "dark", "auto"]);
const SizeEnum = z.enum(["small", "medium", "large", "full"]);

const ShowSchema = z.object({
  title: z.boolean(),
  summary: z.boolean(),
  content: z.boolean(),
  image: z.boolean(),
});

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const EntrySchema = z.object({
  nodeId: z.string().uuid(),
  order: z.number().int(),
  sectionId: z.string().nullable(),
  size: SizeEnum,
  show: ShowSchema,
  position: PositionSchema.nullish(),
});

const SectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
});

const DraftSchema = z.object({
  title: z.string(),
  tagline: z.string().nullish(),
  coverImage: z.string().nullish(),
  theme: ThemeEnum,
  showSidebar: z.boolean(),
  freeLayout: z.boolean().optional(),
  sections: z.array(SectionSchema),
  entries: z.array(EntrySchema),
});

export type WikiDraft = z.infer<typeof DraftSchema>;
export type WikiEntry = z.infer<typeof EntrySchema>;

function defaultDraft(realmName: string): WikiDraft {
  return {
    title: realmName,
    tagline: null,
    coverImage: null,
    theme: "auto",
    showSidebar: true,
    freeLayout: false,
    sections: [],
    entries: [],
  };
}

const MD_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i;
const BARE_IMG_RE = /(https?:\/\/[^\s<>"']+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s<>"']*)?)/i;
function extractImageUrl(content: string | null | undefined): string | null {
  if (!content) return null;
  const md = content.match(MD_IMAGE_RE);
  if (md && md[1]) return md[1];
  const bare = content.match(BARE_IMG_RE);
  if (bare && bare[1]) return bare[1];
  return null;
}

/**
 * Strip wiki entries that reference nodes which no longer exist in the
 * realm. We do this on read (not on every node delete) so dangling refs
 * never leak back through the API. Already-published snapshots keep their
 * frozen entries.
 */
async function pruneDraftToRealm(
  realmId: string,
  draft: WikiDraft,
): Promise<{ draft: WikiDraft; changed: boolean }> {
  if (draft.entries.length === 0) return { draft, changed: false };
  const ids = await db
    .select({ id: nodesTable.id })
    .from(nodesTable)
    .where(eq(nodesTable.realmId, realmId));
  const valid = new Set(ids.map((r) => r.id));
  const next = draft.entries.filter((e) => valid.has(e.nodeId));
  if (next.length === draft.entries.length) return { draft, changed: false };
  return { draft: { ...draft, entries: next }, changed: true };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], (b as unknown[])[i])) return false;
    }
    return true;
  }
  const ak = Object.keys(a as Record<string, unknown>).sort();
  const bk = Object.keys(b as Record<string, unknown>).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (
      !deepEqual(
        (a as Record<string, unknown>)[ak[i]],
        (b as Record<string, unknown>)[bk[i]],
      )
    )
      return false;
  }
  return true;
}

async function loadState(realmId: string) {
  const [realm] = await db
    .select()
    .from(realmsTable)
    .where(eq(realmsTable.id, realmId));
  if (!realm) return null;

  const rawDraft = (realm.wikiDraft as WikiDraft | null) ?? null;
  const parsed = rawDraft ? DraftSchema.safeParse(rawDraft) : null;
  let draft: WikiDraft = parsed && parsed.success ? parsed.data : defaultDraft(realm.name);

  const pruned = await pruneDraftToRealm(realmId, draft);
  draft = pruned.draft;
  if (pruned.changed) {
    await db
      .update(realmsTable)
      .set({ wikiDraft: draft })
      .where(eq(realmsTable.id, realmId));
  }

  let liveSnapshot: typeof wikiSnapshotsTable.$inferSelect | null = null;
  if (realm.wikiPublishedSnapshotId) {
    const [s] = await db
      .select()
      .from(wikiSnapshotsTable)
      .where(eq(wikiSnapshotsTable.id, realm.wikiPublishedSnapshotId));
    liveSnapshot = s ?? null;
  }

  const isPublished = !!liveSnapshot;
  // For never-published realms, "has unpublished changes" means the draft
  // differs from the synthesized default we'd create on first read. For
  // published realms, compare against the live snapshot's frozen layout.
  const baseline: WikiDraft = liveSnapshot
    ? (liveSnapshot.layout as WikiDraft)
    : defaultDraft(realm.name);
  const hasUnpublishedChanges = !deepEqual(draft, baseline);

  return {
    realm,
    draft,
    liveSnapshot,
    response: {
      realmId: realm.id,
      slug: realm.slug,
      draft,
      hasUnpublishedChanges,
      isPublished,
      publishedSnapshotId: liveSnapshot?.id ?? null,
      publishedAt: liveSnapshot ? liveSnapshot.publishedAt.toISOString() : null,
    },
  };
}

router.get(
  "/realms/:realmId/wiki/draft",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const p = GetWikiDraftParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.message });
      return;
    }
    const realmId = p.data.realmId;
    const state = await loadState(realmId);
    if (!state) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    res.json(state.response);
  },
);

router.put(
  "/realms/:realmId/wiki/draft",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const p = UpdateWikiDraftParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.message });
      return;
    }
    const realmId = p.data.realmId;
    const parsed = DraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // Drop any entries that reference nodes outside this realm so we never
    // persist a leaky draft (e.g. node from another realm pasted by hand).
    const ids = await db
      .select({ id: nodesTable.id })
      .from(nodesTable)
      .where(eq(nodesTable.realmId, realmId));
    const valid = new Set(ids.map((r) => r.id));
    const safeDraft: WikiDraft = {
      ...parsed.data,
      tagline: parsed.data.tagline ?? null,
      coverImage: parsed.data.coverImage ?? null,
      entries: parsed.data.entries.filter((e) => valid.has(e.nodeId)),
    };
    await db
      .update(realmsTable)
      .set({ wikiDraft: safeDraft })
      .where(eq(realmsTable.id, realmId));
    const state = await loadState(realmId);
    if (!state) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    res.json(state.response);
  },
);

router.get(
  "/realms/:realmId/wiki/snapshots",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    const p = ListWikiSnapshotsParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.message });
      return;
    }
    const realmId = p.data.realmId;
    const [realm] = await db
      .select({
        published: realmsTable.wikiPublishedSnapshotId,
      })
      .from(realmsTable)
      .where(eq(realmsTable.id, realmId));
    if (!realm) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    const rows = await db
      .select()
      .from(wikiSnapshotsTable)
      .where(eq(wikiSnapshotsTable.realmId, realmId))
      .orderBy(desc(wikiSnapshotsTable.publishedAt))
      .limit(50);
    res.json(
      rows.map((r) => ({
        id: r.id,
        publishedAt: r.publishedAt.toISOString(),
        publishedByUserId: r.publishedByUserId,
        isLive: realm.published === r.id,
        title: ((r.layout as WikiDraft | null)?.title ?? "Untitled wiki") as string,
      })),
    );
  },
);

async function snapshotEntries(
  realmId: string,
  draft: WikiDraft,
): Promise<unknown[]> {
  if (draft.entries.length === 0) return [];
  const ids = draft.entries.map((e) => e.nodeId);
  const rows = await db
    .select()
    .from(nodesTable)
    .where(eq(nodesTable.realmId, realmId));
  const byId = new Map(rows.map((n) => [n.id, n]));
  return draft.entries
    .filter((e) => ids.includes(e.nodeId))
    .map((e) => {
      const n = byId.get(e.nodeId);
      if (!n) return null;
      return {
        nodeId: e.nodeId,
        order: e.order,
        sectionId: e.sectionId,
        size: e.size,
        show: e.show,
        position: e.position ?? null,
        node: {
          id: n.id,
          title: n.title,
          kind: n.kind,
          content: n.content,
          color: n.color,
          tags: n.tags,
          // Derive a per-entry image from the node's content: we look for the
          // first markdown image (`![alt](url)`) or bare http(s) image URL so
          // authors can attach an image without a dedicated schema field. The
          // value is frozen into the snapshot so public output is immutable.
          coverImage: extractImageUrl(n.content),
        },
      };
    })
    .filter((x) => x !== null);
}

router.post(
  "/realms/:realmId/wiki/publish",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const p = PublishWikiParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.message });
      return;
    }
    const realmId = p.data.realmId;
    const userId = req.userId!;
    const state = await loadState(realmId);
    if (!state) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    const entries = await snapshotEntries(realmId, state.draft);
    const [snap] = await db
      .insert(wikiSnapshotsTable)
      .values({
        realmId,
        publishedByUserId: userId,
        layout: state.draft,
        entries,
      })
      .returning();
    await db
      .update(realmsTable)
      .set({ wikiPublishedSnapshotId: snap.id })
      .where(eq(realmsTable.id, realmId));
    const next = await loadState(realmId);
    res.status(201).json(next!.response);
  },
);

router.post(
  "/realms/:realmId/wiki/unpublish",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const p = UnpublishWikiParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.message });
      return;
    }
    const realmId = p.data.realmId;
    await db
      .update(realmsTable)
      .set({ wikiPublishedSnapshotId: null })
      .where(eq(realmsTable.id, realmId));
    const state = await loadState(realmId);
    if (!state) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    res.json(state.response);
  },
);

router.post(
  "/realms/:realmId/wiki/snapshots/:snapshotId/revert",
  requireRealmAccess("editor"),
  async (req, res): Promise<void> => {
    const p = RevertWikiSnapshotParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.message });
      return;
    }
    const realmId = p.data.realmId;
    const snapshotId = p.data.snapshotId;
    const [snap] = await db
      .select()
      .from(wikiSnapshotsTable)
      .where(
        and(
          eq(wikiSnapshotsTable.id, snapshotId),
          eq(wikiSnapshotsTable.realmId, realmId),
        ),
      );
    if (!snap) {
      res.status(404).json({ error: "Snapshot not found" });
      return;
    }
    await db
      .update(realmsTable)
      .set({
        wikiPublishedSnapshotId: snap.id,
        // Also restore the draft to the snapshot's layout so the editor
        // shows the version that's now live.
        wikiDraft: snap.layout,
      })
      .where(eq(realmsTable.id, realmId));
    const state = await loadState(realmId);
    res.json(state!.response);
  },
);

export default router;

/**
 * Public, unauthenticated endpoint. Returns the currently-live snapshot for
 * a realm by slug, or 404 if there is no published version.
 */
export const publicWikiRouter: IRouter = Router();

publicWikiRouter.get(
  "/public/wiki/:slug",
  async (req, res): Promise<void> => {
    const p = GetPublicWikiParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.message });
      return;
    }
    const slug = p.data.slug;
    const [realm] = await db
      .select()
      .from(realmsTable)
      .where(eq(realmsTable.slug, slug));
    if (!realm) {
      res.status(404).json({
        error: "No realm at this URL",
        code: "REALM_NOT_FOUND",
      });
      return;
    }
    if (!realm.wikiPublishedSnapshotId) {
      res.status(404).json({
        error: "This realm has no published wiki",
        code: "WIKI_UNPUBLISHED",
      });
      return;
    }
    const [snap] = await db
      .select()
      .from(wikiSnapshotsTable)
      .where(eq(wikiSnapshotsTable.id, realm.wikiPublishedSnapshotId));
    if (!snap) {
      res.status(404).json({
        error: "This realm has no published wiki",
        code: "WIKI_UNPUBLISHED",
      });
      return;
    }
    res.json({
      realmId: realm.id,
      slug: realm.slug,
      publishedAt: snap.publishedAt.toISOString(),
      layout: snap.layout,
      entries: snap.entries,
    });
  },
);
