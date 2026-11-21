// The Table: what belongs to the whole group rather than to any one sheet.
//
// Three things live here. Fate is the GM's own count — three slots they fill
// as things go wrong, and when the third one fills something lands on the
// party. Tokens are favours the GM hands to a character: three slots each,
// hover one to read it, press it to spend it. Notes is the GM's standing word
// to the table, which everyone reads.
//
// All of it is campaign settings, so it goes round everyone the moment it
// changes — nobody reloads anything to see a token appear or a slot fill.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Flame, Plus, X } from "lucide-react";
import { TABLE_FATE_SLOTS, TABLE_TOKEN_SLOTS, TABLE_NOTES_MAX, assignedNoteOf } from "@shared/agnostic/types";
import type { AgCampaignSettings } from "@shared/agnostic/types";
import type { AgNote } from "@shared/agnostic/types";
import type { AgMember } from "@shared/agnostic/protocol";
import { AgPanel, AgSelector } from "./float";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAg, fieldsOf } from "./hooks";
import { useToast } from "@/hooks/use-toast";

/** The metal everything on a sheet is picked out in. */
const GILT = "#d4a24c";

/** A heading, the same one every other panel in here uses. */
function Heading({ icon, children, hint }: { icon: React.ReactNode; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="text-xs uppercase tracking-wide text-amber-400/90 flex items-center gap-1.5">
        {icon}{children}
      </div>
      {hint && <span className="text-[11px] text-stone-500 truncate">{hint}</span>}
    </div>
  );
}

/**
 * A row per player, holding the sheet that player is playing.
 *
 * It read this off edit access once, which listed everything a player owned
 * — their traits, their items, their wounds — and a trait called Sandwich
 * Addiction sat there asking for tokens. Playing a sheet is its own thing
 * now, and one at a time, so there is exactly one answer per player.
 *
 * Someone playing nothing still gets a row saying so, rather than quietly
 * going missing. The GM is not a row: the tokens are for the people they are
 * handed to.
 */
export function tableRows(notes: AgNote[], members: AgMember[], settings?: AgCampaignSettings | null): { member: AgMember; note: AgNote | null }[] {
  const by = new Map(notes.filter((n) => !n.isTemplate).map((n) => [n.id, n]));
  return members
    .filter((m) => m.role !== "gm")
    .map((m) => ({ member: m, note: by.get(assignedNoteOf(settings, m.userId) ?? "") ?? null }))
    .sort((a, b) => (a.note?.name ?? a.member.name).localeCompare(b.note?.name ?? b.member.name));
}

/** What a token does, as its sheet says. Shown when you hover it. */
function whatItDoes(state: any, tokenId: string): string {
  const f = fieldsOf(state, tokenId).find((x: any) => x.key === "what");
  const v = f?.eff ?? f?.value;
  return typeof v === "string" && v.trim() ? v.trim() : "Nothing written on this token yet.";
}

