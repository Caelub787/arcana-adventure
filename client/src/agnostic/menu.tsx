// The little menu that opens where you pressed: right-click a row, a folder or
// the space around them, or press one of the ⋯ buttons. Same menu either way,
// so there is nothing to learn twice.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** One line of a little menu. */
export type MenuItem = { icon: React.ReactNode; label: string; run: () => void; danger?: boolean; testId: string } | "sep";

/**
 * A menu where you pressed. Right-click anything in the list — a sheet, a
 * folder, the space below them — and what you can do with it is here, the same
 * things the ⋯ buttons open.
 */
export function MenuAt({ at, title, items, keep = [], testId = "ag-menu", onClose }: {
  at: { x: number; y: number }; title?: string; items: MenuItem[]; keep?: string[]; testId?: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, at.x)), top: Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, at.y)) });
  }, [at.x, at.y]);
  useEffect(() => {
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="menu" className="fixed z-[30000] min-w-[210px] rounded-lg border border-stone-700 bg-stone-900/98 shadow-2xl py-1 text-sm text-stone-200" style={pos} data-testid={testId}>
      {title && <div className="px-3 py-1 text-[11px] text-stone-500 truncate max-w-[260px]">{title}</div>}
      {items.map((it, i) => it === "sep" ? <div key={i} className="my-1 border-t border-stone-800" /> : (
        <button key={it.testId} type="button" role="menuitem" onClick={() => { it.run(); if (!keep.includes(it.testId)) onClose(); }}
          className={`w-full flex items-center gap-2.5 px-3 h-9 text-left hover:bg-stone-800 ${it.danger ? "text-red-300 hover:bg-red-950/60" : ""}`} data-testid={`${testId}-${it.testId}`}>
          <span className={it.danger ? "text-red-400" : "text-stone-400"}>{it.icon}</span>{it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
