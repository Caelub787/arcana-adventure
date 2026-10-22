// The crafting tools' windows (always floating panels), and the Crafting
// station that opens them from a character's sheet. A tool is a live session:
// the crafter plays it; the GM and anyone the session is shared with watch.
import React, { useEffect, useRef, useSyncExternalStore, useState } from "react";
import { Hammer, FlaskConical, PenTool, Eye, Loader2, X, Wand2, Hand } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import type { AgNote } from "@shared/agnostic/types";
import { CRAFT_KIND_LABEL, type CraftKind } from "@shared/agnostic/crafting";
import { useAg, useAgMaybe, follow } from "../hooks";
import { AgPanel, agConfirm } from "../float";
import { useToast } from "@/hooks/use-toast";
import { useCraftSession, valueOn, inventoryOf } from "./session";
import { ForgeTool } from "./Forge";
import { AlchemyTool } from "./Alchemy";
import { RuneTool } from "./Runes";
import { SKILL_KEY } from "./common";

// --------------------------------------------------------------------------- open windows
interface OpenCraft { sessionId: string; characterId: string; kind: CraftKind; /** Crafts in this system need a station item (a forge, a pot, a pen). */ stations?: boolean }
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

function CraftWindow({ sessionId, characterId, kind, stations }: OpenCraft) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const session = useCraftSession(sessionId);
  const character = state.notes.get(characterId);
  const Icon = CRAFT_ICON[kind];
  const end = () => agConfirm("Work in progress here is lost (what you've already made stays in the inventory).", { title: "End this crafting session?", confirm: "End it" })
    .then((ok) => { if (ok) request({ op: "craft.close", sessionId }).then(() => closeCraft(sessionId)).catch((e: any) => { toast({ title: "Couldn't end it", description: e.message, variant: "destructive" }); }); });
  return (
    <AgPanel title={<span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" style={{ color: CRAFT_ACCENT[kind] }} />{CRAFT_KIND_LABEL[kind]} — {character?.name ?? "…"}</span>}
      onClose={() => closeCraft(sessionId)} width={860} height={820} panelKey={`ag-craft-${sessionId}`} testId={`craft-window-${kind}`}
      footer={!session.readOnly ? <button type="button" onClick={end} className="h-8 px-3 rounded text-xs text-stone-400 hover:text-red-300">End session</button> : undefined}>
      <CraftBody sessionId={sessionId} characterId={characterId} kind={kind} stations={stations} />
    </AgPanel>
  );
}

/** The live tool of a crafting session. One person is at the controls (the crafter, or the GM); anyone else who may
 *  craft as that character can take over, and everyone else watches — every move shows for all of them as it happens. */
