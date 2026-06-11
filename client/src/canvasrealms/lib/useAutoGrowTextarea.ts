import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Resize a <textarea> to fit its content so all text is visible without
 * an inner scrollbar. The textarea should be styled with `resize-none`
 * and either no explicit height or `height: auto`.
 *
 * Returns a callback ref. Pass it to the textarea via `ref={setEl}`,
 * composing with any existing ref:
 *
 *   const setAutoGrowEl = useAutoGrowTextarea(text, 6);
 *   <textarea ref={(el) => { myRef.current = el; setAutoGrowEl(el); }} />
 *
 * Using a callback ref (rather than a `useRef` object) means the hook
 * re-binds and re-measures whenever the textarea unmounts/remounts —
 * which happens any time the surrounding block is collapsed and
 * re-expanded, the editor switches between nodes, etc. Tying everything
 * to `useState` instead of `useRef` is what makes the listener effect
 * actually re-run on those transitions.
 *
 * `minRows` reserves a minimum visible height even when empty. There is
 * no maximum — the textarea grows as tall as its content needs, and the
 * surrounding container handles overflow scrolling.
 */
export function useAutoGrowTextarea(
  value: string | undefined,
  minRows: number = 1,
) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  // Keep `minRows` in a ref so the resize closure always sees the latest
  // value without forcing the listener effect to re-bind on every render.
  const minRowsRef = useRef(minRows);
  minRowsRef.current = minRows;

  const resize = (target: HTMLTextAreaElement) => {
    const cs = window.getComputedStyle(target);
    const lineHeight = parseFloat(cs.lineHeight);
    const paddingY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const borderY =
      (parseFloat(cs.borderTopWidth) || 0) +
      (parseFloat(cs.borderBottomWidth) || 0);
    const minPx = Number.isFinite(lineHeight)
      ? lineHeight * minRowsRef.current + paddingY + borderY
      : 0;
    // Reset to 'auto' first so scrollHeight reflects the natural content
    // height rather than the previously-set height.
    target.style.height = "auto";
    const next = Math.max(minPx, target.scrollHeight);
    target.style.height = `${next}px`;
  };

  // Resize whenever the controlled value changes OR the element itself
  // changes (mount / remount). useLayoutEffect avoids a one-frame flash.
  useLayoutEffect(() => {
    if (el) resize(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, value]);

  // Bind native listeners so external mutations (e.g. the Yjs <-> textarea
  // bridge in `lib/yTextarea.ts` rewriting `el.value` and dispatching a
  // synthetic `input` event for remote edits) keep the size in sync even
  // though React's controlled `value` hasn't changed. Window resize can
  // change wrapping, which changes required height — re-measure there too.
  useEffect(() => {
    if (!el) return;
    const handler = () => resize(el);
    el.addEventListener("input", handler);
    window.addEventListener("resize", handler);
    // Initial sync in case fonts/CSS settled late.
    resize(el);
    return () => {
      el.removeEventListener("input", handler);
      window.removeEventListener("resize", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el]);

  return setEl;
}
