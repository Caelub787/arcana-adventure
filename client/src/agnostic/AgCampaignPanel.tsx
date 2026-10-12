// The campaign's "Characters" side panel, Agnostic-style: every sheet of every
// kind, templates, components, the tracker designer, and library imports.
import React, { useState } from "react";
import { Settings2 } from "lucide-react";
import { useAgMaybe } from "./hooks";
import { AgNotesBrowser } from "./AgNotesBrowser";
import { TrackerDesigner } from "./AgTracker";
import { GuideButton } from "./AgGuide";

export function AgCampaignPanel({ onPlaceOnMap }: { onPlaceOnMap?: (noteId: string) => void }) {
  const ag = useAgMaybe();
  const [tracker, setTracker] = useState(false);
  if (!ag) return <div className="p-4 text-sm text-stone-400">Loading sheets…</div>;
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <AgNotesBrowser opts={{ showTrackerPin: true, onPlaceOnMap, importSources: true }} />
      </div>
      {ag.realViewer.isGM && ag.state.members.some((m) => m.role !== "gm") && (
        <select value={ag.previewUserId ?? ""} onChange={(e) => ag.setPreviewUserId(e.target.value || null)} className="mx-2 h-8 bg-stone-900 border border-stone-700 rounded px-1 text-xs text-stone-300 shrink-0" title="See the whole table — sheets, tracker, tokens — as a player would" data-testid="ag-campaign-preview">
          <option value="">Viewing as GM</option>
          {ag.state.members.filter((m) => m.role !== "gm").map((m) => <option key={m.userId} value={m.userId}>Preview as {m.name}</option>)}
        </select>
      )}
      <GuideButton className="mx-2 mt-2 shrink-0" />
      {ag.viewer.isGM && (
        <button type="button" onClick={() => setTracker(true)} className="m-2 h-9 rounded bg-stone-800 hover:bg-stone-700 text-xs text-stone-200 inline-flex items-center justify-center gap-1.5 shrink-0" data-testid="ag-open-tracker-designer">
          <Settings2 className="h-3.5 w-3.5" /> Design the player tracker
        </button>
      )}
      {tracker && <TrackerDesigner onClose={() => setTracker(false)} />}
    </div>
  );
}
