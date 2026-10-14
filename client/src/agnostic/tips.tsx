// Tooltips: a small "?" beside a value or insert. Hover it (or tap it on a
// phone) for an explanation in a little pop-up that scrolls when it's long.
//
// Written as plain text with a few conveniences:
//   ## Heading                a heading line
//   A | B | C                 consecutive lines with "|" become a table
//                             (the first one is the header row)
//   - item                    a bullet
//   **bold**                  bold
//   a blank line              a gap
// A table row whose first cell is the value's current text is highlighted
// (e.g. your current rank in a rank ladder).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i} className="text-stone-100">{part.slice(2, -2)}</b> : <React.Fragment key={i}>{part}</React.Fragment>);
}

export function TipContent({ text, current }: { text: string; current?: string | null }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  const here = (current ?? "").trim().toLowerCase();
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <table key={`t${i}`} className="w-full text-xs my-1">
          <thead><tr className="text-stone-500 text-left">{head.map((c, k) => <th key={k} className={`font-medium pb-0.5 ${k ? "text-right" : ""}`}>{inline(c)}</th>)}</tr></thead>
          <tbody>
            {body.map((r, ri) => {
              const isHere = !!here && r[0]?.toLowerCase() === here;
              return (
                <tr key={ri} className={isHere ? "text-amber-300 font-semibold" : "text-stone-300"}>
                  {r.map((c, k) => <td key={k} className={`py-0.5 ${k ? "text-right tabular-nums" : ""}`}>{inline(c)}{isHere && k === 0 && <span className="ml-1 text-[10px] text-amber-500">now</span>}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>,
      );
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      const t = line.replace(/^#+\s*/, "");
      const [title, ...rest] = t.split(" · ");
      out.push(
        <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-stone-700 pb-0.5 mt-2 first:mt-0">
          <span className="text-sm font-bold text-stone-100">{inline(title)}</span>
          {rest.length > 0 && <span className="flex gap-3 text-[11px] text-stone-400">{rest.map((r, k) => <span key={k}>{inline(r)}</span>)}</span>}
        </div>,
      );
    } else if (/^\s*[-•]\s+/.test(line)) {
      out.push(<div key={i} className="flex gap-1.5 text-xs text-stone-300"><span className="text-amber-500">•</span><span>{inline(line.replace(/^\s*[-•]\s+/, ""))}</span></div>);
    } else if (!line.trim()) {
      out.push(<div key={i} className="h-1.5" />);
    } else {
      out.push(<p key={i} className="text-xs text-stone-300 leading-relaxed">{inline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5">{out}</div>;
}

/** The "?" and its pop-up. */
export function TipIcon({ text, current, size = 14, className = "" }: { text?: string | null; current?: string | null; size?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);

  const show = () => { if (hideTimer.current) clearTimeout(hideTimer.current); setOpen(true); };
  const hideSoon = () => { if (pinned) return; if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setOpen(false), 180); };

  // Place it beside the "?" and keep it on screen; it scrolls inside if it's long.
  useLayoutEffect(() => {
    if (!open || !iconRef.current) return;
    const r = iconRef.current.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const useBelow = below >= 200 || below >= above;
    const maxH = Math.max(120, Math.min(420, useBelow ? below : above));
    const h = Math.min(maxH, popRef.current?.scrollHeight ?? maxH);
    setPos({ left, top: useBelow ? r.bottom + 6 : r.top - 6 - h, maxH });
  }, [open, text]);

  // Tapped open (phones): a tap anywhere else closes it.
  useEffect(() => {
    if (!open || !pinned) return;
    const close = (e: PointerEvent) => {
      if (iconRef.current?.contains(e.target as Node) || popRef.current?.contains(e.target as Node)) return;
      setOpen(false); setPinned(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open, pinned]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  if (!text?.trim()) return null;
  return (
    <>
      <span ref={iconRef} role="button" tabIndex={0} aria-label="More about this" contentEditable={false}
        className={`inline-grid place-items-center align-middle shrink-0 cursor-help text-stone-500 hover:text-amber-300 ${open ? "text-amber-300" : ""} ${className}`}
        onMouseEnter={show} onMouseLeave={hideSoon}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (pinned) { setPinned(false); setOpen(false); } else { setPinned(true); setOpen(true); } }}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPinned(!open); setOpen(!open); } if (e.key === "Escape") { setOpen(false); setPinned(false); } }}
        data-testid="ag-tip">
        <HelpCircle style={{ width: size, height: size }} />
      </span>
      {open && createPortal(
        <div ref={popRef} role="tooltip" onMouseEnter={show} onMouseLeave={hideSoon}
          className="fixed z-[30000] w-[min(360px,calc(100vw-16px))] overflow-y-auto overscroll-contain rounded-lg border border-stone-700 bg-stone-900/98 shadow-2xl p-3 text-left"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxHeight: pos?.maxH ?? 420 }}
          data-testid="ag-tip-popup">
          <TipContent text={text} current={current} />
        </div>,
        document.body,
      )}
    </>
  );
}
