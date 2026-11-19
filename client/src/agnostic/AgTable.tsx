// The Table: what belongs to the whole group rather than to any one sheet.
//
// Two things live here. Fate is the GM's own count — three slots they fill as
// things go wrong, and when the third one fills something lands on the party.
// Tokens are favours the GM hands to a character: three slots each, hover one
// to read what it does, press it to spend it.
//
// All of it is campaign settings, so it goes round everyone the moment it
// changes — nobody reloads anything to see a token appear or a fate slot fill.
import React, { useMemo, useState } from "react";
import { Coins, Flame, Plus, X } from "lucide-react";
import { TABLE_FATE_SLOTS, TABLE_TOKEN_SLOTS } from "@shared/agnostic/types";
import type { AgNote } from "@shared/agnostic/types";
import { AgPanel, AgSelector } from "./float";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAg, fieldsOf } from "./hooks";
import { useToast } from "@/hooks/use-toast";

const GILT = "#d4a24c";
const EMPTY = "rgba(120,113,108,0.5)";

/** What a token does, as its sheet says. Shown when you hover it. */
function whatItDoes(state: any, tokenId: string): string {
  const f = fieldsOf(state, tokenId).find((x: any) => x.key === "what");
  const v = f?.eff ?? f?.value;
  return typeof v === "string" && v.trim() ? v.trim() : "No description written on this token yet.";
}

export function AgTable({ onClose }: { onClose: () => void }) {
  const { state, viewer, request, openNote } = useAg();
  const { toast } = useToast();
  const [giving, setGiving] = useState<string | null>(null);
  const [using, setUsing] = useState<{ noteId: string; tokenId: string } | null>(null);

  const table = state.settings?.table ?? { fate: 0, tokens: {} };
  const notes = useMemo(() => Array.from(state.notes.values()) as AgNote[], [state.notes]);
  // A section each for the sheets somebody plays. A sheet nobody owns is the
  // GM's own business and doesn't want a row of token slots at the table.
  const played = useMemo(
    () => notes.filter((n) => !n.isTemplate && n.ownerIds.length > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [notes],
  );
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
      onClose={onClose} panelKey="ag-table" width={520} height={600} testId="ag-table">
      <div className="space-y-5">
        {/* ---- Fate ---------------------------------------------------- */}
        <section>
          <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-rose-400" /> Fate
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {viewer.isGM
              ? "Press a slot to fill it, press a filled one to take it back. When the third fills, it lands on the party."
              : "How much has gone wrong. When the third fills, it lands on all of you."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {Array.from({ length: TABLE_FATE_SLOTS }, (_, i) => {
              const filled = i < table.fate;
              // Pressing the one that's already last empties it, so a GM can
              // take a slot back without a separate control.
              const to = filled && i === table.fate - 1 ? i : i + 1;
              return (
                <button key={i} type="button" disabled={!viewer.isGM}
                  onClick={() => setFate(to)}
                  aria-label={`Fate slot ${i + 1}${filled ? ", filled" : ", empty"}`}
                  aria-pressed={filled}
                  data-testid={`ag-table-fate-${i}`}
                  className={`h-12 w-12 rounded-lg border grid place-items-center transition ${
                    filled ? "border-rose-600 bg-rose-950/50 text-rose-300" : "border-stone-700 bg-stone-900/60 text-stone-700"
                  } ${viewer.isGM ? "hover:border-rose-500 cursor-pointer" : "cursor-default"}`}>
                  <Flame className="h-6 w-6" style={filled ? undefined : { color: EMPTY }} />
                </button>
              );
            })}
            <span className="text-xs text-stone-500 ml-1" data-testid="ag-table-fate-count">{table.fate} of {TABLE_FATE_SLOTS}</span>
          </div>
        </section>

        {/* ---- Tokens, a row per played sheet --------------------------- */}
        <section>
          <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-1.5">
            <Coins className="h-4 w-4" style={{ color: GILT }} /> Tokens
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {viewer.isGM
              ? "Press an empty slot to hand one out. Hover a token to read it; press it to spend it."
              : "What you're holding. Hover one to read it, press it to spend it."}
          </p>
          {!played.length && <p className="mt-2 text-xs text-stone-500">No sheets are assigned to anyone yet.</p>}
          <div className="mt-2 space-y-2">
            {played.map((n) => {
              const held = table.tokens[n.id] ?? [];
              const mine = viewer.isGM || n.ownerIds.includes(viewer.userId);
              return (
                <div key={n.id} className="rounded-lg border border-stone-800/70 bg-stone-950/40 p-2" data-testid={`ag-table-row-${n.name}`}>
                  <button type="button" onClick={() => openNote(n.id)}
                    className="text-xs font-semibold text-stone-100 hover:text-amber-300 truncate max-w-full text-left">
                    {n.name}
                  </button>
                  <div className="mt-1.5 flex items-center gap-2">
                    {Array.from({ length: TABLE_TOKEN_SLOTS }, (_, i) => {
                      const tokenId = held[i];
                      if (!tokenId) {
                        return (
                          <button key={i} type="button" disabled={!viewer.isGM}
                            onClick={() => setGiving(n.id)}
                            aria-label={viewer.isGM ? `Give ${n.name} a token` : "Empty token slot"}
                            data-testid={`ag-table-slot-${n.name}-${i}`}
                            className={`h-11 w-11 rounded-lg border border-dashed grid place-items-center ${
                              viewer.isGM ? "border-stone-600 text-stone-600 hover:border-amber-600/70 hover:text-amber-400 cursor-pointer" : "border-stone-800 text-stone-800 cursor-default"
                            }`}>
                            {viewer.isGM ? <Plus className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                          </button>
                        );
                      }
                      const token = state.notes.get(tokenId);
                      return (
                        <TooltipProvider key={i} delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" disabled={!mine}
                                onClick={() => setUsing({ noteId: n.id, tokenId })}
                                data-testid={`ag-table-token-${n.name}-${i}`}
                                className={`h-11 w-11 rounded-lg border grid place-items-center bg-stone-900 ${
                                  mine ? "border-amber-700/70 hover:border-amber-500 cursor-pointer" : "border-stone-700 cursor-default"
                                }`}>
                                {token?.portrait
                                  ? <img src={token.portrait} alt="" className="h-full w-full object-cover rounded-lg" />
                                  : <Coins className="h-5 w-5" style={{ color: GILT }} />}
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
          </div>
        </section>
      </div>

      {/* Which token to hand out. Only the token sheets, never anything else. */}
      {giving && (
        <AgSelector title="Give a token" testId="ag-table-give"
          emptyText="No tokens made yet — make one from the CA Table Token template."
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

/** The little "Use" prompt a token shows when you press it. */
function UseToken({ name, what, onUse, onClose }: { name: string; what: string; onUse: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[12050] grid place-items-center bg-black/60 p-4" onClick={onClose} data-testid="ag-table-use">
      <div className="w-full max-w-sm rounded-xl border border-stone-700 bg-stone-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-amber-300">{name}</h3>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-200" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs text-stone-300">{what}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 px-3 rounded border border-stone-700 text-xs text-stone-300 hover:bg-stone-800">Not yet</button>
          <button type="button" onClick={onUse} data-testid="ag-table-use-confirm"
            className="h-8 px-3 rounded bg-amber-700 hover:bg-amber-600 text-xs font-semibold text-white">Use</button>
        </div>
      </div>
    </div>
  );
}
