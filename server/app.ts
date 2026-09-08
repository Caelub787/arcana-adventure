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
/**
 * Lets boot carry on when a piece of start-up work takes too long.
 *
 * The work is not cancelled - it keeps running, and finishes when it finishes.
 * What changes is that nothing downstream waits on it. Binding the port is the
 * one thing that must happen on time: a service that never opens its port is
 * failed and replaced, and then whatever it was waiting on never gets done
 * either.
 */
function withDeadline<T>(label: string, ms: number, work: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        console.error(`${label} has not finished after ${ms}ms; booting without waiting for it`);
        resolve(fallback);
      }, ms),
    ),
  ]);
}

/**
 * Runs the boot-time schema guards without being able to hold the deploy up.
 *
 * `ALTER TABLE ... ADD COLUMN` needs an ACCESS EXCLUSIVE lock even when it is
 * a no-op, and a deploy is exactly when that lock is hardest to get: the old
 * instance is still serving while the new one boots, so it holds live
 * connections to the very tables being altered. Without a lock timeout the
 * ALTER waits forever, the new instance never reaches `listen`, the platform
 * never retires the old one, and the deploy times out with no error in the
 * log at all - which is precisely what happened. Worse, a waiting ALTER
 * queues ahead of everything else, so the old instance's own reads on that
 * table stall behind it too.
 *
 * `SET LOCAL` inside a transaction rather than `SET` on the connection: this
 * client goes back to a shared pool afterwards, and a leaked lock_timeout
 * would apply to whatever ran on it next.
 *
 * Returns the statements that did not apply, for the caller to retry once the
 * port is open and the old instance has gone.
 */
async function runSchemaGuard(label: string, statements: string[]): Promise<string[]> {
  const failed: string[] = [];
  const client = await dbPool.connect();
  try {
    for (const sql of statements) {
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query(sql);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        failed.push(sql);
        console.error(`Failed to run startup schema guard [${label}] (${sql}):`, err);
      }
    }
  } finally {
    client.release();
  }
  return failed;
}

/**
 * Anything the guard could not apply, tried again in the background. By the
 * time the port is open the old instance is on its way out, so the lock it was
 * holding is about to be free - and a column that is late by a few seconds is
 * a great deal better than a deploy that never lands.
 */
