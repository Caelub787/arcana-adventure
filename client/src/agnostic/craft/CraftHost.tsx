// The crafting tools' windows (always floating panels), and the Crafting
// station that opens them from a character's sheet. A tool is a live session:
// the crafter plays it; the GM and anyone the session is shared with watch.
import React, { useSyncExternalStore, useState } from "react";
import { Hammer, FlaskConical, PenTool, Eye, Loader2, X, Wand2 } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { CRAFT_KIND_LABEL, type CraftKind } from "@shared/agnostic/crafting";
import { useAg, useAgMaybe, follow } from "../hooks";
import { AgPanel, agConfirm } from "../float";
import { useToast } from "@/hooks/use-toast";
import { useCraftSession, valueOn } from "./session";
import { ForgeTool } from "./Forge";
import { AlchemyTool } from "./Alchemy";
import { RuneTool } from "./Runes";
import { SKILL_KEY } from "./common";

// --------------------------------------------------------------------------- open windows
interface OpenCraft { sessionId: string; characterId: string; kind: CraftKind }
let open: OpenCraft[] = [];
const listeners = new Set<() => void>();
export function openCraft(c: OpenCraft) { open = [...open.filter((o) => o.sessionId !== c.sessionId), c]; listeners.forEach((l) => l()); }
function closeCraft(id: string) { open = open.filter((o) => o.sessionId !== id); listeners.forEach((l) => l()); }
const useOpen = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);

export const CRAFT_ICON: Record<CraftKind, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = { forge: Hammer, alchemy: FlaskConical, rune: PenTool };
export const CRAFT_ACCENT: Record<CraftKind, string> = { forge: "#f97316", alchemy: "#34d399", rune: "#a78bfa" };

export function AgCraftHost() {
  const ag = useAgMaybe();
  const list = useOpen();
  if (!ag) return null;
  return <>{list.map((o) => <CraftWindow key={o.sessionId} {...o} />)}</>;
}

