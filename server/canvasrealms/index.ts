import express, { type Express, type RequestHandler } from "express";
import { logger } from "./lib/logger";
import arcanaWebhookRouter from "./routes/arcana-webhook";
import router from "./routes";

/**
 * Mounts the Canvas Realms (CR) HTTP routers into the host Express app.
 *
 * Differences from the original standalone CR `app.ts`:
 * - No Clerk middleware / proxy (host is same-origin and uses express-session).
 * - No pino-http: a tiny `attachLog` middleware sets `req.log = logger` so the
 *   ported routers' `req.log.*` call sites keep working.
 * - No CORS / json / urlencoded / session: the host app already provides those
 *   globally before this is called.
 *
 * Call this once inside the host `registerRoutes(app)` AFTER session middleware
 * is configured and BEFORE the SPA catch-all / static handler.
 */
export function registerCanvasRealmsRoutes(app: Express): void {
  // Replaces pino-http's per-request logger so ported routers can use req.log.
  const attachLog: RequestHandler = (req, _res, next) => {
    (req as any).log = logger;
    next();
  };

  // Arcana webhook needs the raw request body to verify x-aa-signature, so it
  // gets its own raw body parser scoped to the exact path. Mounted BEFORE the
  // authenticated router so the public webhook isn't gated on a session — auth
  // is the HMAC signature in `x-aa-signature` itself.
  app.use(
    "/api/arcana/webhook",
    express.raw({ type: "*/*", limit: "1mb" }),
    attachLog,
    arcanaWebhookRouter,
  );

  // Compass voice STT: the client uploads a short raw audio blob. Scope a raw
  // body parser to the exact path so the handler receives a Buffer (the host's
  // global express.json() leaves non-JSON content-types untouched).
  app.use(
    "/api/compass/voice/stt",
    express.raw({ type: () => true, limit: "25mb" }),
  );

  // Combined CR API router (health, auth-reset, public arcana/wiki, then
  // requireAuth + storage + realms + collaborators + nodes + folders +
  // relationships + viewports + compass + canvas-members + arcana + wiki).
  app.use("/api", attachLog, router);
}
