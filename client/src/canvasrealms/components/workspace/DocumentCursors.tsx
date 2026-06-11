import { useEffect, useRef, useState, type RefObject } from "react";
import * as Y from "yjs";
import { useRealtime } from "@cr/lib/realtime";

interface RemoteDocCursor {
  clientId: number;
  name: string;
  color: string;
  /** Absolute character index of the caret in the current Y.Text. */
  index: number;
  /** Absolute character index of the selection anchor (may equal index). */
  anchor: number;
}

interface Props {
  nodeId: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/** Renders a coloured caret + name pill over the document textarea for every
 * remote peer whose `docCursor.nodeId` matches this node. Caret pixel position
 * is computed by mirroring the textarea's text + a marker span and reading the
 * marker's offset — robust against word wrap and font changes since the mirror
 * inherits the textarea's computed style. */
export function DocumentCursors({ nodeId, textareaRef }: Props) {
  const ctx = useRealtime();
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [cursors, setCursors] = useState<RemoteDocCursor[]>([]);
  // Bump on textarea size/scroll changes so we re-position carets.
  const [, setTick] = useState(0);

  // Subscribe to awareness changes and project Y.RelativePosition -> index.
  useEffect(() => {
    if (!ctx) return;
    const aw = ctx.awareness;
    const yText = ctx.doc.getText(`node:${nodeId}`);
    const recompute = () => {
      const out: RemoteDocCursor[] = [];
      aw.getStates().forEach((state, clientId) => {
        if (clientId === aw.clientID) return;
        const s = state as {
          user?: { name: string; color: string };
          docCursor?: { nodeId: string; head: unknown; anchor: unknown };
        };
        if (!s.docCursor || s.docCursor.nodeId !== nodeId) return;
        try {
          const headRel = Y.createRelativePositionFromJSON(s.docCursor.head);
          const anchorRel = Y.createRelativePositionFromJSON(
            s.docCursor.anchor,
          );
          const headAbs = Y.createAbsolutePositionFromRelativePosition(
            headRel,
            ctx.doc,
          );
          const anchorAbs = Y.createAbsolutePositionFromRelativePosition(
            anchorRel,
            ctx.doc,
          );
          const head = headAbs?.index;
          const anchor = anchorAbs?.index;
          if (head == null || anchor == null) return;
          out.push({
            clientId,
            name: s.user?.name ?? "Anonymous",
            color: s.user?.color ?? "#7c5cff",
            index: head,
            anchor,
          });
        } catch {
          // skip malformed
        }
      });
      setCursors(out);
    };
    recompute();
    aw.on("change", recompute);
    yText.observe(recompute);
    return () => {
      aw.off("change", recompute);
      yText.unobserve(recompute);
    };
  }, [ctx, nodeId]);

  // Re-render on textarea scroll/resize so carets follow.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const bump = () => setTick((n) => (n + 1) & 0xffff);
    ta.addEventListener("scroll", bump);
    const ro = new ResizeObserver(bump);
    ro.observe(ta);
    return () => {
      ta.removeEventListener("scroll", bump);
      ro.disconnect();
    };
  }, [textareaRef]);

  if (!ctx || cursors.length === 0) return null;
  const ta = textareaRef.current;
  if (!ta) return null;

  // Build the mirror's style from the textarea's computed style every render
  // — cheap and keeps everything in sync.
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

  // Project each cursor index into pixel coords by writing text up to the
  // index into the mirror, appending a zero-width marker, and reading its
  // offset. This is the well-known "textarea-caret-position" pattern.
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

  // Approximate line height for selection-range rectangles.
  const parsedLineHeight = parseFloat(cs.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight)
    ? parsedLineHeight
    : parseFloat(cs.fontSize) * 1.4;
  const taWidth = ta.clientWidth;
  const taRectHeight = ta.getBoundingClientRect().height;

  const rendered: Array<{
    clientId: number;
    name: string;
    color: string;
    caret: { top: number; left: number };
    rects: Array<{ top: number; left: number; width: number; height: number }>;
  }> = [];

  for (const c of cursors) {
    const head = measure(c.index);
    if (!head) continue;
    if (head.top < -8 || head.top > taRectHeight + 4) continue;

    const rects: Array<{
      top: number;
      left: number;
      width: number;
      height: number;
    }> = [];
    if (c.anchor !== c.index) {
      const a = measure(Math.min(c.anchor, c.index));
      const b = measure(Math.max(c.anchor, c.index));
      if (a && b) {
        if (Math.abs(a.top - b.top) < 1) {
          rects.push({
            top: a.top,
            left: a.left,
            width: Math.max(2, b.left - a.left),
            height: lineHeight,
          });
        } else {
          // Start-line tail.
          rects.push({
            top: a.top,
            left: a.left,
            width: Math.max(2, taWidth - a.left),
            height: lineHeight,
          });
          // Full-width middle lines.
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
          // End-line head.
          rects.push({
            top: b.top,
            left: 0,
            width: Math.max(2, b.left),
            height: lineHeight,
          });
        }
      }
    }

    rendered.push({
      clientId: c.clientId,
      name: c.name,
      color: c.color,
      caret: head,
      rects,
    });
  }

  return (
    <>
      <div ref={mirrorRef} aria-hidden style={mirrorStyle} />
      {rendered.map((p) => (
        <div key={p.clientId} className="contents">
          {p.rects.map((r, i) => (
            <div
              key={i}
              className="pointer-events-none absolute z-[54] rounded-[1px]"
              style={{
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                backgroundColor: p.color,
                opacity: 0.18,
              }}
            />
          ))}
          <div
            className="pointer-events-none absolute z-[55]"
            style={{ top: p.caret.top, left: p.caret.left }}
          >
            <div
              className="w-[2px]"
              style={{
                height: `${lineHeight}px`,
                backgroundColor: p.color,
              }}
            />
            <div
              className="absolute -top-4 left-0 px-1 text-[10px] font-medium text-white rounded-sm whitespace-nowrap leading-tight"
              style={{ backgroundColor: p.color }}
            >
              {p.name}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
