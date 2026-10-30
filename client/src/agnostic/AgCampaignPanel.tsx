// The campaign's "Characters" side panel, Agnostic-style: every sheet of every
// kind, templates, components, the player tracker designer, and library imports.
import React, { useState } from "react";
import { Settings2 } from "lucide-react";
import { useAgMaybe } from "./hooks";
import { AgNotesBrowser } from "./AgNotesBrowser";
import { TrackerDesigner } from "./AgTracker";
import { GuideButton } from "./AgGuide";
import { MemberPicker } from "./pickers";
import { usePlayView } from "./viewMode";

export function AgCampaignPanel({ onPlaceOnMap }: { onPlaceOnMap?: (noteId: string) => void }) {
  const ag = useAgMaybe();
  const [tracker, setTracker] = useState(false);
  const play = usePlayView();
  if (!ag) return <div className="p-4 text-sm text-stone-400">Loading sheets…</div>;
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        {/* Notes have a panel of their own, so they aren't in here as well. */}
        <AgNotesBrowser opts={{ showTrackerPin: true, onPlaceOnMap, importSources: true, tabs: ["characters", "abilities", "items", "beasts"] }} />
      </div>
      {ag.realViewer.isGM && ag.state.members.some((m) => m.role !== "gm") && (
        <div className="mx-2 shrink-0" title="See the whole table — sheets, tracker, tokens — as a player would"><MemberPicker value={ag.previewUserId ?? ""} onChange={(id) => ag.setPreviewUserId(id || null)} noneLabel="Viewing as GM" title="Preview the table as…" testId="ag-campaign-preview" /></div>
      )}
      <GuideButton className="mx-2 mt-2 shrink-0" />
      {ag.viewer.isGM && !play && (
        <button type="button" onClick={() => setTracker(true)} className="m-2 h-9 rounded bg-stone-800 hover:bg-stone-700 text-xs text-stone-200 inline-flex items-center justify-center gap-1.5 shrink-0" data-testid="ag-open-tracker-designer">
          <Settings2 className="h-3.5 w-3.5" /> Design the player tracker
        </button>
      )}
      {tracker && <TrackerDesigner onClose={() => setTracker(false)} />}
    </div>
  );
}
