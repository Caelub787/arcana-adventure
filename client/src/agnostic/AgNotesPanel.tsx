// The campaign's Notes panel, for an Agnostic system.
//
// Notes are sheets like everything else here, so this is the sheet browser
// pinned to its Notes tab: the same search, the same folders, the same sharing,
// and a note's page is a full sheet page — words, values, tables, images and a
// free canvas, whatever the writer wants on it.
//
// Players make their own, and a note somebody makes is theirs until they share
// it. The GM's notes start the way everything else in the campaign does.
import React from "react";
import { useAgMaybe } from "./hooks";
import { AgNotesBrowser } from "./AgNotesBrowser";

export function AgNotesPanel() {
  const ag = useAgMaybe();
  if (!ag) return <div className="p-4 text-sm text-stone-400">Loading notes…</div>;
  return (
    <div className="h-full flex flex-col" data-testid="ag-notes-panel">
      <div className="flex-1 min-h-0">
        <AgNotesBrowser opts={{ tabs: ["notes"], types: ["note"] }} />
      </div>
    </div>
  );
}
