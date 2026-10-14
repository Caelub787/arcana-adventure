// Export templates / components / tracker designs to a file, and import them
// into any campaign or library. Exports never include player values, owners,
// or (unless asked) GM-only template text.
import React, { useRef, useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import type { AgExportBundle } from "@shared/agnostic/types";
import { AgPanel } from "./float";
import { useToast } from "@/hooks/use-toast";
import { useAg } from "./hooks";

export function ImportExportDialog({ onClose }: { onClose: () => void }) {
  const { state, request, scope } = useAg();
  const { toast } = useToast();
  const templates = [...Array.from(state.notes.values())].filter((n) => n.isTemplate);
  const comps = [...Array.from(state.components.values())];
  const [pickT, setPickT] = useState<Set<string>>(new Set(templates.map((t) => t.id)));
  const [pickC, setPickC] = useState<Set<string>>(new Set(comps.map((c) => c.id)));
  const [gmText, setGmText] = useState(false);
  const [tracker, setTracker] = useState(scope.kind === "campaign");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); fn(n); };

  const doExport = async () => {
    setBusy(true);
    try {
      const { bundle } = await request<{ bundle: AgExportBundle }>({ op: "export", templateIds: [...Array.from(pickT)], componentIds: [...Array.from(pickC)], includeGmText: gmText, includeTracker: tracker });
      const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `agnostic-templates-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e: any) { toast({ title: "Export failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const doImport = async (file: File) => {
    setBusy(true);
    try {
      const bundle = JSON.parse(await file.text());
      const r = await request<{ templates: number; components: number }>({ op: "import", bundle });
      toast({ title: "Imported", description: `${r.templates} template${r.templates === 1 ? "" : "s"}, ${r.components} component${r.components === 1 ? "" : "s"}.` });
      onClose();
    } catch (e: any) { toast({ title: "Import failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <AgPanel title="Share templates & components" onClose={onClose} width={440} height={600} testId="ag-import-export">
        <div className="space-y-3 text-stone-200 text-sm">
          <div className="rounded border border-stone-800 p-2 space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-amber-400/90">Export</div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {templates.map((t) => <label key={t.id} className="flex items-center gap-2 h-7"><input type="checkbox" className="accent-amber-500" checked={pickT.has(t.id)} onChange={() => toggle(pickT, t.id, setPickT)} />{t.name}<span className="text-[10px] text-stone-500">template</span></label>)}
              {comps.map((c) => <label key={c.id} className="flex items-center gap-2 h-7"><input type="checkbox" className="accent-amber-500" checked={pickC.has(c.id)} onChange={() => toggle(pickC, c.id, setPickC)} />{c.name}<span className="text-[10px] text-stone-500">component</span></label>)}
              {!templates.length && !comps.length && <div className="text-xs text-stone-500">No templates or components here yet.</div>}
            </div>
            {scope.kind === "campaign" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-amber-500" checked={tracker} onChange={(e) => setTracker(e.target.checked)} /> Include player tracker card designs</label>}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-amber-500" checked={gmText} onChange={(e) => setGmText(e.target.checked)} /> Include GM-only sections of templates</label>
            <div className="text-[10px] text-stone-500">Never included: anyone's sheets, values players entered, owners, or specific-player permissions.</div>
            <button type="button" disabled={busy || (!pickT.size && !pickC.size && !tracker)} onClick={doExport} className="h-9 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-50" data-testid="ag-export">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download file</button>
          </div>
          <div className="rounded border border-stone-800 p-2 space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-amber-400/90">Import</div>
            <div className="text-xs text-stone-400">Adds the templates and components from an exported file here. Nothing existing is changed.</div>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="h-9 px-3 rounded bg-stone-800 hover:bg-stone-700 text-sm inline-flex items-center gap-1.5" data-testid="ag-import"><Upload className="h-4 w-4" /> Choose file…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doImport(f); }} />
          </div>
        </div>
    </AgPanel>
  );
}
