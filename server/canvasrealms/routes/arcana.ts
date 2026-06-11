import { Router, type IRouter, type Request } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, realmsTable, nodesTable } from "@workspace/db";
import {
  ArcanaSyncClient,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  generatePkce,
  hashChallenge,
} from "@arcana/aa-sync-sdk";
import { requireRealmAccess } from "../middlewares/auth";
import {
  ARCANA_CLIENT_ID,
  ARCANA_OAUTH_SCOPES,
  ARCANA_ORIGIN_ID,
  buildClient,
  consumePendingAuth,
  defaultArcanaHost,
  fetchArcanaOpenapi,
  getClientSecret,
  invalidateArcanaSchemaCache,
  isArcanaKind,
  loadRealmCreds,
  rememberPendingAuth,
} from "../lib/arcana";
import { ArcanaSyncError, type SyncKind } from "@arcana/aa-sync-sdk";
import { encryptToken } from "../lib/arcana-crypto";
import { signValue } from "../lib/arcana-crypto";
import { logger } from "../lib/logger";
import { bumpInvalidation } from "../realtime/doc-registry";
import { toRealmDto } from "../lib/realm-dto";

const router: IRouter = Router();
// Public sub-router for the OAuth callback only. Arcana redirects the user
// here with no Clerk session attached, so this MUST be mounted before
// requireAuth in routes/index.ts. All other arcana routes go on `router`
// (the default export) and are mounted after requireAuth.
export const publicArcanaRouter: IRouter = Router();

function externalBaseUrl(req: Request): string {
  // Same host the request came in on, so the OAuth redirect URI exchanged
  // with Arcana matches the URL the browser actually loads after consent.
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ||
    req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

function callbackUrl(req: Request): string {
  return `${externalBaseUrl(req)}/api/arcana/callback`;
}

function webhookUrl(req: Request): string {
  return `${externalBaseUrl(req)}/api/arcana/webhook`;
}

/** Build authorize URL. */
router.get(
  "/realms/:realmId/arcana/authorize",
  requireRealmAccess("owner"),
  async (req, res) => {
    const realmId = req.params["realmId"] as string;
    const host = defaultArcanaHost();
    const { codeVerifier } = generatePkce();
    const codeChallenge = await hashChallenge(codeVerifier);
    const stateRaw = crypto.randomBytes(24).toString("base64url");
    const state = `${stateRaw}.${signValue(stateRaw + ":" + realmId)}`;
    const redirectUri = callbackUrl(req);
    const returnTo = (req.query["returnTo"] as string | undefined) ?? null;
    rememberPendingAuth(state, {
      realmId,
      codeVerifier,
      redirectUri,
      host,
      returnTo,
    });
    const authorizeUrl = buildAuthorizeUrl({
      baseUrl: host,
      clientId: ARCANA_CLIENT_ID,
      redirectUri,
      scope: ARCANA_OAUTH_SCOPES,
      state,
      codeChallenge,
      codeChallengeMethod: "S256",
    });
    res.json({ authorizeUrl, state });
  },
);

/**
 * OAuth callback. Public route (mounted before requireAuth in routes/index.ts)
 * because Arcana redirects the user here with no Clerk session attached;
 * authorisation is established by the signed `state` we issued. The handler
 * re-issues a 302 back to the realm settings page once linking is done.
 */
publicArcanaRouter.get("/arcana/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  const state = req.query["state"] as string | undefined;
  const errParam = req.query["error"] as string | undefined;
  if (errParam) {
    res.status(400).send(`Arcana authorization failed: ${errParam}`);
    return;
  }
  if (!code || !state) {
    res.status(400).send("Missing code/state");
    return;
  }
  const pending = consumePendingAuth(state);
  if (!pending) {
    res.status(400).send("Authorization state expired or invalid; please retry.");
    return;
  }
  // Verify signature on the state so a leaked redirect URL can't be replayed.
  const [stateRaw, sig] = state.split(".");
  if (!stateRaw || !sig || signValue(stateRaw + ":" + pending.realmId) !== sig) {
    res.status(400).send("State signature mismatch.");
    return;
  }
  try {
    const tokens = await exchangeAuthorizationCode({
      baseUrl: pending.host,
      code,
      redirectUri: pending.redirectUri,
      clientId: ARCANA_CLIENT_ID,
      clientSecret: getClientSecret(),
      codeVerifier: pending.codeVerifier,
    });

    // Fetch user info so we can show "Linked as ..." in the UI.
    const userinfoRes = await fetch(
      pending.host.replace(/\/$/, "") + "/oauth/userinfo",
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );
    const userinfo = (userinfoRes.ok ? await userinfoRes.json() : {}) as {
      id?: string;
      sub?: string;
      name?: string;
      email?: string;
      username?: string;
    };
    const arcanaUserId = userinfo.id || userinfo.sub || null;
    const arcanaUserDisplay =
      userinfo.name ||
      userinfo.username ||
      userinfo.email ||
      arcanaUserId ||
      null;

    // Register the webhook against our public URL.
    let webhookId: string | null = null;
    let webhookSecret: string | null = null;
    try {
      const sdkForRegistration = new ArcanaSyncClient({
        baseUrl: pending.host,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        clientId: ARCANA_CLIENT_ID,
        clientSecret: getClientSecret(),
        originId: ARCANA_ORIGIN_ID,
      });
      const reg = await sdkForRegistration.registerWebhook(webhookUrl(req));
      webhookId = reg.id;
      webhookSecret = reg.secret;
    } catch (err) {
      logger.warn({ err, realmId: pending.realmId }, "Arcana webhook registration failed");
    }

    await db
      .update(realmsTable)
      .set({
        arcanaHost: pending.host,
        arcanaAccessToken: encryptToken(tokens.access_token),
        arcanaRefreshToken: encryptToken(tokens.refresh_token),
        arcanaTokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        arcanaUserId,
        arcanaUserDisplay,
        arcanaWebhookId: webhookId,
        arcanaWebhookSecret: webhookSecret ? encryptToken(webhookSecret) : null,
      })
      .where(eq(realmsTable.id, pending.realmId));

    bumpInvalidation(pending.realmId, "realms");
    invalidateArcanaSchemaCache(pending.realmId);

    const returnTo = pending.returnTo || `/app/realm/${pending.realmId}`;
    // Render a tiny page that closes the popup if it was opened in one,
    // otherwise navigates the parent window.
    res.status(200).type("html").send(`<!doctype html><meta charset="utf-8"><title>Arcana linked</title>
<script>
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'arcana-linked', realmId: ${JSON.stringify(pending.realmId)} }, '*');
      window.close();
    } else {
      window.location.replace(${JSON.stringify(returnTo)});
    }
  } catch (e) {
    window.location.replace(${JSON.stringify(returnTo)});
  }
</script>
<p style="font: 14px system-ui; padding: 24px;">Arcana Adventure linked. You can close this window.</p>`);
  } catch (err) {
    logger.error({ err, realmId: pending.realmId }, "Arcana token exchange failed");
    res.status(500).send("Failed to link Arcana Adventure. Please try again.");
  }
});