function CraftWindow({ sessionId, characterId, kind }: OpenCraft) {
  const { state, request, viewer } = useAg();
  const { toast } = useToast();
  const session = useCraftSession(sessionId);
  const character = state.notes.get(characterId);
  const Icon = CRAFT_ICON[kind];
  // The crafter plays: a player whose character it is (or the GM, for a character no player has).
  const crafterIsHere = !!character && (character.ownerIds.includes(viewer.userId) || (viewer.isGM && character.ownerIds.length === 0));
  const playing = crafterIsHere && !session.readOnly;
  const gone = !session.note;
  const end = () => agConfirm("Work in progress here is lost (what you've already made stays in the inventory).", { title: "End this crafting session?", confirm: "End it" })
    .then((ok) => { if (ok) request({ op: "craft.close", sessionId }).then(() => closeCraft(sessionId)).catch((e: any) => { toast({ title: "Couldn't end it", description: e.message, variant: "destructive" }); }); });
  return (
    <AgPanel title={<span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" style={{ color: CRAFT_ACCENT[kind] }} />{CRAFT_KIND_LABEL[kind]} — {character?.name ?? "…"}{!playing && <span className="text-[10px] px-1.5 rounded-full border border-stone-600 text-stone-300 inline-flex items-center gap-1"><Eye className="h-3 w-3" />watching</span>}</span>}
      onClose={() => closeCraft(sessionId)} width={860} height={820} panelKey={`ag-craft-${sessionId}`} testId={`craft-window-${kind}`}
      footer={playing ? <button type="button" onClick={end} className="h-8 px-3 rounded text-xs text-stone-400 hover:text-red-300">End session</button> : undefined}>
      <div className="relative -m-3 p-3 min-h-full" style={{ background: `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${CRAFT_ACCENT[kind]} 10%, transparent), transparent 60%)` }}>
        {gone ? <div className="text-sm text-stone-400 p-4">This crafting session has ended.</div>
          : !session.ready ? <div className="text-xs text-stone-400 inline-flex items-center gap-2 p-4"><Loader2 className="h-4 w-4 animate-spin" /> Lighting the fire…</div>
          : kind === "forge" ? <ForgeTool characterId={characterId} state={session.state} set={session.set} playing={playing} />
          : kind === "alchemy" ? <AlchemyTool characterId={characterId} state={session.state} set={session.set} playing={playing} />
          : <RuneTool characterId={characterId} state={session.state} set={session.set} playing={playing} />}
      </div>
    </AgPanel>
  );
}

// --------------------------------------------------------------------------- the station (a sheet block)
const ART: Record<CraftKind, string> = {
  forge: "radial-gradient(circle at 30% 120%, rgba(249,115,22,0.55), transparent 60%), linear-gradient(160deg,#1c1310,#0b0807)",
  alchemy: "radial-gradient(circle at 50% 110%, rgba(52,211,153,0.5), transparent 60%), linear-gradient(160deg,#0d1714,#060a09)",
  rune: "radial-gradient(circle at 70% -10%, rgba(167,139,250,0.5), transparent 60%), linear-gradient(160deg,#141022,#08070c)",
};

/** Crafting on a character: each craft with its skill, opening its tool; sessions in progress to watch. */
export function CraftStation({ noteId, kinds = ["forge", "alchemy", "rune"] }: { noteId: string; kinds?: CraftKind[] }) {
  const { state, request, viewer } = useAg();
  const { toast } = useToast();
  const [busy, setBusy] = useState<CraftKind | null>(null);
  const note = state.notes.get(noteId);
  if (!note) return null;
  if (note.isTemplate) return <div className="text-xs text-stone-500 p-2 rounded border border-dashed border-stone-700">Crafting — the characters made from this template craft here.</div>;
  const mine = note.ownerIds.includes(viewer.userId) || viewer.isGM;
  const sessions: AgNote[] = follow(state, noteId, "crafting").map((id) => state.notes.get(id)).filter((n): n is AgNote => !!n && n.type === "craft");
  const pending = viewer.isGM ? follow(state, noteId, "experiments").map((id) => state.notes.get(id)).filter((n): n is AgNote => !!n && valueOn(state, n.id, "status") === "Waiting for the GM") : [];
  const start = async (kind: CraftKind) => {
    setBusy(kind);
    try {
      const { noteId: sessionId } = await request<{ noteId: string }>({ op: "craft.session", characterId: noteId, kind });
      openCraft({ sessionId, characterId: noteId, kind });
    } catch (e: any) { toast({ title: "Couldn't open it", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };
  return (
    <div className="space-y-2" data-testid="craft-station">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {kinds.map((kind) => {
          const Icon = CRAFT_ICON[kind];
          const skill = Number(valueOn(state, noteId, SKILL_KEY[kind]) ?? 0) || 0;
          const live = sessions.find((x) => valueOn(state, x.id, "craft_kind") === kind);
          return (
            <div key={kind} className="relative overflow-hidden rounded-xl border p-3 min-h-[104px] flex flex-col" style={{ borderColor: `color-mix(in srgb, ${CRAFT_ACCENT[kind]} 45%, transparent)`, background: ART[kind] }} data-testid={`craft-card-${kind}`}>
              <div className="flex items-center gap-2">
                <Icon className="h-6 w-6" style={{ color: CRAFT_ACCENT[kind], filter: `drop-shadow(0 0 8px ${CRAFT_ACCENT[kind]})` }} />
                <div className="min-w-0"><div className="text-sm font-bold text-stone-100">{CRAFT_KIND_LABEL[kind]}</div><div className="text-[11px] text-stone-400">Skill <span className="font-mono text-stone-200">{skill >= 0 ? "+" : ""}{skill}</span>{live ? <span className="ml-1.5 text-emerald-300">● in progress</span> : null}</div></div>
              </div>
              <div className="mt-auto pt-2 flex gap-1.5">
                {mine && <button type="button" disabled={!!busy} onClick={() => start(kind)} className="h-8 flex-1 rounded-lg text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: `linear-gradient(180deg, ${CRAFT_ACCENT[kind]}, color-mix(in srgb, ${CRAFT_ACCENT[kind]} 45%, black))`, boxShadow: `0 0 14px color-mix(in srgb, ${CRAFT_ACCENT[kind]} 45%, transparent)` }} data-testid={`craft-open-${kind}`}>
                  {busy === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{live && note.ownerIds.includes(viewer.userId) ? "Continue" : "Craft"}</button>}
                {live && !(note.ownerIds.includes(viewer.userId)) && <button type="button" onClick={() => openCraft({ sessionId: live.id, characterId: noteId, kind })} className="h-8 px-2.5 rounded-lg border border-stone-600 bg-black/40 text-xs text-stone-200 inline-flex items-center gap-1" data-testid={`craft-watch-${kind}`}><Eye className="h-3.5 w-3.5" /> Watch</button>}
              </div>
            </div>
          );
        })}
      </div>
      {pending.length > 0 && (
        <div className="space-y-1">{pending.map((x) => <ExperimentControls key={x.id} experimentId={x.id} compact />)}</div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- experiments (GM)
/** The GM's choice on an experiment: pick what it made, or nothing. Also shown in chat. */
export function ExperimentControls({ experimentId, compact, text }: { experimentId: string; compact?: boolean; text?: string }) {
  const ag = useAgMaybe();
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ag) return text ? <span>{text}</span> : null;
  const { state, request, viewer, openNote } = ag;
  const exp = state.notes.get(experimentId);
  if (!exp) return <div className="text-xs text-stone-500 italic">{text ?? "That experiment is gone."}</div>;
  const status = String(valueOn(state, exp.id, "status") ?? "");
  const waiting = status === "Waiting for the GM";
  const character = state.notes.get(String(valueOn(state, exp.id, "crafter_id") ?? ""));
  const resolve = async (outputId: string | null) => {
    setBusy(true);
    try { await request({ op: "craft.resolveExperiment", experimentId, outputId }); setPicking(false); }
    catch (e: any) { toast({ title: "Couldn't do that", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const items = Array.from(state.notes.values()).filter((n) => n.type === "item" && !n.copyOf).sort((a, b) => Number(b.isTemplate) - Number(a.isTemplate) || a.name.localeCompare(b.name));
  return (
    <div className="rounded-xl border border-fuchsia-700/60 bg-[radial-gradient(circle_at_0%_0%,rgba(217,70,239,0.18),rgba(12,10,9,0.9)_60%)] p-2.5 space-y-2" data-testid={`craft-experiment-${experimentId}`}>
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-fuchsia-300" />
        <span className="text-xs font-bold text-fuchsia-100 flex-1 min-w-0 truncate">{character?.name ?? "Someone"} experimented{compact ? "" : " with a new brew"}</span>
        <span className={`text-[10px] px-1.5 rounded-full border ${waiting ? "border-amber-500 text-amber-300" : "border-stone-600 text-stone-400"}`}>{waiting ? "waiting" : status.toLowerCase()}</span>
        <button type="button" onClick={() => openNote(exp.id)} className="text-[11px] text-stone-300 hover:text-white underline">Open</button>
      </div>
      {!compact && <pre className="text-[11px] text-stone-300 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">{String(valueOn(state, exp.id, "tried") ?? "")}</pre>}
      {viewer.isGM && waiting && (
        <div className="flex gap-1.5">
          <button type="button" disabled={busy} onClick={() => setPicking(true)} className="h-8 flex-1 rounded-lg bg-gradient-to-b from-fuchsia-500 to-purple-800 text-white text-xs font-semibold" data-testid="craft-experiment-pick">Pick what it makes</button>
          <button type="button" disabled={busy} onClick={() => resolve(null)} className="h-8 px-3 rounded-lg border border-stone-600 text-xs text-stone-200 hover:border-red-400" data-testid="craft-experiment-none">No Item</button>
        </div>
      )}
      {!waiting && <div className="text-[11px] text-stone-400">Result: {String(valueOn(state, exp.id, "result") ?? "")}</div>}
      {picking && (
        <AgPanel title="What did the experiment make?" onClose={() => setPicking(false)} width={420} height={560} testId="craft-experiment-picker">
          <div className="space-y-1">
            {items.map((n) => (
              <button key={n.id} type="button" disabled={busy} onClick={() => resolve(n.id)} className="w-full flex items-center gap-2 p-2 rounded-lg bg-stone-800 border border-stone-700 hover:border-fuchsia-500 text-left" data-testid={`craft-experiment-item-${n.name}`}>
                {n.portrait ? <img src={n.portrait} alt="" className="h-8 w-8 rounded object-cover" /> : <FlaskConical className="h-8 w-8 p-1.5 text-fuchsia-300" />}
                <span className="text-sm text-stone-100 flex-1 truncate">{n.name}</span>{n.isTemplate && <span className="text-[10px] text-stone-400">template</span>}
              </button>
            ))}
          </div>
        </AgPanel>
      )}
    </div>
  );
}

/** A chat line from crafting: "[ag-experiment:<id>] …" becomes the GM's experiment card. */
export function parseCraftChat(text: string): { experimentId: string; rest: string } | null {
  const m = /^\[ag-experiment:([0-9a-f-]{36})\]\s*([\s\S]*)$/i.exec(text ?? "");
  return m ? { experimentId: m[1], rest: m[2] } : null;
}
export function CraftChatCard({ text }: { text: string }) {
  const p = parseCraftChat(text);
  if (!p) return null;
  return <ExperimentControls experimentId={p.experimentId} text={p.rest} />;
}
void X;
