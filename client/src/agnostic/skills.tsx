// The Skills block: one row a skill — its name, what it's for, its bonus and a
// button to roll it. A sheet carries only the skills it actually has, so the
// block is built from the values themselves (every value with `skillOf` set)
// rather than from a table written into the page. "Add a skill" puts a new one
// on the sheet: one of the ready-made ones, or any value and attribute you like.
import React, { useMemo, useState } from "react";
import { useRemovingShown } from "./safety";
import { Plus, Trash2 } from "lucide-react";
import type { AgField } from "@shared/agnostic/types";
import { CA_ATTRS, CA_ABBR, CA_EXTRA_SKILLS, EXTRA_SKILL_MIN, EXTRA_SKILL_MAX, EXTRA_SKILL_NOTE, bonusKey } from "@shared/agnostic/caSkills";
import { useAg, useNoteFields, usePerms, effOf } from "./hooks";
import { ActionButton, EditOnDoubleClick } from "./widgets";
import { AgSelector, PickField, agConfirm } from "./float";
import { AgIcon } from "./icons";
import { TipIcon } from "./tips";
import { useToast } from "@/hooks/use-toast";
import { formatValue } from "@shared/agnostic/formula";

const GILT = "#d4a24c";

/** A skill as the block shows it: the number you set, and what it works out to. */
interface Row { pick: AgField; bonus?: AgField; name: string; about: string; parent: string }

export function skillRows(fields: AgField[]): Row[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return fields
    .filter((f) => f.type !== "formula" && typeof f.options.skillOf === "string")
    .map((pick) => {
      const bonus = byKey.get(bonusKey(pick.key));
      return {
        pick, bonus,
        name: (bonus?.label || pick.label).replace(/\s+(pick|bonus)$/i, ""),
        about: String(pick.options.about ?? bonus?.options.about ?? ""),
        parent: String(pick.options.skillOf ?? ""),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function SkillsBlock({ noteId }: { noteId: string }) {
  const fields = useNoteFields(noteId);
  const { state } = useAg();
  const { canEditBody, isGM } = usePerms(noteId);
  const note = state.notes.get(noteId);
  // Your own character's skills are yours to add, not only the GM's.
  const mayAdd = isGM || canEditBody || !!(note && note.ownerIds.includes(state.userId));
  // Taking a skill off waits on the lock at the top of the sheet.
  const mayDrop = mayAdd && useRemovingShown();
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => skillRows(fields), [fields]);
  // Each skill's roll button is the action named after it.
  const actionOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of Array.from(state.actions.values())) if (a.noteId === noteId) m.set(a.name.toLowerCase(), a.id);
    return m;
  }, [state.actions, noteId]);

  if (!rows.length && !mayAdd) return null;
  return (
    <div className="my-2">
      <table className="w-full border-collapse text-sm sm:table-fixed">
        <thead>
          <tr className="text-left text-stone-400 border-b border-stone-700">
            <th className="py-1.5 pr-2 font-semibold sm:w-[22%]">Skill</th>
            <th className="py-1.5 px-2 font-semibold hidden sm:table-cell">What it's for</th>
            <th className="py-1.5 px-1 sm:px-2 font-semibold w-14 text-center whitespace-nowrap">Bonus</th>
            <th className="py-1.5 pl-2 font-semibold w-[74px]">Roll</th>
            {mayDrop && <th className="w-7" aria-label="Take off" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <SkillRow key={r.pick.id} row={r} noteId={noteId} actionId={actionOf.get(r.name.toLowerCase())} mayEdit={mayDrop} />)}
          {!rows.length && <tr><td colSpan={mayDrop ? 5 : 4} className="py-3 text-stone-500">No skills on this sheet yet.</td></tr>}
        </tbody>
      </table>
      {mayAdd && (
        <div className="mt-2 flex items-start gap-2">
          <button type="button" onClick={() => setAdding(true)} data-testid="ag-skill-add"
            className="inline-flex shrink-0 items-center gap-1 h-7 px-2 whitespace-nowrap rounded border border-stone-700 bg-stone-800 hover:bg-stone-700 text-xs text-stone-200">
            <Plus className="h-3.5 w-3.5" /> Add a skill
          </button>
          <span className="text-[11px] text-stone-500">{EXTRA_SKILL_NOTE}</span>
        </div>
      )}
      {adding && <AddSkill noteId={noteId} have={new Set(fields.map((f) => f.key))} onClose={() => setAdding(false)} />}
    </div>
  );
}

