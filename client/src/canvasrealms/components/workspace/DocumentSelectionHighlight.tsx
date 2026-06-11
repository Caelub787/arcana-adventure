import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  start: number;
  end: number;
}

/** Renders a translucent accent-colored highlight over a [start, end] character
 * range in the bound textarea. Uses the same hidden-mirror measurement pattern
 * as `DocumentCursors` so positions stay correct under word-wrap, scroll, and
 * font changes. Used to mark the passage Compass is currently editing. */
export function DocumentSelectionHighlight({ textareaRef, start, end }: Props) {
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => (n + 1) & 0xffff);

  // Force one re-render after mount so the mirror ref is populated and
  // measurements can succeed on the second render.
  useLayoutEffect(() => {
    bump();
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.addEventListener("scroll", bump);
    const ro = new ResizeObserver(bump);
    ro.observe(ta);
    return () => {
      ta.removeEventListener("scroll", bump);
      ro.disconnect();
    };
  }, [textareaRef]);

  const ta = textareaRef.current;
  if (!ta) return null;

  const cs = window.getComputedStyle(ta);
  const mirrorStyle: React.CSSProperties = {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    overflow: "hidden",
    boxSizing: cs.boxSizing as React.CSSProperties["boxSizing"],
    width: cs.width,
    height: cs.height,
    padding: cs.padding,
    border: cs.border,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight as React.CSSProperties["fontWeight"],
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    tabSize: cs.tabSize as unknown as React.CSSProperties["tabSize"],
    top: 0,
    left: 0,
  };
  const value = ta.value;

  const measure = (idx: number): { top: number; left: number } | null => {
    if (!mirrorRef.current) return null;
    const m = mirrorRef.current;
    const safeIdx = Math.max(0, Math.min(idx, value.length));
    m.textContent = value.slice(0, safeIdx);
    const marker = document.createElement("span");
    marker.textContent = value.slice(safeIdx, safeIdx + 1) || ".";
    m.appendChild(marker);
    const top = marker.offsetTop - ta.scrollTop;
    const left = marker.offsetLeft - ta.scrollLeft;
    m.removeChild(marker);
    return { top, left };
  };

  const parsedLineHeight = parseFloat(cs.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight)
    ? parsedLineHeight
    : parseFloat(cs.fontSize) * 1.4;
  const taWidth = ta.clientWidth;

  // Compute rects only when we can actually measure. The mirror element is
  // always mounted below so a follow-up render (driven by the layout-effect
  // bump above, or by scroll/resize) can take the measurements.
  let rects: Array<{
    top: number;
    left: number;
    width: number;
    height: number;
  }> = [];
  if (end > start) {
    const a = measure(start);
    const b = measure(end);
    if (a && b) {
      if (Math.abs(a.top - b.top) < 1) {
        rects.push({
          top: a.top,
          left: a.left,
          width: Math.max(2, b.left - a.left),
          height: lineHeight,
        });
      } else {
        rects.push({
          top: a.top,
          left: a.left,
          width: Math.max(2, taWidth - a.left),
          height: lineHeight,
        });
        const middleTop = a.top + lineHeight;
        const middleHeight = b.top - a.top - lineHeight;
        if (middleHeight > 0) {
          rects.push({
            top: middleTop,
            left: 0,
            width: taWidth,
            height: middleHeight,
          });
        }
        rects.push({
          top: b.top,
          left: 0,
          width: Math.max(2, b.left),
          height: lineHeight,
        });
      }
    }
  }
  // Reference `tick` so the linter doesn't strip the dependency that drives
  // re-render after mount/scroll/resize.
  void tick;

  return (
    <>
      <div ref={mirrorRef} aria-hidden style={mirrorStyle} />
      {rects.map((r, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute z-[53] rounded-[2px] ring-1 ring-accent/50 bg-accent/25"
          style={{
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
          }}
        />
      ))}
    </>
  );
}
