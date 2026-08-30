import { type Server } from "node:http";
import path from "node:path";

import express, { type Express, type Request, Response, NextFunction } from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { registerRoutes } from "./routes";
import { pool as dbPool } from "./db";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Trust proxy for production (Replit uses reverse proxy)
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  app.set('trust proxy', 1);
}

// Configure Neon to use WebSocket for connections (required for Node.js)
neonConfig.webSocketConstructor = ws;

// PostgreSQL session store for persistence across server restarts
const PgStore = ConnectPgSimple(session);
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10
});

app.use(session({
  store: new PgStore({
    pool,
    createTableIfMissing: true,
    tableName: 'session',
    pruneSessionInterval: 900 // Prune expired sessions every 15 minutes
  }),
  secret: process.env.SESSION_SECRET || 'arcana-adventures-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: isProduction, // Trust the reverse proxy in production
  cookie: { 
    secure: isProduction, // Use secure cookies in production (HTTPS)
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: 'lax' // 'lax' works for same-site requests including custom domains
  }
}));

app.use(express.json({
  limit: '100mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

// Serve attached_assets directory for uploaded images and default assets
const attachedAssetsPath = path.resolve(import.meta.dirname, '..', 'attached_assets');
app.use('/attached_assets', express.static(attachedAssetsPath));

// Serve uploads directory for user-uploaded images (scene backgrounds, etc.)
const uploadsPath = path.resolve(import.meta.dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d',
  immutable: true,
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Self-healing guard for a couple of Map Maker columns: the build-time
// `drizzle-kit push --force` step (render.yaml) has not been reliably
// picking these specific additions up in production even though they
// apply cleanly in isolation, so this runs the same idempotent ALTERs
// directly against the app's own DB connection on every boot. A no-op
// once a column exists; safe to leave in permanently.
async function ensureMapMakerColumns() {
  const statements = [
    `ALTER TABLE IF EXISTS map_objects ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'structures'`,
    `ALTER TABLE IF EXISTS maps ADD COLUMN IF NOT EXISTS map_type text NOT NULL DEFAULT 'regional'`,
  ];
  for (const sql of statements) {
    try {
      await dbPool.query(sql);
    } catch (err) {
      console.error(`Failed to run startup schema guard (${sql}):`, err);
    }
  }
}

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  await ensureMapMakerColumns();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
}
