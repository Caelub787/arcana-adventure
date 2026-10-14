// Connections tables — everything connected to a sheet by one name ("items",
// "wounds", "traits"…), shown as a table or as item cards, with search, sort,
// filter chips, inline-editable columns, and Add / Remove. Configured right,
// this is a whole inventory: the rows are real sheets (open one to see it in
// full), their values are live, and equipped items' modifiers reach the owner.
import React, { useMemo, useState } from "react";
import { Plus, Search, X, Trash2, Unlink, ArrowUp, ArrowDown, Package, LayoutList, Table as TableIcon } from "lucide-react";
import type { AgField, AgLinkColumn, AgLinksConfig, AgLook, AgNote } from "@shared/agnostic/types";
import { AG_BUILTIN_TYPES, agTypeLabel } from "@shared/agnostic/types";
import { formatValue, asNumber } from "@shared/agnostic/formula";
import { useToast } from "@/hooks/use-toast";
import { useAg, follow, resolveRef, effOf, usePerms } from "./hooks";
import { Portrait, FieldInput, ResourceBar, useFieldWriter } from "./widgets";
import { AgSelector, agConfirm, type SelItem } from "./float";

export const normCol = (c: string | AgLinkColumn): AgLinkColumn => (typeof c === "string" ? { ref: c } : c);

