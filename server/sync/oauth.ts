import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import { db } from "../db";
import { oauthClients, oauthAuthorizationCodes, oauthAccessTokens, oauthRefreshTokens, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const ACCESS_TTL_S = 60 * 60;          // 1h
const REFRESH_TTL_S = 60 * 60 * 24 * 30; // 30d
const CODE_TTL_S = 5 * 60;

function token(bytes = 32) { return crypto.randomBytes(bytes).toString("base64url"); }

function verifyChallenge(verifier: string, challenge: string, method: string | null | undefined): boolean {
  if (!challenge) return true;
  if (!verifier) return false;
  if (method === "plain") return verifier === challenge;
  // S256 (default)
  const hash = crypto.createHash("sha256").update(verifier).digest().toString("base64url");
  return hash === challenge;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c] as string));
}

function consentPage(opts: { clientName: string; clientId: string; redirectUri: string; scopes: string[]; state: string; codeChallenge: string; codeChallengeMethod: string; userEmail: string }): string {
  const scopeRows = opts.scopes.map(s => `<li><code>${escapeHtml(s)}</code></li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Authorize ${escapeHtml(opts.clientName)}</title>
<style>body{background:#1c1917;color:#e7e5e4;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#292524;border:1px solid #44403c;border-radius:12px;padding:32px;max-width:480px;width:90%}
h1{color:#fbbf24;margin:0 0 8px;font-size:22px}p{color:#a8a29e;margin:8px 0}
ul{margin:8px 0;padding-left:20px}code{background:#1c1917;padding:2px 6px;border-radius:4px;color:#fcd34d;font-size:13px}
.actions{display:flex;gap:12px;margin-top:24px}button{flex:1;padding:10px 16px;border-radius:8px;border:none;font-weight:600;cursor:pointer;font-size:14px}
.approve{background:#d97706;color:#1c1917}.deny{background:#44403c;color:#e7e5e4}.user{font-size:12px;color:#78716c;margin-top:16px}
</style></head><body><div class="box">
<h1>Authorize ${escapeHtml(opts.clientName)}</h1>
<p><strong>${escapeHtml(opts.clientName)}</strong> wants to access your Arcana Adventure library.</p>
<p>This will allow it to:</p><ul>${scopeRows}</ul>
<form method="POST" action="/oauth/authorize/decision">
<input type="hidden" name="client_id" value="${escapeHtml(opts.clientId)}"/>
<input type="hidden" name="redirect_uri" value="${escapeHtml(opts.redirectUri)}"/>
<input type="hidden" name="scope" value="${escapeHtml(opts.scopes.join(" "))}"/>
<input type="hidden" name="state" value="${escapeHtml(opts.state)}"/>
<input type="hidden" name="code_challenge" value="${escapeHtml(opts.codeChallenge)}"/>
<input type="hidden" name="code_challenge_method" value="${escapeHtml(opts.codeChallengeMethod)}"/>
<div class="actions">
<button class="deny" type="submit" name="decision" value="deny">Deny</button>
<button class="approve" type="submit" name="decision" value="approve">Authorize</button>
</div>
<div class="user">Signed in as ${escapeHtml(opts.userEmail)}</div></form></div></body></html>`;
}

export async function getClientByClientId(clientId: string) {
  const [c] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  return c || null;
}

export async function resolveBearer(authHeader: string | undefined): Promise<{ userId: string; clientId: string; scopes: string[]; tokenRow: any } | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const tok = authHeader.slice(7).trim();
  if (!tok) return null;
  const [row] = await db.select().from(oauthAccessTokens).where(eq(oauthAccessTokens.token, tok));
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  // touch lastUsedAt (fire and forget)
  void db.update(oauthAccessTokens).set({ lastUsedAt: new Date() }).where(eq(oauthAccessTokens.token, tok)).catch(() => {});
  return { userId: row.userId, clientId: row.clientId, scopes: row.scopes || [], tokenRow: row };
}

