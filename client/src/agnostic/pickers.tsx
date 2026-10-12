// Small shared controls for the GM: who-can-see / who-can-edit pickers,
// field reference pickers, colour inputs.
import React, { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, Pencil, Users } from "lucide-react";
import type { AgAcl, AgAudience, AgAudienceOrInherit } from "@shared/agnostic/types";
import { describeAudience } from "@shared/agnostic/acl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAg, useMemberName } from "./hooks";
import { useRefOptions } from "./widgets";

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
  const opts: Array<[AgAudienceOrInherit, string]> = [
    ...(allowInherit ? [["inherit", "Same as sheet"] as [AgAudienceOrInherit, string]] : []),
    ["everyone", "Everyone"], ["owners", "Owners + GM"], ["gm", "GM only"],
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="h-8 sm:h-7 px-2 rounded border border-stone-700 bg-stone-900 text-xs text-stone-200 inline-flex items-center gap-1.5 max-w-full" data-testid={`ag-audience-${label ?? "x"}`}>
          {icon}{label && <span className="text-stone-400">{label}</span>}
          <span className="truncate">{describeAudience(value, memberName)}</span>
          <ChevronDown className="h-3 w-3 text-stone-500 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5 bg-stone-900 border-stone-700" align="start">
        {opts.map(([v, text]) => (
          <button key={String(v)} type="button" onClick={() => choose(v)} className="w-full flex items-center gap-2 px-2 h-8 rounded hover:bg-stone-800 text-sm text-stone-200">
            <span className="w-4">{value === v && <Check className="h-3.5 w-3.5 text-amber-400" />}</span>{text}
          </button>
        ))}
        <div className="border-t border-stone-800 mt-1 pt-1">
          <button type="button" onClick={() => onChange(custom ?? { owners: true, users: [] })} className="w-full flex items-center gap-2 px-2 h-8 rounded hover:bg-stone-800 text-sm text-stone-200">
            <span className="w-4">{custom && <Check className="h-3.5 w-3.5 text-amber-400" />}</span><Users className="h-3.5 w-3.5" /> Specific people…
          </button>
          {custom && (
            <div className="pl-6 pr-1 pb-1 space-y-0.5">
              <label className="flex items-center gap-2 text-sm text-stone-300 h-7"><input type="checkbox" className="accent-amber-500" checked={!!custom.owners} onChange={(e) => onChange({ ...custom, owners: e.target.checked })} /> Owners</label>
              {players.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-sm text-stone-300 h-7"><input type="checkbox" className="accent-amber-500" checked={custom.users.includes(m.userId)} onChange={() => toggleUser(m.userId)} /> {m.name}</label>
              ))}
              {players.length === 0 && <div className="text-xs text-stone-500">No players have joined yet.</div>}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
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

/** Pick a value from this sheet (or a connected one); free text allowed for @paths and $params. */
export function RefPicker({ noteId, value, onChange, params, placeholder = "Pick a value", allowTypes }: {
  noteId: string; value: string | undefined; onChange: (ref: string) => void; params?: string[]; placeholder?: string; allowTypes?: string[];
}) {
  const { state } = useAg();
  const options = useRefOptions(noteId).filter((o) => !allowTypes || allowTypes.includes(o.type));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !s || o.label.toLowerCase().includes(s) || o.ref.includes(s));
  }, [options, q]);
  // Searching also reaches values on any other sheet (linked directly by id).
  const others = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: Array<{ ref: string; label: string }> = [];
    for (const f of Array.from(state.fields.values())) {
      if (f.noteId === noteId || (allowTypes && !allowTypes.includes(f.type))) continue;
      const n = state.notes.get(f.noteId);
      if (!n || n.isTemplate) continue;
      if (!(f.label.toLowerCase().includes(s) || n.name.toLowerCase().includes(s) || f.key.includes(s))) continue;
      out.push({ ref: `@{${n.id}}.${f.key}`, label: `${f.label} — ${n.name}` });
      if (out.length >= 30) break;
    }
    return out;
  }, [q, state, noteId, allowTypes]);
  const absolute = value ? /^@\{([^}]+)\}\.(.+)$/.exec(value) : null;
  const absLabel = absolute ? (() => { const n = state.notes.get(absolute[1]); const f = [...Array.from(state.fields.values())].find((x) => x.noteId === absolute[1] && x.key === absolute[2]); return n ? `${f?.label ?? absolute[2]} — ${n.name}` : null; })() : null;
  const current = options.find((o) => o.ref === value) ?? (absLabel ? { ref: value!, label: absLabel } : undefined);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="h-8 sm:h-7 w-full px-2 rounded border border-stone-700 bg-stone-900 text-xs text-left text-stone-200 inline-flex items-center justify-between gap-1">
          <span className="truncate">{current ? current.label : value || <span className="text-stone-500">{placeholder}</span>}</span>
          <ChevronDown className="h-3 w-3 text-stone-500 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5 bg-stone-900 border-stone-700" align="start">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, or type @owner.hp / $param"
          onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { onChange(q.trim()); setOpen(false); setQ(""); } e.stopPropagation(); }}
          className="w-full h-8 px-2 mb-1 rounded bg-stone-800 border border-stone-700 text-sm text-stone-100 outline-none" />
        <div className="max-h-60 overflow-y-auto">
          {(params ?? []).map((p) => (
            <button key={`$${p}`} type="button" onClick={() => { onChange(`$${p}`); setOpen(false); }} className="w-full text-left px-2 h-7 rounded hover:bg-stone-800 text-sm text-sky-300">${p} <span className="text-stone-500 text-xs">parameter</span></button>
          ))}
          {shown.map((o) => (
            <button key={o.ref} type="button" onClick={() => { onChange(o.ref); setOpen(false); setQ(""); }} className="w-full text-left px-2 py-1 rounded hover:bg-stone-800 text-sm text-stone-200">
              {o.label} <span className="text-[10px] text-stone-500 font-mono">{o.ref}</span>
            </button>
          ))}
          {others.length > 0 && <div className="text-[10px] uppercase tracking-wide text-stone-500 px-2 pt-1.5">Other sheets</div>}
          {others.map((o) => (
            <button key={o.ref} type="button" onClick={() => { onChange(o.ref); setOpen(false); setQ(""); }} className="w-full text-left px-2 py-1 rounded hover:bg-stone-800 text-sm text-stone-200">{o.label}</button>
          ))}
          {!shown.length && !others.length && !params?.length && <div className="text-xs text-stone-500 p-2">No values yet — add fields to this sheet first, search another sheet's values, or type a reference and press Enter.</div>}
        </div>
      </PopoverContent>
    </Popover>
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
