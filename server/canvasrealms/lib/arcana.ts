import {
  ArcanaSyncClient,
  type SyncKind,
  ArcanaSyncError,
} from "@arcana/aa-sync-sdk";
import { eq } from "drizzle-orm";
import { db, realmsTable } from "@workspace/db";
import { decryptToken, encryptToken } from "./arcana-crypto";
import { logger } from "./logger";

/** Set of node kinds that map to an Arcana entity. */
export const ARCANA_KINDS = new Set<string>([
  "item",
  "spell",
  "character",
  "species",
  "class",
  "feat-tree",
  "character-template",
  "roll-template",
]);

export function isArcanaKind(kind: string): kind is SyncKind {
  return ARCANA_KINDS.has(kind);
}

const DEFAULT_HOST = process.env["ARCANA_HOST_URL"] || "https://ArcanaVTT.com";
export const ARCANA_OAUTH_SCOPES = "library:read library:write webhooks:manage";
export const ARCANA_CLIENT_ID = "canvasrealms";
export const ARCANA_ORIGIN_ID = "canvasrealms";

export function defaultArcanaHost(): string {
  return DEFAULT_HOST;
}

export function getClientSecret(): string {
  const v = process.env["ARCANA_CLIENT_SECRET"];
  if (!v) throw new Error("ARCANA_CLIENT_SECRET is not configured");
  return v;
}

