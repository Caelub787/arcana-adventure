// GM secrets (`#...#`) never reach a non-GM as real text — the server swaps
// each one for a run of block characters before the note leaves it, and
// refuses to let a non-GM's save change, remove, or reorder them.
//
// This is the editor-side half of that rule. Without it the blocks look like
// ordinary characters: a player can type straight into one, and only find out
// on the next save that their edit snapped back. Blocking the keystroke is
// both clearer and cheaper than explaining the merge after the fact.
//
// The server remains the authority — this only stops the edit from being made
// in the first place.

export const REDACTION_CHAR = "█";

const REDACTION_RUN_RE = /█+/g;

/** True if this text contains any GM-secret placeholder. */
export function hasRedactedGmSecrets(text: string): boolean {
  return text.includes(REDACTION_CHAR);
}

/**
 * A fingerprint of every redaction run in order, by length. Two texts share a
 * signature exactly when their GM secrets are untouched — same number of runs,
 * same sizes, same order — no matter how much changed around them.
 */
export function redactionSignature(text: string): string {
  return (text.match(REDACTION_RUN_RE) ?? []).map((run) => run.length).join(",");
}

/**
 * Whether an edit left the GM secrets alone. A GM's own copy has no
 * placeholders at all (they see the real `#...#`), so this is a no-op for them.
 */
export function editKeepsGmSecrets(prev: string, next: string): boolean {
  return redactionSignature(prev) === redactionSignature(next);
}
