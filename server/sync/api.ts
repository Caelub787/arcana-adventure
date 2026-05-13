import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { externalEntityLinks, outgoingWebhooks, oauthAccessTokens, oauthRefreshTokens, users, characters } from "@shared/schema";
import { and, eq, or, isNull, inArray, sql } from "drizzle-orm";
import { isAdminUser as sharedIsAdminUser, canReadLibraryRow, canWriteLibraryRow } from "../lib/library-acl";
import crypto from "node:crypto";
import { resolveBearer } from "./oauth";
import { emitLibraryChange } from "./webhooks";

declare global {
  namespace Express {
    interface Request {
      syncUser?: { id: string; clientId: string; scopes: string[]; isAdmin: boolean };
    }
  }
}

const INTEGRATION = "canvasrealms";

export const requireSyncAuth = (requiredScope?: string) => async (req: Request, res: Response, next: NextFunction) => {
  const auth = await resolveBearer(req.headers.authorization);
  if (!auth) return res.status(401).json({ error: "invalid_token" });
  if (requiredScope && !auth.scopes.includes(requiredScope)) {
    return res.status(403).json({ error: "insufficient_scope", required: requiredScope });
  }
  const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
  if (!u) return res.status(401).json({ error: "user_not_found" });
  // Reuse the shared admin detection helper so sync and the rest of the app
  // can never drift on admin allowlist behaviour.
  const isAdmin = await sharedIsAdminUser(u.id);
  req.syncUser = { id: u.id, clientId: auth.clientId, scopes: auth.scopes, isAdmin };
  next();
};

// Explicit plural mapping — `class`+`s` would be `classs`, `species` is already plural, etc.
const KIND_PLURAL: Record<string, string> = {
  "item": "items",
  "spell": "spells",
  "character": "characters",
  "species": "species",
  "class": "classes",
  "feat-tree": "feat-trees",
  "character-template": "character-templates",
  "roll-template": "roll-templates",
};
type Kind = keyof typeof KIND_PLURAL;
export const SYNC_KINDS = Object.keys(KIND_PLURAL) as Kind[];
export function pluralFor(kind: Kind): string { return KIND_PLURAL[kind]; }

// Per-kind owner+system routing config. `systemCol` and `aaV2Value` exist
// because not every entity uses the same field name / value: e.g. species
// uses `systemName` with the human-readable value `"A.A. V2"`, while items,
// spells, characters, classes, feat-trees use `system` = `"aa-v2"`.
const KIND_META: Record<Kind, {
  ownerCol: "ownerUserId" | "createdByUserId";
  systemCol: "system" | "systemName";
  aaV2Value: string;
}> = {
  "item":               { ownerCol: "createdByUserId", systemCol: "system",     aaV2Value: "aa-v2" },
  "spell":              { ownerCol: "ownerUserId",     systemCol: "system",     aaV2Value: "aa-v2" },
  "character":          { ownerCol: "ownerUserId",     systemCol: "system",     aaV2Value: "aa-v2" },
  "species":            { ownerCol: "ownerUserId",     systemCol: "systemName", aaV2Value: "A.A. V2" },
  "class":              { ownerCol: "ownerUserId",     systemCol: "system",     aaV2Value: "aa-v2" },
  "feat-tree":          { ownerCol: "ownerUserId",     systemCol: "system",     aaV2Value: "aa-v2" },
  "character-template": { ownerCol: "ownerUserId",     systemCol: "system",     aaV2Value: "aa-v2" },
  "roll-template":      { ownerCol: "createdByUserId", systemCol: "system",     aaV2Value: "aa-v2" },
};

function applyOwnerRouting(kind: Kind, body: any, syncUser: { id: string; isAdmin: boolean }) {
  const { ownerCol, systemCol, aaV2Value } = KIND_META[kind];
  const out = { ...body };
  if (syncUser.isAdmin) {
    out[ownerCol] = null;
  } else {
    out[ownerCol] = syncUser.id;
    out[systemCol] = aaV2Value;
  }
  if (kind === "roll-template") {
    out.isLiveTemplate = true;
  }
  return out;
}

/**
 * For non-admin PATCH writes we cannot allow the row to be moved out of the
 * AA V2 namespace or away from the caller. Pin owner + system field per kind.
 */
function applyPatchOwnerRouting(kind: Kind, body: any, syncUser: { id: string; isAdmin: boolean }) {
  const { ownerCol, systemCol, aaV2Value } = KIND_META[kind];
  const out = { ...body };
  if (!syncUser.isAdmin) {
    out[systemCol] = aaV2Value;
    out[ownerCol] = syncUser.id;
  }
  return out;
}

