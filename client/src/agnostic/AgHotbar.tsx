// The hotbar in Agnostic systems: the same bar C.A. uses, holding sheets
// (press: open it) and buttons / rolls (press: use it). The GM can also make a
// new function — a button with steps — straight from the picker.
import React, { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, ChevronDown, Dices, Trash2, FileText, SlidersHorizontal, Wand2 } from "lucide-react";
import { agTypeLabel, type AgNote } from "@shared/agnostic/types";
import { useAg, useAgMaybe, resolveRef } from "./hooks";
import { AgPanel } from "./float";
import { Portrait, ResourceBar, useActionRunner } from "./widgets";
import { RollIcon } from "./rollIcons";
import { rollSummary, actionsOfNote } from "./rolls";
import { ActionEditorDialog } from "./ActionEditor";
import { useToast } from "@/hooks/use-toast";

export type AgHotbarRef = `note:${string}` | `action:${string}`;
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
  // The bar can show before Agnostic has connected: an empty tile until then.
  if (!useAgMaybe()) return <button type="button" className={props.className} disabled data-testid={props.testId} />;
  return <AgHotbarSlotInner {...props} />;
}

function AgHotbarSlotInner({ agRef, className, onRemove, registerPress, testId }: {
  agRef: string; className: string; onRemove: () => void; registerPress: (fn: (() => void) | null) => void; testId?: string;
}) {
  const { kind, id } = parse(agRef);
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

const FUNCTIONS_SHEET = "Hotbar functions";

/** Choose what goes in a slot: any sheet you can see, any of their buttons and rolls, or (GM) a new function. */
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
  const sheets = useMemo(() => Array.from(state.notes.values()).filter((n) => !n.isTemplate).sort((a, b) => a.name.localeCompare(b.name)), [state.notes]);
  const types = useMemo(() => Array.from(new Set(sheets.map((n) => n.type))).sort(), [sheets]);
  const needle = q.trim().toLowerCase();
  const matchesAction = (n: AgNote) => !!needle && actionsOfNote(state.actions, n.id).some((a) => a.name.toLowerCase().includes(needle));
  const shown = sheets.filter((n) => (!type || n.type === type) && (!needle || n.name.toLowerCase().includes(needle) || matchesAction(n)));

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

  return (
    <AgPanel title="Add to the hotbar" onClose={onClose} width={420} height={600} testId="ag-hotbar-picker">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sheets and their rolls…" className="w-full h-9 px-2 rounded bg-stone-950 border border-stone-700 text-sm" data-testid="ag-hotbar-search" />
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setType("")} className={`h-7 px-2.5 rounded-full text-[11px] border ${!type ? "border-amber-500 text-amber-300" : "border-stone-700 text-stone-400"}`}>All</button>
        {types.map((t) => <button key={t} type="button" onClick={() => setType(type === t ? "" : t)} className={`h-7 px-2.5 rounded-full text-[11px] border ${type === t ? "border-amber-500 text-amber-300" : "border-stone-700 text-stone-400"}`}>{agTypeLabel(t)}</button>)}
      </div>
      {gm && (
        <button type="button" onClick={newFunction} className="w-full h-9 rounded border border-dashed border-amber-700 text-amber-200 text-sm inline-flex items-center justify-center gap-1.5 hover:bg-amber-900/20" data-testid="ag-hotbar-new-function">
          <Wand2 className="h-4 w-4" /> New function…
        </button>
      )}
      <div className="space-y-1">
        {shown.map((n) => {
          const acts = actionsOfNote(state.actions, n.id);
          const expanded = open === n.id || (!!needle && matchesAction(n));
          return (
            <div key={n.id} className="rounded-lg bg-stone-800/70 border border-stone-700" data-testid={`ag-hotbar-sheet-${n.name}`}>
              <div className="flex items-center gap-2 p-2">
                <button type="button" onClick={() => setOpen(open === n.id ? null : n.id)} className="h-7 w-5 grid place-items-center text-stone-400" title="Its rolls and buttons">
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Portrait note={n} size={30} radius={6} />
                <span className="flex-1 min-w-0"><span className="block text-sm text-stone-100 truncate">{n.name || "Untitled"}</span><span className="block text-[10px] text-stone-500">{agTypeLabel(n.type)}{acts.length ? ` · ${acts.length} button${acts.length > 1 ? "s" : ""}` : ""}</span></span>
                <button type="button" onClick={() => onAssign(`note:${n.id}`)} className="h-7 w-7 grid place-items-center rounded border border-amber-700 text-amber-400 hover:bg-amber-900/30" title="Put this sheet on the slot" data-testid={`ag-hotbar-add-sheet-${n.name}`}><Plus className="h-3.5 w-3.5" /></button>
              </div>
              {expanded && (
                <div className="px-2 pb-2 space-y-1">
                  {acts.filter((a) => !needle || a.name.toLowerCase().includes(needle) || n.name.toLowerCase().includes(needle)).map((a) => {
                    const sum = rollSummary(state, a);
                    return (
                      <button key={a.id} type="button" onClick={() => onAssign(`action:${a.id}`)} className="w-full flex items-center gap-2 p-1.5 rounded bg-stone-900/80 border border-stone-700 hover:border-amber-600 text-left" data-testid={`ag-hotbar-add-action-${a.name}`}>
                        <span className="h-7 w-7 grid place-items-center rounded text-amber-300" style={{ background: a.color ?? "#44403c" }}>{a.options?.icon ? <RollIcon icon={a.options.icon} size={16} /> : <Dices className="h-4 w-4" />}</span>
                        <span className="flex-1 min-w-0 text-sm text-stone-200 truncate">{a.name}</span>
                        {(sum.roll || sum.cost) && <span className="text-[10px] text-stone-400 truncate max-w-[45%]">{[sum.roll, sum.cost].filter(Boolean).join(" · ")}</span>}
                      </button>
                    );
                  })}
                  {!acts.length && <div className="text-[11px] text-stone-500 px-1">No buttons or rolls on this sheet.</div>}
                  {gm && <button type="button" onClick={() => setMaking(n.id)} className="w-full h-8 rounded bg-stone-900 text-[11px] text-amber-200 inline-flex items-center justify-center gap-1 hover:bg-stone-800" data-testid={`ag-hotbar-new-function-on-${n.name}`}><Wand2 className="h-3.5 w-3.5" /> New function on {n.name}</button>}
                </div>
              )}
            </div>
          );
        })}
        {!shown.length && <div className="text-xs text-stone-500 text-center py-4">No sheets match.</div>}
      </div>
      {making && <ActionEditorDialog noteId={making} actionId={null} onClose={() => setMaking(null)} onSaved={(actionId) => { setMaking(null); onAssign(`action:${actionId}`); }} />}
    </AgPanel>
  );
}