export interface ArcanaRealmCreds {
  realmId: string;
  host: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

/** Decrypt and return the realm's Arcana creds, or null if not linked. */
export async function loadRealmCreds(
  realmId: string,
): Promise<ArcanaRealmCreds | null> {
  const [row] = await db
    .select({
      arcanaHost: realmsTable.arcanaHost,
      access: realmsTable.arcanaAccessToken,
      refresh: realmsTable.arcanaRefreshToken,
      expires: realmsTable.arcanaTokenExpiresAt,
    })
    .from(realmsTable)
    .where(eq(realmsTable.id, realmId));
  if (!row || !row.access || !row.arcanaHost) return null;
  try {
    const accessToken = decryptToken(row.access);
    const refreshToken = row.refresh ? decryptToken(row.refresh) : null;
    return {
      realmId,
      host: row.arcanaHost,
      accessToken,
      refreshToken,
      expiresAt: row.expires,
    };
  } catch (err) {
    logger.warn({ err, realmId }, "loadRealmCreds: decrypt failed");
    return null;
  }
}

/** Build a fully-configured SDK client for a realm, with token refresh that
 *  persists rotated tokens back to the DB. */
export function buildClient(creds: ArcanaRealmCreds): ArcanaSyncClient {
  return new ArcanaSyncClient({
    baseUrl: creds.host,
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken ?? undefined,
    clientId: ARCANA_CLIENT_ID,
    clientSecret: getClientSecret(),
    originId: ARCANA_ORIGIN_ID,
    onTokenRefresh: ({ accessToken, refreshToken, expiresAt }) => {
      void db
        .update(realmsTable)
        .set({
          arcanaAccessToken: encryptToken(accessToken),
          arcanaRefreshToken: encryptToken(refreshToken),
          arcanaTokenExpiresAt: new Date(expiresAt),
        })
        .where(eq(realmsTable.id, creds.realmId))
        .catch((err) =>
          logger.error({ err, realmId: creds.realmId }, "persist refreshed Arcana token failed"),
        );
    },
  });
}

/**
 * Push a node update to Arcana. Best-effort: errors are logged, never thrown
 * to the caller, so a failed sync never blocks the local save. The webhook
 * loop is suppressed by the SDK because we set `originId`.
 */
export async function pushNodeToArcana(
  realmId: string,
  node: {
    id: string;
    kind: string;
    title: string;
    arcanaStats?: unknown;
    updatedAt?: Date;
  },
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (!isArcanaKind(node.kind)) return { ok: true };
  const creds = await loadRealmCreds(realmId);
  if (!creds) return { ok: true };
  const stats =
    node.arcanaStats && typeof node.arcanaStats === "object"
      ? (node.arcanaStats as Record<string, unknown>)
      : {};
  const payload: Record<string, unknown> = {
    ...stats,
    externalId: node.id,
    // Always include a name fallback so AA can render something even
    // before any stats are filled in.
    name: (stats["name"] as string) ?? node.title,
    externalUpdatedAt: (node.updatedAt ?? new Date()).toISOString(),
  };
  // Fill in any required fields the user hasn't filled yet with sensible
  // type-appropriate defaults so Arcana doesn't reject the create with 400.
  await fillArcanaRequiredDefaults(realmId, node.kind, payload);
  const client = buildClient(creds);
  try {
    await client.upsert(node.kind as SyncKind, payload);
    return { ok: true };
  } catch (err) {
    if (err instanceof ArcanaSyncError) {
      logger.warn(
        { realmId, nodeId: node.id, kind: node.kind, status: err.status, code: err.code },
        "Arcana upsert failed",
      );
      return { ok: false, error: err.message, status: err.status };
    }
    logger.warn({ err, realmId, nodeId: node.id }, "Arcana upsert failed");
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cache for Arcana's OpenAPI document, keyed by realm. The schema can change
 * as Arcana evolves so we honour an etag/version check; if the upstream
 * document doesn't expose one we fall back to a 5-minute TTL.
 */
interface CachedSchema {
  fetchedAt: number;
  etag: string | null;
  version: string | null;
  body: unknown;
}
const SCHEMA_TTL_MS = 5 * 60 * 1000;
const schemaCache = new Map<string, CachedSchema>();

export async function fetchArcanaOpenapi(
  realmId: string,
  forceRefresh = false,
): Promise<unknown> {
  const creds = await loadRealmCreds(realmId);
  if (!creds) throw new Error("realm is not linked to Arcana");

  const cached = schemaCache.get(realmId);
  if (
    cached &&
    !forceRefresh &&
    Date.now() - cached.fetchedAt < SCHEMA_TTL_MS
  ) {
    return cached.body;
  }

  const url = creds.host.replace(/\/$/, "") + "/api/sync/v1/openapi.json";
  const headers: Record<string, string> = {
    authorization: `Bearer ${creds.accessToken}`,
  };
  if (cached?.etag) headers["if-none-match"] = cached.etag;

  let res = await fetch(url, { headers });
  if (res.status === 401 && creds.refreshToken) {
    // Trigger a refresh via the SDK so the new token is persisted, then retry.
    const client = buildClient(creds);
    await client.refresh();
    const fresh = await loadRealmCreds(realmId);
    if (!fresh) throw new Error("Arcana link was lost during schema fetch");
    headers["authorization"] = `Bearer ${fresh.accessToken}`;
    res = await fetch(url, { headers });
  }
  if (res.status === 304 && cached) {
    cached.fetchedAt = Date.now();
    return cached.body;
  }
  if (!res.ok) {
    throw new Error(`Arcana openapi fetch failed (${res.status})`);
  }
  const body = await res.json();
  schemaCache.set(realmId, {
    fetchedAt: Date.now(),
    etag: res.headers.get("etag"),
    version:
      (body && typeof body === "object" && (body as Record<string, unknown>)["info"]
        ? ((body as { info?: { version?: string } }).info?.version ?? null)
        : null),
    body,
  });
  return body;
}

export function invalidateArcanaSchemaCache(realmId: string): void {
  schemaCache.delete(realmId);
}

interface JSONSchemaLite {
  type?: string | string[];
  properties?: Record<string, JSONSchemaLite>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
}

/** Find Arcana's schema for a given node kind in the cached openapi doc.
 *  Tolerant of naming variations: kebab-case, PascalCase, "Sync" prefix,
 *  and finally a case-insensitive sweep of all schema names. */
export function pickArcanaSchemaForKind(
  doc: unknown,
  kind: string,
): JSONSchemaLite | null {
  if (!doc || typeof doc !== "object") return null;
  const components = (doc as { components?: { schemas?: Record<string, JSONSchemaLite> } }).components;
  const schemas = components?.schemas ?? {};
  const camel = kind.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const Pascal = camel[0]!.toUpperCase() + camel.slice(1);
  const candidates = [
    `Sync${Pascal}`,
    Pascal,
    camel,
    kind[0]!.toUpperCase() + kind.slice(1),
    kind,
    `Sync${Pascal}Patch`,
  ];
  for (const c of candidates) {
    if (schemas[c]) return schemas[c]!;
  }
  // Last-ditch case-insensitive match across all schema names.
  const wantPascal = Pascal.toLowerCase();
  const wantSync = ("sync" + wantPascal);
  for (const [name, schema] of Object.entries(schemas)) {
    const lc = name.toLowerCase();
    if (lc === wantSync || lc === wantPascal) return schema;
  }
  return null;
}

/** Mutate `payload` to add type-appropriate defaults for any required field
 *  on the Arcana schema that is currently missing or null/undefined. Best
 *  effort — silently skips on schema fetch failure. */
async function fillArcanaRequiredDefaults(
  realmId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let doc: unknown;
  try {
    doc = await fetchArcanaOpenapi(realmId);
  } catch {
    return;
  }
  const schema = pickArcanaSchemaForKind(doc, kind);
  if (!schema?.required || !schema.properties) return;
  for (const key of schema.required) {
    if (key === "name" || key === "externalId" || key === "externalUpdatedAt") continue;
    const cur = payload[key];
    if (cur !== undefined && cur !== null && cur !== "") continue;
    const propSchema = schema.properties[key];
    if (!propSchema) continue;
    payload[key] = defaultForSchema(propSchema);
  }
}

function defaultForSchema(s: JSONSchemaLite): unknown {
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== "null") ?? s.type[0] : s.type;
  switch (t) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "array":
      return [];
    case "object":
      return {};
    case "string":
    default:
      return "";
  }
}

/**
 * Short-lived in-memory store for OAuth state -> PKCE verifier mapping.
 * Keyed by signed state. TTL 10 minutes — long enough for a slow consent
 * flow, short enough to avoid leaks.
 */
interface PendingAuth {
  realmId: string;
  codeVerifier: string;
  redirectUri: string;
  host: string;
  returnTo: string | null;
  expiresAt: number;
}
const pendingAuth = new Map<string, PendingAuth>();
const PKCE_TTL_MS = 10 * 60 * 1000;

export function rememberPendingAuth(state: string, p: Omit<PendingAuth, "expiresAt">): void {
  // Opportunistic GC.
  const now = Date.now();
  for (const [k, v] of pendingAuth) {
    if (v.expiresAt < now) pendingAuth.delete(k);
  }
  pendingAuth.set(state, { ...p, expiresAt: now + PKCE_TTL_MS });
}

export function consumePendingAuth(state: string): PendingAuth | null {
  const v = pendingAuth.get(state);
  if (!v) return null;
  pendingAuth.delete(state);
  if (v.expiresAt < Date.now()) return null;
  return v;
}