/** Reverse-lookup externalId for a row so GET/PATCH responses always include it when known. */
async function externalIdFor(kind: Kind, internalId: string, userId: string): Promise<string | null> {
  const [row] = await db.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.integration, INTEGRATION),
    eq(externalEntityLinks.entityKind, kind),
    eq(externalEntityLinks.internalId, internalId),
    eq(externalEntityLinks.userId, userId),
  ));
  return row?.externalId || null;
}

async function lookupExternal(kind: Kind, externalId: string, userId: string) {
  const [row] = await db.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.integration, INTEGRATION),
    eq(externalEntityLinks.externalId, externalId),
    eq(externalEntityLinks.entityKind, kind),
    eq(externalEntityLinks.userId, userId),
  ));
  return row || null;
}

async function upsertLink(kind: Kind, externalId: string, internalId: string, userId: string) {
  const existing = await lookupExternal(kind, externalId, userId);
  if (existing) {
    await db.update(externalEntityLinks).set({ internalId, updatedAt: new Date() }).where(eq(externalEntityLinks.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(externalEntityLinks).values({
    integration: INTEGRATION, externalId, entityKind: kind, internalId, userId,
  }).returning();
  return created.id;
}

async function deleteLinkByInternalId(kind: Kind, internalId: string, userId: string) {
  await db.delete(externalEntityLinks).where(and(
    eq(externalEntityLinks.entityKind, kind),
    eq(externalEntityLinks.internalId, internalId),
    eq(externalEntityLinks.userId, userId),
  ));
}

const adapters: Record<Kind, {
  list: (userId: string, isAdmin: boolean) => Promise<any[]>;
  get: (id: string) => Promise<any | undefined>;
  create: (data: any) => Promise<any>;
  update: (id: string, data: any) => Promise<any>;
  delete: (id: string) => Promise<void>;
  getOwner: (row: any) => string | null | undefined;
}> = {
  "item": {
    list: (uid, admin) => storage.getSystemItems("aa-v2", admin ? undefined : [uid]),
    get: (id) => storage.getSystemItem(id),
    create: (d) => storage.createSystemItem(d),
    update: (id, d) => storage.updateSystemItem(id, d),
    delete: (id) => storage.deleteSystemItem(id),
    getOwner: (r) => r?.createdByUserId,
  },
  "spell": {
    list: (uid, admin) => storage.getSystemSpells("aa-v2", admin ? undefined : [uid]),
    get: (id) => storage.getSystemSpell(id),
    create: (d) => storage.createSystemSpell(d),
    update: (id, d) => storage.updateSystemSpell(id, d),
    delete: (id) => storage.deleteSystemSpell(id),
    getOwner: (r) => r?.ownerUserId,
  },
  "species": {
    list: (uid, admin) => storage.getSystemSpecies("A.A. V2", admin ? undefined : [uid]),
    get: (id) => storage.getSystemSpeciesById(id),
    create: (d) => storage.createSystemSpecies(d),
    update: (id, d) => storage.updateSystemSpecies(id, d),
    delete: (id) => storage.deleteSystemSpecies(id),
    getOwner: (r) => r?.ownerUserId,
  },
  "class": {
    list: (uid, admin) => storage.getClasses("aa-v2", admin ? undefined : [uid]),
    get: (id) => storage.getClass(id),
    create: (d) => storage.createClass(d),
    update: (id, d) => storage.updateClass(id, d),
    delete: (id) => storage.deleteClass(id),
    getOwner: (r) => r?.ownerUserId,
  },
  "feat-tree": {
    list: (uid, admin) => storage.getFeatTrees("aa-v2", admin ? undefined : [uid]),
    get: (id) => storage.getFeatTree(id),
    create: (d) => storage.createFeatTree(d),
    update: (id, d) => storage.updateFeatTree(id, d),
    delete: (id) => storage.deleteFeatTree(id),
    getOwner: (r) => r?.ownerUserId,
  },
  "character": {
    // Player/GM characters (non-template). Direct query because storage
    // doesn't expose a per-owner non-template character listing.
    list: async (uid, admin) => {
      if (admin) {
        return await db.select().from(characters).where(eq(characters.isTemplate, false));
      }
      return await db.select().from(characters).where(and(
        eq(characters.isTemplate, false),
        eq(characters.ownerUserId, uid),
      ));
    },
    get: async (id) => {
      const row = await storage.getCharacter(id);
      if (!row || row.isTemplate) return undefined;
      return row;
    },
    create: (d) => storage.createCharacter({ ...d, isTemplate: false }),
    update: (id, d) => storage.updateCharacter(id, d),
    delete: (id) => storage.deleteCharacter(id),
    getOwner: (r) => r?.ownerUserId,
  },
  "character-template": {
    list: (uid, admin) => storage.getCharacterTemplates(admin ? undefined : [uid]),
    get: (id) => storage.getCharacter(id),
    create: (d) => storage.createCharacter({ ...d, isTemplate: true }),
    update: (id, d) => storage.updateCharacter(id, d),
    delete: (id) => storage.deleteCharacter(id),
    getOwner: (r) => r?.ownerUserId,
  },
  "roll-template": {
    list: (uid, admin) => storage.getItemTemplates("aa-v2", admin ? undefined : [uid]),
    get: (id) => storage.getSystemItem(id),
    create: (d) => storage.createSystemItem({ ...d, isLiveTemplate: true, isTemplate: true }),
    update: (id, d) => storage.updateSystemItem(id, d),
    delete: (id) => storage.deleteSystemItem(id),
    getOwner: (r) => r?.createdByUserId,
  },
};

// ACL predicates re-exported from server/lib/library-acl.ts so sync and the
// REST app share one authorization source of truth.
const canRead = canReadLibraryRow;
const canWrite = canWriteLibraryRow;

function staleCheck(req: Request, existing: any): boolean {
  const ext = req.body?.externalUpdatedAt || req.headers["x-external-updated-at"];
  if (!ext || !existing?.updatedAt) return false;
  try {
    return new Date(String(ext)).getTime() < new Date(existing.updatedAt).getTime();
  } catch { return false; }
}

function originClient(req: Request): string | undefined {
  const h = req.headers["x-sync-origin"];
  if (typeof h === "string") return h;
  if (Array.isArray(h)) return h[0];
  return undefined;
}

function dropMeta(body: any) {
  const { externalId, externalUpdatedAt, ownerUserId, createdByUserId, ...rest } = body || {};
  return rest;
}

function envelope(kind: Kind, row: any, externalId?: string) {
  return { kind, id: row?.id, externalId: externalId || null, data: row };
}

// ---- Webhook URL validation (basic SSRF guard) ----
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (/^127\./.test(h)) return true;
  if (h === "0.0.0.0" || h === "::1") return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;       // link-local
  if (h.endsWith(".internal")) return true;
  return false;
}
function validateWebhookUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return "invalid url"; }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) {
    return "https required";
  }
  if (process.env.NODE_ENV === "production" && isPrivateHost(u.hostname)) return "private host not allowed";
  return null;
}

