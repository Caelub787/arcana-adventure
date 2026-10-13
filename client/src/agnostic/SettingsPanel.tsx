// Sheet settings (GM): permissions, owners, type, battlemap bars, actions,
// template (locked, with confirmed switching + undo), versions, copies.
import React, { useEffect, useState } from "react";
import { Lock, History, RotateCcw, Save, Copy, Trash2, Plus, Library, Dices, Pencil, RefreshCw, AlertTriangle } from "lucide-react";
import type { AgAcl, AgTokenBar, AgVersionMeta } from "@shared/agnostic/types";
import { AG_BUILTIN_TYPES, agTypeLabel } from "@shared/agnostic/types";
import { useToast } from "@/hooks/use-toast";
import { AgPanel, AgSelector, agConfirm } from "./float";
import { useAuth } from "@/lib/AuthContext";
import { agClient } from "./client";
import { useAg, usePerms } from "./hooks";
import { AclEditor, ColorInput, RefPicker, noteItems } from "./pickers";
import { LookButton } from "./look";
import { ActionEditorDialog } from "./ActionEditor";
import { pushUndo } from "./undo";

const Section = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <section className="space-y-2">
    <div className="text-xs uppercase tracking-wide text-amber-400/90 flex items-center gap-1">{icon}{title}</div>
    {children}
  </section>
);

export function SettingsPanel({ noteId, onDeleted }: { noteId: string; onDeleted: () => void }) {
  const { state, request, scope } = useAg();
  const { note } = usePerms(noteId);
  const { toast } = useToast();
  const { user } = useAuth() as any;
  if (!note) return null;
  const update = (patch: any) => request({ op: "note.update", id: noteId, patch }).catch((e) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  const players = state.members.filter((m) => m.role !== "gm");
  const types = [...Array.from(new Set([...AG_BUILTIN_TYPES.map((t) => t.id), ...[...Array.from(state.notes.values())].map((n) => n.type)]))];

  return (
    <div className="p-3 space-y-5 text-stone-200" data-testid="ag-settings-panel">
      <Section title="Who can see this sheet">
        <div className="space-y-1.5">
          <div className="text-[11px] text-stone-400">Name & portrait</div>
          <AclEditor acl={note.acl} allowInherit={false} onChange={(acl: AgAcl) => update({ acl })} editLabel="Rename" />
          <div className="text-[11px] text-stone-400 pt-1">The rest of the sheet</div>
          <AclEditor acl={note.bodyAcl} onChange={(bodyAcl: AgAcl) => update({ bodyAcl })} />
          <div className="text-[10px] text-stone-500">Every value, section and button can narrow this further.{note.isTemplate ? " Sheets made from this template start with these settings (the template itself is only ever visible to you)." : ""}</div>
        </div>
      </Section>

      {scope.kind === "campaign" && (
        <Section title="Owners">
          <div className="flex flex-wrap gap-1.5">
            {players.map((m) => {
              const on = note.ownerIds.includes(m.userId);
              return (
                <button key={m.userId} type="button" onClick={() => update({ ownerIds: on ? note.ownerIds.filter((x) => x !== m.userId) : [...note.ownerIds, m.userId] })}
                  className={`h-8 px-2.5 rounded-full border text-xs ${on ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-stone-700 text-stone-300"}`} data-testid={`ag-owner-${m.name}`}>{m.name}</button>
              );
            })}
            {!players.length && <span className="text-xs text-stone-500">No players have joined yet.</span>}
          </div>
        </Section>
      )}

      <Section title="Kind & folder">
        <div className="flex flex-wrap gap-1.5">
          <input list="ag-types" defaultValue={note.type} onBlur={(e) => e.target.value !== note.type && update({ type: e.target.value })} className="h-8 w-36 bg-stone-900 border border-stone-700 rounded px-2 text-sm" />
          <datalist id="ag-types">{types.map((t) => <option key={t} value={t}>{agTypeLabel(t)}</option>)}</datalist>
          <input defaultValue={note.folder ?? ""} placeholder="Folder (optional)" onBlur={(e) => (e.target.value || null) !== note.folder && update({ folder: e.target.value || null })} className="h-8 flex-1 min-w-[120px] bg-stone-900 border border-stone-700 rounded px-2 text-sm" />
        </div>
      </Section>

      <TokenBarsSection noteId={noteId} bars={note.tokenBars} onChange={(tokenBars) => update({ tokenBars })} />
      <ActionsSection noteId={noteId} />
      {note.isTemplate ? <TemplateSection noteId={noteId} /> : <TemplateLockSection noteId={noteId} />}
      <VersionsSection noteId={noteId} />

      <Section title="Copies">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => request<{ noteId: string }>({ op: "note.duplicate", id: noteId }).then(() => toast({ title: "Duplicated" }))} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
          {scope.kind !== "library" && user && (
            <button type="button" onClick={() => agClient.request({ kind: "library", id: user.id }, { op: "note.copyFrom", sourceNoteId: noteId, sourceScope: scope }).then(() => toast({ title: "Saved to My Library" })).catch((e) => toast({ title: "Couldn't copy", description: e.message, variant: "destructive" }))}
              className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs inline-flex items-center gap-1" data-testid="ag-save-to-library"><Library className="h-3.5 w-3.5" /> Save to My Library</button>
          )}
          <button type="button" onClick={() => { agConfirm(`Delete “${note.name}” for everyone? Its version history goes too.`, { title: "Delete this sheet?", confirm: "Delete" }).then((ok) => { if (ok) request({ op: "note.delete", id: noteId }).then(onDeleted); }); }} className="h-8 px-2.5 rounded text-xs text-red-300 hover:bg-red-950 inline-flex items-center gap-1 ml-auto" data-testid="ag-note-delete"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>
      </Section>
    </div>
  );
}