export function AgTable({ onClose }: { onClose: () => void }) {
  const { state, viewer, request, openNote } = useAg();
  const { toast } = useToast();
  const [giving, setGiving] = useState<string | null>(null);
  const [using, setUsing] = useState<{ noteId: string; tokenId: string } | null>(null);

  const table = state.settings?.table ?? { fate: 0, tokens: {}, notes: "" };
  const notes = useMemo(() => Array.from(state.notes.values()) as AgNote[], [state.notes]);
  const rows = useMemo(() => tableRows(notes, state.members, state.settings), [notes, state.members, state.settings]);
  const tokenSheets = useMemo(
    () => notes.filter((n) => !n.isTemplate && n.type === "table_token").sort((a, b) => a.name.localeCompare(b.name)),
    [notes],
  );

  const say = (e: any) => toast({ title: "That didn't work", description: e?.message, variant: "destructive" });
  const setFate = (filled: number) => request({ op: "table.fate", filled }).catch(say);
  const give = (noteId: string, tokenId: string) => request({ op: "table.give", noteId, tokenId }).catch(say);
  const use = (noteId: string, tokenId: string) => request({ op: "table.use", noteId, tokenId }).catch(say);

  return (
    <AgPanel title={<span className="flex items-center gap-2"><Coins className="h-4 w-4" style={{ color: GILT }} /> Table</span>}
      onClose={onClose} panelKey="ag-table" width={500} height={620} testId="ag-table">
      <div className="space-y-4 text-sm text-stone-200">

        {/* ---- Fate ---------------------------------------------------- */}
        <section className="space-y-1.5">
          <Heading icon={<Flame className="h-3.5 w-3.5" />} hint={`${table.fate} of ${TABLE_FATE_SLOTS}`}>Fate</Heading>
          <div className="rounded border border-stone-800 bg-stone-950/60 px-2 py-2">
            <div className="flex items-center gap-2">
              {Array.from({ length: TABLE_FATE_SLOTS }, (_, i) => {
                const filled = i < table.fate;
                // Pressing the last filled one empties it, so the GM can take
                // a slot back without a separate control.
                const to = filled && i === table.fate - 1 ? i : i + 1;
                return (
                  <button key={i} type="button" disabled={!viewer.isGM}
                    onClick={() => setFate(to)}
                    aria-label={`Fate slot ${i + 1}${filled ? ", filled" : ", empty"}`}
                    aria-pressed={filled}
                    data-testid={`ag-table-fate-${i}`}
                    className={`chrome-frame h-11 flex-1 rounded-lg border grid place-items-center transition ${
                      filled ? "border-rose-600/80 bg-rose-950/40 text-rose-300" : "bg-stone-900/70 text-stone-700"
                    } ${viewer.isGM ? "cursor-pointer hover:border-rose-500/80" : "cursor-default"}`}
                    style={filled ? { boxShadow: "0 0 0 1px rgb(0 0 0 / 0.5), 0 0 14px -4px #e11d48" } : undefined}>
                    <Flame className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-stone-500 mt-1.5">
              {viewer.isGM
                ? "Press a slot to fill it, press the last filled one to take it back. When the third fills, it lands on the party."
                : "How much has gone wrong. When the third fills, it lands on all of you."}
            </p>
          </div>
        </section>

        {/* ---- Notes --------------------------------------------------- */}
        <section className="space-y-1.5">
          <Heading icon={<span className="text-[13px] leading-none">✒</span>}>Notes</Heading>
          <TableNotes text={table.notes ?? ""} canEdit={viewer.isGM}
            onSave={(text) => request({ op: "table.notes", text }).catch(say)} />
        </section>

        {/* ---- Tokens, a row per played sheet --------------------------- */}
        <section className="space-y-1.5">
          <Heading icon={<Coins className="h-3.5 w-3.5" />}
            hint={viewer.isGM ? "press an empty slot to hand one out" : "press one to spend it"}>Tokens</Heading>
          {!rows.length && (
            <div className="rounded border border-stone-800 bg-stone-950/60 px-2 py-2 text-[11px] text-stone-500">
              Nobody has joined the campaign yet.
            </div>
          )}
          {rows.map(({ member, note: n }) => {
            if (!n) {
              return (
                <div key={member.userId} className="flex items-center gap-2 rounded border border-stone-800/70 bg-stone-950/40 px-2 py-1.5" data-testid={`ag-table-row-${member.name}`}>
                  <span className="flex-1 min-w-0 truncate text-xs font-semibold text-stone-500">{member.name}</span>
                  <span className="text-[11px] text-stone-600 shrink-0">not playing anything</span>
                </div>
              );
            }
            const held = table.tokens[n.id] ?? [];
            const mine = viewer.isGM || n.ownerIds.includes(viewer.userId);
            return (
              <div key={member.userId} className="flex items-center gap-2 rounded border border-stone-800 bg-stone-950/60 px-2 py-1.5" data-testid={`ag-table-row-${n.name}`}>
                <button type="button" onClick={() => openNote(n.id)}
                  className="flex-1 min-w-0 text-left hover:opacity-90">
                  <span className="block truncate text-xs font-semibold" style={{ color: GILT }}>{n.name}</span>
                  <span className="block truncate text-[10px] text-stone-500">{member.name}</span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  {Array.from({ length: TABLE_TOKEN_SLOTS }, (_, i) => {
                    const tokenId = held[i];
                    if (!tokenId) {
                      return (
                        <button key={i} type="button" disabled={!viewer.isGM}
                          onClick={() => setGiving(n.id)}
                          aria-label={viewer.isGM ? `Give ${n.name} a token` : "Empty token slot"}
                          data-testid={`ag-table-slot-${n.name}-${i}`}
                          className={`h-9 w-9 rounded-lg border border-dashed grid place-items-center ${
                            viewer.isGM
                              ? "border-stone-700 text-stone-600 hover:border-amber-600/70 hover:text-amber-400 cursor-pointer"
                              : "border-stone-800/80 text-stone-800 cursor-default"
                          }`}>
                          {viewer.isGM ? <Plus className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />}
                        </button>
                      );
                    }
                    const token = state.notes.get(tokenId);
                    return (
                      <TooltipProvider key={i} delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" disabled={!mine}
                              onClick={() => setUsing({ noteId: n.id, tokenId })}
                              data-testid={`ag-table-token-${n.name}-${i}`}
                              className={`chrome-frame h-9 w-9 rounded-lg border grid place-items-center overflow-hidden bg-stone-900 ${
                                mine ? "cursor-pointer hover:border-amber-500" : "cursor-default"
                              }`}
                              style={{ boxShadow: "0 0 0 1px rgb(0 0 0 / 0.5), 0 0 12px -4px var(--ca-gilt)" }}>
                              {token?.portrait
                                ? <img src={token.portrait} alt="" className="h-full w-full object-cover" />
                                : <Coins className="h-4 w-4" style={{ color: GILT }} />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-stone-800 border-stone-700 text-stone-200 max-w-[260px]">
                            <p className="font-semibold text-amber-300">{token?.name ?? "A token"}</p>
                            <p className="text-xs text-stone-300 mt-0.5">{whatItDoes(state, tokenId)}</p>
                            {mine && <p className="text-[10px] text-stone-500 mt-1">Press it to spend it.</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {/* Which token to hand out. Only token sheets, never anything else. */}
      {giving && (
        <AgSelector title="Give a token" testId="ag-table-give"
          emptyText="No tokens yet — make one from the CA Table Token template."
          items={tokenSheets.map((t) => ({ id: t.id, name: t.name, sub: whatItDoes(state, t.id) }))}
          onPick={(id) => { const to = giving; setGiving(null); if (to) void give(to, id); }}
          onClose={() => setGiving(null)} />
      )}

      {/* Spending one asks first: it is gone from the slot afterwards. */}
      {using && (() => {
        const token = state.notes.get(using.tokenId);
        return (
          <UseToken name={token?.name ?? "this token"} what={whatItDoes(state, using.tokenId)}
            onClose={() => setUsing(null)}
            onUse={() => { const u = using; setUsing(null); void use(u.noteId, u.tokenId); }} />
        );
      })()}
    </AgPanel>
  );
}

/**
 * The GM's standing note to the table.
 *
 * Typed into a local copy and saved when you stop typing, so a key press
 * doesn't go round the table — but whatever the GM types wins while they are
 * typing, and anything that arrives from elsewhere shows the moment they stop.
 */
function TableNotes({ text, canEdit, onSave }: { text: string; canEdit: boolean; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(text);
  const typing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!typing.current) setDraft(text); }, [text]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!canEdit) {
    return (
      <div className="rounded border border-stone-800 bg-stone-950/60 px-2 py-2 min-h-[64px] text-[13px] whitespace-pre-wrap text-stone-300" data-testid="ag-table-notes-read">
        {text.trim() || <span className="text-stone-600 italic">Nothing written up yet.</span>}
      </div>
    );
  }
  const push = (v: string) => {
    typing.current = true;
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { typing.current = false; onSave(v); }, 600);
  };
  return (
    <>
      <textarea
        value={draft}
        maxLength={TABLE_NOTES_MAX}
        onChange={(e) => push(e.target.value)}
        onBlur={() => { if (timer.current) clearTimeout(timer.current); typing.current = false; if (draft !== text) onSave(draft); }}
        rows={4}
        placeholder="Anything the whole table should have in front of them — where you left off, what everyone knows, house rules for tonight."
        className="w-full rounded border border-stone-700 bg-stone-950 px-2 py-1.5 text-[13px] leading-snug text-stone-200 placeholder:text-stone-600 outline-none focus:border-amber-600 resize-y"
        data-testid="ag-table-notes"
      />
      <p className="text-[11px] text-stone-500">Everyone at the table reads this. Saves on its own.</p>
    </>
  );
}

/** The little "Use" prompt a token shows when you press it. */
function UseToken({ name, what, onUse, onClose }: { name: string; what: string; onUse: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[12050] grid place-items-center bg-black/60 p-4" onClick={onClose} data-testid="ag-table-use">
      <div className="chrome-frame w-full max-w-sm rounded-xl border bg-stone-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold" style={{ color: GILT }}>{name}</h3>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-200" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs text-stone-300">{what}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 px-3 rounded border border-stone-700 text-xs text-stone-300 hover:bg-stone-800">Not yet</button>
          <button type="button" onClick={onUse} data-testid="ag-table-use-confirm"
            className="h-8 px-3 rounded bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white">Use</button>
        </div>
      </div>
    </div>
  );
}