export function registerSyncRoutes(app: Express) {
  app.get("/api/sync/v1/me", requireSyncAuth(), async (req, res) => {
    const u = req.syncUser!;
    res.json({ id: u.id, isAdmin: u.isAdmin, scopes: u.scopes, libraryRouting: u.isAdmin ? "global-admin" : "personal-aa-v2" });
  });

  for (const kind of SYNC_KINDS) {
    const a = adapters[kind];
    const base = `/api/sync/v1/${pluralFor(kind)}`;

    app.get(base, requireSyncAuth("library:read"), async (req: Request, res: Response) => {
      try {
        const u = req.syncUser!;
        const rows = await a.list(u.id, u.isAdmin);
        res.json({ data: rows });
      } catch (err: any) {
        res.status(500).json({ error: "list_failed", message: err?.message });
      }
    });

    app.get(`${base}/by-external/:externalId`, requireSyncAuth("library:read"), async (req: Request, res: Response) => {
      const u = req.syncUser!;
      const link = await lookupExternal(kind, req.params.externalId, u.id);
      if (!link) return res.status(404).json({ error: "not_found" });
      const row = await a.get(link.internalId);
      if (!row) return res.status(404).json({ error: "not_found" });
      if (!canRead(u, a.getOwner(row))) return res.status(403).json({ error: "forbidden" });
      res.json(envelope(kind, row, req.params.externalId));
    });

    app.get(`${base}/:id`, requireSyncAuth("library:read"), async (req: Request, res: Response) => {
      const row = await a.get(req.params.id);
      if (!row) return res.status(404).json({ error: "not_found" });
      const u = req.syncUser!;
      if (!canRead(u, a.getOwner(row))) return res.status(403).json({ error: "forbidden" });
      const ext = await externalIdFor(kind, row.id, u.id);
      res.json(envelope(kind, row, ext || undefined));
    });

    app.post(base, requireSyncAuth("library:write"), async (req: Request, res: Response) => {
      try {
        const u = req.syncUser!;
        const externalId = req.body?.externalId as string | undefined;
        let existing: any = null;
        if (externalId) {
          const link = await lookupExternal(kind, externalId, u.id);
          if (link) existing = await a.get(link.internalId);
        }
        const inputData = applyOwnerRouting(kind, dropMeta(req.body), u);

        if (existing) {
          if (!canWrite(u, a.getOwner(existing))) return res.status(403).json({ error: "forbidden" });
          if (staleCheck(req, existing)) return res.status(200).json({ skipped: "stale", ...envelope(kind, existing, externalId) });
          const updated = await a.update(existing.id, inputData);
          await emitLibraryChange({ event: `library.${kind}.updated`, kind, action: "updated", id: updated.id, externalId, userId: a.getOwner(updated), data: updated, sourceClientId: originClient(req) });
          return res.status(200).json(envelope(kind, updated, externalId));
        }

        const created = await a.create(inputData);
        if (externalId) await upsertLink(kind, externalId, created.id, u.id);
        await emitLibraryChange({ event: `library.${kind}.created`, kind, action: "created", id: created.id, externalId, userId: a.getOwner(created), data: created, sourceClientId: originClient(req) });
        res.status(201).json(envelope(kind, created, externalId));
      } catch (err: any) {
        res.status(400).json({ error: "create_failed", message: err?.message });
      }
    });

    app.patch(`${base}/:id`, requireSyncAuth("library:write"), async (req: Request, res: Response) => {
      try {
        const u = req.syncUser!;
        const existing = await a.get(req.params.id);
        if (!existing) return res.status(404).json({ error: "not_found" });
        if (!canWrite(u, a.getOwner(existing))) return res.status(403).json({ error: "forbidden" });
        const ext = await externalIdFor(kind, existing.id, u.id);
        if (staleCheck(req, existing)) return res.status(200).json({ skipped: "stale", ...envelope(kind, existing, ext || undefined) });
        // Non-admin PATCHes are pinned to AA V2 + own ownership so the row
        // cannot be moved out of the user's personal library.
        const patchBody = applyPatchOwnerRouting(kind, dropMeta(req.body), u);
        const updated = await a.update(req.params.id, patchBody);
        await emitLibraryChange({ event: `library.${kind}.updated`, kind, action: "updated", id: updated.id, externalId: ext || undefined, userId: a.getOwner(updated), data: updated, sourceClientId: originClient(req) });
        res.json(envelope(kind, updated, ext || undefined));
      } catch (err: any) {
        res.status(400).json({ error: "update_failed", message: err?.message });
      }
    });

    app.delete(`${base}/:id`, requireSyncAuth("library:write"), async (req: Request, res: Response) => {
      try {
        const u = req.syncUser!;
        const existing = await a.get(req.params.id);
        if (!existing) return res.status(404).json({ error: "not_found" });
        if (!canWrite(u, a.getOwner(existing))) return res.status(403).json({ error: "forbidden" });
        await a.delete(req.params.id);
        await deleteLinkByInternalId(kind, req.params.id, u.id);
        await emitLibraryChange({ event: `library.${kind}.deleted`, kind, action: "deleted", id: req.params.id, userId: a.getOwner(existing), sourceClientId: originClient(req) });
        res.json({ ok: true, kind, id: req.params.id });
      } catch (err: any) {
        res.status(400).json({ error: "delete_failed", message: err?.message });
      }
    });
  }

  // ===== Webhook management =====
  app.get("/api/sync/v1/webhooks", requireSyncAuth("webhooks:manage"), async (req, res) => {
    const u = req.syncUser!;
    const rows = await db.select().from(outgoingWebhooks).where(eq(outgoingWebhooks.clientId, u.clientId));
    res.json({ data: rows.map(r => ({ id: r.id, url: r.url, active: r.active, createdAt: r.createdAt })) });
  });

  app.post("/api/sync/v1/webhooks", requireSyncAuth("webhooks:manage"), async (req, res) => {
    const u = req.syncUser!;
    const { url } = req.body || {};
    if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
    const bad = validateWebhookUrl(url);
    if (bad) return res.status(400).json({ error: "invalid_url", message: bad });
    const secret = crypto.randomBytes(32).toString("base64url");
    const [row] = await db.insert(outgoingWebhooks).values({ clientId: u.clientId, url, secret, active: true }).returning();
    res.status(201).json({ id: row.id, url: row.url, secret, active: row.active });
  });

  app.delete("/api/sync/v1/webhooks/:id", requireSyncAuth("webhooks:manage"), async (req, res) => {
    const u = req.syncUser!;
    await db.delete(outgoingWebhooks).where(and(eq(outgoingWebhooks.id, req.params.id), eq(outgoingWebhooks.clientId, u.clientId)));
    res.json({ ok: true });
  });
}
