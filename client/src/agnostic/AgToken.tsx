// Battlemap overlay for a note-backed token: its live portrait, name and the
// bars the GM chose. Bars are the note's real values — click one (if you're
// allowed) to change it, and the sheet, tracker and every client update.
import React from "react";
import type { AgTokenBar } from "@shared/agnostic/types";
import { Portrait } from "./widgets";
import { canViewNote } from "@shared/agnostic/acl";
import { useAgMaybe, resolveRef } from "./hooks";
import { ResourceBar } from "./widgets";

export function AgTokenOverlay({ noteId, tokenSize, showName = true, showBars = true }: { noteId: string; tokenSize: number; showName?: boolean; showBars?: boolean }) {
  const ag = useAgMaybe();
  if (!ag) return null;
  const { state, viewer } = ag;
  const note = state.notes.get(noteId);
  if (!note || !canViewNote(note, viewer)) return null;
  const bars: AgTokenBar[] = note.tokenBars ?? state.settings?.tokenBarsByType?.[note.type] ?? [];
  const resolved = showBars ? bars.map((b) => ({ b, f: resolveRef(state, noteId, b.value)[0], m: b.max ? resolveRef(state, noteId, b.max)[0] : undefined })).filter((x) => x.f) : [];
  const barH = Math.max(5, Math.min(10, tokenSize / 8));
  return (
    <>
      {/* The kind's icon until the picture loads (and if it can't). */}
      <Portrait note={note} size="100%" radius={12} className="absolute inset-0 pointer-events-none !border-0 !bg-stone-800/90" />
      {(showName || resolved.length > 0) && (
        <div className="absolute z-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-px" style={{ bottom: 2, width: tokenSize * 0.92 }}
          onPointerDown={(e) => { if ((e.target as HTMLElement).closest("[data-ag-token-bar]")) e.stopPropagation(); }}
          onClick={(e) => { if ((e.target as HTMLElement).closest("[data-ag-token-bar]")) e.stopPropagation(); }}>
          {showName && (
            <div className="font-display text-white text-center leading-tight pointer-events-none" style={{ fontSize: Math.max(8, Math.min(11, tokenSize / 5.5)), textShadow: "1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000", maxWidth: tokenSize * 1.2 }}>{note.name}</div>
          )}
          {resolved.map(({ b, f, m }) => {
            // A bar's look is designed at a 64px token and scales with the token.
            const h = b.look?.height ? Math.max(2, Math.round((b.look.height * tokenSize) / 64)) : b.showNumbers ? Math.max(barH, 10) : barH;
            const look = b.look?.fontSize ? { ...b.look, fontSize: Math.max(6, Math.round((b.look.fontSize * tokenSize) / 64)) } : b.look;
            return (
              <div key={b.id} style={{ width: `${b.look?.width ?? 100}%` }} data-ag-token-bar data-testid={`ag-token-bar-${b.value}`}>
                <ResourceBar field={f!} maxField={m} color={b.color} height={h} showNumbers={!!b.showNumbers} look={look} label={b.label || undefined} compact />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
