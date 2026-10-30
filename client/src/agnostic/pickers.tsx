// Small shared controls for the GM: who-can-see / who-can-edit pickers,
// field reference pickers, colour inputs.
import React, { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, Pencil, Users, Puzzle, Hash } from "lucide-react";
import type { AgAcl, AgAudience, AgAudienceOrInherit, AgNote } from "@shared/agnostic/types";
import { agTypeLabel } from "@shared/agnostic/types";
import { describeAudience } from "@shared/agnostic/acl";
import { useAg, useMemberName } from "./hooks";
import { useRefOptions } from "./widgets";
import { AgPanel, PickField, type SelItem } from "./float";

export function AudienceSelect({ value, onChange, allowInherit = true, label, icon }: {
  value: AgAudienceOrInherit; onChange: (v: AgAudienceOrInherit) => void; allowInherit?: boolean; label?: string; icon?: React.ReactNode;
}) {
  const { state } = useAg();
  const memberName = useMemberName();
  const players = state.members.filter((m) => m.role !== "gm");
  const custom = typeof value === "object" ? value : null;
  const [open, setOpen] = useState(false);
  const choose = (v: AgAudienceOrInherit) => { onChange(v); if (typeof v !== "object") setOpen(false); };
  const toggleUser = (id: string) => {
    const cur = custom ?? { owners: false, users: [] };
    const users = cur.users.includes(id) ? cur.users.filter((u) => u !== id) : [...cur.users, id];
    onChange({ ...cur, users });
  };
  const opts: Array<[AgAudienceOrInherit, string, string]> = [
    ...(allowInherit ? [["inherit", "Same as sheet", "Follow the sheet's own setting"] as [AgAudienceOrInherit, string, string]] : []),
    ["everyone", "Everyone", "Every player in the campaign"], ["owners", "Owners + GM", "The sheet's owners"], ["gm", "GM only", "Only you"],
  ];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-8 sm:h-7 px-2 rounded border border-stone-700 bg-stone-900 text-xs text-stone-200 inline-flex items-center gap-1.5 max-w-full" data-testid={`ag-audience-${label ?? "x"}`}>
        {icon}{label && <span className="text-stone-400">{label}</span>}
        <span className="truncate">{describeAudience(value, memberName)}</span>
        <ChevronDown className="h-3 w-3 text-stone-500 shrink-0" />
      </button>
      {open && (
        <AgPanel title={label === "See" ? "Who can see it" : label ? `Who can ${label.toLowerCase()} it` : "Who"} onClose={() => setOpen(false)} width={340} height={460} testId="ag-audience-panel">
          <div className="space-y-1">
            {opts.map(([v, text, sub]) => (
              <button key={String(v)} type="button" onClick={() => choose(v)} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left ${value === v ? "bg-amber-900/25 border-amber-600" : "bg-stone-800 border-stone-700 hover:border-amber-700"}`}>
                <span className="w-4">{value === v && <Check className="h-3.5 w-3.5 text-amber-400" />}</span>
                <span><span className="block text-sm text-stone-100">{text}</span><span className="block text-[11px] text-stone-400">{sub}</span></span>
              </button>
            ))}
            <button type="button" onClick={() => onChange(custom ?? { owners: true, users: [] })} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left ${custom ? "bg-amber-900/25 border-amber-600" : "bg-stone-800 border-stone-700 hover:border-amber-700"}`}>
              <span className="w-4">{custom && <Check className="h-3.5 w-3.5 text-amber-400" />}</span><Users className="h-3.5 w-3.5" /><span className="text-sm text-stone-100">Specific people…</span>
            </button>
          </div>
          {custom && (
            <div className="space-y-1 pl-2">
              <label className="flex items-center gap-2 text-sm text-stone-300 h-8"><input type="checkbox" className="accent-amber-500" checked={!!custom.owners} onChange={(e) => onChange({ ...custom, owners: e.target.checked })} /> Owners</label>
              {players.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-sm text-stone-300 h-8"><input type="checkbox" className="accent-amber-500" checked={custom.users.includes(m.userId)} onChange={() => toggleUser(m.userId)} /> {m.name}</label>
              ))}
              {players.length === 0 && <div className="text-xs text-stone-500">No players have joined yet.</div>}
            </div>
          )}
        </AgPanel>
      )}
    </>
  );
}

/** "Who can see" + "who can edit" side by side. */
export function AclEditor({ acl, onChange, allowInherit = true, editLabel = "Edit" }: { acl: AgAcl; onChange: (a: AgAcl) => void; allowInherit?: boolean; editLabel?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <AudienceSelect label="See" icon={<Eye className="h-3 w-3 text-stone-400" />} value={acl.view} allowInherit={allowInherit} onChange={(view) => onChange({ ...acl, view })} />
      <AudienceSelect label={editLabel} icon={<Pencil className="h-3 w-3 text-stone-400" />} value={acl.edit} allowInherit={allowInherit} onChange={(edit) => onChange({ ...acl, edit })} />
    </div>
  );
}