function SkillRow({ row, noteId, actionId, mayEdit }: { row: Row; noteId: string; actionId?: string; mayEdit: boolean }) {
  const { request } = useAg();
  const { toast } = useToast();
  const { pick, bonus, about, parent } = row;
  const shown = bonus ?? pick;
  const drop = async () => {
    if (!(await agConfirm(`Take ${row.name} off this sheet?`, { confirm: "Take it off", danger: true }))) return;
    try { await request({ op: "skill.remove", noteId, key: pick.key }); }
    catch (e: any) { toast({ title: "Couldn't take it off", description: e.message, variant: "destructive" }); }
  };
  return (
    <tr className="group border-b border-stone-800/70 align-middle" data-testid={`ag-skill-${pick.key}`}>
      <td className="py-1 pr-2 align-top sm:align-middle">
        <span className="font-semibold text-stone-100">{row.name}</span>
        {parent && <span className="ml-1 text-stone-500 text-xs">({CA_ABBR[parent] ?? parent.slice(0, 3).toUpperCase()})</span>}
        {about && <span className="sm:hidden block text-[11px] text-stone-500 leading-snug mt-0.5">{about}</span>}
      </td>
      <td className="py-1 px-2 text-stone-400 text-[12px] leading-snug hidden sm:table-cell">{about}</td>
      <td className="py-1 px-1 sm:px-2 text-center align-top sm:align-middle">
        <EditOnDoubleClick field={shown}>
          <span className="font-mono font-bold tabular-nums" style={{ color: GILT }} title="Double-click (or long-press) for the attribute and your pick">
            {formatValue(effOf(shown), shown.options.decimals)}
          </span>
        </EditOnDoubleClick>
      </td>
      <td className="py-1 pl-2 whitespace-nowrap">{actionId ? <ActionButton actionId={actionId} label="Roll" compact /> : null}</td>
      {mayEdit && (
        <td className="py-1 text-right">
          <button type="button" onClick={drop} title={`Take ${row.name} off this sheet`} data-testid={`ag-skill-drop-${pick.key}`}
            className="h-6 w-6 opacity-60 hover:opacity-100 grid place-items-center rounded text-stone-500 hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

/** Pick one of the ready-made skills, or describe your own. */
function AddSkill({ noteId, have, onClose }: { noteId: string; have: Set<string>; onClose: () => void }) {
  const { request } = useAg();
  const { toast } = useToast();
  const [custom, setCustom] = useState<{ name: string; parent: string; about: string } | null>(null);
  const spare = CA_EXTRA_SKILLS.filter((k) => !have.has(k.key));

  const add = async (k: { key?: string; name: string; parent: string; desc: string }) => {
    try {
      await request({ op: "skill.add", noteId, key: k.key, name: k.name, parent: k.parent, about: k.desc, min: EXTRA_SKILL_MIN, max: EXTRA_SKILL_MAX });
      onClose();
    } catch (e: any) {
      toast({ title: "Couldn't add it", description: e.message, variant: "destructive" });
    }
  };

  if (custom) {
    const key = custom.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const clash = !!key && have.has(key);
    return (
      <AgSelector title="A skill of your own" items={[]} onPick={() => {}} onClose={onClose} emptyText=""
        hint={
          <div className="space-y-2 pt-1">
            <label className="block text-xs text-stone-400">Name
              <input autoFocus value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })}
                className="mt-1 w-full h-9 px-2 rounded bg-stone-800 border border-stone-700 text-sm text-stone-100 outline-none focus:border-amber-600" placeholder="e.g. Beast Taming" />
            </label>
            <label className="block text-xs text-stone-400">What it's for
              <input value={custom.about} onChange={(e) => setCustom({ ...custom, about: e.target.value })}
                className="mt-1 w-full h-9 px-2 rounded bg-stone-800 border border-stone-700 text-sm text-stone-100 outline-none focus:border-amber-600" placeholder="One line, shown beside the name" />
            </label>
            <div className="text-xs text-stone-400">
              Attribute it hangs off
              <PickField value={custom.parent} onChange={(v) => setCustom({ ...custom, parent: v })} noneLabel="None — on its own" title="Attribute"
                items={CA_ATTRS.map((a) => ({ id: a.key, name: `${a.name} (${a.abbr})` }))} className="mt-1" />
            </div>
            {clash && <div className="text-xs text-red-400">This sheet already has a value called {key}.</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCustom(null)} className="h-8 px-3 rounded border border-stone-700 text-xs text-stone-300">Back</button>
              <button type="button" disabled={!key || clash} data-testid="ag-skill-add-custom"
                onClick={() => add({ key, name: custom.name.trim(), parent: custom.parent, desc: custom.about.trim() })}
                className="h-8 px-3 rounded bg-amber-700 disabled:opacity-40 text-xs text-white">Add it</button>
            </div>
          </div>
        } />
    );
  }
  return (
    <AgSelector title="Add a skill" testId="ag-skill-picker" onClose={onClose}
      emptyText="Every ready-made skill is already on this sheet."
      items={spare.map((k) => ({
        id: k.key, name: k.name, sub: k.desc,
        icon: <AgIcon name={k.icon} size={16} color={k.color} />,
        badge: CA_ABBR[k.parent] ?? "",
      }))}
      onPick={(id) => { const k = spare.find((x) => x.key === id); if (k) add(k); }}
      actions={<button type="button" onClick={() => setCustom({ name: "", parent: "", about: "" })} data-testid="ag-skill-own"
        className="h-8 px-3 rounded border border-stone-700 bg-stone-800 text-xs text-stone-200">One of your own…</button>} />
  );
}
