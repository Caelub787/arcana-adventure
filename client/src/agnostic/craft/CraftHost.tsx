// The crafting tools' windows (always floating panels), and the Crafting
// station that opens them from a character's sheet. A tool is a live session:
// the crafter plays it; the GM and anyone the session is shared with watch.
import React, { useEffect, useRef, useSyncExternalStore, useState } from "react";
import { Hammer, FlaskConical, PenTool, Eye, Loader2, X, Wand2, Hand, Settings2, Lock, Check, Plus, Minus, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import type { AgNote } from "@shared/agnostic/types";
import { CRAFT_KIND_LABEL, CRAFT_KIND_OF_STATION, CRAFT_DEF_TYPE, stationRecipes, type CraftKind } from "@shared/agnostic/crafting";
import { useAg, useAgMaybe, follow } from "../hooks";
import { AgPanel, agConfirm } from "../float";
import { useToast } from "@/hooks/use-toast";
import { useCraftSession, valueOn, inventoryOf, type CraftState } from "./session";
import { ForgeTool } from "./Forge";
import { AlchemyTool } from "./Alchemy";
import { RuneTool } from "./Runes";
import { SKILL_KEY } from "./common";

// --------------------------------------------------------------------------- open windows
interface OpenCraft { sessionId: string; characterId: string; kind: CraftKind; /** Crafts in this system need a station item (a forge, a pot, a pen). */ stations?: boolean; /** Opened by pressing Craft: this viewer takes the controls. */ claim?: boolean }
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

/**
 * The live tool of a crafting session. Before anyone is crafting, whoever may craft as the character plans on their own
 * screen (recipe, materials…); the first real step — forging a part, starting a brew or a tracing, a Quick Craft —
 * puts them at the controls, and from then on everyone watches them live. A character can have several players:
 * that first step is what decides. Only the GM can take over, and give it back after.
 */
export function CraftBody({ sessionId, characterId, kind, stations, station: atStation, ensureSession, head, tail }: Omit<OpenCraft, "sessionId"> & {
  sessionId: string | null; /** The station item this is open on (its sheet). */ station?: string;
  /** Make the session when crafting starts (there's none until then). */ ensureSession?: () => Promise<string>;
  head?: React.ReactNode; tail?: React.ReactNode;
}) {
  const { state, viewer } = useAg();
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const session = useCraftSession(sessionId);
  const character = state.notes.get(characterId);
  const mayPlay = !!character && (character.ownerIds.includes(viewer.userId) || viewer.isGM) && (!sessionId || !session.ready || !session.readOnly);
  const driver = typeof session.state.driver === "string" ? session.state.driver as string : "";
  // Whoever is at the controls sends a heartbeat; when it stops (they closed the page), nobody is.
  const beat = useRef({ key: "", at: Date.now() });
  const beatKey = `${driver}|${session.state.beat ?? ""}`;
  if (beat.current.key !== beatKey) beat.current = { key: beatKey, at: Date.now() };
  const [, tick] = useState(0);
  const present = !!driver && (driver === viewer.userId || Date.now() - beat.current.at < 12000);
  const playing = mayPlay && !!sessionId && session.ready && driver === viewer.userId;
  const planning = mayPlay && !playing && !present && (!sessionId || session.ready);
  const myName = String(user?.username || user?.name || (viewer.isGM ? "The GM" : "Someone"));
  // Planning is this viewer's own until they start.
  const [local, setLocal] = useState<CraftState>({});
  const toolState: CraftState = planning ? { ...session.state, stage: "plan", ...local } : session.state;
  const toolSet = playing ? session.set : planning ? (p: CraftState) => setLocal((l) => ({ ...l, ...p })) : () => {};
  const pending = useRef<CraftState | null>(null);
  const flush = () => {
    const p = pending.current;
    if (!p || !session.ready) return;
    pending.current = null;
    const d = session.map?.get("driver"), b = Number(session.map?.get("beat") ?? 0);
    if (d && d !== viewer.userId && Date.now() - b < 12000) { toast({ title: "Someone else just started crafting here", description: "You're watching them now." }); return; }
    session.set({ ...p, driver: viewer.userId, driverName: myName, beat: Date.now(), returnTo: undefined });
    setLocal({});
  };
  const start = (p: CraftState) => {
    if (playing) { session.set(p); return; }
    if (!planning) return;
    pending.current = { ...local, ...p };
    if (sessionId && session.ready) flush();
    else if (ensureSession) ensureSession().catch((e: any) => { pending.current = null; toast({ title: "Couldn't start crafting", description: e.message, variant: "destructive" }); });
  };
  useEffect(() => { if (session.ready && pending.current) flush(); }, [session.ready, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The GM taking over remembers whose turn it was, to hand it back.
  const takeOver = () => session.set({ driver: viewer.userId, driverName: myName, beat: Date.now(), returnTo: present && driver !== viewer.userId ? { id: driver, name: String(session.state.driverName ?? "them") } : undefined });
  const returnTo = session.state.returnTo && typeof session.state.returnTo.id === "string" ? session.state.returnTo as { id: string; name: string } : null;
  const giveBack = () => returnTo && session.set({ driver: returnTo.id, driverName: returnTo.name, beat: Date.now(), returnTo: undefined });
  // Stepping away: whatever was made stays in the inventory (a part waits for its blueprint); unsaved work stops.
  const stepAway = () => { session.set({ driver: undefined, driverName: undefined, returnTo: undefined, stage: "plan" }); setLocal({}); };
  const playingRef = useRef(playing); playingRef.current = playing;
  useEffect(() => {
    if (!session.ready) return;
    const t = setInterval(() => { if (playingRef.current) session.set({ beat: Date.now() }); tick((x) => x + 1); }, 4000);
    return () => clearInterval(t);
  }, [session.ready, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving hands the controls back.
  const map = useRef(session.map); map.current = session.map;
  useEffect(() => () => { const m = map.current; if (m && m.get("driver") === viewer.userId) { m.doc?.transact(() => { m.delete("driver"); m.set("stage", "plan"); }); } }, [viewer.userId]);
  // The station they carry for this craft (live: it appears the moment the GM gives one).
  const station = atStation ? state.notes.get(atStation) : inventoryOf(state, characterId).find((n) => valueOn(state, n.id, "station_for") === CRAFT_KIND_LABEL[kind]);
  const missingStation = !!stations && mayPlay && !station;
  const chip = "inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-stone-700 bg-stone-900 text-[11px] text-stone-300 max-w-full";
  const btn = "h-7 px-2.5 rounded-md border border-stone-600 bg-stone-800 hover:bg-stone-700 text-[11px] text-stone-100 inline-flex items-center gap-1.5";
  const status = playing ? <>
    <span className={chip} data-testid="craft-playing"><Hand className="h-3.5 w-3.5 text-amber-400" />You're crafting</span>
    {viewer.isGM && returnTo && <button type="button" onClick={giveBack} className={btn} data-testid="craft-give-back"><Undo2 className="h-3.5 w-3.5" /> Give back to {returnTo.name}</button>}
    <button type="button" onClick={stepAway} className="h-7 px-2 rounded-md text-[11px] text-stone-400 hover:text-stone-100" data-testid="craft-step-away">Step away</button>
  </> : present ? <>
    <span className={chip} data-testid="craft-watching"><Eye className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{returnTo?.id === viewer.userId ? "The GM has taken over — watching" : `${String(session.state.driverName ?? "Someone")} is crafting — watching`}</span></span>
    {viewer.isGM && <button type="button" onClick={takeOver} className={btn} data-testid="craft-take-over"><Hand className="h-3.5 w-3.5" /> Take over</button>}
  </> : null;
  const showTool = !missingStation && (planning || (sessionId && session.ready && session.note));
  return (
    // Drawing and hammering on the tools' canvases mustn't start dragging the sheet block they sit in.
    <div className="space-y-2" data-testid={`craft-body-${kind}`} onPointerDownCapture={(e) => { if ((e.target as HTMLElement).tagName === "CANVAS") e.preventDefault(); }} onDragStartCapture={(e) => { if ((e.target as HTMLElement).tagName === "CANVAS") e.preventDefault(); }}>
      {(head || status || tail || (station && !atStation)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {head}
          {station && !atStation && <StationChip note={station} kind={kind} />}
          <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-1.5">{status}{tail}</span>
        </div>
      )}
      {sessionId && session.ready && !session.note ? <div className="text-sm text-stone-400 p-4">This crafting session has ended.</div>
        : missingStation ? <NeedStation kind={kind} />
        : !showTool ? (sessionId ? <div className="text-xs text-stone-400 inline-flex items-center gap-2 p-4"><Loader2 className="h-4 w-4 animate-spin" /> Getting ready…</div> : <div className="text-xs text-stone-500 p-3">Nobody is crafting here right now.</div>)
        : kind === "forge" ? <ForgeTool characterId={characterId} state={toolState} set={toolSet} start={start} playing={playing || planning} stationId={station?.id} />
        : kind === "alchemy" ? <AlchemyTool characterId={characterId} state={toolState} set={toolSet} start={start} playing={playing || planning} stationId={station?.id} />
        : <RuneTool characterId={characterId} state={toolState} set={toolSet} start={start} playing={playing || planning} stationId={station?.id} />}
    </div>
  );
}

// --------------------------------------------------------------------------- the bench (on a station item's sheet)
export const KIND_OF_STATION = CRAFT_KIND_OF_STATION;
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

/**
 * A station's craft, open right on its sheet: the forge's sheet is the forge. Any item can be one (the GM sets
 * which craft, its Quick Craft bonus and which recipes can be made at it). Its holder crafts with it.
 */
export function CraftBench({ noteId }: { noteId: string }) {
  const { state, request, viewer } = useAg();
  const note = state.notes.get(noteId);
  const kind = CRAFT_KIND_OF_STATION[String(valueOn(state, noteId, "station_for") ?? "")];
  const holder = holderOf(state, noteId);
  const live = holder && kind ? follow(state, holder.id, "crafting").map((id) => state.notes.get(id))
    .find((n): n is AgNote => !!n && n.type === "craft" && valueOn(state, n.id, "craft_kind") === kind && !Number(valueOn(state, n.id, "craft_done") ?? 0) && String(valueOn(state, n.id, "station_id") ?? "") === noteId) : undefined;
  const [made, setMade] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  if (!note) return null;
  if (!kind) return viewer.isGM ? <StationSetup noteId={noteId} /> : null;
  const Icon = CRAFT_ICON[kind];
  const sessionId = live?.id ?? (made && state.notes.has(made) ? made : null);
  // The session (shared, live) only exists once someone starts crafting.
  const ensureSession = async () => {
    const r = await request<{ noteId: string }>({ op: "craft.session", characterId: holder!.id, kind, stationId: noteId });
    setMade(r.noteId);
    return r.noteId;
  };
  const skill = holder ? Number(valueOn(state, holder.id, SKILL_KEY[kind]) ?? 0) || 0 : 0;
  const bonus = Number(valueOn(state, noteId, "station_bonus") ?? 0) || 0;
  const head = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <Icon className="h-4 w-4 text-amber-400 shrink-0" />
      <span className="text-[10px] uppercase tracking-wide text-amber-400/80">{CRAFT_KIND_LABEL[kind]}</span>
      {holder && <span className="text-[11px] text-stone-300 truncate">{holder.name} <span className="font-mono text-stone-400">{skill >= 0 ? "+" : "−"}{Math.abs(skill + bonus)}</span></span>}
    </span>
  );
  const gear = viewer.isGM && (
    <button type="button" onClick={() => setSetup((v) => !v)} title="Station setup (GM)" className={`h-7 w-7 rounded-md border grid place-items-center ${setup ? "border-amber-600 text-amber-200" : "border-stone-700 text-stone-400 hover:border-stone-500"}`} data-testid="craft-bench-setup"><Settings2 className="h-3.5 w-3.5" /></button>
  );
  return (
    <div className="space-y-2" data-testid={`craft-bench-${kind}`}>
      {setup && viewer.isGM && <StationSetup noteId={noteId} />}
      {note.isTemplate || !holder ? (
        <>
          <div className="flex items-center gap-1.5">{head}<span className="ml-auto">{gear}</span></div>
          {note.isTemplate ? <div className="text-xs text-stone-500 p-2 rounded-md border border-dashed border-stone-700">Stations made from this template open their craft here.</div>
            : <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-3 text-xs text-stone-400 flex items-center gap-2" data-testid="craft-bench-unheld"><Icon className="h-4 w-4 text-amber-400/80" /> Give this to a character to craft with it — their {CRAFT_KIND_LABEL[kind]} opens here.</div>}
        </>
      ) : <CraftBody sessionId={sessionId} characterId={holder.id} kind={kind} station={noteId} ensureSession={ensureSession} head={head} tail={gear} />}
    </div>
  );
}

/** The GM's setup of a station: which craft it's for, its Quick Craft bonus, and which recipes can be made at it. */
function StationSetup({ noteId }: { noteId: string }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const kind = CRAFT_KIND_OF_STATION[String(valueOn(state, noteId, "station_for") ?? "")];
  const fieldOf = (key: string) => Array.from(state.fields.values()).find((f) => f.noteId === noteId && f.key === key);
  const save = async (key: string, label: string, type: "select" | "number" | "text", value: string | number, options: Record<string, unknown> = {}) => {
    try {
      const f = fieldOf(key);
      if (f) await request({ op: "field.set", id: f.id, value });
      else await request({ op: "field.create", noteId, label, key, type, value, options: options as any });
    } catch (e: any) { toast({ title: "Couldn't save it", description: e.message, variant: "destructive" }); }
  };
  const setKind = async (k: CraftKind) => {
    await save("station_for", "Station for", "select", CRAFT_KIND_LABEL[k], { choices: Object.values(CRAFT_KIND_LABEL), choiceColors: { Blacksmithing: "#f97316", Alchemy: "#34d399", "Rune Making": "#a78bfa" } });
    if (!fieldOf("station_bonus")) await save("station_bonus", "Quick Craft bonus", "number", 0, { tooltip: "Added to Quick Craft rolls made at it." });
  };
  const limits = stationRecipes(valueOn(state, noteId, "station_recipes"));
  const defs = kind ? Array.from(state.notes.values()).filter((n) => !n.isTemplate && n.type === CRAFT_DEF_TYPE[kind]).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const setLimits = (ids: string[] | null) => save("station_recipes", "Recipes made here", "text", ids ? JSON.stringify(ids) : "", { tooltip: "Which recipes can be made at this station (empty: all of its craft)." });
  const bonus = Number(valueOn(state, noteId, "station_bonus") ?? 0) || 0;
  const opt = (on: boolean) => `h-7 px-2.5 rounded-md border text-[11px] inline-flex items-center gap-1.5 ${on ? "border-amber-500 bg-amber-500/10 text-amber-100" : "border-stone-700 bg-stone-900 text-stone-300 hover:border-stone-500"}`;
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2.5 space-y-2.5" data-testid="craft-station-setup">
      <div className="text-[10px] uppercase tracking-wide text-amber-400/80">{kind ? "Station setup" : "Make this a crafting station"} <span className="normal-case tracking-normal text-stone-500">— GM only</span></div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-stone-400 w-24">Craft</span>
        {(["forge", "alchemy", "rune"] as CraftKind[]).map((k) => { const I = CRAFT_ICON[k]; return <button key={k} type="button" onClick={() => setKind(k)} className={opt(kind === k)} data-testid={`station-kind-${k}`}><I className="h-3.5 w-3.5" />{CRAFT_KIND_LABEL[k]}</button>; })}
      </div>
      {kind && <>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-stone-400 w-24">Quick Craft bonus</span>
          <button type="button" onClick={() => save("station_bonus", "Quick Craft bonus", "number", bonus - 1)} className="h-7 w-7 rounded-md border border-stone-700 bg-stone-900 text-stone-300 grid place-items-center"><Minus className="h-3 w-3" /></button>
          <span className="w-8 text-center font-mono text-xs text-stone-100" data-testid="station-bonus">{bonus >= 0 ? "+" : ""}{bonus}</span>
          <button type="button" onClick={() => save("station_bonus", "Quick Craft bonus", "number", bonus + 1)} className="h-7 w-7 rounded-md border border-stone-700 bg-stone-900 text-stone-300 grid place-items-center"><Plus className="h-3 w-3" /></button>
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-stone-400 w-24">Recipes here</span>
            <button type="button" onClick={() => setLimits(null)} className={opt(!limits)} data-testid="station-recipes-all">Every {CRAFT_KIND_LABEL[kind]} recipe</button>
            <button type="button" onClick={() => setLimits(limits ?? [])} className={opt(!!limits)} data-testid="station-recipes-some">Only these</button>
          </div>
          {limits && (
            <div className="flex flex-wrap gap-1 pl-[6.4rem]">
              {defs.map((d) => { const on = limits.includes(d.id); return (
                <button key={d.id} type="button" onClick={() => setLimits(on ? limits.filter((x) => x !== d.id) : [...limits, d.id])} className={opt(on)} data-testid={`station-recipe-${d.name}`}>
                  {on ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{d.name}
                </button>
              ); })}
              {!defs.length && <span className="text-[11px] text-stone-500">No {CRAFT_KIND_LABEL[kind]} recipes yet.</span>}
            </div>
          )}
          <div className="text-[10px] text-stone-500 pl-[6.4rem]">Knowing a recipe (its scroll) isn't enough — it also has to be made at a station that allows it.</div>
        </div>
      </>}
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
      openCraft({ sessionId, characterId: noteId, kind, stations, claim: true });
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
