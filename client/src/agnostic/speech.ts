// What somebody just said, over the head of whoever they are playing.
//
// A table talks in the chat panel, but a table also looks at the map. A line
// typed in chat shows for a few seconds above the token of the sheet its writer
// owns, then fades — so you can see who is speaking without reading the log,
// and the log is still the record.
//
// Only ordinary talk: rolls, whispers and the system's own lines are not
// speech, and a long message is cut down to what fits over a token.
//
// The GM is the exception: what they type belongs to the table rather than to
// any one token, so it is kept apart and shown at the top of the screen.

export interface Speech { text: string; at: number; sender: string; gm: boolean }

/** How long a bubble stays up before it fades, and how long the fade takes. */
export const SPEECH_HOLD_MS = 5200;
export const SPEECH_FADE_MS = 900;
export const SPEECH_MAX_CHARS = 120;
/** The GM's bubble sits across the top of the table, so it has room for more. */
export const SPEECH_GM_MAX_CHARS = 240;

const byUser = new Map<string, Speech>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const notify = () => listeners.forEach((f) => f());

/** Chat lines that are speech: what a person typed, not what the system said. */
export function isSpeech(msg: { type?: string | null; userId?: string | null; text?: string | null; recipientId?: string | null }): boolean {
  if (!msg?.userId || !msg.text?.trim()) return false;
  if (msg.recipientId) return false;
  const t = msg.type ?? "chat";
  return t === "chat";
}

/** The words that go in the bubble: one line's worth, tidied. */
export function speechText(text: string, max = SPEECH_MAX_CHARS): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** Remember what somebody said, and set it fading. */
export function said(userId: string, text: string, sender = "", opts: { at?: number; gm?: boolean } = {}): void {
  const gm = !!opts.gm;
  const at = opts.at ?? Date.now();
  const words = speechText(text, gm ? SPEECH_GM_MAX_CHARS : SPEECH_MAX_CHARS);
  if (!userId || !words) return;
  byUser.set(userId, { text: words, at, sender, gm });
  notify();
  // One timer for the whole map: the next thing to expire wakes it.
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; sweep(); }, SPEECH_HOLD_MS + SPEECH_FADE_MS + 60);
}

/** Take down everything that has finished fading. */
function sweep() {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of Array.from(byUser.entries())) {
    if (now - s.at >= SPEECH_HOLD_MS + SPEECH_FADE_MS) { byUser.delete(id); changed = true; }
  }
  if (changed) notify();
  if (byUser.size && !timer) timer = setTimeout(() => { timer = null; sweep(); }, 400);
}

/** What this person last said, if it hasn't faded yet. */
export function speechOf(userId: string | null | undefined): Speech | null {
  if (!userId) return null;
  const s = byUser.get(userId);
  if (!s) return null;
  return Date.now() - s.at < SPEECH_HOLD_MS + SPEECH_FADE_MS ? s : null;
}

/**
 * The GM speaks as the table, not as anyone standing on it. Their line goes
 * across the top of the screen instead of over a token — a GM who has taken a
 * player's character to run a scene shouldn't make that character talk.
 */
export function gmSpeech(): Speech | null {
  let latest: Speech | null = null;
  for (const s of Array.from(byUser.values())) {
    if (!s.gm || Date.now() - s.at >= SPEECH_HOLD_MS + SPEECH_FADE_MS) continue;
    if (!latest || s.at > latest.at) latest = s;
  }
  return latest;
}

/** How solid a bubble is right now: full, then fading out. */
export function speechOpacity(at: number, now = Date.now()): number {
  const age = now - at;
  if (age <= SPEECH_HOLD_MS) return 1;
  return Math.max(0, 1 - (age - SPEECH_HOLD_MS) / SPEECH_FADE_MS);
}

export function onSpeech(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Everything said is forgotten when the table is left. */
export function forgetSpeech(): void {
  byUser.clear();
  if (timer) { clearTimeout(timer); timer = null; }
  notify();
}
