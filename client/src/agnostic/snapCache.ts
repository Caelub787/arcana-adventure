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
  const d = await db();
  if (!d) return;
  try { d.transaction(STORE, "readwrite").objectStore(STORE).clear(); } catch { /* ignore */ }
}
