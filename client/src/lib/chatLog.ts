// The table's chat, kept whether or not the panel is open.
//
// The panel used to fetch the log when it mounted, so every time you opened it
// you watched an empty box for a moment. The log lives here instead: it is
// fetched once when you arrive at the campaign and kept up to date by the
// websocket from then on, open or shut. Opening the panel is then just a read.
import { useSyncExternalStore } from "react";
import { api, gameWs } from "./api";

export interface ChatLine {
  id: string;
  userId?: string;
  sender: string;
  text: string;
  createdAt: string;
  type?: string;
  recipientId?: string;
  recipientName?: string;
  campaignId?: string;
}

const logs = new Map<string, ChatLine[]>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
let wired = false;

const notify = () => listeners.forEach((f) => f());

export const chatLogOf = (campaignId: string | null | undefined): ChatLine[] =>
  (campaignId ? logs.get(campaignId) : undefined) ?? EMPTY;
const EMPTY: ChatLine[] = [];

/** A line said at the table, from the websocket. Ours or anyone else's. */
export function chatReceived(campaignId: string, line: ChatLine): void {
  const cur = logs.get(campaignId) ?? [];
  if (cur.some((m) => m.id === line.id)) return; // the same line twice
  logs.set(campaignId, [...cur, line]);
  notify();
}

export function chatCleared(campaignId: string): void {
  logs.set(campaignId, []);
  notify();
}

/** Fetch the log once per campaign. Called as soon as the campaign opens. */
export function ensureChatLoaded(campaignId: string | null | undefined): void {
  if (!campaignId || logs.has(campaignId) || loading.has(campaignId)) return;
  loading.add(campaignId);
  wire();
  api.getChatMessages(campaignId)
    .then((rows: any[]) => {
      // Anything that arrived while this was in flight stays, in order.
      const live = logs.get(campaignId) ?? [];
      const seen = new Set(rows.map((r) => r.id));
      logs.set(campaignId, [...rows, ...live.filter((m) => !seen.has(m.id))]);
      notify();
    })
    .catch(() => { /* the panel still works; the next line fills it */ })
    .finally(() => loading.delete(campaignId));
}

/** One subscription for the whole app, so the log keeps up with the table. */
function wire() {
  if (wired) return;
  wired = true;
  gameWs.onMessage((data: any) => {
    const id = data?.message?.campaignId || data?.campaignId;
    if (data?.type === "chat_message" && data.message && id) chatReceived(id, data.message);
    if (data?.type === "chat_cleared" && id) chatCleared(id);
  });
}

export function onChatLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Everything is forgotten when the tab goes; nothing here is a record. */
export function forgetChatLogs(): void {
  logs.clear();
  loading.clear();
  notify();
}

/** React: the log as it stands, redrawn whenever a line arrives. */
export function useChatLog(campaignId: string | null | undefined): ChatLine[] {
  ensureChatLoaded(campaignId);
  return useSyncExternalStore(onChatLog, () => chatLogOf(campaignId), () => EMPTY);
}
