import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Spectator mode is a read-only player view (e.g., for casting to a TV or
// streaming on Discord). The mode is encoded in the URL (?spectator=1) so
// every request can derive it deterministically — no global mutable state,
// no race with React effects. When active, requests carry an
// X-Spectator-Mode header so the server scopes the response to player-only
// data even if the authenticated user is actually the GM.
export function isSpectatorMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("spectator") === "1";
  } catch {
    return false;
  }
}
function withSpectatorHeader(headers: Record<string, string> = {}): Record<string, string> {
  if (isSpectatorMode()) {
    return { ...headers, "X-Spectator-Mode": "1" };
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseHeaders: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  const res = await fetch(url, {
    method,
    headers: withSpectatorHeader(baseHeaders),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: withSpectatorHeader(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