async function retrySchemaGuard(pending: string[]) {
  let remaining = pending;
  for (const waitMs of [5_000, 15_000, 30_000, 60_000, 120_000]) {
    if (remaining.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    remaining = await runSchemaGuard("retry", remaining);
  }
  if (remaining.length > 0) {
    console.error(`Startup schema guard gave up on ${remaining.length} statement(s):`, remaining);
  }
}

async function ensureMapMakerColumns() {
  const statements = [
    `ALTER TABLE IF EXISTS map_objects ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'structures'`,
    `ALTER TABLE IF EXISTS maps ADD COLUMN IF NOT EXISTS map_type text NOT NULL DEFAULT 'regional'`,
  ];
  return runSchemaGuard("map-maker", statements);
}

// Same self-healing pattern as ensureMapMakerColumns, extended to every
// table/column the Campaign Knowledge System (notes visibility/folders/
// timelines/history) and the C.A. ruleset (wounds/custom fields/linked
// skill rolls) added - all of it landed after the Map Maker columns above
// turned up unreliably applied by the build-time db:push, so it gets the
// same boot-time guard rather than waiting to find each gap one bug report
// at a time. Every statement is idempotent (IF NOT EXISTS) and safe to
// leave here permanently, including after a build-time push starts
// reliably picking these up too.
async function ensureKnowledgeSystemSchema() {
  const statements = [
    `ALTER TABLE IF EXISTS note_folders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom'`,
    `ALTER TABLE IF EXISTS note_folders ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'gm'`,
    `ALTER TABLE IF EXISTS note_folders ADD COLUMN IF NOT EXISTS visible_player_ids jsonb`,
    `ALTER TABLE IF EXISTS notes ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'gm'`,
    `ALTER TABLE IF EXISTS notes ADD COLUMN IF NOT EXISTS visible_player_ids jsonb`,
    `ALTER TABLE IF EXISTS notes ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE IF EXISTS scenes ADD COLUMN IF NOT EXISTS source_map_id varchar`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_wounds jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_body_sex text NOT NULL DEFAULT 'male'`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_energy_pool integer NOT NULL DEFAULT 0`,
    // C.A. ranks, Physique and auras. Physique is 0 = "not set" rather than a
    // Physique of zero, so the default is safe for existing characters; the
    // overload effects it triggers use the wound effect shape.
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_physique integer NOT NULL DEFAULT 100`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_physique_effects jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_age integer`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_birthday text`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_languages text`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_aura_color text`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_aura_shape text`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_aura_color2 text`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_aura_angle integer`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_ability_name text`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS ca_ability_description text`,
    `ALTER TABLE IF EXISTS free_hotbar_entries ADD COLUMN IF NOT EXISTS roll_entry_id varchar REFERENCES roll_entries(id) ON DELETE CASCADE`,
    `ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS effects jsonb NOT NULL DEFAULT '[]'::jsonb`,
    // Swampy keeps its own copies of the three C.A.-shaped columns so the two
    // systems' wound/body/pool mechanics can diverge independently.
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_wounds jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_body_sex text NOT NULL DEFAULT 'male'`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_energy_pool integer NOT NULL DEFAULT 0`,
    `ALTER TABLE IF EXISTS roll_entries ADD COLUMN IF NOT EXISTS linked_skill_key text`,
    // Swampy runs Daggerheart's resource model: HP behind two damage
    // thresholds, Armour Slots, one Strain track, and the player's half of the
    // Duality Dice. The GM's Fear pool belongs to the campaign.
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_hope integer NOT NULL DEFAULT 2`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_strain integer NOT NULL DEFAULT 0`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_max_strain integer NOT NULL DEFAULT 6`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_armour_slots integer NOT NULL DEFAULT 0`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_max_armour_slots integer NOT NULL DEFAULT 0`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_major_threshold integer NOT NULL DEFAULT 8`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_severe_threshold integer NOT NULL DEFAULT 16`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_experiences jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE IF EXISTS characters ADD COLUMN IF NOT EXISTS swampy_warren_ids text[] NOT NULL DEFAULT ARRAY[]::text[]`,
    `ALTER TABLE IF EXISTS campaigns ADD COLUMN IF NOT EXISTS swampy_fear integer NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS swampy_warrens (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      system text NOT NULL DEFAULT 'swampy',
      owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
      campaign_id varchar REFERENCES campaigns(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      image text,
      condition text NOT NULL DEFAULT 'flourishing',
      nature text NOT NULL DEFAULT '',
      paths jsonb NOT NULL DEFAULT '[]'::jsonb,
      houses jsonb NOT NULL DEFAULT '[]'::jsonb,
      scars jsonb NOT NULL DEFAULT '[]'::jsonb,
      gm_notes text NOT NULL DEFAULT '',
      created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS swampy_workings (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id varchar NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name text NOT NULL,
      warren_id varchar REFERENCES swampy_warrens(id) ON DELETE SET NULL,
      warren_name text NOT NULL DEFAULT '',
      method text NOT NULL DEFAULT '',
      effect text NOT NULL DEFAULT '',
      cost text NOT NULL DEFAULT '',
      limits text NOT NULL DEFAULT '',
      condition_interaction text NOT NULL DEFAULT '',
      risk text NOT NULL DEFAULT '',
      created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
      character_id varchar REFERENCES characters(id) ON DELETE SET NULL,
      character_name text NOT NULL DEFAULT '',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS swampy_house_cards (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      system text NOT NULL DEFAULT 'swampy',
      owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
      name text NOT NULL,
      house text NOT NULL DEFAULT '',
      image text,
      upright_meaning text NOT NULL DEFAULT '',
      reversed_meaning text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0,
      created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE IF EXISTS campaigns ADD COLUMN IF NOT EXISTS roll_feed jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `CREATE TABLE IF NOT EXISTS timelines (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_id varchar NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text DEFAULT '',
      calendar jsonb,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS timeline_events (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      timeline_id varchar NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
      campaign_id varchar NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text DEFAULT '',
      date_type text NOT NULL DEFAULT 'ordered',
      date_value jsonb,
      end_date_value jsonb,
      sort_order integer NOT NULL DEFAULT 0,
      tags jsonb,
      category text,
      color text,
      image text,
      links jsonb,
      visibility text NOT NULL DEFAULT 'gm',
      visible_player_ids jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_revisions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id varchar NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      actor_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type text NOT NULL,
      entity_id varchar NOT NULL,
      action text NOT NULL,
      before jsonb,
      after jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS custom_fields (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_type text NOT NULL,
      owner_id varchar NOT NULL,
      header text NOT NULL,
      body text DEFAULT '',
      gm_only boolean NOT NULL DEFAULT false,
      gm_notes text DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )`,
  ];
  return runSchemaGuard("knowledge", statements);
}

// Compact inline SVG placeholders — just enough to try out placement,
// scatter, and the variant-swap hotkey before real art exists. Encoded as
// data: URIs so no upload/storage step is needed to seed them.
function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const TEST_STAMP_SVGS = {
  treeNormal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="44" y="62" width="12" height="26" fill="#5c4033"/><polygon points="50,8 22,52 78,52" fill="#2d5016"/><polygon points="50,26 27,64 73,64" fill="#3f7024"/></svg>`,
  treeAutumn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="44" y="62" width="12" height="26" fill="#5c4033"/><polygon points="50,8 22,52 78,52" fill="#c2410c"/><polygon points="50,26 27,64 73,64" fill="#ea580c"/></svg>`,
  mountain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,10 10,88 90,88" fill="#6b6b6b"/><polygon points="50,10 38,42 62,42" fill="#e8e8e8"/></svg>`,
  house: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="22" y="46" width="56" height="42" fill="#8b7355"/><polygon points="50,14 14,50 86,50" fill="#7f1d1d"/><rect x="44" y="64" width="14" height="24" fill="#3f2a1a"/></svg>`,
  rock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 75 Q10 50 32 40 Q48 20 65 32 Q90 35 82 60 Q88 82 60 80 Q30 92 20 75 Z" fill="#7a7a7a"/><path d="M32 40 Q48 20 65 32 Q55 45 40 50 Q30 46 32 40 Z" fill="#969696"/></svg>`,
};
async function ensureTestStampAssets() {
  try {
    const existing = await dbPool.query(`SELECT COUNT(*)::int AS count FROM stamp_assets`);
    if ((existing.rows?.[0]?.count ?? 0) > 0) return;
    const admin = await dbPool.query(`SELECT id FROM users WHERE is_admin = true ORDER BY created_at ASC LIMIT 1`);
    const adminId = admin.rows?.[0]?.id;
    if (!adminId) return; // nothing to attribute the seed to yet

    const seedAsset = async (name: string, category: string, variants: { label: string; image: string }[]) => {
      const asset = await dbPool.query(
        `INSERT INTO stamp_assets (name, category, created_by_user_id) VALUES ($1, $2, $3) RETURNING id`,
        [name, category, adminId]
      );
      const assetId = asset.rows[0].id;
      for (let i = 0; i < variants.length; i++) {
        await dbPool.query(
          `INSERT INTO stamp_asset_variants (stamp_asset_id, label, image, sort_order) VALUES ($1, $2, $3, $4)`,
          [assetId, variants[i].label, variants[i].image, i]
        );
      }
    };

    await seedAsset('Tree', 'Nature', [
      { label: 'Normal', image: svgDataUri(TEST_STAMP_SVGS.treeNormal) },
      { label: 'Autumn', image: svgDataUri(TEST_STAMP_SVGS.treeAutumn) },
    ]);
    await seedAsset('Mountain', 'Nature', [{ label: 'Normal', image: svgDataUri(TEST_STAMP_SVGS.mountain) }]);
    await seedAsset('Rock', 'Nature', [{ label: 'Normal', image: svgDataUri(TEST_STAMP_SVGS.rock) }]);
    await seedAsset('House', 'Structures', [{ label: 'Normal', image: svgDataUri(TEST_STAMP_SVGS.house) }]);
  } catch (err) {
    console.error("Failed to seed test stamp assets:", err);
  }
}

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  // Bounded twice over: each statement has its own lock and statement
  // timeouts, and the lot has a deadline in case something outside them - the
  // pool handing out a connection, say - is what stalls.
  const pendingSchema = await withDeadline(
    "Startup schema guard",
    45_000,
    (async () => [
      ...(await ensureMapMakerColumns()),
      ...(await ensureKnowledgeSystemSchema()),
    ])(),
    [] as string[],
  );
  await withDeadline("Test stamp asset seeding", 20_000, ensureTestStampAssets(), undefined);
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
    // Only once the port is open: a retry that runs before it would be back
    // to holding the deploy up, which is the thing this is here to avoid.
    if (pendingSchema.length > 0) {
      log(`${pendingSchema.length} schema statement(s) did not apply; retrying in the background`);
      void retrySchemaGuard(pendingSchema);
    }
  });
}
