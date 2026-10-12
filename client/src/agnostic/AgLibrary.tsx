// Agnostic's own Admin library and My Library: completely separate from every
// other system's items/characters/species. Starts empty; holds Characters
// (incl. NPCs), Items and Species — sheets and templates — plus components.
import React from "react";
import type { AgScope } from "@shared/agnostic/types";
import { AgScopeProvider } from "./hooks";
import { AgWindowsProvider, AgWindowStack, useAgWindows } from "./AgWindows";
import { AgNotesBrowser } from "./AgNotesBrowser";
import { GuideButton } from "./AgGuide";

export const AG_LIBRARY_TYPES = ["character", "npc", "item", "species"];

function Inner({ scope }: { scope: AgScope }) {
  const win = useAgWindows();
  return (
    <AgScopeProvider scope={scope} onOpenNote={win?.open}>
      <div className="h-full min-h-[60vh] rounded-lg border border-stone-800 bg-stone-950/60 overflow-hidden">
        <AgNotesBrowser opts={{ types: AG_LIBRARY_TYPES }} />
      </div>
      <AgWindowStack />
    </AgScopeProvider>
  );
}

export function AgLibrary({ scope }: { scope: AgScope }) {
  return (
    <AgWindowsProvider>
      <div className="space-y-2 flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <p className="text-xs text-stone-400 flex-1 min-w-[220px]">
            {scope.kind === "admin" ? "Agnostic admin library" : "Your Agnostic library"} — separate from every other system. Make templates for Characters, NPCs, Items and Species, then bring them into any Agnostic campaign.
          </p>
          <GuideButton topic="libraries" label="How Agnostic works" />
        </div>
        <div className="flex-1 min-h-0"><Inner scope={scope} /></div>
      </div>
    </AgWindowsProvider>
  );
}
