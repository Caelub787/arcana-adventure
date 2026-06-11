import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, realmsTable, nodesTable } from "@workspace/db";
import { verifyWebhookSignature } from "@arcana/aa-sync-sdk";
import { decryptToken } from "../lib/arcana-crypto";
import { invalidateArcanaSchemaCache } from "../lib/arcana";
import { bumpInvalidation, ensureNodeWatched } from "../realtime/doc-registry";
import { generateUniqueKeyForRealm } from "./nodes";
import { logger } from "../lib/logger";

/**
 * Arcana webhook intake. Public route — auth is the `x-aa-signature` header
 * verified against the per-realm webhook secret stored on the realm row.
 *
 * The route is wired up so the body arrives as a Buffer (raw) — required for
 * HMAC verification. See app.ts for the wiring.
 */
const router: IRouter = Router();

interface WebhookPayload {
  event?: string;
  kind?: string;
  action?: string;
  id?: string;
  externalId?: string | null;
  userId?: string | null;
  data?: Record<string, unknown>;
  ts?: string;
}

// Mounted at /api/arcana/webhook in app.ts — this route is just "/".
router.post("/", async (req, res) => {
  const sig = req.headers["x-aa-signature"];
  const sigStr = Array.isArray(sig) ? sig[0] : sig;
  const raw =
    Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: "invalid json" });
    return;
  }

  // We don't know which realm this delivery is for until we find a realm
  // whose webhook secret verifies the signature. In practice each Arcana
  // user's deliveries arrive on the same shared URL but with a per-realm
  // secret, so we narrow by the userId echoed in the payload first.
  let realms = await db
    .select({
      id: realmsTable.id,
      secret: realmsTable.arcanaWebhookSecret,
      arcanaUserId: realmsTable.arcanaUserId,
    })
    .from(realmsTable)
    .where(eq(realmsTable.arcanaUserId, payload.userId ?? ""));
  if (realms.length === 0) {
    // Fallback: any realm whose webhook secret matches.
    realms = await db
      .select({
        id: realmsTable.id,
        secret: realmsTable.arcanaWebhookSecret,
        arcanaUserId: realmsTable.arcanaUserId,
      })
      .from(realmsTable);
  }

  let matchedRealmId: string | null = null;
  for (const r of realms) {
    if (!r.secret) continue;
    let secret: string;
    try {
      secret = decryptToken(r.secret);
    } catch {
      continue;
    }
    const ok = await verifyWebhookSignature(raw, secret, sigStr);
    if (ok) {
      matchedRealmId = r.id;
      break;
    }
  }

  if (!matchedRealmId) {
    res.status(401).json({ error: "signature_mismatch" });
    return;
  }

  // Schema bumps come through as `library.changed` (low fidelity) or as
  // typed events like `library.<kind>.<action>`. For the typed ones we
  // patch / create the matching node directly; the low-fidelity event
  // just nudges connected clients to refetch.
  const event = payload.event ?? "";
  if (event === "library.changed") {
    invalidateArcanaSchemaCache(matchedRealmId);
    bumpInvalidation(matchedRealmId, "nodes");
    res.json({ ok: true, kind: "changed" });
    return;
  }

  const kind = payload.kind ?? "";
  const externalId = payload.externalId ?? null;
  const action = payload.action ?? "";

  if (!kind) {
    res.json({ ok: true, ignored: "missing_kind" });
    return;
  }

  try {
    if (action === "deleted" && externalId) {
      const [existing] = await db
        .select({ id: nodesTable.id })
        .from(nodesTable)
        .where(and(eq(nodesTable.realmId, matchedRealmId), eq(nodesTable.id, externalId)));
      if (existing) {
        await db.delete(nodesTable).where(eq(nodesTable.id, existing.id));
        bumpInvalidation(matchedRealmId, "nodes");
      }
      res.json({ ok: true, kind: "deleted" });
      return;
    }

    const data = payload.data ?? {};
    const title =
      (typeof data["name"] === "string" && data["name"]) ||
      (typeof data["title"] === "string" && data["title"]) ||
      `New ${kind}`;

    let existingId: string | null = null;
    if (externalId) {
      const [existing] = await db
        .select({ id: nodesTable.id })
        .from(nodesTable)
        .where(and(eq(nodesTable.realmId, matchedRealmId), eq(nodesTable.id, externalId)));
      if (existing) existingId = existing.id;
    }

    if (existingId) {
      const [row] = await db
        .update(nodesTable)
        .set({
          title,
          arcanaStats: data,
        })
        .where(eq(nodesTable.id, existingId))
        .returning();
      if (row) ensureNodeWatched(matchedRealmId, row.id, row.kind, row.content);
    } else {
      const key = await generateUniqueKeyForRealm(matchedRealmId);
      const [row] = await db
        .insert(nodesTable)
        .values({
          ...(externalId ? { id: externalId } : {}),
          realmId: matchedRealmId,
          key,
          title,
          kind,
          arcanaStats: data,
          mode: "window",
          x: Math.round(Math.random() * 200 - 100),
          y: Math.round(Math.random() * 200 - 100),
        })
        .returning();
      if (row) ensureNodeWatched(matchedRealmId, row.id, row.kind, row.content);
    }
    bumpInvalidation(matchedRealmId, "nodes");
    res.json({ ok: true, kind: action || "applied" });
  } catch (err) {
    logger.error({ err, realmId: matchedRealmId, payload }, "Arcana webhook apply failed");
    res.status(500).json({ error: "apply_failed" });
  }
});

export default router;