async function issueTokens(clientId: string, userId: string, scopes: string[]) {
  const access = token();
  const refresh = token();
  const now = Date.now();
  await db.insert(oauthAccessTokens).values({
    token: access, clientId, userId, scopes,
    expiresAt: new Date(now + ACCESS_TTL_S * 1000),
  });
  await db.insert(oauthRefreshTokens).values({
    token: refresh, clientId, userId, scopes,
    expiresAt: new Date(now + REFRESH_TTL_S * 1000),
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(" ") };
}

export function registerOAuthRoutes(app: Express) {
  // GET /oauth/authorize — consent page
  app.get("/oauth/authorize", async (req: Request, res: Response) => {
    try {
      const { response_type, client_id, redirect_uri, scope, state = "", code_challenge = "", code_challenge_method = "S256" } = req.query as Record<string, string>;
      if (response_type !== "code") return res.status(400).send("response_type must be 'code'");
      if (!client_id || !redirect_uri) return res.status(400).send("client_id and redirect_uri required");
      const client = await getClientByClientId(client_id);
      if (!client) return res.status(400).send("Unknown client_id");
      if (!client.redirectUris.includes(redirect_uri)) return res.status(400).send("redirect_uri not registered");
      const reqScopes = (scope || "library:read library:write").split(/\s+/).filter(Boolean);
      const bad = reqScopes.find(s => !client.allowedScopes.includes(s));
      if (bad) return res.status(400).send(`scope not allowed: ${bad}`);

      if (!(req.session as any).userId) {
        const next = encodeURIComponent(req.originalUrl);
        return res.redirect(`/login?next=${next}`);
      }
      const [u] = await db.select().from(users).where(eq(users.id, (req.session as any).userId));
      if (!u) return res.status(401).send("Not authenticated");

      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(consentPage({
        clientName: client.name, clientId: client.clientId, redirectUri: redirect_uri,
        scopes: reqScopes, state, codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method,
        userEmail: u.email,
      }));
    } catch (err: any) {
      res.status(500).send("Internal error: " + (err?.message || err));
    }
  });

  // POST /oauth/authorize/decision — issue auth code
  app.post("/oauth/authorize/decision", async (req: Request, res: Response) => {
    try {
      const { decision, client_id, redirect_uri, scope, state = "", code_challenge = "", code_challenge_method = "S256" } = req.body || {};
      if (!(req.session as any).userId) return res.status(401).send("Not authenticated");
      const client = await getClientByClientId(client_id);
      if (!client) return res.status(400).send("Unknown client");
      if (!client.redirectUris.includes(redirect_uri)) return res.status(400).send("redirect_uri not registered");
      // Re-validate scopes against client allow-list (defense against form tampering).
      const reqScopes = String(scope || "").split(/\s+/).filter(Boolean);
      const badScope = reqScopes.find(s => !client.allowedScopes.includes(s));
      if (badScope) return res.status(400).send(`scope not allowed: ${badScope}`);
      // Validate PKCE method if provided.
      if (code_challenge && !["S256", "plain"].includes(code_challenge_method)) {
        return res.status(400).send("invalid code_challenge_method");
      }
      if (decision !== "approve") {
        const url = new URL(redirect_uri);
        url.searchParams.set("error", "access_denied");
        if (state) url.searchParams.set("state", state);
        return res.redirect(url.toString());
      }
      const code = token();
      await db.insert(oauthAuthorizationCodes).values({
        code, clientId: client_id, userId: (req.session as any).userId, redirectUri: redirect_uri,
        scopes: reqScopes,
        codeChallenge: code_challenge || null, codeChallengeMethod: code_challenge ? code_challenge_method : null,
        expiresAt: new Date(Date.now() + CODE_TTL_S * 1000),
      });
      const url = new URL(redirect_uri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);
      res.redirect(url.toString());
    } catch (err: any) {
      res.status(500).send("Internal error: " + (err?.message || err));
    }
  });

  // POST /oauth/token — exchange code for tokens, or refresh
  app.post("/oauth/token", async (req: Request, res: Response) => {
    try {
      const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier, refresh_token } = req.body || {};
      const client = client_id ? await getClientByClientId(client_id) : null;
      if (!client) return res.status(400).json({ error: "invalid_client" });
      if (!client_secret || !(await bcrypt.compare(client_secret, client.clientSecretHash))) {
        return res.status(401).json({ error: "invalid_client", error_description: "client secret mismatch" });
      }

      if (grant_type === "authorization_code") {
        if (!code) return res.status(400).json({ error: "invalid_request", error_description: "code required" });
        const [row] = await db.select().from(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.code, code));
        if (!row || row.consumed) return res.status(400).json({ error: "invalid_grant" });
        if (row.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: "invalid_grant", error_description: "code expired" });
        if (row.clientId !== client_id) return res.status(400).json({ error: "invalid_grant" });
        if (row.redirectUri !== redirect_uri) return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
        if (row.codeChallenge && !verifyChallenge(code_verifier || "", row.codeChallenge, row.codeChallengeMethod)) {
          return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        }
        // Atomic single-use consumption — prevents race-condition double-redemption.
        const consumed = await db.update(oauthAuthorizationCodes)
          .set({ consumed: true })
          .where(and(eq(oauthAuthorizationCodes.code, code), eq(oauthAuthorizationCodes.consumed, false)))
          .returning({ code: oauthAuthorizationCodes.code });
        if (consumed.length === 0) return res.status(400).json({ error: "invalid_grant", error_description: "code already used" });
        const out = await issueTokens(client_id, row.userId, row.scopes || []);
        return res.json(out);
      }

      if (grant_type === "refresh_token") {
        if (!refresh_token) return res.status(400).json({ error: "invalid_request" });
        const [r] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.token, refresh_token));
        if (!r || r.revokedAt || r.expiresAt.getTime() < Date.now() || r.clientId !== client_id) {
          return res.status(400).json({ error: "invalid_grant" });
        }
        // rotate refresh
        await db.update(oauthRefreshTokens).set({ revokedAt: new Date() }).where(eq(oauthRefreshTokens.token, refresh_token));
        const out = await issueTokens(client_id, r.userId, r.scopes || []);
        return res.json(out);
      }

      res.status(400).json({ error: "unsupported_grant_type" });
    } catch (err: any) {
      res.status(500).json({ error: "server_error", error_description: String(err?.message || err) });
    }
  });

  // POST /oauth/revoke
  app.post("/oauth/revoke", async (req: Request, res: Response) => {
    try {
      const { token: tok, client_id, client_secret } = req.body || {};
      const client = client_id ? await getClientByClientId(client_id) : null;
      if (!client) return res.status(400).json({ error: "invalid_client" });
      if (!client_secret || !(await bcrypt.compare(client_secret, client.clientSecretHash))) {
        return res.status(401).json({ error: "invalid_client" });
      }
      if (!tok) return res.status(200).json({ ok: true });
      await db.update(oauthAccessTokens).set({ revokedAt: new Date() }).where(eq(oauthAccessTokens.token, tok));
      await db.update(oauthRefreshTokens).set({ revokedAt: new Date() }).where(eq(oauthRefreshTokens.token, tok));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /oauth/userinfo — bearer-auth
  app.get("/oauth/userinfo", async (req: Request, res: Response) => {
    const auth = await resolveBearer(req.headers.authorization);
    if (!auth) return res.status(401).json({ error: "invalid_token" });
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!u) return res.status(404).json({ error: "user_not_found" });
    res.json({ sub: u.id, email: u.email, username: u.username, name: u.name, is_admin: !!u.isAdmin });
  });
}

// Seed CanvasRealms client at boot if not present.
// Secret comes from env CANVASREALMS_CLIENT_SECRET; if absent, generate one
// and log it once so the operator can copy it into Replit secrets.
export async function seedCanvasRealmsClient() {
  try {
    const existing = await getClientByClientId("canvasrealms");
    if (existing) return;
    let secret = process.env.CANVASREALMS_CLIENT_SECRET;
    let generated = false;
    if (!secret) {
      secret = crypto.randomBytes(32).toString("base64url");
      generated = true;
    }
    const hash = await bcrypt.hash(secret, 10);
    await db.insert(oauthClients).values({
      clientId: "canvasrealms",
      clientSecretHash: hash,
      name: "CanvasRealms",
      redirectUris: ["https://canvasrealms.com/oauth/callback", "http://localhost:5000/oauth/callback"],
      allowedScopes: ["library:read", "library:write", "webhooks:manage"],
    });
    console.log("[sync.oauth] Seeded CanvasRealms OAuth client");
    if (generated) {
      console.log("[sync.oauth] *** Generated CanvasRealms client_secret (store in CANVASREALMS_CLIENT_SECRET secret): " + secret);
    }
  } catch (err) {
    console.error("[sync.oauth] seed failed:", err);
  }
}
