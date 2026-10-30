// What somebody just said, over the head of whoever they are playing.
//
// A table talks in the chat panel, but a table also looks at the map. A line
// typed in chat shows for a few seconds above the token of the sheet its writer
// owns, then fades — so you can see who is speaking without reading the log,
// and the log is still the record.
//
// Only ordinary talk: rolls, whispers and the system's own lines are not
// speech, and a long message is cut down to what fits over a token.

export interface Speech { noteId: string; text: string; at: number; sender: string }

/** How long a bubble stays up before it fades, and how long the fade takes. */
export const SPEECH_HOLD_MS = 5200;
export const SPEECH_FADE_MS = 900;
export const SPEECH_MAX_CHARS = 120;

const byUser = new Map<string, { text: string; at: number; sender: string }>();
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
export function speechText(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > SPEECH_MAX_CHARS ? `${one.slice(0, SPEECH_MAX_CHARS - 1).trimEnd()}…` : one;
}

/** Remember what somebody said, and set it fading. */
export function said(userId: string, text: string, sender = "", at = Date.now()): void {
  const words = speechText(text);
  if (!userId || !words) return;
  byUser.set(userId, { text: words, at, sender });
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
export function speechOf(userId: string | null | undefined): { text: string; at: number; sender: string } | null {
  if (!userId) return null;
  const s = byUser.get(userId);
  if (!s) return null;
  return Date.now() - s.at < SPEECH_HOLD_MS + SPEECH_FADE_MS ? s : null;
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
