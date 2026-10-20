// Settings > Keyboard shortcuts. Edit which keys run each action; saved to
// your account, so the same shortcuts apply in every campaign and update on
// your other devices right away. Always a floating panel.
import React, { useEffect, useMemo, useState } from "react";
import { Keyboard, Plus, RotateCcw, Search, X } from "lucide-react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { toast } from "@/hooks/use-toast";
import {
  KEYBIND_ACTIONS, bindingsFor, comboFromEvent, comboLabel, getKeybindOverrides, saveKeybindOverrides,
  setKeybindRecording, useKeybindVersion, type KeybindAction,
} from "@/lib/keybinds";

const GROUP_ORDER = ["Panels", "View", "Battlemap", "Hotbar"] as const;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function KeybindsPanel({ onClose, isGM }: { onClose: () => void; isGM: boolean }) {
  const version = useKeybindVersion();
  const [query, setQuery] = useState("");
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (actionId: string, combos: string[], alsoClear?: { id: string; combos: string[] }) => {
    const next = { ...getKeybindOverrides() };
    const put = (id: string, c: string[]) => {
      const a = KEYBIND_ACTIONS.find((x) => x.id === id);
      if (a && same(c, a.defaults)) delete next[id];
      else next[id] = c;
    };
    put(actionId, combos);
    if (alsoClear) put(alsoClear.id, alsoClear.combos);
    setSaving(true);
    try { await saveKeybindOverrides(next); } catch (e: any) { toast({ title: e?.message || "Could not save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  // Listening for a new combo.
  useEffect(() => {
    if (!recordingFor) return;
    setKeybindRecording(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { setRecordingFor(null); return; }
      const combo = comboFromEvent(e);
      if (!combo) return; // a lone modifier: keep listening
      const actionId = recordingFor;
      setRecordingFor(null);
      const current = bindingsFor(actionId);
      if (current.includes(combo)) return;
      const clash = KEYBIND_ACTIONS.find((a) => a.id !== actionId && bindingsFor(a.id).includes(combo));
      if (clash && !window.confirm(`${comboLabel(combo)} is already used for "${clash.label}". Use it for this instead?`)) return;
      void save(actionId, [...current, combo].slice(-4), clash ? { id: clash.id, combos: bindingsFor(clash.id).filter((c) => c !== combo) } : undefined);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); setKeybindRecording(false); };
  }, [recordingFor]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => KEYBIND_ACTIONS.filter((a) => (!a.gmOnly || isGM) && (!q || a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || bindingsFor(a.id).some((c) => c.toLowerCase().includes(q)))), [q, isGM, version]);
  const changedCount = Object.keys(getKeybindOverrides()).length;

  const row = (a: KeybindAction) => {
    const combos = bindingsFor(a.id);
    const custom = !same(combos, a.defaults);
    const listening = recordingFor === a.id;
    return (
      <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-800/50" data-testid={`keybind-row-${a.id}`}>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-stone-200 truncate">{a.label}</div>
          {a.description && <div className="text-[11px] text-stone-500 truncate">{a.description}</div>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 max-w-[55%]">
          {combos.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded border border-stone-600 bg-stone-950 px-1.5 h-6 text-[11px] font-mono text-amber-200" data-testid={`keybind-combo-${a.id}`}>
              {comboLabel(c)}
              <button type="button" className="text-stone-500 hover:text-red-300" title="Remove this key" onClick={() => void save(a.id, combos.filter((x) => x !== c))}><X className="h-3 w-3" /></button>
            </span>
          ))}
          {listening ? (
            <span className="inline-flex items-center h-6 px-2 rounded border border-cyan-400 bg-cyan-500/15 text-[11px] text-cyan-200 animate-pulse" data-testid="keybind-listening">Press keys… (Esc cancels)</span>
          ) : (
            <button type="button" onClick={() => setRecordingFor(a.id)} className="inline-flex items-center gap-0.5 h-6 px-1.5 rounded border border-dashed border-stone-600 text-[11px] text-stone-400 hover:text-stone-100 hover:border-stone-400" title="Add a key" data-testid={`keybind-add-${a.id}`}>
              <Plus className="h-3 w-3" />{combos.length ? "" : " Set key"}
            </button>
          )}
          {custom && (
            <button type="button" onClick={() => void save(a.id, a.defaults)} className="h-6 w-6 grid place-items-center rounded text-stone-500 hover:text-amber-300" title={`Reset to default${a.defaults.length ? ` (${a.defaults.map(comboLabel).join(", ")})` : " (none)"}`} data-testid={`keybind-reset-${a.id}`}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <FloatingPanel
      open
      onClose={onClose}
      panelKey="keybinds"
      title={<span className="flex items-center gap-2"><Keyboard className="h-4 w-4 text-amber-400" /> Keyboard shortcuts</span>}
      defaultSize={{ width: 520, height: 620 }}
      minWidth={360}
      minHeight={320}
    >
      <div className="p-3 space-y-3" data-testid="keybinds-panel">
        <p className="text-xs text-stone-400 leading-relaxed">
          Saved to your account — the same shortcuts work in every campaign and update on your other devices straight away.
          Single keys don't fire while you're typing; combinations with Ctrl or Alt do.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-stone-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search actions or keys" className="w-full h-8 pl-7 pr-2 rounded bg-stone-950 border border-stone-700 text-sm text-stone-200" data-testid="keybinds-search" />
          </div>
          <button
            type="button"
            disabled={!changedCount || saving}
            onClick={() => { if (window.confirm("Reset every shortcut to its default?")) void saveKeybindOverrides({}).catch(() => toast({ title: "Could not save", variant: "destructive" })); }}
            className="h-8 px-2.5 rounded border border-stone-600 text-xs text-stone-300 hover:bg-stone-800 disabled:opacity-40 flex items-center gap-1"
            data-testid="keybinds-reset-all"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset all
          </button>
        </div>
        {GROUP_ORDER.map((g) => {
          const list = shown.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <div className="text-[11px] uppercase tracking-wider text-amber-500/80 font-semibold px-2 mb-1">{g}</div>
              <div className="rounded-lg border border-stone-800 bg-stone-900/40 divide-y divide-stone-800/70">{list.map(row)}</div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="text-sm text-stone-500 text-center py-6">Nothing matches “{query}”.</p>}
      </div>
    </FloatingPanel>
  );
}
