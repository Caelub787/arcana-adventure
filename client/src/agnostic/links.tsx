// Connections tables — everything connected to a sheet by one name ("items",
// "wounds", "traits"…), shown as a table or as item cards, with search, sort,
// filter chips, inline-editable columns, and Add / Remove. Configured right,
// this is a whole inventory: the rows are real sheets (open one to see it in
// full), their values are live, and equipped items' modifiers reach the owner.
import React, { useMemo, useState } from "react";
import { Plus, Search, X, Trash2, Unlink, ArrowUp, ArrowDown, Package, LayoutList, Table as TableIcon, ExternalLink, Maximize2, Minimize2, Grid3x3 } from "lucide-react";
import type { AgField, AgLinkColumn, AgLinksConfig, AgLook, AgNote } from "@shared/agnostic/types";
import { AG_BUILTIN_TYPES, agTypeLabel, noteDocName } from "@shared/agnostic/types";
import { formatValue, asNumber } from "@shared/agnostic/formula";
import { useToast } from "@/hooks/use-toast";
import { useAg, follow, followWithParents, isLinkPath, resolveRef, effOf, usePerms } from "./hooks";
import { Portrait, FieldInput, ResourceBar, useFieldWriter, EditOnDoubleClick, CommitInput, ActionButton } from "./widgets";
import { RollsList } from "./rolls";
import { EffectsList } from "./effects";
import { AgSelector, QtyPicker, agConfirm, type SelItem } from "./float";
import { TipIcon, useAnchoredPopup } from "./tips";
// A list can show its sheets' pages, and pages contain lists: the editor is loaded when first needed.
const AgEditor = React.lazy(() => import("./editor/AgEditor").then((m) => ({ default: m.AgEditor })));

export const normCol = (c: string | AgLinkColumn): AgLinkColumn => (typeof c === "string" ? { ref: c } : c);

function colLabel(c: AgLinkColumn, sample?: AgField) {
  return c.label || sample?.label || c.ref.replace(/_/g, " ");
}