/** Unlink: revoke token, deregister webhook, clear stored credentials. */
router.post(
  "/realms/:realmId/arcana/unlink",
  requireRealmAccess("owner"),
  async (req, res) => {
    const realmId = req.params["realmId"] as string;
    const creds = await loadRealmCreds(realmId);
    if (creds) {
      const client = buildClient(creds);
      const [row] = await db
        .select({ webhookId: realmsTable.arcanaWebhookId })
        .from(realmsTable)
        .where(eq(realmsTable.id, realmId));
      if (row?.webhookId) {
        try {
          await client.deleteWebhook(row.webhookId);
        } catch (err) {
          logger.warn({ err, realmId }, "Arcana deleteWebhook failed (continuing unlink)");
        }
      }
      // Best-effort revoke of the access token.
      try {
        const body = new URLSearchParams({
          token: creds.accessToken,
          client_id: ARCANA_CLIENT_ID,
          client_secret: getClientSecret(),
        });
        await fetch(creds.host.replace(/\/$/, "") + "/oauth/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        });
      } catch (err) {
        logger.warn({ err, realmId }, "Arcana revoke failed (continuing unlink)");
      }
    }
    const [row] = await db
      .update(realmsTable)
      .set({
        arcanaHost: null,
        arcanaAccessToken: null,
        arcanaRefreshToken: null,
        arcanaTokenExpiresAt: null,
        arcanaUserId: null,
        arcanaUserDisplay: null,
        arcanaSystem: null,
        arcanaWebhookId: null,
        arcanaWebhookSecret: null,
      })
      .where(eq(realmsTable.id, realmId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }
    invalidateArcanaSchemaCache(realmId);
    bumpInvalidation(realmId, "realms");
    res.json(toRealmDto(row));
  },
);

/** Server-side proxy for Arcana's OpenAPI document so the access token
 * never leaves the server. */
router.get(
  "/realms/:realmId/arcana/openapi",
  requireRealmAccess("viewer"),
  async (req, res) => {
    const realmId = req.params["realmId"] as string;
    const force = req.query["refresh"] === "true";
    try {
      const body = await fetchArcanaOpenapi(realmId, force);
      res.json(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      const code = msg.includes("not linked") ? 400 : 502;
      res.status(code).json({ error: msg });
    }
  },
);

// ---------------------------------------------------------------------------
// Library proxy endpoints
//
// Thin pass-through to the realm's `ArcanaSyncClient` so the browser-side
// `<ItemDialog>`, `<SpellDialog>`, `<ClassDialog>`, etc. can list / get /
// upsert / patch / delete entities without ever seeing the OAuth token.
// ---------------------------------------------------------------------------

async function withRealmClient(
  realmId: string,
  res: Parameters<Parameters<typeof router.get>[2]>[1],
  fn: (client: ReturnType<typeof buildClient>) => Promise<unknown>,
): Promise<void> {
  try {
    const creds = await loadRealmCreds(realmId);
    if (!creds) {
      res.status(400).json({ error: "Realm is not linked to Arcana" });
      return;
    }
    const client = buildClient(creds);
    const out = await fn(client);
    res.json(out);
  } catch (err) {
    if (err instanceof ArcanaSyncError) {
      res
        .status(err.status && err.status >= 400 ? err.status : 502)
        .json({ error: err.message, code: err.code });
      return;
    }
    logger.warn({ err, realmId }, "Arcana library proxy failed");
    const msg = err instanceof Error ? err.message : "library request failed";
    res.status(502).json({ error: msg });
  }
}

function parseKind(req: Request, res: Parameters<Parameters<typeof router.get>[2]>[1]): SyncKind | null {
  const kind = req.params["kind"] as string;
  if (!isArcanaKind(kind)) {
    res.status(400).json({ error: `Unknown Arcana kind: ${kind}` });
    return null;
  }
  return kind as SyncKind;
}

// The species table on Arcana keys its system off a human-readable display
// label, not the slug. Every other library kind uses the raw slug.
const SPECIES_SYSTEM_LABELS: Record<string, string> = {
  "arcana-adventure": "Arcana Adventure",
  "aa-v2": "A.A. V2",
  "aa-v3": "A.A. V3",
};

// Force every entity written through a realm to carry that realm's chosen
// Arcana system, so V1/V3 realms can't accidentally persist `aa-v2` just
// because a dialog seeded that default. Legacy realms with no system fall
// back to "aa-v2".
async function applyRealmSystem(
  realmId: string,
  kind: SyncKind,
  body: Record<string, unknown>,
): Promise<void> {
  const [row] = await db
    .select({ system: realmsTable.arcanaSystem })
    .from(realmsTable)
    .where(eq(realmsTable.id, realmId));
  const slug = row?.system ?? "aa-v2";
  if (kind === "species") {
    body["systemName"] = SPECIES_SYSTEM_LABELS[slug] ?? slug;
  } else {
    body["system"] = slug;
  }
}

router.get(
  "/realms/:realmId/arcana/library/:kind",
  requireRealmAccess("viewer"),
  async (req, res) => {
    const kind = parseKind(req, res);
    if (!kind) return;
    await withRealmClient(req.params["realmId"] as string, res, (c) => c.list(kind));
  },
);

router.get(
  "/realms/:realmId/arcana/library/:kind/by-external/:externalId",
  requireRealmAccess("viewer"),
  async (req, res) => {
    const kind = parseKind(req, res);
    if (!kind) return;
    await withRealmClient(req.params["realmId"] as string, res, (c) =>
      c.getByExternal(kind, req.params["externalId"] as string),
    );
  },
);

router.get(
  "/realms/:realmId/arcana/library/:kind/:id",
  requireRealmAccess("viewer"),
  async (req, res) => {
    const kind = parseKind(req, res);
    if (!kind) return;
    await withRealmClient(req.params["realmId"] as string, res, (c) =>
      c.get(kind, req.params["id"] as string),
    );
  },
);

router.post(
  "/realms/:realmId/arcana/library/:kind",
  requireRealmAccess("editor"),
  async (req, res) => {
    const kind = parseKind(req, res);
    if (!kind) return;
    const realmId = req.params["realmId"] as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    await applyRealmSystem(realmId, kind, body);
    await withRealmClient(realmId, res, (c) => c.upsert(kind, body));
  },
);

router.patch(
  "/realms/:realmId/arcana/library/:kind/:id",
  requireRealmAccess("editor"),
  async (req, res) => {
    const kind = parseKind(req, res);
    if (!kind) return;
    const realmId = req.params["realmId"] as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    await applyRealmSystem(realmId, kind, body);
    await withRealmClient(realmId, res, (c) =>
      c.patch(kind, req.params["id"] as string, body),
    );
  },
);

router.delete(
  "/realms/:realmId/arcana/library/:kind/:id",
  requireRealmAccess("editor"),
  async (req, res) => {
    const kind = parseKind(req, res);
    if (!kind) return;
    await withRealmClient(req.params["realmId"] as string, res, (c) =>
      c.delete(kind, req.params["id"] as string),
    );
  },
);

export default router;
