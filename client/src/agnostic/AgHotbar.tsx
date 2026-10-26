// The hotbar in Agnostic systems: the same bar C.A. uses, holding sheets
// (press: open it), buttons / rolls (press: use it) and items off one
// character's inventory (press: use it — a forge, pot or pen opens its craft
// right there). The GM can also make a new function — a button with steps —
// straight from the picker.
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, ChevronDown, Dices, Trash2, FileText, SlidersHorizontal, Wand2, Pencil, Hammer, FlaskConical, PenTool, Package, User, Loader2 } from "lucide-react";
import { CRAFT_KIND_LABEL, CRAFT_KIND_OF_STATION, type CraftKind } from "@shared/agnostic/crafting";
import { agTypeLabel, type AgNote } from "@shared/agnostic/types";
import { useAg, useAgMaybe, resolveRef } from "./hooks";
import { AgPanel } from "./float";
import { Portrait, ResourceBar, useActionRunner } from "./widgets";
import { RollIcon } from "./rollIcons";
import { rollSummary, actionsOfNote, RollEditor } from "./rolls";
import { ActionEditorDialog } from "./ActionEditor";
import { useToast } from "@/hooks/use-toast";
import { inventoryOf, qtyOf, valueOn } from "./craft/session";

// The craft itself (forge, alchemy, runes) only loads once a station is used from the bar.
const CraftBench = lazy(() => import("./craft/CraftHost").then((m) => ({ default: m.CraftBench })));
const STATION_ICON: Record<CraftKind, React.ComponentType<{ className?: string }>> = { forge: Hammer, alchemy: FlaskConical, rune: PenTool };

export type AgHotbarRef = `note:${string}` | `action:${string}` | `item:${string}:${string}`;
const parse = (ref: string) => { const i = ref.indexOf(":"); return { kind: ref.slice(0, i), id: ref.slice(i + 1) }; };

/** A sheet's small bars (its token bars), for its hotbar tile. */
function MiniBars({ note }: { note: AgNote }) {
  const { state } = useAg();
  const bars = note.tokenBars ?? state.settings?.tokenBarsByType?.[note.type] ?? [];
  const rows = bars.slice(0, 2).map((b) => ({ b, f: resolveRef(state, note.id, b.value)[0], m: b.max ? resolveRef(state, note.id, b.max)[0] : undefined })).filter((x) => x.f);
  if (!rows.length) return null;
  return <div className="absolute bottom-0 inset-x-0 space-y-px">{rows.map(({ b, f, m }) => <ResourceBar key={b.id} field={f!} maxField={m} color={b.color} height={4} showNumbers={false} compact look={{ radius: 0, border: "transparent" }} />)}</div>;
}

/**
 * One hotbar slot holding a sheet or a button. Press: open / use it. Hold or
 * right-click: a small menu (roll options, open its sheet, remove).
 */
export function AgHotbarSlot(props: {
  agRef: string; className: string; onRemove: () => void; registerPress: (fn: (() => void) | null) => void; testId?: string;
}) {
  const ready = !!useAgMaybe();
  // Pressed before Agnostic was ready (first visit on this browser): held, then done once it is.
  const pending = React.useRef(false);
  const [waiting, setWaiting] = useState(false);
  const { registerPress } = props;
  const register = React.useCallback((fn: (() => void) | null) => {
    registerPress(fn);
    if (fn && pending.current) { pending.current = false; fn(); }
  }, [registerPress]);
  useEffect(() => {
    if (ready) return;
    registerPress(() => { pending.current = true; setWaiting(true); });
    return () => registerPress(null);
  }, [ready, registerPress]);
  if (!ready) {
    return (
      <button type="button" className={props.className} data-testid={props.testId} title="Loading…" onClick={() => { pending.current = true; setWaiting(true); }}>
        <Loader2 className={`h-4 w-4 text-amber-500/70 ${waiting ? "animate-spin" : ""}`} />
      </button>
    );
  }
  return <AgHotbarSlotInner {...props} registerPress={register} />;
}