function colLabel(c: AgLinkColumn, sample?: AgField) {
  return c.label || sample?.label || c.ref.replace(/_/g, " ");
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
  const ids = follow(state, noteId, label);
  const fieldOf = (id: string, ref: string) => resolveRef(state, id, ref)[0];
  const sortVal = (id: string) => (sort === "name" ? (state.notes.get(id)?.name ?? "").toLowerCase() : (() => { const v = effOf(fieldOf(id, sort)); return typeof v === "number" ? v : String(v ?? "").toLowerCase(); })());
  const chipValues = config.filterBy ? Array.from(new Set(ids.map((id) => String(effOf(fieldOf(id, config.filterBy!)) ?? "")).filter(Boolean))).sort() : [];
  const chipColor = (v: string) => (config.filterBy ? ids.map((id) => fieldOf(id, config.filterBy!)).find((f) => f?.options.choiceColors?.[v])?.options.choiceColors?.[v] : undefined);
  const rows = ids
    .filter((id) => !q.trim() || (state.notes.get(id)?.name ?? "").toLowerCase().includes(q.trim().toLowerCase()))
    .filter((id) => !chip || String(effOf(fieldOf(id, config.filterBy!)) ?? "") === chip)
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

  const openAdd = async () => {
    try {
      const types = config.add?.types?.length ? config.add.types : undefined;
      const { templates } = await request<{ templates: Array<{ id: string; name: string; type: string; portrait: string | null; description: string | null }> }>({ op: "note.creatableTemplates", types });
      const items: SelItem[] = templates.map((t) => ({ id: `t:${t.id}`, name: t.name, image: t.portrait, group: "New", sub: t.description || `New ${agTypeLabel(t.type)}`, badge: agTypeLabel(t.type), icon: <Package className="h-4 w-4" /> }));
      if (viewer.isGM && config.add?.existing !== false) {
        for (const n of Array.from(state.notes.values())) {
          if (n.isTemplate || n.id === noteId || ids.includes(n.id) || (types && !types.includes(n.type))) continue;
          items.push({ id: `n:${n.id}`, name: n.name || "Untitled", image: n.portrait, group: "Existing sheets", sub: `Connect this ${agTypeLabel(n.type).toLowerCase()}`, badge: agTypeLabel(n.type) });
        }
        if (types) for (const t of types) items.push({ id: `b:${t}`, name: `Blank ${agTypeLabel(t)}`, group: "New", sub: "An empty sheet to fill in", icon: <Plus className="h-4 w-4" /> });
      }
      setAdding(items);
    } catch (e: any) { toast({ title: "Couldn't load", description: e.message, variant: "destructive" }); }
  };
  const pick = async (id: string) => {
    const reverse = config.add?.reverse || "owner";
    try {
      if (id.startsWith("n:")) await request({ op: "link.create", fromNoteId: id.slice(2), toNoteId: noteId, label: reverse, reverseLabel: label });
      else if (id.startsWith("t:")) await request({ op: "note.createLinked", hostNoteId: noteId, templateId: id.slice(2), label, reverseLabel: reverse });
      else if (id.startsWith("b:")) await request({ op: "note.createLinked", hostNoteId: noteId, type: id.slice(2), name: `New ${agTypeLabel(id.slice(2))}`, label, reverseLabel: reverse });
      toast({ title: "Added" });
    } catch (e: any) { toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }); }
  };
  const remove = (id: string) => {
    const n = state.notes.get(id);
    const del = removeMode === "delete";
    agConfirm(del ? `“${n?.name}” is deleted for everyone.` : `“${n?.name}” stays as a sheet, just no longer connected here.`, { title: del ? `Delete “${n?.name}”?` : `Remove “${n?.name}” from this list?`, confirm: del ? "Delete" : "Remove" })
      .then((ok) => ok && request({ op: "note.removeLinked", hostNoteId: noteId, noteId: id, mode: del ? "delete" : "disconnect" }).catch((e: any) => toast({ title: "Couldn't remove it", description: e.message, variant: "destructive" })));
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
      {mayAdd && <button type="button" onClick={openAdd} className="ml-auto h-8 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1" data-testid="ag-links-add"><Plus className="h-3.5 w-3.5" /> Add</button>}
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
    const f = fieldOf(id, c.ref);
    if (!f) return <span className="text-stone-600">—</span>;
    const display = c.display ?? "input";
    if (display === "bar") {
      const m = c.maxRef ? fieldOf(id, c.maxRef) : undefined;
      return <span className="inline-block align-middle" style={{ width: compact ? 72 : 110 }}><ResourceBar field={f} maxField={m} color={c.color ?? "#22c55e"} height={compact ? 8 : 12} showNumbers={!compact} compact /></span>;
    }
    if (display === "badge") {
      const v = effOf(f);
      if (v === null || v === "") return null;
      const col = f.options.choiceColors?.[String(v)] ?? c.color ?? "#a8a29e";
      return <span className="inline-flex items-center px-1.5 py-px rounded-full border text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: col, color: col, background: `color-mix(in srgb, ${col} 12%, transparent)` }}>{formatValue(v)}{c.suffix ? ` ${c.suffix}` : ""}</span>;
    }
    if (display === "toggle") return <ToggleCell field={f} label={colLabel(c, f)} />;
    if (display === "value") return <span className="text-stone-200">{formatValue(effOf(f), f.options.decimals)}{c.suffix ? <span className="text-stone-500"> {c.suffix}</span> : null}</span>;
    return <span className="inline-flex items-center gap-1"><FieldInput field={f} />{c.suffix ? <span className="text-stone-500 text-[11px]">{c.suffix}</span> : null}</span>;
  };

  const removeBtn = (id: string) => canRemove(id) && (
    <button type="button" onClick={(e) => { e.stopPropagation(); remove(id); }} className="h-8 w-8 grid place-items-center rounded text-stone-500 hover:text-red-400 hover:bg-red-950/40 shrink-0" title={removeMode === "delete" ? "Delete" : "Remove from this list"} data-testid={`ag-links-remove-${state.notes.get(id)?.name}`}>
      {removeMode === "delete" ? <Trash2 className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
    </button>
  );

  const empty = <div className="px-2 py-3 text-stone-500 text-xs text-center">{ids.length ? "Nothing matches." : config.emptyText || `Nothing connected as “${label}” yet.`}</div>;

  if (config.layout === "cards") {
    const badges = columns.filter((c) => c.display === "badge");
    const stats = columns.filter((c) => !c.display || c.display === "value" || c.display === "input");
    const bars = columns.filter((c) => c.display === "bar");
    const toggles = columns.filter((c) => c.display === "toggle");
    return (
      <div className="space-y-2" style={fontStyle} data-testid="ag-links">
        {toolbar}
        {rows.map((id) => {
          const n = state.notes.get(id)!;
          const accentF = config.accentBy ? fieldOf(id, config.accentBy) : undefined;
          const accent = accentF?.options.choiceColors?.[String(effOf(accentF) ?? "")];
          return (
            <div key={id} role="button" tabIndex={0} onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, select, a, [data-no-open]")) openNote(id); }} onKeyDown={(e) => { if (e.key === "Enter") openNote(id); }}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-stone-900/80 border hover:brightness-110 cursor-pointer" style={{ borderColor: accent ?? look?.border ?? "#44403c" }} data-testid={`ag-links-row-${n.name}`}>
              <Portrait note={n} size={44} radius={8} className="shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-stone-100 truncate">{n.name || "Untitled"}</span>
                  {badges.map((c) => <React.Fragment key={c.ref}>{cell(id, c)}</React.Fragment>)}
                </div>
                {(stats.length > 0 || bars.length > 0) && (
                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-stone-400" data-no-open>
                    {stats.map((c) => <span key={c.ref} className="inline-flex items-center gap-1"><span className="text-stone-500">{colLabel(c, fieldOf(id, c.ref))}</span>{cell(id, c, true)}</span>)}
                    {bars.map((c) => <span key={c.ref} className="inline-flex items-center gap-1"><span className="text-stone-500">{colLabel(c, fieldOf(id, c.ref))}</span>{cell(id, c, true)}</span>)}
                  </div>
                )}
              </div>
              {toggles.map((c) => <span key={c.ref} data-no-open>{cell(id, c)}</span>)}
              {removeBtn(id)}
            </div>
          );
        })}
        {!rows.length && empty}
        {adding && <AgSelector title={`Add to ${label.replace(/_/g, " ")}`} items={adding} onPick={pick} onClose={() => setAdding(null)} keepOpen hint="Click to add; this window stays open so you can add several." emptyText="Nothing to add yet — the GM makes templates for these." testId="ag-links-add-selector" />}
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
              <th className="text-left px-2 py-1 font-medium">{label.replace(/_/g, " ") || "Connected"}</th>
              {columns.map((c) => <th key={c.ref} className="text-left px-2 py-1 font-medium">{colLabel(c, sample ? fieldOf(sample, c.ref) : undefined)}</th>)}
              {removeMode !== "none" && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => {
              const n = state.notes.get(id)!;
              return (
                <tr key={id} className="border-t border-stone-800 hover:bg-stone-800/40" data-testid={`ag-links-row-${n.name}`}>
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
      {adding && <AgSelector title={`Add to ${label.replace(/_/g, " ")}`} items={adding} onPick={pick} onClose={() => setAdding(null)} keepOpen hint="Click to add; this window stays open so you can add several." emptyText="Nothing to add yet — the GM makes templates for these." testId="ag-links-add-selector" />}
    </div>
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

const DISPLAYS: Array<[NonNullable<AgLinkColumn["display"]>, string]> = [["input", "Editable"], ["value", "Value"], ["badge", "Badge"], ["bar", "Bar"], ["toggle", "On/off button"]];

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
        <input list="ag-link-labels-cfg" value={value.label} placeholder="e.g. items" onChange={(e) => onChange({ ...value, label: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} className="h-7 flex-1 min-w-[120px] bg-stone-900 border border-stone-700 rounded px-1.5 text-xs font-mono" data-testid="ag-links-label" />
        <datalist id="ag-link-labels-cfg">{labels.map((l) => <option key={l} value={l} />)}</datalist>
      </>)}
      {row("Show as", (
        <span className="inline-flex rounded border border-stone-700 overflow-hidden">
          <button type="button" onClick={() => setCfg({ layout: "table" })} className={`h-7 px-2 text-xs inline-flex items-center gap-1 ${cfg.layout !== "cards" ? "bg-amber-600/40 text-amber-100" : "text-stone-400"}`}><TableIcon className="h-3.5 w-3.5" /> Table</button>
          <button type="button" onClick={() => setCfg({ layout: "cards" })} className={`h-7 px-2 text-xs inline-flex items-center gap-1 ${cfg.layout === "cards" ? "bg-amber-600/40 text-amber-100" : "text-stone-400"}`} data-testid="ag-links-cards"><LayoutList className="h-3.5 w-3.5" /> Item cards</button>
        </span>
      ))}

      <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1">Columns (values on each connected sheet)</div>
      <datalist id="ag-link-keys">{keys.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</datalist>
      {cols.map((c, i) => (
        <div key={i} className="rounded border border-stone-800 bg-stone-950/50 p-1.5 space-y-1">
          <div className="flex items-center gap-1">
            <input list="ag-link-keys" value={c.ref} placeholder="value key, e.g. weight" onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, ref: e.target.value.toLowerCase().replace(/[^a-z0-9_.@]/g, "") } : x)))} className="h-7 w-28 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs font-mono" data-testid={`ag-links-col-${i}`} />
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
