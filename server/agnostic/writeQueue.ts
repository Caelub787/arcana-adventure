// Write-behind persistence for Agnostic. Every change is applied in memory and
// broadcast to everyone at once; the database catches up in the background.
//
// One queue, strictly in order, so rows always land in the order they were
// made (a sheet before its values, a delete after the insert it undoes).
// Runs of the same kind of write (upserts into one table, deletes from one
// table) go out as one statement, so adding a 150-value sheet or deleting a
// stack of items is a handful of round trips, not hundreds.
//
// Reads that must see the latest data (loading a scope that was unloaded,
// version history) wait for the writes of that scope first; documents keep
// their latest unsaved state in memory (docs.ts), so nothing ever reads stale.
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";

type Table = any;
interface Upsert {
  kind: "upsert"; table: Table; target: string; row: Record<string, unknown>; update: string[]; scope: string;
  /** false: a failed row is dropped at once (e.g. a document whose sheet was deleted meanwhile). */
  retry: boolean;
  /** Within a run of upserts, lower ranks are written first (sheets before what hangs off them). */
  rank: number;
  done?: () => void;
}
interface Delete { kind: "delete"; table: Table; id: string; scope: string }
interface Task { kind: "task"; run: () => Promise<unknown>; scope: string; label: string }
type Item = Upsert | Delete | Task;

const queue: Item[] = [];
let running = false;
const pendingByScope = new Map<string, number>();
let idleWaiters: Array<() => void> = [];
const BATCH = 250;
const WINDOW = 3000;

function bump(scope: string, d: number) {
  const n = (pendingByScope.get(scope) ?? 0) + d;
  if (n <= 0) pendingByScope.delete(scope); else pendingByScope.set(scope, n);
}
function push(item: Item) {
  queue.push(item);
  bump(item.scope, 1);
  if (!running) void pump();
}

/** Insert-or-update `row` later (by id, or `opts.target`); `update` lists the columns a conflict overwrites. */
export function upsertLater(scope: string, table: Table, row: Record<string, unknown>, update: string[], opts: { target?: string; retry?: boolean; rank?: number; done?: () => void } = {}) {
  push({ kind: "upsert", table, target: opts.target ?? "id", row, update, scope, retry: opts.retry ?? true, rank: opts.rank ?? 1, done: opts.done });
}
/** Delete the row with this id later. */
export function deleteLater(scope: string, table: Table, id: string) {
  push({ kind: "delete", table, id, scope });
}
/** Run any other write later, in order with the rest. */
export function writeLater(scope: string, label: string, run: () => Promise<unknown>) {
  push({ kind: "task", run, scope, label });
}

export function hasPendingWrites(scope?: string): boolean {
  return scope ? (pendingByScope.get(scope) ?? 0) > 0 : queue.length > 0 || running;
}

/** Resolves once every write queued so far (for `scope`, or all) is in the database. */
export async function writesSettled(scope?: string): Promise<void> {
  while (hasPendingWrites(scope)) await new Promise<void>((r) => idleWaiters.push(r));
}

async function execUpserts(batch: Upsert[]) {
  // The same row twice in one statement is an error: keep the latest.
  const byKey = new Map<unknown, Upsert>();
  for (const u of batch) byKey.set(u.row[u.target], u);
  const rows = Array.from(byKey.values()).map((u) => u.row);
  const { table, update, target } = batch[0];
  const set: Record<string, unknown> = {};
  for (const k of update) set[k] = sql.raw(`excluded."${table[k].name}"`);
  await db.insert(table).values(rows as any).onConflictDoUpdate({ target: table[target], set });
}

async function withRetry(label: string, fn: () => Promise<unknown>, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try { await fn(); return; } catch (e) {
      if (attempt >= retries) { console.error(`[agnostic] couldn't save (${label}):`, (e as Error).message); return; }
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
}

function sameRun(a: Item, b: Item): boolean {
  if (a.kind === "upsert" && b.kind === "upsert") return a.table === b.table && a.update === b.update && a.target === b.target;
  if (a.kind === "delete" && b.kind === "delete") return a.table === b.table;
  return false;
}

async function pump() {
  running = true;
  try {
    while (queue.length) {
      const first = queue[0];
      let n = 1;
      if (first.kind === "upsert") {
        // Every upsert up to the next delete/other write, one statement per table:
        // sheets first, then what hangs off them, each table keeping its own order.
        while (n < queue.length && n < WINDOW && queue[n].kind === "upsert") n++;
      } else if (first.kind === "delete") {
        while (n < queue.length && n < BATCH && sameRun(first, queue[n])) n++;
      }
      const items = queue.slice(0, n);
      if (first.kind === "upsert") {
        const groups: Upsert[][] = [];
        for (const u of items as Upsert[]) {
          const g = groups.find((x) => sameRun(x[0], u));
          if (g) g.push(u); else groups.push([u]);
        }
        groups.sort((a, b) => a[0].rank - b[0].rank);
        for (const g of groups) {
          for (let i = 0; i < g.length; i += BATCH) {
            const batch = g.slice(i, i + BATCH);
            try { await execUpserts(batch); }
            catch {
              // One bad row shouldn't sink the rest: go one by one.
              for (const u of batch) await withRetry("upsert", () => execUpserts([u]), u.retry ? 3 : 0);
            }
            for (const u of batch) u.done?.();
          }
        }
      } else if (first.kind === "delete") {
        const ids = (items as Delete[]).map((d) => d.id);
        await withRetry("delete", () => db.delete(first.table).where(inArray(first.table.id, ids)));
      } else {
        await withRetry(first.label, first.run);
      }
      queue.splice(0, n);
      for (const it of items) bump(it.scope, -1);
      const w = idleWaiters; idleWaiters = [];
      w.forEach((r) => r());
    }
  } finally {
    running = false;
    const w = idleWaiters; idleWaiters = [];
    w.forEach((r) => r());
  }
}

// A deploy or restart must not drop what's still queued: finish it first
// (bounded). Repeated signals while saving are ignored rather than killing it.
let hooked = false;
let shuttingDown = false;
export function flushOnShutdown(extra: () => Promise<unknown> = async () => {}) {
  if (hooked) return;
  hooked = true;
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      const pending = queue.length;
      if (pending) console.log(`[agnostic] saving ${pending} pending change(s) before stopping…`);
      const done = Promise.resolve().then(extra).then(() => writesSettled());
      const cap = new Promise((r) => setTimeout(r, 9000));
      void Promise.race([done, cap]).finally(() => process.exit(0));
    });
  }
}
