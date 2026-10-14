// Agnostic's own Admin library and My Library: completely separate from every
// other system's items/characters/species. Starts empty; holds Characters
// (incl. NPCs), Items and Species — sheets and templates — plus components.
import React from "react";
import { agLibrarySystem, type AgScope } from "@shared/agnostic/types";
import { systemLabel } from "@shared/systems";
import { AgScopeProvider } from "./hooks";
import { AgWindowsProvider, AgWindowStack, useAgWindows } from "./AgWindows";
import { AgNotesBrowser } from "./AgNotesBrowser";
import { GuideButton, AgGuideHost } from "./AgGuide";
import { AgConfirmHost } from "./float";

export const AG_LIBRARY_TYPES = ["character", "npc", "item", "species"];

function Inner({ scope }: { scope: AgScope }) {
  const win = useAgWindows();
  return (
    <AgScopeProvider scope={scope} onOpenNote={win?.open}>
      <div className="h-full min-h-[60vh] rounded-lg border border-stone-800 bg-stone-950/60 overflow-hidden">
        <AgNotesBrowser opts={{ types: AG_LIBRARY_TYPES }} />
      </div>
      <AgWindowStack />
      <AgGuideHost />
      <AgConfirmHost />
    </AgScopeProvider>
  );
}

export function AgLibrary({ scope, system }: { scope: AgScope; system?: string }) {
  const sys = system ?? agLibrarySystem(scope) ?? "agnostic";
  const name = systemLabel(sys);
  return (
    <AgWindowsProvider>
      <div className="space-y-2 flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <p className="text-xs text-stone-400 flex-1 min-w-[220px]">
            {scope.kind === "admin" ? `${name} admin library` : `Your ${name} library`} — separate from every other system{sys !== "agnostic" ? " (and from plain Agnostic)" : ""}. Make templates for Characters, NPCs, Items and Species, then bring them into any {name} campaign.
          </p>
          <GuideButton topic="libraries" label="How Agnostic works" />
        </div>
        <div className="flex-1 min-h-0"><Inner scope={scope} /></div>
      </div>
    </AgWindowsProvider>
  );
}
