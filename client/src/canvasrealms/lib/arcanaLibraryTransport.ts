import type { LibraryTransport } from "@arcana/library-dialogs";
import type { SyncKind, SyncEnvelope } from "@arcana/aa-sync-sdk";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Always root-anchored: the API server is mounted at `/api` on the same
  // origin, regardless of the SPA's BASE_URL prefix.
  const url = `/api${path}`;
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error || j?.detail || j?.message || "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`${method} ${path} failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

/**
 * Browser-side `LibraryTransport` that proxies every call through the
 * realm-scoped Express endpoints under
 * `/api/realms/:realmId/arcana/library/:kind`. The OAuth token never
 * leaves the server.
 */
export function createArcanaLibraryTransport(realmId: string): LibraryTransport {
  const root = `/realms/${encodeURIComponent(realmId)}/arcana/library`;
  return {
    list: <T = unknown>(kind: SyncKind) =>
      call<{ data: T[] }>("GET", `${root}/${kind}`),
    get: <T = unknown>(kind: SyncKind, id: string) =>
      call<SyncEnvelope<T>>("GET", `${root}/${kind}/${encodeURIComponent(id)}`),
    getByExternal: <T = unknown>(kind: SyncKind, externalId: string) =>
      call<SyncEnvelope<T>>(
        "GET",
        `${root}/${kind}/by-external/${encodeURIComponent(externalId)}`,
      ),
    upsert: <T = unknown>(kind: SyncKind, body: T) =>
      call<SyncEnvelope<T>>("POST", `${root}/${kind}`, body),
    patch: (<T,>(kind: SyncKind, id: string, body: Partial<T>) =>
      call<SyncEnvelope<T>>(
        "PATCH",
        `${root}/${kind}/${encodeURIComponent(id)}`,
        body,
      )) as LibraryTransport["patch"],
    delete: (kind: SyncKind, id: string) =>
      call<{ ok: true }>("DELETE", `${root}/${kind}/${encodeURIComponent(id)}`),
  };
}
