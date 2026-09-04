// Helpers for applying someone else's live edit to a textarea you might be
// typing in yourself.
//
// The note editor is server-authoritative: everyone sends their own version,
// the server merges and re-broadcasts. That means text can change underneath a
// caret at any moment, and naively re-setting the value sends the caret to the
// end of the document mid-sentence.

/**
 * Where a caret at `caret` in `oldText` should sit once the text becomes
 * `newText`.
 *
 * Compares the unchanged head and tail and moves the caret only when the edit
 * happened before it. An edit after the caret leaves it alone; an edit before
 * it shifts it by the size change; an edit spanning it puts it at the end of
 * the untouched head, which is the closest honest answer.
 */
export function remapCaret(oldText: string, newText: string, caret: number): number {
  if (oldText === newText) return caret;

  const max = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const clamped = Math.max(0, Math.min(caret, oldText.length));
  // Entirely inside the untouched head — nothing moved under it.
  if (clamped <= prefix) return clamped;
  // Entirely inside the untouched tail — shift by however much the text grew.
  if (clamped >= oldText.length - suffix) {
    return Math.max(0, Math.min(clamped + (newText.length - oldText.length), newText.length));
  }
  // The caret was sitting in the part that got rewritten.
  return Math.min(prefix, newText.length);
}
