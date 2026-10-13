// Actions (button functions) — built from steps, no code:
//   Roll        1d20 + dex            → its result is available as $name
//   Change      @target.hp  subtract  $dmg
//   Message     "{name} hits for {$dmg}!"
import React, { useState } from "react";
import { Plus, Trash2, Dices, ArrowDownUp, MessageSquare, Pencil } from "lucide-react";
import type { AgActionStep, AgAcl } from "@shared/agnostic/types";
import { AgPanel, PickField, type SelItem } from "./float";
import { useToast } from "@/hooks/use-toast";
import { useAg } from "./hooks";
import { FormulaInput } from "./FormulaBuilder";
import { AclEditor, ColorInput, RefPicker } from "./pickers";

export function ActionPicker({ noteId, value, onChange }: { noteId: string; value: string; onChange: (id: string) => void }) {
  const { state } = useAg();
  const [editing, setEditing] = useState<string | null | "new">(null);
  const actions = Array.from(state.actions.values()).filter((a) => a.noteId === noteId);
  const current = value ? state.actions.get(value) : undefined;
  const items: SelItem[] = actions.sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({
    id: a.id, name: a.name, icon: <span className="h-4 w-4 rounded-sm" style={{ background: a.color ?? "#92400e" }} />,
    sub: (a.steps ?? []).map((st) => (st.type === "roll" ? `Roll ${st.expr}` : st.type === "modify" ? `${st.op} ${st.target}` : "Message")).join(" · ") || "No steps",
  }));
  return (
    <>
      <PickField
        value={value} items={items} onChange={onChange} title="Choose what the button does" placeholder="Choose what it does…"
        emptyText="This sheet has no actions yet." testId="ag-action-picker"
        actions={(close) => <button type="button" onClick={() => { close(); setEditing("new"); }} className="h-9 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm inline-flex items-center gap-1" data-testid="ag-action-new"><Plus className="h-4 w-4" /> New action…</button>}
      />
      {current && <button type="button" onClick={() => setEditing(current.id)} className="mt-1 text-[11px] text-amber-300 hover:underline inline-flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit “{current.name}”</button>}
      {!current && <button type="button" onClick={() => setEditing("new")} className="mt-1 text-[11px] text-amber-300 hover:underline inline-flex items-center gap-1"><Plus className="h-3 w-3" /> New action…</button>}
      {editing && (
        <ActionEditorDialog
          noteId={noteId}
          actionId={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => { onChange(id); setEditing(null); }}
        />
      )}
    </>
  );
}

const DEFAULT_ACL: AgAcl = { view: "inherit", edit: "owners" };

