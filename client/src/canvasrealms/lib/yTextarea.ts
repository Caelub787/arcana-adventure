import type * as Y from "yjs";
import { createRelativePositionFromTypeIndex, createAbsolutePositionFromRelativePosition } from "yjs";

/**
 * Bind a <textarea> (or <input>) to a Y.Text. Local edits diff the textarea
 * value against the current Y.Text and apply minimal insert/delete operations.
 * Remote changes overwrite the textarea value while preserving caret/selection
 * via Y.RelativePosition so the user's cursor doesn't jump when a collaborator
 * edits.
 *
 * Returns a disposer.
 */
export function bindYTextToTextarea(
  yText: Y.Text,
  el: HTMLTextAreaElement | HTMLInputElement,
  doc: Y.Doc,
  origin: symbol,
): () => void {
  // 1) Initialize textarea from Y.Text
  el.value = yText.toString();

  // Apply local DOM edits to Y.Text by diffing.
  const onInput = () => {
    const newText = el.value;
    const oldText = yText.toString();
    if (newText === oldText) return;
    // Find common prefix
    let start = 0;
    const minLen = Math.min(newText.length, oldText.length);
    while (start < minLen && newText[start] === oldText[start]) start++;
    // Find common suffix
    let endNew = newText.length;
    let endOld = oldText.length;
    while (
      endNew > start &&
      endOld > start &&
      newText[endNew - 1] === oldText[endOld - 1]
    ) {
      endNew--;
      endOld--;
    }
    const removed = endOld - start;
    const inserted = newText.slice(start, endNew);
    doc.transact(() => {
      if (removed > 0) yText.delete(start, removed);
      if (inserted.length > 0) yText.insert(start, inserted);
    }, origin);
  };
  el.addEventListener("input", onInput);

  // Remote updates: rewrite the value, preserving caret via relative pos.
  const onYUpdate = (_event: Y.YTextEvent, tx: Y.Transaction) => {
    if (tx.origin === origin) return; // local edit, already in DOM
    const isFocused = document.activeElement === el;
    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    const relStart = createRelativePositionFromTypeIndex(yText, selStart);
    const relEnd = createRelativePositionFromTypeIndex(yText, selEnd);
    el.value = yText.toString();
    if (isFocused) {
      const absStart = createAbsolutePositionFromRelativePosition(relStart, doc);
      const absEnd = createAbsolutePositionFromRelativePosition(relEnd, doc);
      const s = absStart?.index ?? selStart;
      const e = absEnd?.index ?? selEnd;
      try {
        el.setSelectionRange(s, e);
      } catch {
        // ignore
      }
    }
    // Notify React (controlled-input style listeners): dispatch a synthetic
    // input event so consumers relying on `onChange` see the new value.
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  yText.observe(onYUpdate);

  return () => {
    el.removeEventListener("input", onInput);
    yText.unobserve(onYUpdate);
  };
}
