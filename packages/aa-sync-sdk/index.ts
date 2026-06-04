/**
 * @arcana/aa-sync-sdk
 *
 * Lightweight TypeScript client for Arcana Adventure's two-way library
 * sync. Drop into CanvasRealms (or any partner app) — pure fetch, no
 * dependencies.
 *
 * ```ts
 * import { ArcanaSyncClient, verifyWebhookSignature } from "@arcana/aa-sync-sdk";
 *
 * const client = new ArcanaSyncClient({
 *   baseUrl: "https://arcana.replit.app",
 *   accessToken: "<bearer>",
 *   refreshToken: "<refresh>",
 *   clientId: "canvasrealms",
 *   clientSecret: process.env.CANVASREALMS_CLIENT_SECRET!,
 *   originId: "canvasrealms", // suppresses webhook fanout to ourselves
 * });
 *
 * await client.upsert("item", { externalId: "cr_abc", name: "Sunblade", ... });
 * await client.list("spell");
 * ```
 */

export type SyncKind =
  | "item"
  | "spell"
  | "character"
  | "species"
  | "class"
  | "feat-tree"
  | "character-template"
  | "roll-template"
  | "element";

const KIND_PLURAL: Record<SyncKind, string> = {
  "item": "items",
  "spell": "spells",
  "character": "characters",
  "species": "species",
  "class": "classes",
  "feat-tree": "feat-trees",
  "character-template": "character-templates",
  "roll-template": "roll-templates",
  "element": "elements",
};
function pluralize(kind: SyncKind): string { return KIND_PLURAL[kind]; }

/**
 * One-line factory: `const client = createClient({ baseUrl, accessToken });`
 * For full OAuth refresh support, pass `clientId`, `clientSecret`, and `refreshToken`.
 */
export function createClient(opts: ArcanaSyncClientOptions): ArcanaSyncClient {
  return new ArcanaSyncClient(opts);
}

export interface SyncEnvelope<T = any> {
  kind: SyncKind;
  id: string;
  externalId: string | null;
  data: T;
}

export interface ArcanaSyncClientOptions {
  baseUrl: string;
  accessToken: string;
  /**
   * Optional refresh credentials. Required only if you want the SDK to
   * auto-refresh on 401. Minimal usage works without them:
   *   `createClient({ baseUrl, accessToken })`
   */
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  /** Identifier echoed in `X-Sync-Origin` so this client's own writes don't trigger inbound webhook fanout to itself. */
  originId?: string;
  /** Called whenever the access token is auto-refreshed so the caller can persist it. */
  onTokenRefresh?: (next: { accessToken: string; refreshToken: string; expiresAt: number }) => void;
}

export class ArcanaSyncClient {
  private accessToken: string;
  private refreshToken?: string;
  constructor(private readonly opts: ArcanaSyncClientOptions) {
    this.accessToken = opts.accessToken;
    this.refreshToken = opts.refreshToken;
  }