function AgHotbarSlotInner({ agRef, className, onRemove, registerPress, testId }: {
  agRef: string; className: string; onRemove: () => void; registerPress: (fn: (() => void) | null) => void; testId?: string;
}) {
  const { kind, id } = parse(agRef);
  if (kind === "item") { const [characterId, itemId] = id.split(":"); return <ItemSlot characterId={characterId} itemId={itemId} className={className} onRemove={onRemove} registerPress={registerPress} testId={testId} />; }
  return kind === "action"
    ? <ActionSlot actionId={id} className={className} onRemove={onRemove} registerPress={registerPress} testId={testId} />
    : <NoteSlot noteId={id} className={className} onRemove={onRemove} registerPress={registerPress} testId={testId} />;
}

function useHold(onHold: () => void) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = React.useRef(false);
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  return {
    fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === "mouse" && e.button !== 0) return; fired.current = false; cancel(); timer.current = setTimeout(() => { fired.current = true; timer.current = null; onHold(); }, 550); },
      onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); cancel(); onHold(); },
    },
  };
}

function SlotMenu({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <AgPanel title={title} onClose={onClose} width={280} height={240} testId="ag-hotbar-menu"><div className="space-y-1.5">{children}</div></AgPanel>;
}
const menuBtn = "w-full h-9 px-3 rounded bg-stone-800 hover:bg-stone-700 text-sm text-stone-200 inline-flex items-center gap-2";

function NoteSlot({ noteId, className, onRemove, registerPress, testId }: { noteId: string; className: string; onRemove: () => void; registerPress: (fn: (() => void) | null) => void; testId?: string }) {
  const { state, openNote } = useAg();
  const note = state.notes.get(noteId);
  const [menu, setMenu] = useState(false);
  const press = () => { if (note) openNote(noteId); };
  useEffect(() => { registerPress(press); return () => registerPress(null); });
  const hold = useHold(() => setMenu(true));
  return (
    <>
      <button type="button" className={className} title={note?.name ?? "Sheet"} data-testid={testId}
        onClick={(e) => { if (hold.fired.current) { hold.fired.current = false; e.preventDefault(); return; } press(); }} {...hold.handlers}>
        {note ? (
          <div className="relative w-full h-full pointer-events-none">
            {note.portrait ? <img src={note.portrait} alt={note.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full grid place-items-center text-amber-400 font-semibold text-lg">{(note.name || "?").slice(0, 1).toUpperCase()}</div>}
            <MiniBars note={note} />
          </div>
        ) : <span className="text-[9px] text-stone-500">gone</span>}
      </button>
      {menu && (
        <SlotMenu title={note?.name ?? "Sheet"} onClose={() => setMenu(false)}>
          <button type="button" className={menuBtn} onClick={() => { setMenu(false); press(); }}><FileText className="h-4 w-4" /> Open</button>
          <button type="button" className={`${menuBtn} text-red-300`} onClick={() => { setMenu(false); onRemove(); }} data-testid="ag-hotbar-remove"><Trash2 className="h-4 w-4" /> Remove from hotbar</button>
        </SlotMenu>
      )}
    </>
  );
}

function ActionSlot({ actionId, className, onRemove, registerPress, testId }: { actionId: string; className: string; onRemove: () => void; registerPress: (fn: (() => void) | null) => void; testId?: string }) {
  const { state, openNote } = useAg();
  const runner = useActionRunner(actionId);
  const [menu, setMenu] = useState(false);
  const a = runner.action;
  const owner = a ? state.notes.get(a.noteId) : undefined;
  const press = () => { void runner.run(); };
  useEffect(() => { registerPress(press); return () => registerPress(null); });
  const hold = useHold(() => setMenu(true));
  const sum = a ? rollSummary(state, a) : { roll: null, cost: null };
  const title = a ? [`${a.name}${owner ? ` — ${owner.name}` : ""}`, sum.roll, sum.cost].filter(Boolean).join(" · ") : "Button";
  return (
    <>
      <button type="button" className={className} title={title} disabled={!!a && !runner.allowed} data-testid={testId}
        onClick={(e) => { if (hold.fired.current) { hold.fired.current = false; e.preventDefault(); return; } press(); }} {...hold.handlers}>
        {a ? (
          <div className="relative w-full h-full pointer-events-none" style={{ background: a.color ? `color-mix(in srgb, ${a.color} 35%, transparent)` : undefined }}>
            {owner?.portrait ? <img src={owner.portrait} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" /> : null}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              {a.options?.icon ? <RollIcon icon={a.options.icon} size={20} color="var(--ca-gilt-bright, #f5d58a)" /> : <Dices className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--ca-gilt-bright, #f5d58a)" }} />}
              <span className="hidden sm:block text-[8px] leading-none px-0.5 w-full text-center truncate text-stone-100">{runner.busy ? "…" : a.name}</span>
            </div>
          </div>
        ) : <span className="text-[9px] text-stone-500">gone</span>}
      </button>
      {runner.ui}
      {menu && (
        <SlotMenu title={a?.name ?? "Button"} onClose={() => setMenu(false)}>
          {a && runner.allowed && <button type="button" className={menuBtn} onClick={() => { setMenu(false); runner.askOptions(); }} data-testid="ag-hotbar-options"><SlidersHorizontal className="h-4 w-4" /> Roll with advantage / modifier…</button>}
          {owner && <button type="button" className={menuBtn} onClick={() => { setMenu(false); openNote(owner.id); }}><FileText className="h-4 w-4" /> Open {owner.name}</button>}
          <button type="button" className={`${menuBtn} text-red-300`} onClick={() => { setMenu(false); onRemove(); }} data-testid="ag-hotbar-remove"><Trash2 className="h-4 w-4" /> Remove from hotbar</button>
        </SlotMenu>
      )}
    </>
  );
}

/** A crafting station's kind (forge, alchemy, runes), if the item is one. */
const stationKind = (state: ReturnType<typeof useAg>["state"], itemId: string): CraftKind | undefined => CRAFT_KIND_OF_STATION[String(valueOn(state, itemId, "station_for") ?? "")];
/** Whether the item is still connected to (carried by) that character. */
const carries = (state: ReturnType<typeof useAg>["state"], characterId: string, itemId: string) => {
  for (const l of Array.from(state.links.values())) if (l.fromNoteId === itemId && l.toNoteId === characterId) return true;
  return false;
};

/**
 * One item off one character's inventory. Press: use it — a crafting station opens its craft in a floating panel
 * (the same live bench as on its sheet, so whoever is at it, the GM's take over and the rest all carry on); any
 * other item opens its sheet. Hold: open the item or the character, or remove it.
 */
function ItemSlot({ characterId, itemId, className, onRemove, registerPress, testId }: { characterId: string; itemId: string; className: string; onRemove: () => void; registerPress: (fn: (() => void) | null) => void; testId?: string }) {
  const { state, openNote } = useAg();
  const item = state.notes.get(itemId);
  const character = state.notes.get(characterId);
  const [menu, setMenu] = useState(false);
  const [bench, setBench] = useState(false);
  const kind = item ? stationKind(state, itemId) : undefined;
  const held = carries(state, characterId, itemId);
  const qty = item ? qtyOf(state, itemId) : 1;
  const Icon = kind ? STATION_ICON[kind] : null;
  const use = () => { if (!item) return; if (kind && held) setBench(true); else openNote(itemId); };
  useEffect(() => { registerPress(use); return () => registerPress(null); });
  const hold = useHold(() => setMenu(true));
  const title = item ? [item.name, character ? (held ? character.name : `no longer with ${character.name}`) : null, kind ? `${CRAFT_KIND_LABEL[kind]} station` : null].filter(Boolean).join(" · ") : "Item";
  return (
    <>
      <button type="button" className={className} title={title} data-testid={testId}
        onClick={(e) => { if (hold.fired.current) { hold.fired.current = false; e.preventDefault(); return; } use(); }} {...hold.handlers}>
        {item ? (
          <div className={`relative w-full h-full pointer-events-none ${held ? "" : "opacity-40 grayscale"}`} data-testid="ag-hotbar-item">
            {item.portrait ? <img src={item.portrait} alt={item.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full grid place-items-center text-amber-400">{Icon ? <Icon className="h-5 w-5" /> : <Package className="h-5 w-5" />}</div>}
            {character && <span className="absolute top-0 left-0 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-br overflow-hidden border-r border-b border-black/60 bg-stone-900">
              {character.portrait ? <img src={character.portrait} alt="" className="w-full h-full object-cover" /> : <span className="block text-[8px] leading-[14px] text-center text-amber-300">{(character.name || "?").slice(0, 1).toUpperCase()}</span>}
            </span>}
            {Icon && item.portrait && <span className="absolute top-0 right-0 h-3.5 w-3.5 sm:h-4 sm:w-4 grid place-items-center rounded-bl bg-black/70 text-amber-300"><Icon className="h-2.5 w-2.5" /></span>}
            {qty > 1 && <span className="absolute bottom-0 right-0 px-0.5 rounded-tl bg-black/75 text-[9px] leading-tight font-mono text-stone-100">×{qty}</span>}
          </div>
        ) : <span className="text-[9px] text-stone-500">gone</span>}
      </button>
      {menu && (
        <SlotMenu title={item?.name ?? "Item"} onClose={() => setMenu(false)}>
          {item && kind && held && Icon && <button type="button" className={menuBtn} onClick={() => { setMenu(false); setBench(true); }} data-testid="ag-hotbar-use-station"><Icon className="h-4 w-4" /> Use — {CRAFT_KIND_LABEL[kind]}</button>}
          {item && <button type="button" className={menuBtn} onClick={() => { setMenu(false); openNote(itemId); }} data-testid="ag-hotbar-open-item"><FileText className="h-4 w-4" /> Open {item.name}</button>}
          {character && <button type="button" className={menuBtn} onClick={() => { setMenu(false); openNote(characterId); }}><User className="h-4 w-4" /> Open {character.name}</button>}
          <button type="button" className={`${menuBtn} text-red-300`} onClick={() => { setMenu(false); onRemove(); }} data-testid="ag-hotbar-remove"><Trash2 className="h-4 w-4" /> Remove from hotbar</button>
        </SlotMenu>
      )}
      {bench && item && kind && held && (
        <AgPanel title={<span className="inline-flex items-center gap-1.5 min-w-0"><span className="truncate">{item.name}</span>{character && <span className="text-[11px] text-stone-400 truncate">— {character.name}</span>}</span>}
          onClose={() => setBench(false)} width={720} height={680} panelKey={`ag-hotbar-bench-${itemId}`} testId="ag-hotbar-bench">
          <Suspense fallback={<div className="text-sm text-stone-400">Opening…</div>}><CraftBench noteId={itemId} /></Suspense>
        </AgPanel>
      )}
    </>
  );
}

const FUNCTIONS_SHEET = "Hotbar functions";

/** Choose what goes in a slot: any sheet you can see, any of their buttons and rolls, any item a character carries, or (GM) a new function. */
export function AgHotbarPicker(props: { onAssign: (ref: AgHotbarRef) => void; onClose: () => void }) {
  if (!useAgMaybe()) return <AgPanel title="Add to the hotbar" onClose={props.onClose} width={420} height={200}><div className="text-sm text-stone-400">Connecting…</div></AgPanel>;
  return <AgHotbarPickerInner {...props} />;
}

function AgHotbarPickerInner({ onAssign, onClose }: { onAssign: (ref: AgHotbarRef) => void; onClose: () => void }) {
  const { state, request, realViewer } = useAg();
  const { toast } = useToast();
  const gm = realViewer.isGM;
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  // Players: their own roll function, being made or changed (its action id).
  const [mine, setMine] = useState<string | null>(null);
  const [choosingSheet, setChoosingSheet] = useState(false);
  const sheets = useMemo(() => Array.from(state.notes.values()).filter((n) => !n.isTemplate).sort((a, b) => a.name.localeCompare(b.name)), [state.notes]);
  const types = useMemo(() => Array.from(new Set(sheets.map((n) => n.type))).sort(), [sheets]);
  const needle = q.trim().toLowerCase();
  const matchesAction = (n: AgNote) => !!needle && actionsOfNote(state.actions, n.id).some((a) => a.name.toLowerCase().includes(needle));
  // What each character carries — its items go on the bar as that character's.
  const carried = useMemo(() => {
    const out = new Map<string, AgNote[]>();
    for (const n of sheets) if (n.type === "character") { const inv = inventoryOf(state, n.id); if (inv.length) out.set(n.id, inv); }
    return out;
  }, [sheets, state]);
  const matchesItem = (n: AgNote) => !!needle && (carried.get(n.id) ?? []).some((i) => i.name.toLowerCase().includes(needle));
  const shown = sheets.filter((n) => (!type || n.type === type) && (!needle || n.name.toLowerCase().includes(needle) || matchesAction(n) || matchesItem(n)));

  // The GM's own sheet for functions that don't belong to any one sheet.
  const newFunction = async () => {
    try {
      let host = sheets.find((n) => n.name === FUNCTIONS_SHEET && n.folder === "Hotbar");
      if (!host) {
        const { noteId } = await request<{ noteId: string }>({ op: "note.create", type: "note", name: FUNCTIONS_SHEET, folder: "Hotbar" });
        await request({ op: "note.update", id: noteId, patch: { acl: { view: "gm", edit: "gm" } } });
        setMaking(noteId);
      } else setMaking(host.id);
    } catch (e: any) { toast({ title: "Couldn't do that", description: e.message, variant: "destructive" }); }
  };

  // A player's own sheets (characters first) that a function can roll for.
  const ownSheets = sheets.filter((n) => n.ownerIds.includes(realViewer.userId)).sort((a, b) => Number(b.type === "character") - Number(a.type === "character"));
  const newPlayerFunction = async (noteId: string) => {
    setChoosingSheet(false);
    try {
      const { actionId } = await request<{ actionId: string }>({ op: "action.upsert", action: { noteId, name: "My roll", steps: [], color: "#7c3aed", options: { roll: { via: "", count: "1", die: "20", add: "", bonus: "0", costs: [] }, icon: "die:d20", showName: true, showIcon: true, listed: false } } });
      setMine(actionId);
    } catch (e: any) { toast({ title: "Couldn't make it", description: e.message, variant: "destructive" }); }
  };
  const mineAction = mine ? state.actions.get(mine) : undefined;

  return (
    <AgPanel title="Add to the hotbar" onClose={onClose} width={420} height={600} testId="ag-hotbar-picker">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sheets, their rolls and items…" className="w-full h-9 px-2 rounded bg-stone-950 border border-stone-700 text-sm" data-testid="ag-hotbar-search" />
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setType("")} className={`h-7 px-2.5 rounded-full text-[11px] border ${!type ? "border-amber-500 text-amber-300" : "border-stone-700 text-stone-400"}`}>All</button>
        {types.map((t) => <button key={t} type="button" onClick={() => setType(type === t ? "" : t)} className={`h-7 px-2.5 rounded-full text-[11px] border ${type === t ? "border-amber-500 text-amber-300" : "border-stone-700 text-stone-400"}`}>{agTypeLabel(t)}</button>)}
      </div>
      {gm && (
        <button type="button" onClick={newFunction} className="w-full h-9 rounded border border-dashed border-amber-700 text-amber-200 text-sm inline-flex items-center justify-center gap-1.5 hover:bg-amber-900/20" data-testid="ag-hotbar-new-function">
          <Wand2 className="h-4 w-4" /> New function…
        </button>
      )}
      {!gm && ownSheets.length > 0 && (
        <button type="button" onClick={() => (ownSheets.length === 1 ? newPlayerFunction(ownSheets[0].id) : setChoosingSheet(true))} className="w-full h-9 rounded border border-dashed border-amber-700 text-amber-200 text-sm inline-flex items-center justify-center gap-1.5 hover:bg-amber-900/20" data-testid="ag-hotbar-new-function">
          <Wand2 className="h-4 w-4" /> New function…
        </button>
      )}
      {choosingSheet && (
        <div className="rounded-lg border border-amber-800/60 bg-stone-900 p-2 space-y-1" data-testid="ag-hotbar-function-sheet">
          <div className="text-[11px] text-stone-400">Which of your sheets does it roll for?</div>
          {ownSheets.map((n) => (
            <button key={n.id} type="button" onClick={() => newPlayerFunction(n.id)} className="w-full flex items-center gap-2 p-1.5 rounded bg-stone-800/80 border border-stone-700 hover:border-amber-600 text-left">
              <Portrait note={n} size={24} radius={5} /><span className="text-sm text-stone-200 truncate">{n.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {shown.map((n) => {
          const acts = actionsOfNote(state.actions, n.id);
          const items = carried.get(n.id) ?? [];
          const expanded = open === n.id || (!!needle && (matchesAction(n) || matchesItem(n)));
          return (
            <div key={n.id} className="rounded-lg bg-stone-800/70 border border-stone-700" data-testid={`ag-hotbar-sheet-${n.name}`}>
              <div className="flex items-center gap-2 p-2">
                <button type="button" onClick={() => setOpen(open === n.id ? null : n.id)} className="h-7 w-5 grid place-items-center text-stone-400" title="Its rolls and buttons">
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Portrait note={n} size={30} radius={6} />
                <span className="flex-1 min-w-0"><span className="block text-sm text-stone-100 truncate">{n.name || "Untitled"}</span><span className="block text-[10px] text-stone-500">{agTypeLabel(n.type)}{acts.length ? ` · ${acts.length} button${acts.length > 1 ? "s" : ""}` : ""}{items.length ? ` · ${items.length} item${items.length > 1 ? "s" : ""}` : ""}</span></span>
                <button type="button" onClick={() => onAssign(`note:${n.id}`)} className="h-7 w-7 grid place-items-center rounded border border-amber-700 text-amber-400 hover:bg-amber-900/30" title="Put this sheet on the slot" data-testid={`ag-hotbar-add-sheet-${n.name}`}><Plus className="h-3.5 w-3.5" /></button>
              </div>
              {expanded && (
                <div className="px-2 pb-2 space-y-1">
                  {acts.filter((a) => !needle || a.name.toLowerCase().includes(needle) || n.name.toLowerCase().includes(needle)).map((a) => {
                    const sum = rollSummary(state, a);
                    return (
                      <div key={a.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => onAssign(`action:${a.id}`)} className="flex-1 min-w-0 flex items-center gap-2 p-1.5 rounded bg-stone-900/80 border border-stone-700 hover:border-amber-600 text-left" data-testid={`ag-hotbar-add-action-${a.name}`}>
                          <span className="h-7 w-7 grid place-items-center rounded text-amber-300" style={{ background: a.color ?? "#44403c" }}>{a.options?.icon ? <RollIcon icon={a.options.icon} size={16} /> : <Dices className="h-4 w-4" />}</span>
                          <span className="flex-1 min-w-0 text-sm text-stone-200 truncate">{a.name}</span>
                          {(sum.roll || sum.cost) && <span className="text-[10px] text-stone-400 truncate max-w-[45%]">{[sum.roll, sum.cost].filter(Boolean).join(" · ")}</span>}
                        </button>
                        {/* A player's own function: they can change it. */}
                        {!gm && a.options?.playerMade && <button type="button" onClick={() => setMine(a.id)} className="h-9 w-8 grid place-items-center rounded border border-stone-700 text-stone-400 hover:text-amber-300" title="Change this function" data-testid={`ag-hotbar-edit-function-${a.name}`}><Pencil className="h-3.5 w-3.5" /></button>}
                      </div>
                    );
                  })}
                  {!acts.length && <div className="text-[11px] text-stone-500 px-1">No buttons or rolls on this sheet.</div>}
                  {items.length > 0 && (
                    <div className="pt-1 space-y-1" data-testid={`ag-hotbar-inventory-${n.name}`}>
                      <div className="text-[10px] uppercase tracking-wide text-stone-500 px-1">Inventory — used as {n.name}'s</div>
                      {items.filter((i) => !needle || i.name.toLowerCase().includes(needle) || n.name.toLowerCase().includes(needle)).map((i) => {
                        const k = stationKind(state, i.id);
                        const I = k ? STATION_ICON[k] : Package;
                        const qty = qtyOf(state, i.id);
                        return (
                          <button key={i.id} type="button" onClick={() => onAssign(`item:${n.id}:${i.id}`)} className="w-full min-w-0 flex items-center gap-2 p-1.5 rounded bg-stone-900/80 border border-stone-700 hover:border-amber-600 text-left" data-testid={`ag-hotbar-add-item-${i.name}`}>
                            {i.portrait ? <Portrait note={i} size={28} radius={5} /> : <span className="h-7 w-7 grid place-items-center rounded bg-stone-800 text-amber-300"><I className="h-4 w-4" /></span>}
                            <span className="flex-1 min-w-0 text-sm text-stone-200 truncate">{i.name}{qty > 1 ? <span className="text-stone-400 font-mono text-xs"> ×{qty}</span> : null}</span>
                            {k && <span className="shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full border border-amber-700/70 text-[10px] text-amber-200"><I className="h-3 w-3" />{CRAFT_KIND_LABEL[k]}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {gm && <button type="button" onClick={() => setMaking(n.id)} className="w-full h-8 rounded bg-stone-900 text-[11px] text-amber-200 inline-flex items-center justify-center gap-1 hover:bg-stone-800" data-testid={`ag-hotbar-new-function-on-${n.name}`}><Wand2 className="h-3.5 w-3.5" /> New function on {n.name}</button>}
                </div>
              )}
            </div>
          );
        })}
        {!shown.length && <div className="text-xs text-stone-500 text-center py-4">No sheets match.</div>}
      </div>
      {mine && (
        <AgPanel title={mineAction ? `Function — ${mineAction.name}` : "New function"} onClose={() => setMine(null)} width={560} height={520} testId="ag-hotbar-player-function">
          {mineAction ? (
            <div className="space-y-2">
              <div className="text-[11px] text-stone-400">Your own roll: its dice, a value of yours it adds (a skill, an attribute…), a bonus, and what it spends. Hold the button for advantage, disadvantage or a modifier.</div>
              <RollEditor action={mineAction} attrs={{ via: "", costs: [] }} first last neighbours={[mineAction]} index={0} limited />
              <button type="button" onClick={() => { onAssign(`action:${mineAction.id}`); setMine(null); }} className="w-full h-9 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium" data-testid="ag-hotbar-function-assign">Put it on the hotbar</button>
            </div>
          ) : <div className="text-sm text-stone-400">Making it…</div>}
        </AgPanel>
      )}
      {making && <ActionEditorDialog noteId={making} actionId={null} onClose={() => setMaking(null)} onSaved={(actionId) => { setMaking(null); onAssign(`action:${actionId}`); }} />}
    </AgPanel>
  );
}