type State = ReturnType<typeof useAg>["state"];
/** A sheet's own colour: its first value marked "is a colour" (e.g. an ability's tag colour). */
export function noteColor(state: State, noteId: string): string | undefined {
  for (const f of Array.from(state.fields.values())) {
    if (f.noteId === noteId && f.options.isColor && typeof f.value === "string" && /^#[0-9a-f]{3,8}$/i.test(f.value)) return f.value;
  }
  return undefined;
}

/** Sheets a row is connected to (a "connection" column), as small coloured tags; click one to open it. */
function ConnectionTags({ noteId, label, color }: { noteId: string; label: string; color?: string }) {
  const { state, openNote } = useAg();
  const ids = follow(state, noteId, label);
  if (!ids.length) return <span className="text-stone-600">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1" data-no-open>
      {ids.map((id) => {
        const col = noteColor(state, id) ?? color ?? "#d4a24c";
        return (
          <button key={id} type="button" onClick={(e) => { e.stopPropagation(); openNote(id); }}
            className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full border text-[10.5px] font-semibold hover:brightness-125"
            style={{ borderColor: col, color: col, background: `color-mix(in srgb, ${col} 14%, transparent)` }} data-testid={`ag-conn-tag-${state.notes.get(id)?.name}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: col }} />{state.notes.get(id)?.name || "Untitled"}
          </button>
        );
      })}
    </span>
  );
}

export function LinksTable({ noteId, label, columns: rawColumns, config = {}, look }: {
  noteId: string; label: string; columns: Array<string | AgLinkColumn>; config?: AgLinksConfig; look?: AgLook;
}) {
  const { state, openNote, request, viewer, realViewer } = useAg();
  const { canEditBody } = usePerms(noteId);
  const host = state.notes.get(noteId);
  const { toast } = useToast();
  const columns = rawColumns.map(normCol);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("");
  const [sort, setSort] = useState(config.sortBy ?? "name");
  const [desc, setDesc] = useState(false);
  const [adding, setAdding] = useState<null | SelItem[]>(null);
  const [howMany, setHowMany] = useState<SelItem | null>(null);
  // Adding to a path list: first which sheet it goes on (e.g. which ability), then what.
  const [addHost, setAddHost] = useState<string>(noteId);
  const [pickingHost, setPickingHost] = useState<null | SelItem[]>(null);
  // A path ("abilities.aspects") lists the sheets reached through others; parents = what each hangs off.
  const parents = followWithParents(state, noteId, label);
  const ids = Array.from(parents.keys());
  const viaPath = isLinkPath(label);
  const fieldOf = (id: string, ref: string) => resolveRef(state, id, ref)[0];
  // A "connection" column's value is the names of the sheets it shows (filter / sort / colour by ability…).
  const connCol = (ref: string) => columns.find((c) => c.ref === ref && c.display === "connection");
  const textOf = (id: string, ref: string) => connCol(ref) ? follow(state, id, ref).map((x) => state.notes.get(x)?.name ?? "").join(", ") : String(effOf(fieldOf(id, ref)) ?? "");
  const sortVal = (id: string) => (sort === "name" ? (state.notes.get(id)?.name ?? "").toLowerCase() : connCol(sort) ? textOf(id, sort).toLowerCase() : (() => { const v = effOf(fieldOf(id, sort)); return typeof v === "number" ? v : String(v ?? "").toLowerCase(); })());
  const chipValues = config.filterBy ? Array.from(new Set(ids.flatMap((id) => connCol(config.filterBy!) ? follow(state, id, config.filterBy!).map((x) => state.notes.get(x)?.name ?? "") : [textOf(id, config.filterBy!)]).filter(Boolean))).sort() : [];
  const chipColor = (v: string) => {
    if (!config.filterBy) return undefined;
    if (connCol(config.filterBy)) { const hit = ids.flatMap((id) => follow(state, id, config.filterBy!)).find((x) => state.notes.get(x)?.name === v); return hit ? noteColor(state, hit) : undefined; }
    return ids.map((id) => fieldOf(id, config.filterBy!)).find((f) => f?.options.choiceColors?.[v])?.options.choiceColors?.[v];
  };
  const accentOf = (id: string): string | undefined => {
    if (!config.accentBy) return undefined;
    if (connCol(config.accentBy)) { const hit = follow(state, id, config.accentBy)[0]; return hit ? noteColor(state, hit) : undefined; }
    const f = fieldOf(id, config.accentBy);
    // A colour value (an ability's tag colour) is the colour itself.
    if (f?.options.isColor) { const v = effOf(f); return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined; }
    return f?.options.choiceColors?.[String(effOf(f) ?? "")];
  };
  const rows = ids
    .filter((id) => !q.trim() || (state.notes.get(id)?.name ?? "").toLowerCase().includes(q.trim().toLowerCase()))
    .filter((id) => !chip || (connCol(config.filterBy!) ? follow(state, id, config.filterBy!).some((x) => state.notes.get(x)?.name === chip) : textOf(id, config.filterBy!) === chip))
    .sort((a, b) => { const x = sortVal(a), y = sortVal(b); const r = x < y ? -1 : x > y ? 1 : 0; return desc ? -r : r; });
  const sample = ids.length ? ids[0] : undefined;

  const canAddAsGM = viewer.isGM;
  const mayAdd = !!config.add && (canAddAsGM || canEditBody || (host?.ownerIds.includes(realViewer.userId) ?? false));
  const removeMode = config.remove ?? "none";
  const canRemove = (id: string) => {
    if (removeMode === "none") return false;
    if (viewer.isGM) return true;
    const n = state.notes.get(id);
    return !!n && n.ownerIds.includes(viewer.userId);
  };

  const lastLabel = label.split(".").filter(Boolean).pop() ?? label;
  /** Who a copy is on now ("Aria, Bren"). */
  const holdersOf = (id: string) => Array.from(state.links.values()).filter((l) => l.fromNoteId === id && l.label === (config.add?.reverse || "owner")).map((l) => state.notes.get(l.toNoteId)?.name).filter(Boolean).join(", ");
  const openAddPath = () => {
    const hosts = follow(state, noteId, label.split(".").filter(Boolean).slice(0, -1).join("."));
    if (hosts.length === 1) { setAddHost(hosts[0]); void openAdd(hosts[0]); return; }
    if (!hosts.length) { toast({ title: "Nothing to add to yet", description: "Add the sheets these go on first." }); return; }
    setPickingHost(hosts.map((id) => { const n = state.notes.get(id)!; return { id, name: n.name || "Untitled", image: n.portrait, sub: `Add to ${n.name || "this"}` }; }));
  };
  const openAdd = async (hostId = noteId) => {
    try {
      const types = config.add?.types?.length ? config.add.types : undefined;
      // Lists that only take existing sheets (a character's items: the originals live in the sidebar).
      const makeNew = config.add?.createNew !== false;
      const { templates } = makeNew ? await request<{ templates: Array<{ id: string; name: string; type: string; portrait: string | null; description: string | null }> }>({ op: "note.creatableTemplates", types }) : { templates: [] };
      const items: SelItem[] = (templates ?? []).map((t) => ({ id: `t:${t.id}`, name: t.name, image: t.portrait, group: "New", sub: t.description || `New ${agTypeLabel(t.type)}`, badge: agTypeLabel(t.type), icon: <Package className="h-4 w-4" /> }));
      if (viewer.isGM && config.add?.existing !== false) {
        for (const n of Array.from(state.notes.values())) {
          if (n.isTemplate || n.id === hostId || n.id === noteId || ids.includes(n.id) || (types && !types.includes(n.type))) continue;
          // Lists that give copies: an original gives a copy (it stays as it is); someone's copy moves here.
          const copyList = !!config.add?.copy;
          items.push({
            id: `n:${n.id}`, name: n.name || "Untitled", image: n.portrait,
            group: copyList ? (n.copyOf ? "Copies (move here)" : "Originals (give a copy)") : "Existing sheets",
            sub: copyList ? (n.copyOf ? `Move it here${holdersOf(n.id) ? ` from ${holdersOf(n.id)}` : ""}, notes and all` : "Give a copy — the original stays as it is") : `Connect this ${agTypeLabel(n.type).toLowerCase()}`,
            badge: agTypeLabel(n.type),
          });
        }
        if (types && makeNew) for (const t of types) items.push({ id: `b:${t}`, name: `Blank ${agTypeLabel(t)}`, group: "New", sub: "An empty sheet to fill in", icon: <Plus className="h-4 w-4" /> });
      }
      setAdding(items);
    } catch (e: any) { toast({ title: "Couldn't load", description: e.message, variant: "destructive" }); }
  };
  const pick = async (id: string, qty?: number) => {
    const reverse = config.add?.reverse || "owner";
    const host = viaPath ? addHost : noteId;
    const name = adding?.find((i) => i.id === id)?.name ?? "";
    try {
      let made: { noteId?: string; how?: string; qty?: number } = {};
      if (id.startsWith("n:")) made = await request({ op: "note.attach", hostNoteId: host, noteId: id.slice(2), label: lastLabel, reverseLabel: reverse, qty });
      else if (id.startsWith("t:")) made = await request({ op: "note.createLinked", hostNoteId: host, templateId: id.slice(2), label: lastLabel, reverseLabel: reverse });
      else if (id.startsWith("b:")) made = await request({ op: "note.createLinked", hostNoteId: host, type: id.slice(2), name: `New ${agTypeLabel(id.slice(2))}`, label: lastLabel, reverseLabel: reverse });
      // A new sheet made from a template: set how many on it too.
      if (qty && qty !== 1 && !id.startsWith("n:") && made.noteId) {
        const q = Array.from(state.fields.values()).find((f) => f.noteId === made.noteId && f.key === "qty");
        if (q) await request({ op: "field.set", id: q.id, value: qty });
      }
      toast({ title: made.how === "stacked" ? `${name} ×${qty ?? 1} added — now ×${made.qty}` : `Added${qty && qty !== 1 ? ` ${qty} ×` : ""} ${name}` });
    } catch (e: any) { toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }); }
  };
  const holdHint = config.add?.copy ? "Click to add one — hold (or right-click) to choose how many. This window stays open so you can add several." : "Click to add; this window stays open so you can add several.";
  const qtyUi = howMany && <QtyPicker title={`How many ${howMany.name}?`} onPick={(n) => void pick(howMany.id, n)} onClose={() => setHowMany(null)} />;
  const remove = (id: string) => {
    const n = state.notes.get(id);
    const del = removeMode === "delete";
    agConfirm(del ? `“${n?.name}” is deleted for everyone.` : `“${n?.name}” stays as a sheet, just no longer connected here.`, { title: del ? `Delete “${n?.name}”?` : `Remove “${n?.name}” from this list?`, confirm: del ? "Delete" : "Remove" })
      .then((ok) => ok && request({ op: "note.removeLinked", hostNoteId: parents.get(id) ?? noteId, noteId: id, mode: del ? "delete" : "disconnect" }).catch((e: any) => toast({ title: "Couldn't remove it", description: e.message, variant: "destructive" })));
  };

  // Rows can be dragged onto another sheet (moves it there, off the sheet it hangs from) or onto the map.
  const dragRow = (id: string) => (e: React.DragEvent) => {
    if ((e.target as HTMLElement).closest?.("input, textarea, select")) { e.preventDefault(); return; }
    e.stopPropagation();
    e.dataTransfer.setData("application/character-id", `ag:${id}`);
    e.dataTransfer.setData("application/ag-from", parents.get(id) ?? noteId);
    e.dataTransfer.effectAllowed = "copyMove";
  };
  const fontStyle: React.CSSProperties = { fontSize: look?.fontSize, color: look?.textColor };
  const toolbar = (config.search || config.filterBy || mayAdd || columns.length > 0) && (
    <div className="flex flex-wrap items-center gap-1.5">
      {config.search && (
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-8 pl-7 pr-6 rounded-md bg-stone-900 border border-stone-700 text-xs text-stone-100" data-testid="ag-links-search" />
          {q && <button type="button" onClick={() => setQ("")} className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center text-stone-500"><X className="h-3 w-3" /></button>}
        </div>
      )}
      {(config.search || config.sortBy) && (
        <span className="inline-flex items-center gap-0.5">
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-8 bg-stone-900 border border-stone-700 rounded-md px-1 text-xs text-stone-200" title="Sort by" data-testid="ag-links-sort">
            <option value="name">Name</option>
            {columns.map((c) => <option key={c.ref} value={c.ref}>{colLabel(c, sample ? fieldOf(sample, c.ref) : undefined)}</option>)}
          </select>
          <button type="button" onClick={() => setDesc(!desc)} className="h-8 w-7 grid place-items-center rounded-md border border-stone-700 bg-stone-900 text-stone-400" title={desc ? "Descending" : "Ascending"}>{desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}</button>
        </span>
      )}
      {mayAdd && <button type="button" onClick={() => (viaPath ? openAddPath() : openAdd())} className="ml-auto h-8 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1" data-testid="ag-links-add"><Plus className="h-3.5 w-3.5" /> Add</button>}
      {chipValues.length > 1 && (
        <div className="w-full flex gap-1 overflow-x-auto no-scrollbar">
          {["", ...chipValues].map((v) => (
            <button key={v || "all"} type="button" onClick={() => setChip(v)} className={`h-7 px-2.5 rounded-full text-[11px] border shrink-0 ${chip === v ? "bg-amber-500/10" : ""}`} style={{ borderColor: chip === v ? (chipColor(v) ?? "#f59e0b") : "#44403c", color: chipColor(v) ?? (chip === v ? "#fcd34d" : "#a8a29e") }}>{v || "All"}</button>
          ))}
        </div>
      )}
    </div>
  );

  const cell = (id: string, c: AgLinkColumn, compact = false) => {
    if (c.display === "rolls") return <RollsList noteId={id} compact={compact} />;
    if (c.display === "effects") return <EffectsList noteId={id} />;
    if (c.display === "connection") return <ConnectionTags noteId={id} label={c.ref} color={c.color} />;
    if (c.display === "button") {
      // A button on the connected sheet, found by its name ("Use", "Strike"…).
      const want = c.ref.trim().toLowerCase();
      const a = Array.from(state.actions.values()).find((x) => x.noteId === id && x.name.trim().toLowerCase() === want);
      return a ? <span data-no-open><ActionButton actionId={a.id} label={c.label || a.name} look={{ height: compact ? 28 : 30, fontSize: 12, color: c.color }} /></span> : null;
    }
    const f = fieldOf(id, c.ref);
    if (!f) return <span className="text-stone-600">—</span>;
    const display = c.display ?? "input";
    if (display === "bar") {
      const m = c.maxRef ? fieldOf(id, c.maxRef) : undefined;
      return <span className="inline-block align-middle" style={{ width: compact ? 72 : 110 }}><ResourceBar field={f} maxField={m} color={c.color ?? "#22c55e"} height={compact ? 8 : 12} showNumbers={!compact} compact /></span>;
    }
    // Values and badges change on double-click (long-press on phones), even when empty.
    if (display === "badge") {
      const v = effOf(f);
      const empty = v === null || v === "";
      const col = f.options.choiceColors?.[String(v)] ?? c.color ?? "#a8a29e";
      return <span data-no-open><EditOnDoubleClick field={f} empty={empty}>{empty ? null : <span className="inline-flex items-center px-1.5 py-px rounded-full border text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: col, color: col, background: `color-mix(in srgb, ${col} 12%, transparent)` }}>{formatValue(v)}{c.suffix ? ` ${c.suffix}` : ""}</span>}</EditOnDoubleClick></span>;
    }
    if (display === "toggle") return <ToggleCell field={f} label={colLabel(c, f)} />;
    if (display === "text") {
      const text = formatValue(effOf(f));
      return <span className="text-stone-300 whitespace-pre-wrap" data-no-open><EditOnDoubleClick field={f} empty={text === ""}><span>{text}</span></EditOnDoubleClick></span>;
    }
    if (display === "value") {
      const text = formatValue(effOf(f), f.options.decimals);
      return <span className="text-stone-200" data-no-open><EditOnDoubleClick field={f} empty={text === ""}><span>{text}{c.suffix ? <span className="text-stone-500"> {c.suffix}</span> : null}</span></EditOnDoubleClick></span>;
    }
    return <span className="inline-flex items-center gap-1"><FieldInput field={f} />{c.suffix ? <span className="text-stone-500 text-[11px]">{c.suffix}</span> : null}</span>;
  };

  const removeBtn = (id: string) => canRemove(id) && (
    <button type="button" onClick={(e) => { e.stopPropagation(); remove(id); }} className="h-8 w-8 grid place-items-center rounded text-stone-500 hover:text-red-400 hover:bg-red-950/40 shrink-0" title={removeMode === "delete" ? "Delete" : "Remove from this list"} data-testid={`ag-links-remove-${state.notes.get(id)?.name}`}>
      {removeMode === "delete" ? <Trash2 className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
    </button>
  );

  const empty = <div className="px-2 py-3 text-stone-500 text-xs text-center">{ids.length ? "Nothing matches." : config.emptyText || `Nothing connected as “${label}” yet.`}</div>;

  if (config.layout === "icons") {
    return (
      <div className="space-y-1.5" style={fontStyle} data-testid="ag-links">
        <IconsList noteId={noteId} label={label} rows={rows} columns={columns} config={config} look={look} cell={cell} fieldOf={fieldOf} accentOf={accentOf}
          dragRow={dragRow} removeBtn={removeBtn} mayAdd={mayAdd} onAdd={() => (viaPath ? openAddPath() : openAdd())} search={config.search ? { q, setQ } : null} empty={!rows.length ? empty : null} />
        {adding && <AgSelector title={`Add to ${viaPath ? state.notes.get(addHost)?.name ?? lastLabel : label.replace(/_/g, " ")}`} items={adding} onPick={(id) => void pick(id)} onHold={config.add?.copy ? (id) => setHowMany(adding.find((i) => i.id === id) ?? null) : undefined} onClose={() => setAdding(null)} keepOpen hint={holdHint} emptyText="Nothing to add yet — the GM makes templates for these." testId="ag-links-add-selector" />}
        {qtyUi}
        {pickingHost && <AgSelector title="Add to which one?" items={pickingHost} onPick={(id) => { setPickingHost(null); setAddHost(id); void openAdd(id); }} onClose={() => setPickingHost(null)} testId="ag-links-add-host" />}
      </div>
    );
  }

  if (config.layout === "cards") {
    const badges = columns.filter((c) => c.display === "badge");
    const stats = columns.filter((c) => !c.display || c.display === "value" || c.display === "input");
    const bars = columns.filter((c) => c.display === "bar");
    const toggles = columns.filter((c) => c.display === "toggle");
    const texts = columns.filter((c) => c.display === "text");
    const buttons = columns.filter((c) => c.display === "button");
    const rollCols = columns.filter((c) => c.display === "rolls");
    const effectCols = columns.filter((c) => c.display === "effects");
    const connCols = columns.filter((c) => c.display === "connection");
    return (
      <div className="space-y-2" style={fontStyle} data-testid="ag-links">
        {toolbar}
        {rows.map((id) => {
          const n = state.notes.get(id)!;
          const accent = accentOf(id);
          return (
            <div key={id} role="button" tabIndex={0} draggable onDragStart={dragRow(id)} onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, select, a, [data-no-open]")) openNote(id); }} onKeyDown={(e) => { if (e.key === "Enter") openNote(id); }}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-stone-900/80 border hover:brightness-110 cursor-pointer" style={{ borderColor: accent ?? look?.border ?? "#44403c" }} data-testid={`ag-links-row-${n.name}`}>
              <Portrait note={n} size={44} radius={8} className="shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <RowName note={n} />
                  {badges.map((c) => <React.Fragment key={c.ref}>{cell(id, c)}</React.Fragment>)}
                  {connCols.map((c) => <React.Fragment key={`c-${c.ref}`}>{cell(id, c)}</React.Fragment>)}
                </div>
                {(stats.length > 0 || bars.length > 0) && (
                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-stone-400" data-no-open>
                    {stats.map((c) => { const f = fieldOf(id, c.ref); return <span key={c.ref} className="inline-flex items-center gap-1"><span className="text-stone-500">{colLabel(c, f)}</span>{cell(id, c, true)}{f?.options.tooltip && <TipIcon text={f.options.tooltip} current={formatValue(effOf(f))} size={11} />}</span>; })}
                    {bars.map((c) => <span key={c.ref} className="inline-flex items-center gap-1"><span className="text-stone-500">{colLabel(c, fieldOf(id, c.ref))}</span>{cell(id, c, true)}</span>)}
                  </div>
                )}
                {texts.map((c) => <div key={c.ref} className="text-[12px] leading-snug line-clamp-3">{c.label ? <span className="text-stone-500">{c.label} </span> : null}{cell(id, c, true)}</div>)}
                {effectCols.map((c, k) => <div key={`fx-${k}`}>{cell(id, c, true)}</div>)}
                {rollCols.map((c, k) => <div key={`rolls-${k}`} className="pt-0.5">{cell(id, c, true)}</div>)}
              </div>
              {buttons.length > 0 && <div className="flex flex-col sm:flex-row gap-1 shrink-0" data-no-open>{buttons.map((c) => <React.Fragment key={c.ref}>{cell(id, c, true)}</React.Fragment>)}</div>}
              {toggles.map((c) => <span key={c.ref} data-no-open>{cell(id, c)}</span>)}
              {removeBtn(id)}
            </div>
          );
        })}
        {!rows.length && empty}
        {adding && <AgSelector title={`Add to ${viaPath ? state.notes.get(addHost)?.name ?? lastLabel : label.replace(/_/g, " ")}`} items={adding} onPick={(id) => void pick(id)} onHold={config.add?.copy ? (id) => setHowMany(adding.find((i) => i.id === id) ?? null) : undefined} onClose={() => setAdding(null)} keepOpen hint={holdHint} emptyText="Nothing to add yet — the GM makes templates for these." testId="ag-links-add-selector" />}
        {qtyUi}
        {pickingHost && <AgSelector title="Add to which one?" items={pickingHost} onPick={(id) => { setPickingHost(null); setAddHost(id); void openAdd(id); }} onClose={() => setPickingHost(null)} testId="ag-links-add-host" />}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="ag-links">
      {toolbar}
      <div className={`overflow-auto ${look?.border ? "" : "border border-stone-700"}`} style={{ maxHeight: look?.height || undefined, borderRadius: look?.radius ?? 4, border: look?.border ? `1px solid ${look.border}` : undefined }}>
        <table className="w-full text-sm" style={{ ...fontStyle, fontStyle: look?.italic ? "italic" : undefined }}>
          <thead className={`${look?.color ? "" : "bg-stone-800/80"} text-stone-300 sticky top-0`} style={{ background: look?.color, color: look?.textColor, fontWeight: look?.bold ? 700 : undefined }}>
            <tr>
              <th className="text-left px-2 py-1 font-medium">{lastLabel.replace(/_/g, " ") || "Connected"}</th>
              {columns.map((c) => { const f = sample ? fieldOf(sample, c.ref) : undefined; return <th key={c.ref} className="text-left px-2 py-1 font-medium"><span className="inline-flex items-center gap-1">{colLabel(c, f)}{f?.options.tooltip && <TipIcon text={f.options.tooltip} size={11} />}</span></th>; })}
              {removeMode !== "none" && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => {
              const n = state.notes.get(id)!;
              return (
                <tr key={id} draggable onDragStart={dragRow(id)} className="border-t border-stone-800 hover:bg-stone-800/40" data-testid={`ag-links-row-${n.name}`}>
                  <td className="px-2 py-1"><button type="button" className="inline-flex items-center gap-1.5 text-amber-200 hover:underline text-left" onClick={() => openNote(id)}><Portrait note={n} size={20} radius={4} />{n.name}</button></td>
                  {columns.map((c) => <td key={c.ref} className="px-2 py-1">{cell(id, c)}</td>)}
                  {removeMode !== "none" && <td className="px-1">{removeBtn(id)}</td>}
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={columns.length + 2}>{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {adding && <AgSelector title={`Add to ${viaPath ? state.notes.get(addHost)?.name ?? lastLabel : label.replace(/_/g, " ")}`} items={adding} onPick={(id) => void pick(id)} onHold={config.add?.copy ? (id) => setHowMany(adding.find((i) => i.id === id) ?? null) : undefined} onClose={() => setAdding(null)} keepOpen hint={holdHint} emptyText="Nothing to add yet — the GM makes templates for these." testId="ag-links-add-selector" />}
        {qtyUi}
      {pickingHost && <AgSelector title="Add to which one?" items={pickingHost} onPick={(id) => { setPickingHost(null); setAddHost(id); void openAdd(id); }} onClose={() => setPickingHost(null)} testId="ag-links-add-host" />}
    </div>
  );
}

// --------------------------------------------------------------------------- icons
// Each connected sheet as a small picture. Hover it (tap on a phone) for what it
// does — its columns, with working rolls; click it (double-tap or hold on a
// phone) to open it. "Show all" lays every one out in full; that choice is each
// viewer's own, remembered on their device.
const expandedKey = (noteId: string, label: string) => `ag-links-open:${noteId}:${label}`;
const expandedLists = new Map<string, boolean>();
const expandListeners = new Set<() => void>();
function getExpanded(k: string): boolean {
  if (!expandedLists.has(k)) { let v = false; try { v = localStorage.getItem(k) === "1"; } catch { /* storage blocked */ } expandedLists.set(k, v); }
  return expandedLists.get(k)!;
}
function setExpanded(k: string, on: boolean) {
  expandedLists.set(k, on);
  try { if (on) localStorage.setItem(k, "1"); else localStorage.removeItem(k); } catch { /* storage blocked */ }
  expandListeners.forEach((l) => l());
}
function useExpanded(k: string): [boolean, (on: boolean) => void] {
  const [, force] = useState(0);
  React.useEffect(() => { const l = () => force((n) => n + 1); expandListeners.add(l); return () => { expandListeners.delete(l); }; }, []);
  return [getExpanded(k), (on) => setExpanded(k, on)];
}

const initialsOf = (name: string) => (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("") || "?").toUpperCase();

/** A sheet's picture as a small square — its initials on its colour when it has none. */
function IconFace({ note, size, accent }: { note: AgNote; size: number; accent?: string }) {
  const { state } = useAg();
  if (note.portrait) return <Portrait note={note} size={size} radius={Math.round(size / 5)} />;
  const col = accent ?? noteColor(state, note.id) ?? "#d4a24c";
  return (
    <span className="grid place-items-center font-bold shrink-0 border" style={{ width: size, height: size, borderRadius: Math.round(size / 5), fontSize: Math.round(size * 0.36), color: col, borderColor: `color-mix(in srgb, ${col} 55%, transparent)`, background: `color-mix(in srgb, ${col} 16%, #1c1917)` }}>
      {initialsOf(note.name || "?")}
    </span>
  );
}

type CellFn = (id: string, c: AgLinkColumn, compact?: boolean) => React.ReactNode;

/** Everything a connected sheet's columns show, stacked (the pop-up and the "show all" view). */
function ColumnsDetail({ id, columns, cell, fieldOf }: { id: string; columns: AgLinkColumn[]; cell: CellFn; fieldOf: (id: string, ref: string) => AgField | undefined }) {
  const badges = columns.filter((c) => c.display === "badge" || c.display === "connection");
  const stats = columns.filter((c) => !c.display || c.display === "value" || c.display === "input" || c.display === "bar");
  const texts = columns.filter((c) => c.display === "text");
  const effectCols = columns.filter((c) => c.display === "effects");
  const rollCols = columns.filter((c) => c.display === "rolls");
  const actions = columns.filter((c) => c.display === "button" || c.display === "toggle");
  return (
    <div className="space-y-1.5 min-w-0">
      {badges.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{badges.map((c) => <React.Fragment key={`b-${c.ref}`}>{cell(id, c)}</React.Fragment>)}</div>}
      {stats.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-stone-400" data-no-open>
          {stats.map((c) => { const f = fieldOf(id, c.ref); return <span key={c.ref} className="inline-flex items-center gap-1"><span className="text-stone-500">{colLabel(c, f)}</span>{cell(id, c, true)}</span>; })}
        </div>
      )}
      {texts.map((c) => <div key={`t-${c.ref}`} className="text-[12.5px] leading-snug text-stone-300">{c.label ? <span className="text-stone-500">{c.label} </span> : null}{cell(id, c, true)}</div>)}
      {effectCols.map((c, k) => <div key={`fx-${k}`}>{cell(id, c, true)}</div>)}
      {rollCols.map((c, k) => <div key={`r-${k}`}>{cell(id, c)}</div>)}
      {actions.length > 0 && <div className="flex flex-wrap gap-1.5" data-no-open>{actions.map((c) => <React.Fragment key={`a-${c.ref}`}>{cell(id, c)}</React.Fragment>)}</div>}
    </div>
  );
}

/** One connected sheet's page, shown inside this one (always as players see it; its values and rolls still work). */
function EmbeddedPage({ note }: { note: AgNote }) {
  return <div className="ag-embedded-page text-[13px]" data-testid={`ag-links-page-${note.name}`}><React.Suspense fallback={null}><AgEditor docName={noteDocName(note.id, note.docEpoch)} noteId={note.id} nested locked /></React.Suspense></div>;
}

const HOLD_OPEN_MS = 500;
const DOUBLE_TAP_MS = 320;

function IconTile({ id, columns, cell, fieldOf, accent, dragRow, removeBtn, size }: {
  id: string; columns: AgLinkColumn[]; cell: CellFn; fieldOf: (id: string, ref: string) => AgField | undefined; accent?: string;
  dragRow: (id: string) => (e: React.DragEvent) => void; removeBtn: (id: string) => React.ReactNode; size: number;
}) {
  const { state, openNote } = useAg();
  const n = state.notes.get(id)!;
  const pop = useAnchoredPopup(id);
  const touch = React.useRef({ hold: null as ReturnType<typeof setTimeout> | null, fired: false, lastTap: 0, x: 0, y: 0, isTouch: false });
  const cancelHold = () => { if (touch.current.hold) { clearTimeout(touch.current.hold); touch.current.hold = null; } };
  const open = () => { pop.close(); openNote(id); };
  const shown = columns;
  return (
    <>
      <button ref={pop.anchorRef as React.RefObject<HTMLButtonElement>} type="button" draggable onDragStart={dragRow(id)}
        aria-label={n.name || "Untitled"}
        className={`relative rounded-lg p-0.5 border-2 transition-transform hover:scale-105 select-none touch-manipulation ${pop.open ? "scale-105" : ""}`}
        style={{ borderColor: pop.open ? (accent ?? "#d4a24c") : "transparent", WebkitTouchCallout: "none" }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") pop.show(); }}
        onPointerLeave={(e) => { cancelHold(); if (e.pointerType === "mouse") pop.hideSoon(); }}
        onPointerDown={(e) => {
          touch.current.isTouch = e.pointerType !== "mouse";
          if (!touch.current.isTouch) return;
          touch.current.fired = false; touch.current.x = e.clientX; touch.current.y = e.clientY; cancelHold();
          // Holding it opens the sheet.
          touch.current.hold = setTimeout(() => { touch.current.hold = null; touch.current.fired = true; open(); }, HOLD_OPEN_MS);
        }}
        onPointerMove={(e) => { if (touch.current.hold && Math.hypot(e.clientX - touch.current.x, e.clientY - touch.current.y) > 10) cancelHold(); }}
        onPointerUp={cancelHold} onPointerCancel={cancelHold}
        onContextMenu={(e) => { if (touch.current.isTouch) e.preventDefault(); }}
        onClick={(e) => {
          e.stopPropagation();
          if (!touch.current.isTouch) { open(); return; }
          if (touch.current.fired) { touch.current.fired = false; return; }
          // A second tap straight after the first opens it; one tap shows what it does.
          const now = Date.now();
          if (now - touch.current.lastTap < DOUBLE_TAP_MS) { touch.current.lastTap = 0; open(); return; }
          touch.current.lastTap = now;
          if (pop.pinned) pop.close(); else pop.pin();
        }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open(); } if (e.key === " ") { e.preventDefault(); if (pop.open) pop.close(); else pop.pin(); } }}
        data-testid={`ag-links-icon-${n.name}`}>
        <IconFace note={n} size={size} accent={accent} />
      </button>
      {pop.portal(
        <div className="space-y-2" data-testid={`ag-links-icon-tip-${n.name}`}>
          <div className="flex items-center gap-2">
            <IconFace note={n} size={30} accent={accent} />
            <span className="flex-1 min-w-0 text-sm font-bold text-stone-100 truncate">{n.name || "Untitled"}</span>
            <button type="button" onClick={open} className="h-7 px-2 rounded border border-stone-700 text-[11px] text-stone-300 hover:border-amber-600 hover:text-amber-200 inline-flex items-center gap-1 shrink-0" data-testid="ag-links-icon-open"><ExternalLink className="h-3 w-3" /> Open</button>
            {removeBtn(id)}
          </div>
          <ColumnsDetail id={id} columns={shown} cell={cell} fieldOf={fieldOf} />
        </div>,
        "ag-links-icon-popup",
      )}
    </>
  );
}

function IconsList({ noteId, label, rows, columns, config, look, cell, fieldOf, accentOf, dragRow, removeBtn, mayAdd, onAdd, search, empty }: {
  noteId: string; label: string; rows: string[]; columns: AgLinkColumn[]; config: AgLinksConfig; look?: AgLook; cell: CellFn;
  fieldOf: (id: string, ref: string) => AgField | undefined; accentOf: (id: string) => string | undefined;
  dragRow: (id: string) => (e: React.DragEvent) => void; removeBtn: (id: string) => React.ReactNode;
  mayAdd: boolean; onAdd: () => void; search: { q: string; setQ: (q: string) => void } | null; empty: React.ReactNode;
}) {
  const { state, openNote } = useAg();
  const [expanded, setExpandedHere] = useExpanded(expandedKey(noteId, label));
  const size = Math.max(24, Math.min(96, config.iconSize ?? 40));
  const shown = columns;
  const asPage = config.expand === "page";
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {search && (
          <div className="relative flex-1 min-w-[120px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
            <input value={search.q} onChange={(e) => search.setQ(e.target.value)} placeholder="Search…" className="w-full h-7 pl-7 pr-2 rounded-md bg-stone-900 border border-stone-700 text-xs text-stone-100" data-testid="ag-links-search" />
          </div>
        )}
        {!expanded && (
          <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0" data-testid="ag-links-icons">
            {rows.map((id) => <IconTile key={id} id={id} columns={columns} cell={cell} fieldOf={fieldOf} accent={accentOf(id)} dragRow={dragRow} removeBtn={removeBtn} size={size} />)}
            {empty}
          </div>
        )}
        <span className={`inline-flex items-center gap-1 shrink-0 ${expanded ? "ml-auto" : ""}`}>
          {rows.length > 0 && (
            <button type="button" onClick={() => setExpandedHere(!expanded)} aria-pressed={expanded}
              className={`h-7 px-2 rounded-md border text-[11px] inline-flex items-center gap-1 ${expanded ? "border-amber-600 bg-amber-600/15 text-amber-200" : "border-stone-700 bg-stone-900 text-stone-300 hover:border-amber-700"}`}
              title={expanded ? "Back to icons" : "Show every one in full (just for you, on this device)"} data-testid="ag-links-expand">
              {expanded ? <><Minimize2 className="h-3.5 w-3.5" /> Icons</> : <><Maximize2 className="h-3.5 w-3.5" /> Show all</>}
            </button>
          )}
          {mayAdd && <button type="button" onClick={onAdd} className="h-7 px-2.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[11px] inline-flex items-center gap-1" data-testid="ag-links-add"><Plus className="h-3.5 w-3.5" /> Add</button>}
        </span>
      </div>
      {expanded && (
        <div className="space-y-2" data-testid="ag-links-expanded">
          {rows.map((id) => {
            const n = state.notes.get(id)!;
            const accent = accentOf(id);
            return (
              <div key={id} draggable onDragStart={dragRow(id)} className="rounded-lg bg-stone-900/80 border p-2.5 space-y-2" style={{ borderColor: accent ?? look?.border ?? "#44403c" }} data-testid={`ag-links-row-${n.name}`}>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openNote(id)} className="shrink-0" title="Open"><IconFace note={n} size={32} accent={accent} /></button>
                  <button type="button" onClick={() => openNote(id)} className="flex-1 min-w-0 text-left text-sm font-semibold text-stone-100 truncate hover:text-amber-200">{n.name || "Untitled"}</button>
                  {removeBtn(id)}
                </div>
                {asPage ? <EmbeddedPage note={n} /> : <ColumnsDetail id={id} columns={shown} cell={cell} fieldOf={fieldOf} />}
              </div>
            );
          })}
          {empty}
        </div>
      )}
    </>
  );
}

/** A row's name; double-click (long-press) to rename it, for whoever may. */
function RowName({ note }: { note: AgNote }) {
  const { request } = useAg();
  const { canEditHeader } = usePerms(note.id);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  if (editing) {
    // Leaving the box (or Enter) saves; the wrapper hears the blur after the input commits.
    return <span data-no-open onClick={(e) => e.stopPropagation()} onBlur={() => setTimeout(() => setEditing(false), 0)}><CommitInput autoFocus value={note.name} className="h-7 w-44 bg-stone-950 border border-amber-600 rounded px-1.5 text-sm text-stone-100"
      onCommit={(v) => { setEditing(false); if (v.trim() && v !== note.name) request({ op: "note.update", id: note.id, patch: { name: v.trim() } }).catch((e: any) => toast({ title: "Couldn't rename it", description: e.message, variant: "destructive" })); }}
      /></span>;
  }
  return (
    <span className="text-sm font-semibold text-stone-100 truncate" title={canEditHeader ? "Double-click to rename" : undefined}
      onDoubleClick={canEditHeader ? (e) => { e.stopPropagation(); setEditing(true); } : undefined}
      onTouchStart={canEditHeader ? () => { cancel(); timer.current = setTimeout(() => setEditing(true), 500); } : undefined}
      onTouchEnd={cancel} onTouchMove={cancel}>{note.name || "Untitled"}</span>
  );
}

/** A yes/no value as a button: "Equip" / "Equipped". */
function ToggleCell({ field, label }: { field: AgField; label: string }) {
  const { canEditField } = usePerms(field.noteId);
  const w = useFieldWriter();
  const on = !!effOf(field);
  const editable = canEditField(field);
  return (
    <button type="button" disabled={!editable} onClick={(e) => { e.stopPropagation(); w.set(field, !on); }}
      className={`h-8 px-2.5 rounded-md border text-xs font-medium shrink-0 disabled:cursor-default ${on ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-stone-700 bg-stone-900 text-stone-300 hover:border-amber-700"}`}
      data-testid={`ag-toggle-${field.key}`}>
      {on ? `✓ ${label}` : label}
    </button>
  );
}

// --------------------------------------------------------------------------- settings
export interface LinksSettings { label: string; columns: Array<string | AgLinkColumn>; config?: AgLinksConfig }

const DISPLAYS: Array<[NonNullable<AgLinkColumn["display"]>, string]> = [["input", "Editable"], ["value", "Value"], ["badge", "Badge"], ["bar", "Bar"], ["toggle", "On/off button"], ["text", "Text (in full)"], ["button", "Its button (by name)"], ["rolls", "Its rolls (all shown ones)"], ["effects", "Its effects (what it changes)"], ["connection", "Sheets it's connected to (tags)"]];

/** Everything a connections table can do, in one panel. */
export function LinksConfigEditor({ noteId, value, onChange }: { noteId: string; value: LinksSettings; onChange: (v: LinksSettings) => void }) {
  const { state } = useAg();
  const cfg = value.config ?? {};
  const cols = value.columns.map(normCol);
  const setCfg = (p: Partial<AgLinksConfig>) => onChange({ ...value, config: { ...cfg, ...p } });
  const setCols = (c: AgLinkColumn[]) => onChange({ ...value, columns: c });
  // Keys offered for columns: whatever the connected sheets (or any sheet of the add kinds) have.
  const keys = useMemo(() => {
    const ids = new Set(follow(state, noteId, value.label));
    const types = cfg.add?.types ?? [];
    const out = new Map<string, string>();
    for (const f of Array.from(state.fields.values())) {
      const n = state.notes.get(f.noteId);
      if (!n) continue;
      if (ids.has(n.id) || types.includes(n.type)) out.set(f.key, f.label);
    }
    return Array.from(out.entries());
  }, [state, noteId, value.label, cfg.add?.types]);
  const labels = useMemo(() => {
    const set = new Set<string>();
    for (const l of Array.from(state.links.values())) { if (l.fromNoteId === noteId) set.add(l.label); if (l.toNoteId === noteId) set.add(l.reverseLabel); }
    return Array.from(set);
  }, [state.links, noteId]);
  const types = Array.from(new Set([...AG_BUILTIN_TYPES.map((t) => t.id), ...Array.from(state.notes.values()).map((n) => n.type)]));
  const row = (label: string, el: React.ReactNode) => <div className="flex items-center gap-1.5"><span className="text-[11px] text-stone-400 w-20 shrink-0">{label}</span><div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">{el}</div></div>;
  const keySelect = (v: string | undefined, onSel: (k: string) => void, none = "(none)") => (
    <select value={v ?? ""} onChange={(e) => onSel(e.target.value)} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs max-w-[170px]">
      <option value="">{none}</option>
      {cols.map((c) => <option key={c.ref} value={c.ref}>{c.label || keys.find(([k]) => k === c.ref)?.[1] || c.ref}</option>)}
    </select>
  );
  return (
    <div className="space-y-2 text-stone-200" data-testid="ag-links-config">
      {row("Connection", <>
        <input list="ag-link-labels-cfg" value={value.label} placeholder="e.g. items" onChange={(e) => onChange({ ...value, label: e.target.value.toLowerCase().replace(/[^a-z0-9_.*+]/g, "_") })} className="h-7 flex-1 min-w-[120px] bg-stone-900 border border-stone-700 rounded px-1.5 text-xs font-mono" data-testid="ag-links-label" />
        <datalist id="ag-link-labels-cfg">{labels.map((l) => <option key={l} value={l} />)}</datalist>
      </>)}
      {row("Show as", (
        <span className="inline-flex rounded border border-stone-700 overflow-hidden">
          <button type="button" onClick={() => setCfg({ layout: "table" })} className={`h-7 px-2 text-xs inline-flex items-center gap-1 ${cfg.layout !== "cards" ? "bg-amber-600/40 text-amber-100" : "text-stone-400"}`}><TableIcon className="h-3.5 w-3.5" /> Table</button>
          <button type="button" onClick={() => setCfg({ layout: "cards" })} className={`h-7 px-2 text-xs inline-flex items-center gap-1 ${cfg.layout === "cards" ? "bg-amber-600/40 text-amber-100" : "text-stone-400"}`} data-testid="ag-links-cards"><LayoutList className="h-3.5 w-3.5" /> Item cards</button>
          <button type="button" onClick={() => setCfg({ layout: "icons" })} className={`h-7 px-2 text-xs inline-flex items-center gap-1 ${cfg.layout === "icons" ? "bg-amber-600/40 text-amber-100" : "text-stone-400"}`} data-testid="ag-links-icons-layout"><Grid3x3 className="h-3.5 w-3.5" /> Icons</button>
        </span>
      ))}
      {cfg.layout === "icons" && <>
        <div className="text-[10px] text-stone-500">A small picture per sheet (its initials when it has none). Hover one — tap on a phone — for its columns below, rolls and all; click it (double-tap or hold on a phone) to open it. <b>Show all</b> lays them out in full, for each viewer on their own device.</div>
        {row("Show all", (
          <select value={cfg.expand ?? "columns"} onChange={(e) => setCfg({ expand: e.target.value as "columns" | "page" })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs" data-testid="ag-links-expand-mode">
            <option value="columns">Their columns</option>
            <option value="page">Each one's whole page</option>
          </select>
        ))}
        {row("Icon size", <><input type="range" min={24} max={96} value={cfg.iconSize ?? 40} onChange={(e) => setCfg({ iconSize: Number(e.target.value) })} className="flex-1 accent-amber-500" /><span className="text-[11px] text-stone-400 w-8">{cfg.iconSize ?? 40}px</span></>)}
      </>}

      <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1">Columns (values on each connected sheet)</div>
      <datalist id="ag-link-keys">{keys.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</datalist>
      {cols.map((c, i) => (
        <div key={i} className="rounded border border-stone-800 bg-stone-950/50 p-1.5 space-y-1">
          <div className="flex items-center gap-1">
            <input list={c.display === "button" ? undefined : "ag-link-keys"} value={c.ref} placeholder={c.display === "button" ? "button name, e.g. Use" : "value key, e.g. weight"} onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, ref: x.display === "button" ? e.target.value.slice(0, 60) : e.target.value.toLowerCase().replace(/[^a-z0-9_.@]/g, "") } : x)))} className="h-7 w-28 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs font-mono" data-testid={`ag-links-col-${i}`} />
            <select value={c.display ?? "input"} onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, display: e.target.value as any } : x)))} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs">
              {DISPLAYS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <input value={c.label ?? ""} placeholder="heading" onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, label: e.target.value || undefined } : x)))} className="h-7 flex-1 min-w-0 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />
            <button type="button" disabled={i === 0} onClick={() => { const n = [...cols]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setCols(n); }} className="h-7 w-6 grid place-items-center text-stone-500 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
            <button type="button" onClick={() => setCols(cols.filter((_, j) => j !== i))} className="h-7 w-6 grid place-items-center text-stone-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
          </div>
          {c.display === "bar" && (
            <div className="flex items-center gap-1 text-[11px] text-stone-400">out of
              <input list="ag-link-keys" value={c.maxRef ?? ""} placeholder="max key, e.g. durability_max" onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, maxRef: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") || undefined } : x)))} className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs font-mono" />
              <input type="color" value={c.color ?? "#22c55e"} onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-6 w-7 bg-transparent" />
            </div>
          )}
          {(!c.display || c.display === "value" || c.display === "input") && (
            <div className="flex items-center gap-1 text-[11px] text-stone-400">after the number
              <input value={c.suffix ?? ""} placeholder="e.g. lbs" onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, suffix: e.target.value || undefined } : x)))} className="h-7 w-20 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setCols([...cols, { ref: "", display: "input" }])} className="h-7 px-2 rounded bg-stone-800 text-xs inline-flex items-center gap-1" data-testid="ag-links-col-add"><Plus className="h-3 w-3" /> Add column</button>

      <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1">Finding things</div>
      {row("Search box", <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!cfg.search} onChange={(e) => setCfg({ search: e.target.checked || undefined })} /> Search, and sort by any column</label>)}
      {row("Sort first by", <select value={cfg.sortBy ?? "name"} onChange={(e) => setCfg({ sortBy: e.target.value })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs"><option value="name">Name</option>{cols.map((c) => <option key={c.ref} value={c.ref}>{c.label || c.ref}</option>)}</select>)}
      {row("Filter chips", keySelect(cfg.filterBy, (k) => setCfg({ filterBy: k || undefined })))}
      {row("Card colour", keySelect(cfg.accentBy, (k) => setCfg({ accentBy: k || undefined }), "(plain)"))}

      <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1">Adding & removing</div>
      {row("Add button", <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!cfg.add} onChange={(e) => setCfg({ add: e.target.checked ? { types: [], reverse: "owner", existing: true } : null })} data-testid="ag-links-add-toggle" /> Show “Add”</label>)}
      {cfg.add && (
        <>
          {row("Kinds", types.map((t) => {
            const on = (cfg.add?.types ?? []).includes(t);
            return <button key={t} type="button" onClick={() => setCfg({ add: { ...cfg.add!, types: on ? cfg.add!.types!.filter((x) => x !== t) : [...(cfg.add!.types ?? []), t] } })} className={`h-7 px-2 rounded-full border text-[11px] ${on ? "border-amber-500 text-amber-200" : "border-stone-700 text-stone-400"}`}>{agTypeLabel(t)}</button>;
          }))}
          {row("New sheets", <label className="text-xs inline-flex items-center gap-1" title="Off: Add only offers sheets that already exist (from the sidebar); nothing new is made in this list.">
            <input type="checkbox" className="accent-amber-500" checked={cfg.add.createNew !== false} onChange={(e) => setCfg({ add: { ...cfg.add!, createNew: e.target.checked ? undefined : false } })} data-testid="ag-links-create-new" /> Add can make new ones from templates
          </label>)}
          {row("Copies", <>
            <label className="text-xs inline-flex items-center gap-1" title="Picked or dragged here, an original gives this sheet its own copy (its own notes); someone's copy moves here instead.">
              <input type="checkbox" className="accent-amber-500" checked={!!cfg.add.copy} onChange={(e) => setCfg({ add: { ...cfg.add!, copy: e.target.checked || undefined, copyFolder: e.target.checked ? (cfg.add!.copyFolder || "Copies") : undefined } })} data-testid="ag-links-copy" /> Give this sheet its own copy
            </label>
            {cfg.add.copy && <input value={cfg.add.copyFolder ?? "Copies"} placeholder="folder" title="The folder copies are kept in (they stay there when taken off, to give again)" onChange={(e) => setCfg({ add: { ...cfg.add!, copyFolder: e.target.value.slice(0, 80) } })} className="h-7 w-40 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" data-testid="ag-links-copy-folder" />}
          </>)}
          {row("They call it", <><input value={cfg.add.reverse ?? "owner"} onChange={(e) => setCfg({ add: { ...cfg.add!, reverse: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } })} className="h-7 w-28 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs font-mono" /><span className="text-[10px] text-stone-500">so their formulas reach this sheet as @{cfg.add.reverse || "owner"}</span></>)}
        </>
      )}
      {row("Remove", <select value={cfg.remove ?? "none"} onChange={(e) => setCfg({ remove: e.target.value as any })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs"><option value="none">No remove button</option><option value="disconnect">Remove from the list (keep the sheet)</option><option value="delete">Delete the sheet</option></select>)}
      <div className="text-[10px] text-stone-500">Players can add from a template only when its Settings allow “Players can add this”, and remove only what they added. The GM can always add and remove.</div>
    </div>
  );
}

export function sumBy(state: ReturnType<typeof useAg>["state"], ids: string[], ref: string) {
  return ids.reduce((s, id) => s + asNumber(effOf(resolveRef(state, id, ref)[0]) as any), 0);
}
export type { AgNote };