/** Pick a value from this sheet, a connected one, any other sheet, or a $parameter; or type a reference. */
export function RefPicker({ noteId, value, onChange, params, placeholder = "Pick a value", allowTypes }: {
  noteId: string; value: string | undefined; onChange: (ref: string) => void; params?: string[]; placeholder?: string; allowTypes?: string[];
}) {
  const { state } = useAg();
  const options = useRefOptions(noteId).filter((o) => !allowTypes || allowTypes.includes(o.type));
  const items = useMemo<SelItem[]>(() => {
    const out: SelItem[] = [];
    for (const p of params ?? []) out.push({ id: `$${p}`, name: `$${p}`, mono: true, group: "Parameters", icon: <Puzzle className="h-4 w-4 text-sky-300" />, sub: `Parameter — left unconnected it uses the sheet's “${p}”` });
    for (const o of options) out.push({ id: o.ref, name: o.label, sub: o.ref, badge: o.type, group: o.via ? "Connected" : "This sheet", words: o.ref, icon: <Hash className="h-4 w-4" /> });
    for (const f of Array.from(state.fields.values())) {
      if (f.noteId === noteId || (allowTypes && !allowTypes.includes(f.type))) continue;
      const n = state.notes.get(f.noteId);
      if (!n || n.isTemplate) continue;
      out.push({ id: `@{${n.id}}.${f.key}`, name: f.label, sub: n.name || "Untitled", image: n.portrait, badge: f.type, group: "Other sheets", words: `${n.name} ${f.key}` });
    }
    return out;
  }, [options, params, state, noteId, allowTypes]);
  const absolute = value ? /^@\{([^}]+)\}\.(.+)$/.exec(value) : null;
  const absLabel = absolute ? (() => { const n = state.notes.get(absolute[1]); const f = Array.from(state.fields.values()).find((x) => x.noteId === absolute[1] && x.key === absolute[2]); return n ? `${f?.label ?? absolute[2]} — ${n.name}` : null; })() : null;
  return (
    <PickField
      value={value ?? ""} items={items} onChange={onChange} title="Choose a value" placeholder={placeholder} display={absLabel ?? value}
      freeText={(q) => (/^[@$]/.test(q) ? q.toLowerCase() : null)}
      hint={<>Or type a reference and press Enter, e.g. <span className="font-mono text-sky-300">@owner.hp</span> or <span className="font-mono text-sky-300">@target.hp</span>.</>}
      emptyText="No values yet — add some in the sheet's Values tab."
      testId="ag-ref-picker"
    />
  );
}

export function ColorInput({ value, onChange, title = "Colour" }: { value: string | undefined; onChange: (c: string) => void; title?: string }) {
  return (
    <label className="inline-flex items-center gap-1 h-8 sm:h-7 px-1.5 rounded border border-stone-700 bg-stone-900 cursor-pointer" title={title}>
      <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} className="h-5 w-6 bg-transparent border-0 p-0 cursor-pointer" />
    </label>
  );
}

function toHex(c: string | undefined) {
  if (!c) return "#f59e0b";
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  return "#f59e0b";
}

export const audienceName = (a: AgAudience) => describeAudience(a);

// --- choosers for lists that grow (components, sheets, players) -------------------------
export function ComponentPicker({ value, onChange, testId = "ag-component-picker" }: { value: string; onChange: (id: string) => void; testId?: string }) {
  const { state } = useAg();
  const items = useMemo<SelItem[]>(() => Array.from(state.components.values()).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({
    id: c.id, name: c.name, icon: <Puzzle className="h-4 w-4" />, words: c.params.join(" "),
    sub: c.params.length ? c.params.map((p) => `$${p}`).join("  ") : "No parameters",
  })), [state.components]);
  return <PickField value={value} items={items} onChange={onChange} title="Choose a component" placeholder="Choose a component…" emptyText="No components yet — make one with the Components button at the top of Sheets." testId={testId} />;
}

export function noteItems(notes: AgNote[]): SelItem[] {
  // A sheet you only have because it's on the player tracker isn't yours to
  // pick, connect or put anywhere: it's a card to watch.
  return notes.filter((n) => !n.trackerOnly).slice().sort((a, b) => a.name.localeCompare(b.name)).map((n) => ({
    id: n.id, name: n.name || "Untitled", image: n.portrait, group: agTypeLabel(n.type),
    sub: n.isTemplate ? `${agTypeLabel(n.type)} template · v${n.templateMeta?.version ?? 1}` : agTypeLabel(n.type),
  }));
}

export function NotePicker({ value, onChange, notes, title = "Choose a sheet", placeholder = "Choose a sheet…", noneLabel, testId = "ag-note-picker" }: {
  value: string; onChange: (id: string) => void; notes: AgNote[]; title?: string; placeholder?: string; noneLabel?: string; testId?: string;
}) {
  const items = useMemo(() => noteItems(notes), [notes]);
  return <PickField value={value} items={items} onChange={onChange} title={title} placeholder={placeholder} noneLabel={noneLabel} emptyText="No sheets yet." testId={testId} />;
}

/** Players (for "view as"). Empty value = the GM's own view. */
export function MemberPicker({ value, onChange, noneLabel = "Viewing as GM", title = "View as…", testId }: { value: string; onChange: (id: string) => void; noneLabel?: string; title?: string; testId?: string }) {
  const { state } = useAg();
  const items = useMemo<SelItem[]>(() => state.members.filter((m) => m.role !== "gm").map((m) => ({ id: m.userId, name: m.name, icon: <Users className="h-4 w-4" />, sub: "See everything exactly as this player does" })), [state.members]);
  return <PickField value={value} items={items} onChange={onChange} title={title} noneLabel={noneLabel} placeholder={noneLabel} display={null} testId={testId} />;
}