  private async request(method: string, path: string, body?: any, externalUpdatedAt?: string): Promise<any> {
    const url = this.opts.baseUrl.replace(/\/$/, "") + path;
    const doFetch = (token: string) => fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        ...(this.opts.originId ? { "x-sync-origin": this.opts.originId } : {}),
        ...(externalUpdatedAt ? { "x-external-updated-at": externalUpdatedAt } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    let res = await doFetch(this.accessToken);
    if (res.status === 401 && this.refreshToken) {
      await this.refresh();
      res = await doFetch(this.accessToken);
    }
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ArcanaSyncError(res.status, parsed?.error || "request_failed", parsed?.message || text);
    return parsed;
  }

  async refresh(): Promise<void> {
    if (!this.refreshToken) throw new ArcanaSyncError(401, "no_refresh_token", "No refresh token configured");
    if (!this.opts.clientId || !this.opts.clientSecret) {
      throw new ArcanaSyncError(401, "no_client_credentials", "clientId and clientSecret are required to refresh");
    }
    const url = this.opts.baseUrl.replace(/\/$/, "") + "/oauth/token";
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
    });
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    if (!res.ok) throw new ArcanaSyncError(res.status, "refresh_failed", await res.text());
    const json = await res.json();
    this.accessToken = json.access_token;
    if (json.refresh_token) this.refreshToken = json.refresh_token;
    this.opts.onTokenRefresh?.({ accessToken: this.accessToken, refreshToken: this.refreshToken!, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 });
  }

  // ===== Library CRUD =====
  list<T = any>(kind: SyncKind): Promise<{ data: T[] }> { return this.request("GET", `/api/sync/v1/${pluralize(kind)}`); }
  get<T = any>(kind: SyncKind, id: string): Promise<SyncEnvelope<T>> { return this.request("GET", `/api/sync/v1/${pluralize(kind)}/${encodeURIComponent(id)}`); }
  getByExternal<T = any>(kind: SyncKind, externalId: string): Promise<SyncEnvelope<T>> { return this.request("GET", `/api/sync/v1/${pluralize(kind)}/by-external/${encodeURIComponent(externalId)}`); }
  /** Create or upsert (uses `externalId` as the key for upsert). */
  upsert<T = any>(kind: SyncKind, body: T & { externalId?: string; externalUpdatedAt?: string }): Promise<SyncEnvelope<T>> {
    return this.request("POST", `/api/sync/v1/${pluralize(kind)}`, body, (body as any).externalUpdatedAt);
  }
  patch<T = any>(kind: SyncKind, id: string, body: Partial<T> & { externalUpdatedAt?: string }): Promise<SyncEnvelope<T>> {
    return this.request("PATCH", `/api/sync/v1/${pluralize(kind)}/${encodeURIComponent(id)}`, body, (body as any).externalUpdatedAt);
  }
  delete(kind: SyncKind, id: string): Promise<{ ok: true }> { return this.request("DELETE", `/api/sync/v1/${pluralize(kind)}/${encodeURIComponent(id)}`); }

  // ===== Webhook management =====
  listWebhooks(): Promise<{ data: Array<{ id: string; url: string; active: boolean; createdAt: string }> }> { return this.request("GET", "/api/sync/v1/webhooks"); }
  /** Returns the secret ONCE — store it. Used to verify incoming webhooks. */
  registerWebhook(url: string): Promise<{ id: string; url: string; secret: string; active: boolean }> { return this.request("POST", "/api/sync/v1/webhooks", { url }); }
  deleteWebhook(id: string): Promise<{ ok: true }> { return this.request("DELETE", `/api/sync/v1/webhooks/${encodeURIComponent(id)}`); }

  /** Get info about the bearer-token user (admin → global library, otherwise personal AA V2). */
  me(): Promise<{ id: string; isAdmin: boolean; scopes: string[]; libraryRouting: "global-admin" | "personal-aa-v2" }> {
    return this.request("GET", "/api/sync/v1/me");
  }
}

export class ArcanaSyncError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = "ArcanaSyncError"; }
}

/**
 * Verify an inbound webhook signature using HMAC-SHA256.
 * The `body` MUST be the raw request body string (not a re-stringified
 * parsed object). Header is `x-aa-signature` formatted as `sha256=<hex>`.
 */
export async function verifyWebhookSignature(rawBody: string, secret: string, header: string | undefined): Promise<boolean> {
  if (!header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const expected = "sha256=" + hex;
  if (expected.length !== header.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) ok |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return ok === 0;
}

/** Build the OAuth2 authorize URL with PKCE. */
export function buildAuthorizeUrl(opts: { baseUrl: string; clientId: string; redirectUri: string; scope?: string; state: string; codeChallenge: string; codeChallengeMethod?: "S256" | "plain" }): string {
  const u = new URL(opts.baseUrl.replace(/\/$/, "") + "/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", opts.scope || "library:read library:write webhooks:manage");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", opts.codeChallengeMethod || "S256");
  return u.toString();
}

/** Exchange an authorization code for tokens. */
export async function exchangeAuthorizationCode(opts: { baseUrl: string; code: string; redirectUri: string; clientId: string; clientSecret: string; codeVerifier?: string }): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    ...(opts.codeVerifier ? { code_verifier: opts.codeVerifier } : {}),
  });
  const res = await fetch(opts.baseUrl.replace(/\/$/, "") + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new ArcanaSyncError(res.status, "exchange_failed", await res.text());
  return res.json();
}

/** PKCE helpers for partner apps that don't already have one. */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const codeVerifier = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { codeVerifier, codeChallenge: codeVerifier /* caller must hash if using S256 — see hashChallenge */ };
}

/** Compute the S256 code_challenge for a given verifier. */
export async function hashChallenge(codeVerifier: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(codeVerifier));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
