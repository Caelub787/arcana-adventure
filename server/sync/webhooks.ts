import crypto from "node:crypto";
import { db } from "../db";
import { outgoingWebhooks, outboundWebhookJobs } from "@shared/schema";
import { and, eq, lte, sql } from "drizzle-orm";

const MAX_ATTEMPTS = 6;
const BACKOFF_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export type LibraryChange = {
  event: string; // e.g. "library.item.updated" or generic "library.changed"
  kind: string;  // 'item' | 'spell' | 'character' | 'species' | 'class' | 'feat-tree' | 'character-template' | 'roll-template'
  action: "created" | "updated" | "deleted" | "changed";
  id?: string;
  externalId?: string;
  userId?: string | null;
  data?: any;
  sourceClientId?: string;
  ts: string;
};

export function signPayload(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(body: string, secret: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = signPayload(secret, body);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return false;
  }
}

export async function emitLibraryChange(change: Omit<LibraryChange, "ts"> & { ts?: string }): Promise<void> {
  try {
    const hooks = await db.select().from(outgoingWebhooks).where(eq(outgoingWebhooks.active, true));
    if (hooks.length === 0) return;
    const payload: LibraryChange = { ...change, ts: change.ts || new Date().toISOString() };
    for (const h of hooks) {
      if (change.sourceClientId && h.clientId === change.sourceClientId) continue;
      await db.insert(outboundWebhookJobs).values({
        webhookId: h.id,
        payload: payload as any,
        status: "pending",
        nextAttemptAt: new Date(),
      });
    }
  } catch (err) {
    console.error("[sync.webhooks] enqueue failed:", err);
  }
}

let workerStarted = false;
export function startWebhookWorker() {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(drainOnce, 5_000).unref();
  console.log("[sync.webhooks] worker started");
}

async function drainOnce() {
  try {
    const due = await db
      .select()
      .from(outboundWebhookJobs)
      .where(and(eq(outboundWebhookJobs.status, "pending"), lte(outboundWebhookJobs.nextAttemptAt, new Date())))
      .limit(10);
    for (const job of due) {
      void deliverJob(job.id);
    }
  } catch (err) {
    console.error("[sync.webhooks] drain failed:", err);
  }
}

async function deliverJob(jobId: string) {
  try {
    const [job] = await db.update(outboundWebhookJobs)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(outboundWebhookJobs.id, jobId), eq(outboundWebhookJobs.status, "pending")))
      .returning();
    if (!job) return;
    const [hook] = await db.select().from(outgoingWebhooks).where(eq(outgoingWebhooks.id, job.webhookId));
    if (!hook || !hook.active) {
      await db.update(outboundWebhookJobs).set({ status: "dead", lastError: "webhook missing/inactive", updatedAt: new Date() }).where(eq(outboundWebhookJobs.id, job.id));
      return;
    }
    const body = JSON.stringify(job.payload);
    const signature = signPayload(hook.secret, body);
    const attempts = job.attempts + 1;
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aa-signature": signature,
          "x-aa-event": (job.payload as any)?.event || "library.changed",
          "user-agent": "ArcanaAdventure-Sync/1.0",
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        await db.update(outboundWebhookJobs).set({ status: "succeeded", attempts, updatedAt: new Date(), lastError: null }).where(eq(outboundWebhookJobs.id, job.id));
        return;
      }
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (err: any) {
      const dead = attempts >= MAX_ATTEMPTS;
      const next = new Date(Date.now() + (BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] || 60_000));
      await db.update(outboundWebhookJobs).set({
        status: dead ? "dead" : "pending",
        attempts,
        lastError: String(err?.message || err).slice(0, 500),
        nextAttemptAt: next,
        updatedAt: new Date(),
      }).where(eq(outboundWebhookJobs.id, job.id));
    }
  } catch (err) {
    console.error("[sync.webhooks] deliverJob failed:", err);
  }
}

export async function getRecentJobsSummary(limit = 50) {
  const rows = await db.select().from(outboundWebhookJobs)
    .orderBy(sql`updated_at DESC`)
    .limit(limit);
  const counts = { pending: 0, sending: 0, succeeded: 0, failed: 0, dead: 0 };
  for (const r of rows) (counts as any)[r.status] = ((counts as any)[r.status] || 0) + 1;
  return { rows, counts };
}

export async function retryFailedJobs(): Promise<number> {
  const res = await db.update(outboundWebhookJobs)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), updatedAt: new Date(), lastError: null })
    .where(eq(outboundWebhookJobs.status, "dead"))
    .returning({ id: outboundWebhookJobs.id });
  return res.length;
}