export function CraftBody({ sessionId, characterId, kind, stations, station: atStation }: OpenCraft & { /** The station item this is open on (its sheet). */ station?: string }) {
  const { state, viewer } = useAg();
  const { user } = useAuth() as any;
  const session = useCraftSession(sessionId);
  const character = state.notes.get(characterId);
  const mayPlay = !!character && !session.readOnly && (character.ownerIds.includes(viewer.userId) || viewer.isGM);
  const driver = typeof session.state.driver === "string" ? session.state.driver as string : "";
  const playing = mayPlay && driver === viewer.userId;
  const take = () => session.set({ driver: viewer.userId, driverName: String(user?.username || user?.name || (viewer.isGM ? "The GM" : "Someone")) });
  // Nobody at the controls: whoever may play takes them. Leaving hands them back.
  // (Read from the document itself: the snapshot can lag a render behind it.)
  useEffect(() => { if (mayPlay && session.ready && !driver && !session.map?.get("driver")) take(); }, [mayPlay, session.ready, driver]); // eslint-disable-line react-hooks/exhaustive-deps
  // Whoever is at the controls sends a heartbeat; if it stops (they closed the page without leaving), someone else takes over.
  const lastBeat = useRef(Date.now());
  useEffect(() => { lastBeat.current = Date.now(); }, [session.state.beat, driver]);
  const live = useRef({ mayPlay, driver, playing, take }); live.current = { mayPlay, driver, playing, take };
  useEffect(() => {
    if (!session.ready) return;
    const t = setInterval(() => {
      const L = live.current;
      if (L.playing) session.set({ beat: Date.now() });
      else if (L.mayPlay && L.driver && Date.now() - lastBeat.current > 12000) L.take();
    }, 4000);
    return () => clearInterval(t);
  }, [session.ready, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const map = useRef(session.map); map.current = session.map;
  useEffect(() => () => { const m = map.current; if (m && m.get("driver") === viewer.userId) m.delete("driver"); }, [viewer.userId]);
  // The station they carry for this craft (live: it appears the moment the GM gives one).
  const station = atStation ? state.notes.get(atStation) : inventoryOf(state, characterId).find((n) => valueOn(state, n.id, "station_for") === CRAFT_KIND_LABEL[kind]);
  const missingStation = !!stations && mayPlay && !station;
  return (
    // Drawing and hammering on the tools' canvases mustn't start dragging the sheet block they sit in.
    <div className="space-y-2" data-testid={`craft-body-${kind}`} onPointerDownCapture={(e) => { if ((e.target as HTMLElement).tagName === "CANVAS") e.preventDefault(); }} onDragStartCapture={(e) => { if ((e.target as HTMLElement).tagName === "CANVAS") e.preventDefault(); }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {station && !atStation && <StationChip note={station} kind={kind} />}
        {session.ready && !playing && (
          <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-stone-700 bg-stone-900 text-[11px] text-stone-300" data-testid="craft-watching">
            <Eye className="h-3.5 w-3.5" />{driver ? `${String(session.state.driverName ?? "Someone")} is crafting — you're watching` : "Watching"}
          </span>
        )}
        {session.ready && mayPlay && !playing && driver && (
          <button type="button" onClick={take} className="h-7 px-2.5 rounded-md border border-stone-600 bg-stone-800 hover:bg-stone-700 text-[11px] text-stone-100 inline-flex items-center gap-1.5" data-testid="craft-take-over">
            <Hand className="h-3.5 w-3.5" /> Take over
          </button>
        )}
      </div>
      {!session.note ? <div className="text-sm text-stone-400 p-4">This crafting session has ended.</div>
        : missingStation ? <NeedStation kind={kind} />
        : !session.ready ? <div className="text-xs text-stone-400 inline-flex items-center gap-2 p-4"><Loader2 className="h-4 w-4 animate-spin" /> Getting ready…</div>
        : kind === "forge" ? <ForgeTool characterId={characterId} state={session.state} set={session.set} playing={playing} />
        : kind === "alchemy" ? <AlchemyTool characterId={characterId} state={session.state} set={session.set} playing={playing} />
        : <RuneTool characterId={characterId} state={session.state} set={session.set} playing={playing} />}
    </div>
  );
}

// --------------------------------------------------------------------------- the bench (on a station item's sheet)
export const KIND_OF_STATION: Record<string, CraftKind> = { Blacksmithing: "forge", Alchemy: "alchemy", "Rune Making": "rune" };
/** Who holds an item: the sheet it's connected to (a character, not another item). */
export function holderOf(state: ReturnType<typeof useAg>["state"], itemId: string): AgNote | undefined {
  const out: AgNote[] = [];
  for (const l of Array.from(state.links.values())) {
    if (l.fromNoteId !== itemId) continue;
    const n = state.notes.get(l.toNoteId);
    if (n && !n.isTemplate && n.type !== "item" && n.type !== "craft") out.push(n);
  }
  return out.find((n) => n.type === "character") ?? out[0];
}

/** A station's craft, open right on its sheet: the forge's sheet is the forge. Its holder crafts with it. */
export function CraftBench({ noteId }: { noteId: string }) {
  const { state, request, viewer } = useAg();
  const { toast } = useToast();
  const note = state.notes.get(noteId);
  const kind = KIND_OF_STATION[String(valueOn(state, noteId, "station_for") ?? "")];
  const holder = holderOf(state, noteId);
  const mayPlay = !!holder && (holder.ownerIds.includes(viewer.userId) || viewer.isGM);
  const live = holder && kind ? follow(state, holder.id, "crafting").map((id) => state.notes.get(id))
    .find((n): n is AgNote => !!n && n.type === "craft" && valueOn(state, n.id, "craft_kind") === kind && !Number(valueOn(state, n.id, "craft_done") ?? 0)) : undefined;
  const [made, setMade] = useState<string | null>(null);
  const asked = useRef("");
  // Open (or pick up) the holder's session for this craft as soon as someone who may craft looks at it.
  useEffect(() => {
    if (!holder || !kind || !mayPlay || live || asked.current === `${holder.id}:${kind}`) return;
    asked.current = `${holder.id}:${kind}`;
    request<{ noteId: string }>({ op: "craft.session", characterId: holder.id, kind }).then((r) => setMade(r.noteId))
      .catch((e: any) => { asked.current = ""; toast({ title: "Couldn't set up the station", description: e.message, variant: "destructive" }); });
  }, [holder?.id, kind, mayPlay, live?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!note) return null;
  if (note.isTemplate) return <div className="text-xs text-stone-500 p-2 rounded-md border border-dashed border-stone-700">Crafting — a station made from this template opens its craft here.</div>;
  if (!kind) return <div className="text-xs text-stone-400 p-2 rounded-md border border-dashed border-stone-700" data-testid="craft-bench-unset">Set what this station is for (Blacksmithing, Alchemy or Rune Making) to craft with it.</div>;
  const Icon = CRAFT_ICON[kind];
  if (!holder) return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-3 text-xs text-stone-400 flex items-center gap-2" data-testid="craft-bench-unheld">
      <Icon className="h-4 w-4 text-amber-400/80" /> Give this to a character to craft with it — their {CRAFT_KIND_LABEL[kind]} opens here.
    </div>
  );
  const sessionId = live?.id ?? (made && state.notes.has(made) ? made : null);
  const skill = Number(valueOn(state, holder.id, SKILL_KEY[kind]) ?? 0) || 0;
  const bonus = Number(valueOn(state, noteId, "station_bonus") ?? 0) || 0;
  const reset = () => sessionId && agConfirm("Work in progress here is lost (what's already been made stays in the inventory).", { title: "Start over?", confirm: "Start over" })
    .then((ok) => { if (ok) request({ op: "craft.close", sessionId }).then(() => { asked.current = ""; setMade(null); }).catch((e: any) => { toast({ title: "Couldn't do that", description: e.message, variant: "destructive" }); }); });
  return (
    <div className="space-y-2" data-testid={`craft-bench-${kind}`}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-700 bg-stone-900/60 px-2.5 py-1.5">
        <Icon className="h-4 w-4 text-amber-400" />
        <span className="text-[10px] uppercase tracking-wide text-amber-400/80">{CRAFT_KIND_LABEL[kind]}</span>
        <span className="text-xs text-stone-200">{holder.name}</span>
        <span className="text-[11px] text-stone-400">skill <span className="font-mono text-stone-200">{skill >= 0 ? "+" : "−"}{Math.abs(skill)}</span>{bonus ? <> · station <span className="font-mono text-stone-200">{bonus > 0 ? "+" : "−"}{Math.abs(bonus)}</span></> : null}</span>
        {mayPlay && sessionId && <button type="button" onClick={reset} className="ml-auto h-7 px-2 rounded-md text-[11px] text-stone-400 hover:text-red-300" data-testid="craft-bench-reset">Start over</button>}
      </div>
      {sessionId ? <CraftBody sessionId={sessionId} characterId={holder.id} kind={kind} station={noteId} />
        : mayPlay ? <div className="text-xs text-stone-400 inline-flex items-center gap-2 p-3"><Loader2 className="h-4 w-4 animate-spin" /> Getting ready…</div>
        : <div className="text-xs text-stone-500 p-3">Nobody is crafting here right now.</div>}
    </div>
  );
}

const STATION_WORD: Record<CraftKind, string> = { forge: "a forge", alchemy: "an alchemist's pot", rune: "a rune pen" };
function StationChip({ note, kind }: { note: AgNote; kind: CraftKind }) {
  const { state } = useAg();
  const Icon = CRAFT_ICON[kind];
  const bonus = Number(valueOn(state, note.id, "station_bonus") ?? 0) || 0;
  return (
    <div className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-stone-700 bg-stone-900 text-[11px] text-stone-200" data-testid={`craft-station-${kind}`}>
      <Icon className="h-3.5 w-3.5 text-amber-400" /> Using {note.name}{bonus ? <span className="font-mono text-stone-300">{bonus > 0 ? "+" : ""}{bonus} to Quick Craft</span> : null}
    </div>
  );
}
function NeedStation({ kind }: { kind: CraftKind }) {
  const Icon = CRAFT_ICON[kind];
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-6 text-center space-y-2" data-testid={`craft-need-station-${kind}`}>
      <Icon className="h-10 w-10 mx-auto text-amber-400" />
      <div className="text-base font-bold text-stone-100">You need {STATION_WORD[kind]}</div>
      <div className="text-xs text-stone-300 max-w-sm mx-auto">{CRAFT_KIND_LABEL[kind]} needs {STATION_WORD[kind]} in your inventory. Once you have one (the GM can give you one), this opens straight away.</div>
    </div>
  );
}

// --------------------------------------------------------------------------- the station (a sheet block)

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
      const { noteId: sessionId, stations } = await request<{ noteId: string; stations?: boolean }>({ op: "craft.session", characterId: noteId, kind });
      openCraft({ sessionId, characterId: noteId, kind, stations });
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
            <div key={kind} className="rounded-lg border border-stone-700 bg-stone-900/60 p-3 min-h-[96px] flex flex-col" data-testid={`craft-card-${kind}`}>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-amber-400" />
                <div className="min-w-0"><div className="text-sm font-bold text-stone-100">{CRAFT_KIND_LABEL[kind]}</div><div className="text-[11px] text-stone-400">Skill <span className="font-mono text-stone-200">{skill >= 0 ? "+" : ""}{skill}</span>{live ? <span className="ml-1.5 text-emerald-300">● in progress</span> : null}</div></div>
              </div>
              <div className="mt-auto pt-2 flex gap-1.5">
                {mine && <button type="button" disabled={!!busy} onClick={() => start(kind)} className="h-8 flex-1 rounded-md bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50" data-testid={`craft-open-${kind}`}>
                  {busy === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{live && note.ownerIds.includes(viewer.userId) ? "Continue" : "Craft"}</button>}
                {live && !(note.ownerIds.includes(viewer.userId)) && <button type="button" onClick={() => openCraft({ sessionId: live.id, characterId: noteId, kind })} className="h-8 px-2.5 rounded-md border border-stone-700 bg-stone-900 text-xs text-stone-200 inline-flex items-center gap-1" data-testid={`craft-watch-${kind}`}><Eye className="h-3.5 w-3.5" /> Watch</button>}
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
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2.5 space-y-2" data-testid={`craft-experiment-${experimentId}`}>
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-semibold text-stone-100 flex-1 min-w-0 truncate">{character?.name ?? "Someone"} experimented{compact ? "" : " with a new brew"}</span>
        <span className={`text-[10px] px-1.5 rounded-full border ${waiting ? "border-amber-500 text-amber-300" : "border-stone-600 text-stone-400"}`}>{waiting ? "waiting" : status.toLowerCase()}</span>
        <button type="button" onClick={() => openNote(exp.id)} className="text-[11px] text-stone-300 hover:text-white underline">Open</button>
      </div>
      {!compact && <pre className="text-[11px] text-stone-300 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">{String(valueOn(state, exp.id, "tried") ?? "")}</pre>}
      {viewer.isGM && waiting && (
        <div className="flex gap-1.5">
          <button type="button" disabled={busy} onClick={() => setPicking(true)} className="h-8 flex-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium" data-testid="craft-experiment-pick">Pick what it makes</button>
          <button type="button" disabled={busy} onClick={() => resolve(null)} className="h-8 px-3 rounded-md border border-stone-700 bg-stone-900 text-xs text-stone-200 hover:border-red-400" data-testid="craft-experiment-none">No Item</button>
        </div>
      )}
      {!waiting && <div className="text-[11px] text-stone-400">Result: {String(valueOn(state, exp.id, "result") ?? "")}</div>}
      {picking && (
        <AgPanel title="What did the experiment make?" onClose={() => setPicking(false)} width={420} height={560} testId="craft-experiment-picker">
          <div className="space-y-1">
            {items.map((n) => (
              <button key={n.id} type="button" disabled={busy} onClick={() => resolve(n.id)} className="w-full flex items-center gap-2 p-2 rounded-md bg-stone-900 border border-stone-700 hover:border-amber-600 text-left" data-testid={`craft-experiment-item-${n.name}`}>
                {n.portrait ? <img src={n.portrait} alt="" className="h-8 w-8 rounded object-cover" /> : <FlaskConical className="h-8 w-8 p-1.5 text-amber-400" />}
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