export function ActionEditorDialog({ noteId, actionId, onClose, onSaved }: { noteId: string; actionId: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const existing = actionId ? state.actions.get(actionId) : undefined;
  const [name, setName] = useState(existing?.name ?? "Roll");
  const [color, setColor] = useState(existing?.color ?? "#92400e");
  const [acl, setAcl] = useState<AgAcl>(existing?.acl ?? DEFAULT_ACL);
  const [steps, setSteps] = useState<AgActionStep[]>(existing?.steps ?? [{ type: "roll", name: "r", expr: "1d20", label: "" }]);
  const [saving, setSaving] = useState(false);
  const rollNames = (upTo: number) => steps.slice(0, upTo).filter((s): s is Extract<AgActionStep, { type: "roll" }> => s.type === "roll").map((s) => s.name);

  const setStep = (i: number, s: AgActionStep) => setSteps(steps.map((x, j) => (j === i ? s : x)));
  const save = async () => {
    setSaving(true);
    try {
      const res = await request<{ actionId: string }>({ op: "action.upsert", action: { id: actionId ?? undefined, noteId, name, steps, acl, color } });
      onSaved(res.actionId);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!actionId) return;
    await request({ op: "action.delete", id: actionId });
    onClose();
  };

  return (
    <AgPanel title={actionId ? `Edit action — ${existing?.name ?? ""}` : "New action"} onClose={onClose} width={520} height={640} testId="ag-action-editor"
      footer={<>
        {actionId && <button type="button" onClick={remove} className="h-9 px-3 rounded text-sm text-red-300 hover:bg-red-950 mr-auto">Delete</button>}
        <button type="button" onClick={onClose} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !name.trim()} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm disabled:opacity-50" data-testid="ag-action-save">Save</button>
      </>}>
        <div className="space-y-3 text-stone-200">
          <div className="flex items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Button name" className="h-9 flex-1 bg-stone-950 border border-stone-700 rounded px-2 text-sm" data-testid="ag-action-name" />
            <ColorInput value={color} onChange={setColor} title="Button colour" />
          </div>
          <div>
            <div className="text-[11px] text-stone-400 mb-1">Who sees the button / who can press it</div>
            <AclEditor acl={acl} onChange={setAcl} editLabel="Press" />
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="rounded border border-stone-700 bg-stone-950/60 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  {s.type === "roll" ? <Dices className="h-4 w-4 text-amber-400" /> : s.type === "modify" ? <ArrowDownUp className="h-4 w-4 text-emerald-400" /> : <MessageSquare className="h-4 w-4 text-sky-400" />}
                  <span className="text-xs font-medium">{s.type === "roll" ? "Roll" : s.type === "modify" ? "Change a value" : "Message"}</span>
                  <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="ml-auto h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {s.type === "roll" && (
                  <>
                    <FormulaInput noteId={noteId} value={s.expr} allowDice locals={rollNames(i)} onChange={(expr) => setStep(i, { ...s, expr })} testId={`ag-step-${i}-expr`} />
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-stone-400">Shown as</span>
                      <input value={s.label ?? ""} placeholder={name} onChange={(e) => setStep(i, { ...s, label: e.target.value })} className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded px-1.5" />
                      <span className="text-stone-400">saved as</span>
                      <span className="font-mono text-sky-300">$</span>
                      <input value={s.name} onChange={(e) => setStep(i, { ...s, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") || "r" })} className="h-7 w-16 bg-stone-900 border border-stone-700 rounded px-1.5 font-mono text-sky-300" />
                    </div>
                  </>
                )}
                {s.type === "modify" && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <select value={s.op} onChange={(e) => setStep(i, { ...s, op: e.target.value as any })} className="h-7 bg-stone-900 border border-stone-700 rounded px-1">
                        <option value="subtract">Subtract from</option><option value="add">Add to</option><option value="set">Set</option>
                      </select>
                      <div className="flex-1 min-w-[160px]"><RefPicker noteId={noteId} value={s.target} placeholder="Value to change (e.g. @target.hp)" onChange={(target) => setStep(i, { ...s, target })} /></div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs"><span className="text-stone-400 shrink-0">{s.op === "set" ? "to" : "by"}</span><div className="flex-1"><FormulaInput noteId={noteId} value={s.value} locals={rollNames(i)} onChange={(value) => setStep(i, { ...s, value })} /></div></div>
                    <div className="text-[10px] text-stone-500">Tip: <span className="font-mono">@target.hp</span> changes the token you have targeted on the battlemap.</div>
                  </>
                )}
                {s.type === "message" && (
                  <>
                    <textarea value={s.text} onChange={(e) => setStep(i, { ...s, text: e.target.value })} placeholder="e.g. {name} deals {$dmg} damage!" className="w-full min-h-[48px] bg-stone-900 border border-stone-700 rounded px-1.5 py-1 text-sm" />
                    <div className="text-[10px] text-stone-500">Anything in {"{ }"} is worked out — values, {rollNames(i).map((n) => `$${n}`).join(", ") || "roll results"}.</div>
                  </>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setSteps([...steps, { type: "roll", name: `r${steps.filter((x) => x.type === "roll").length + 1}`, expr: "1d6" }])} className="h-8 px-2 rounded bg-stone-800 text-xs inline-flex items-center gap-1"><Dices className="h-3.5 w-3.5" /> Roll</button>
              <button type="button" onClick={() => setSteps([...steps, { type: "modify", target: "", op: "subtract", value: rollNames(steps.length).slice(-1)[0] ? `$${rollNames(steps.length).slice(-1)[0]}` : "1" }])} className="h-8 px-2 rounded bg-stone-800 text-xs inline-flex items-center gap-1"><ArrowDownUp className="h-3.5 w-3.5" /> Change a value</button>
              <button type="button" onClick={() => setSteps([...steps, { type: "message", text: "" }])} className="h-8 px-2 rounded bg-stone-800 text-xs inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Message</button>
            </div>
          </div>
        </div>
    </AgPanel>
  );
}