function TokenBarsSection({ noteId, bars, onChange }: { noteId: string; bars: AgTokenBar[] | null; onChange: (b: AgTokenBar[] | null) => void }) {
  const { state } = useAg();
  const note = state.notes.get(noteId)!;
  const fallback = state.settings?.tokenBarsByType?.[note.type];
  const list = bars ?? [];
  const set = (i: number, p: Partial<AgTokenBar>) => onChange(list.map((b, j) => (j === i ? { ...b, ...p } : b)));
  return (
    <Section title="Bars on the battlemap">
      <div className="text-[11px] text-stone-500">{bars === null ? `Using the ${agTypeLabel(note.type)} default${fallback?.length ? ` (${fallback.map((b) => b.value).join(", ")})` : " (none)"}.` : "This sheet's own bars."} Values stay linked — changing them on the token changes the sheet.</div>
      {list.map((b, i) => (
        <div key={b.id} className="flex flex-wrap items-center gap-1.5">
          <div className="w-32"><RefPicker noteId={noteId} value={b.value} onChange={(value) => set(i, { value })} /></div>
          <span className="text-[11px] text-stone-500">of</span>
          <div className="w-32"><RefPicker noteId={noteId} value={b.max} placeholder="(no max)" onChange={(max) => set(i, { max })} /></div>
          <ColorInput value={b.color} onChange={(color) => set(i, { color })} />
          <label className="text-[11px] inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!b.showNumbers} onChange={(e) => set(i, { showNumbers: e.target.checked })} />numbers</label>
          <LookButton look={b.look} onChange={(look) => set(i, { look })} kind="tokenBar" title="Bar look: thickness, width, colours, style" />
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onChange([...list, { id: Math.random().toString(36).slice(2, 8), value: "hp", max: "hp_max", color: "#16a34a" }])} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs inline-flex items-center gap-1" data-testid="ag-tokenbar-add"><Plus className="h-3.5 w-3.5" /> Add bar</button>
        {bars !== null && <button type="button" onClick={() => onChange(null)} className="h-8 px-2.5 rounded text-xs text-stone-400 hover:bg-stone-800">Use the default</button>}
      </div>
    </Section>
  );
}

function ActionsSection({ noteId }: { noteId: string }) {
  const { state } = useAg();
  const [editing, setEditing] = useState<string | null | "new">(null);
  const actions = [...Array.from(state.actions.values())].filter((a) => a.noteId === noteId);
  return (
    <Section title="Buttons" icon={<Dices className="h-3.5 w-3.5" />}>
      <div className="space-y-1">
        {actions.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded border border-stone-800 bg-stone-900/60 px-2 py-1">
            <span className="h-3 w-3 rounded-sm" style={{ background: a.color ?? "#92400e" }} />
            <span className="text-sm flex-1 truncate">{a.name}</span>
            <span className="text-[10px] text-stone-500">{a.steps?.length ?? 0} step{a.steps?.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={() => setEditing(a.id)} className="h-7 w-7 grid place-items-center text-stone-400 hover:text-stone-100"><Pencil className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setEditing("new")} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New button action</button>
      <div className="text-[10px] text-stone-500">Put a button on the sheet with Insert → Button, or on a canvas / tracker card.</div>
      {editing && <ActionEditorDialog noteId={noteId} actionId={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </Section>
  );
}

/** Sheets show their template, locked; changing it wipes the sheet (after a confirm) and can be undone. */
function TemplateLockSection({ noteId }: { noteId: string }) {
  const [choosing, setChoosing] = useState(false);
  const { state, request, key } = useAg();
  const { toast } = useToast();
  const note = state.notes.get(noteId)!;
  const templates = [...Array.from(state.notes.values())].filter((n) => n.isTemplate);
  const current = note.templateId ? state.notes.get(note.templateId) : undefined;
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [lastUndo, setLastUndo] = useState<string | null>(null);
  const behind = current && (note.templateVersion ?? 0) < (current.templateMeta?.version ?? 1);

  const doSwitch = async () => {
    const target = pending;
    setPending(undefined);
    try {
      const { versionId } = await request<{ versionId: string }>({ op: "note.switchTemplate", id: noteId, templateId: target ?? null });
      setLastUndo(versionId);
      const undo = () => request({ op: "version.restore", versionId });
      pushUndo(key, { label: "Template change", undo });
      toast({ title: "Template changed", description: "Ctrl+Z or “Undo template change” brings the old sheet back." });
    } catch (e: any) { toast({ title: "Couldn't change template", description: e.message, variant: "destructive" }); }
  };

  return (
    <Section title="Template" icon={<Lock className="h-3.5 w-3.5" />}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="h-8 px-2.5 rounded border border-stone-700 bg-stone-950 text-sm inline-flex items-center gap-1.5" data-testid="ag-template-locked"><Lock className="h-3.5 w-3.5 text-amber-400" />{current?.name ?? (note.templateId ? "(deleted template)" : "No template")}</span>
        <button type="button" onClick={() => setChoosing(true)} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs inline-flex items-center gap-1" data-testid="ag-template-switch">Change template…</button>
        {choosing && (
          <AgSelector title="Change template" items={noteItems(templates.filter((t) => t.id !== note.templateId))} noneLabel={note.templateId ? "No template (blank sheet)" : undefined}
            onPick={(id) => setPending(id || null)} onClose={() => setChoosing(false)} emptyText="No other templates yet." testId="ag-template-switch-selector" />
        )}
        {lastUndo && <button type="button" onClick={() => request({ op: "version.restore", versionId: lastUndo }).then(() => setLastUndo(null))} className="h-8 px-2.5 rounded bg-stone-800 text-xs inline-flex items-center gap-1" data-testid="ag-template-undo"><RotateCcw className="h-3.5 w-3.5" /> Undo template change</button>}
      </div>
      {behind && (
        <div className="flex items-center gap-2 text-xs text-amber-200 bg-amber-950/40 border border-amber-800/60 rounded px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> The template has a newer version (v{current!.templateMeta?.version}). Open the template's settings → “Apply to sheets”.
        </div>
      )}
      {pending !== undefined && (
        <AgPanel title={`Switch to ${pending ? `“${state.notes.get(pending)?.name}”` : "no template"}?`} onClose={() => setPending(undefined)} width={400} height={280} testId="ag-template-confirm-panel"
          footer={<>
            <button type="button" onClick={() => setPending(undefined)} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button>
            <button type="button" onClick={doSwitch} className="h-9 px-4 rounded bg-red-700 hover:bg-red-600 text-white text-sm" data-testid="ag-template-confirm">Clear sheet & switch</button>
          </>}>
          <div className="text-sm text-stone-300 leading-relaxed">This clears everything on the sheet — its values, text and buttons — and starts over from the new template. The name, portrait, owners and connections stay. You can undo this afterwards (it's also saved in Version history).</div>
        </AgPanel>
      )}
    </Section>
  );
}

function TemplateSection({ noteId }: { noteId: string }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const t = state.notes.get(noteId)!;
  const sheets = [...Array.from(state.notes.values())].filter((n) => n.templateId === noteId);
  const [mode, setMode] = useState<"fields" | "full">("fields");
  const [removeMissing, setRemoveMissing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const version = t.templateMeta?.version ?? 1;
  useEffect(() => { setSelected(new Set(sheets.filter((s) => (s.templateVersion ?? 0) < version).map((s) => s.id))); }, [version, sheets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveVersion = async () => {
    const label = window.prompt("What changed? (optional)") ?? null;
    try { const r = await request<{ version: number }>({ op: "template.saveVersion", id: noteId, label }); toast({ title: `Saved as v${r.version}`, description: "Existing sheets keep their version until you apply it." }); }
    catch (e: any) { toast({ title: "Couldn't save", description: e.message, variant: "destructive" }); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const r = await request<{ applied: number }>({ op: "template.apply", templateId: noteId, noteIds: [...Array.from(selected)], mode, removeMissing });
      toast({ title: `Updated ${r.applied} sheet${r.applied === 1 ? "" : "s"}`, description: "Each sheet's previous state is in its Version history." });
    } catch (e: any) { toast({ title: "Couldn't apply", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <Section title={`Template · v${version}`} icon={<RefreshCw className="h-3.5 w-3.5" />}>
      <div className="text-[11px] text-stone-500">Edit this template like any sheet. New sheets made from it get the current state. Existing sheets only change when you apply.</div>
      <button type="button" onClick={saveVersion} className="h-8 px-2.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1" data-testid="ag-template-save-version"><Save className="h-3.5 w-3.5" /> Save as new version</button>
      <div className="rounded border border-stone-800 p-2 space-y-1.5">
        <div className="text-xs text-stone-300">Apply to existing sheets ({sheets.length})</div>
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {sheets.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm h-7">
              <input type="checkbox" className="accent-amber-500" checked={selected.has(s.id)} onChange={(e) => { const n = new Set(selected); e.target.checked ? n.add(s.id) : n.delete(s.id); setSelected(n); }} />
              <span className="truncate flex-1">{s.name}</span>
              <span className={`text-[10px] ${(s.templateVersion ?? 0) < version ? "text-amber-300" : "text-stone-500"}`}>v{s.templateVersion ?? "?"}</span>
            </label>
          ))}
          {!sheets.length && <div className="text-xs text-stone-500">No sheets use this template yet.</div>}
        </div>
        <div className="space-y-1 text-xs">
          <label className="flex items-start gap-2"><input type="radio" className="accent-amber-500 mt-0.5" checked={mode === "fields"} onChange={() => setMode("fields")} /> <span>Values, formulas & buttons only — keep each sheet's layout and text</span></label>
          <label className="flex items-start gap-2"><input type="radio" className="accent-amber-500 mt-0.5" checked={mode === "full"} onChange={() => setMode("full")} /> <span>Everything, including the layout (text in template sections is kept per sheet)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-500" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} /> Remove values the template no longer has</label>
        </div>
        <div className="text-[10px] text-stone-500">Current values players have entered are kept. Each sheet is snapshotted first, so it can be restored.</div>
        <button type="button" disabled={!selected.size || busy} onClick={apply} className="h-8 px-3 rounded bg-stone-700 hover:bg-stone-600 text-xs disabled:opacity-50" data-testid="ag-template-apply">Apply to {selected.size} sheet{selected.size === 1 ? "" : "s"}</button>
      </div>
    </Section>
  );
}

function VersionsSection({ noteId }: { noteId: string }) {
  const { request } = useAg();
  const { toast } = useToast();
  const [versions, setVersions] = useState<AgVersionMeta[] | null>(null);
  const load = () => request<{ versions: AgVersionMeta[] }>({ op: "version.list", noteId }).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  const REASONS: Record<string, string> = { manual: "Saved", "template-switch": "Before template change", "template-apply": "Before template update", "template-version": "Template version", "before-restore": "Before a restore" };
  return (
    <Section title="Version history" icon={<History className="h-3.5 w-3.5" />}>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => request({ op: "version.create", noteId, label: window.prompt("Name this version (optional)") || null }).then(() => { toast({ title: "Version saved" }); load(); })} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs inline-flex items-center gap-1" data-testid="ag-version-save"><Save className="h-3.5 w-3.5" /> Save a version now</button>
        <button type="button" onClick={load} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs" data-testid="ag-version-show">{versions ? "Refresh" : "Show history"}</button>
      </div>
      {versions && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-2 rounded border border-stone-800 bg-stone-900/60 px-2 py-1 text-xs">
              <span className="flex-1 min-w-0"><span className="text-stone-200">{v.label || REASONS[v.reason] || v.reason}</span><span className="block text-[10px] text-stone-500">{new Date(v.createdAt).toLocaleString()}</span></span>
              <button type="button" onClick={() => { agConfirm("The sheet goes back to this version. Its current state is saved first, so you can come back.", { title: "Restore this version?", confirm: "Restore", danger: false }).then((ok) => { if (ok) request({ op: "version.restore", versionId: v.id }).then(() => { toast({ title: "Restored" }); load(); }).catch((e) => toast({ title: "Couldn't restore", description: e.message, variant: "destructive" })); }); }}
                className="h-7 px-2 rounded bg-stone-800 hover:bg-stone-700 inline-flex items-center gap-1" data-testid="ag-version-restore"><RotateCcw className="h-3 w-3" /> Restore</button>
            </div>
          ))}
          {!versions.length && <div className="text-xs text-stone-500">Nothing saved yet. Versions are also kept automatically before template changes and restores.</div>}
        </div>
      )}
    </Section>
  );
}
