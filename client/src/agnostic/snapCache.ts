// The last copy of a scope this browser saw, per user, kept in IndexedDB so a
// page opens on it at once (hotbar, sheets list, tracker…) instead of waiting
// for the server. The server's snapshot replaces it moments later, and every
// change still goes through the server, which checks it as always.
// Best effort: no IndexedDB (private mode, old browser) just means no cache.

const DB = "agnostic-cache";
const STORE = "snapshots";
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

const keyOf = (userId: string, scopeKey: string) => `${userId}|${scopeKey}`;

// Who was signed in last, written where it can be read without waiting for
// anything. The cached copy is stored per user, so reading it needs a user id
// - and asking the server who you are is a round trip, which is the very wait
// the cache exists to avoid. Remembering it here lets the last copy be on
// screen before the server has said a word. It is only ever used to look up
// this browser's own cache: the real identity still comes from the server,
// and if it turns out to be someone else the cached copy is dropped.
const LAST_USER = "agnostic-last-user";

export function rememberUser(userId: string): void {
  try { if (userId) localStorage.setItem(LAST_USER, userId); } catch { /* storage off: no cache */ }
}

export function lastUser(): string {
  try { return localStorage.getItem(LAST_USER) ?? ""; } catch { return ""; }
}

export function forgetUser(): void {
  try { localStorage.removeItem(LAST_USER); } catch { /* ignore */ }
}

export async function readSnapshot<T>(userId: string, scopeKey: string): Promise<T | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(keyOf(userId, scopeKey));
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function writeSnapshot(userId: string, scopeKey: string, value: unknown): Promise<void> {
  const d = await db();
  if (!d) return;
  try { d.transaction(STORE, "readwrite").objectStore(STORE).put(value, keyOf(userId, scopeKey)); } catch { /* full or closed: skip */ }
}

/** Forget everything (signing out). */
export async function clearSnapshots(): Promise<void> {
  forgetUser();
  const d = await db();
  if (!d) return;
  try { d.transaction(STORE, "readwrite").objectStore(STORE).clear(); } catch { /* ignore */ }
}
