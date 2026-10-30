// Battlemap overlay for a note-backed token: its live portrait, name and the
// bars the GM chose. Bars are the note's real values — click one (if you're
// allowed) to change it, and the sheet, tracker and every client update.
import React from "react";
import type { AgTokenBar, AgNote } from "@shared/agnostic/types";
import { Portrait } from "./widgets";
import { canViewNote } from "@shared/agnostic/acl";
import { useAgMaybe, resolveRef } from "./hooks";
import { ResourceBar } from "./widgets";
import { onSpeech, speechOf, speechOpacity, SPEECH_FADE_MS } from "./speech";

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
      <SpeechBubble note={note} tokenSize={tokenSize} />
      {/* The kind's icon until the picture loads (and if it can't). */}
      {/* Pinned over the token's own square (the Portrait box is position:relative itself). */}
      <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden" data-testid="ag-token-portrait">
        <Portrait note={note} size="100%" radius={12} className="!border-0 !bg-stone-800/90" />
      </div>
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

/**
 * What the person playing this sheet just typed in chat, over its head for a
 * few seconds. Whoever owns the sheet is who is speaking through it, so a
 * player's line appears over their own character wherever it stands — and over
 * each of their sheets, if they have more than one on the table.
 */
function SpeechBubble({ note, tokenSize }: { note: AgNote; tokenSize: number }) {
  const [, bump] = React.useState(0);
  React.useEffect(() => onSpeech(() => bump((n) => n + 1)), []);
  // Fading is a second of animation: redraw while there is something to fade.
  const owner = note.ownerIds.find((id) => !!speechOf(id));
  const said = speechOf(owner);
  React.useEffect(() => {
    if (!said) return;
    const t = setInterval(() => bump((n) => n + 1), 120);
    return () => clearInterval(t);
  }, [said?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!said) return null;
  const opacity = speechOpacity(said.at);
  if (opacity <= 0) return null;
  const size = Math.max(9, Math.min(13, tokenSize / 4.6));
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-20"
      style={{ bottom: `calc(100% + ${Math.max(6, tokenSize / 9)}px)`, width: Math.max(120, tokenSize * 2.4), opacity, transition: `opacity ${SPEECH_FADE_MS}ms linear` }}
      data-testid="ag-token-speech"
    >
      <div className="relative mx-auto w-fit max-w-full rounded-xl bg-stone-900/95 border border-stone-600 px-2.5 py-1.5 shadow-lg">
        <div className="text-stone-100 leading-snug break-words text-center" style={{ fontSize: size }}>{said.text}</div>
        {/* The tail, pointing down at whoever said it. */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] h-2 w-2 rotate-45 bg-stone-900/95 border-r border-b border-stone-600" />
      </div>
    </div>
  );
}