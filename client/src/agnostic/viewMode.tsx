// GM view / Player view, per person per campaign.
//   GM view      everything the person may change, including the sheets' layout:
//                the text, inserts, resizing, Values / Links / Settings, templates…
//   Player view  playing, not building: values, bars, buttons, items and wounds
//                still work, but the page itself is locked and the building
//                tools are out of the way.
// Only a view: permissions never change. GMs start in GM view, players in
// Player view. Libraries are for building, so they're always in GM view.
import { useKeybind, useBindingLabel } from "@/lib/keybinds";
import React, { useSyncExternalStore } from "react";
import { Hammer, Gamepad2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { scopeKey, type AgScope } from "@shared/agnostic/types";
import { useAgMaybe } from "./hooks";

export type AgViewMode = "gm" | "player";

const listeners = new Set<() => void>();
const cache = new Map<string, AgViewMode | null>();
const storageKey = (key: string) => `ag-view-mode:${key}`;

function stored(key: string): AgViewMode | null {
  if (!cache.has(key)) {
    let v: string | null = null;
    try { v = localStorage.getItem(storageKey(key)); } catch { /* private mode */ }
    cache.set(key, v === "gm" || v === "player" ? v : null);
  }
  return cache.get(key) ?? null;
}

export function getAgViewMode(key: string, isGM: boolean): AgViewMode {
  return stored(key) ?? (isGM ? "gm" : "player");
}

export function setAgViewMode(key: string, mode: AgViewMode) {
  cache.set(key, mode);
  try { localStorage.setItem(storageKey(key), mode); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useAgViewMode(key: string | null, isGM: boolean): AgViewMode {
  return useSyncExternalStore(subscribe, () => (key ? getAgViewMode(key, isGM) : "gm"));
}

/** True while the current campaign is in Player view (always false in libraries). */
export function usePlayView(): boolean {
  const ctx = useAgMaybe();
  const key = ctx && ctx.scope.kind === "campaign" ? ctx.key : null;
  return useAgViewMode(key, !!ctx?.realViewer.isGM) === "player";
}

/** The switch in the map's left button column. */
export function AgViewModeButton({ scope, isGM: isGMProp }: { scope: AgScope; isGM: boolean }) {
  const key = scopeKey(scope);
  // The server's word on who's a GM (assistant GMs, admins) once connected.
  const ctx = useAgMaybe();
  const isGM = ctx && ctx.key === key ? ctx.realViewer.isGM : isGMProp;
  const mode = useAgViewMode(key, isGM);
  const play = mode === "player";
  const label = play ? "Player view" : "GM view";
  // Ctrl+K (⌘K on a Mac) by default - rebindable in Settings > Keyboard shortcuts.
  useKeybind("view.gmPlayer", () => {
    setAgViewMode(key, getAgViewMode(key, isGM) === "player" ? "gm" : "player");
  }, isGM);
  const shortcut = useBindingLabel("view.gmPlayer");
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAgViewMode(key, play ? "gm" : "player")}
            className={`chrome-frame chrome-btn bg-stone-900/70 hover:bg-stone-800/90 border backdrop-blur-sm shadow-lg pointer-events-auto ${play ? "border-sky-500/80 text-sky-300" : "border-amber-500 text-amber-400"}`}
            aria-label={`${label} — switch to ${play ? "GM view" : "Player view"}${shortcut ? ` (${shortcut})` : ""}`}
            data-testid="button-ag-view-mode"
            data-mode={mode}
          >
            {play ? <Gamepad2 className="h-5 w-5" /> : <Hammer className="h-5 w-5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-stone-800 border-stone-700 text-stone-200 max-w-[240px]">
          <p className="font-semibold">{label}</p>
          <p className="text-xs text-stone-400">
            {play
              ? `Playing: change values, bars, items and wounds; the sheets' layout is locked. Click for ${isGM ? "GM view" : "editing view"}.`
              : `Building: edit everything you're allowed to, including the sheets' layout. Click for Player view.`}
          </p>
          {shortcut && <p className="text-[10px] text-stone-500 mt-0.5">{shortcut} switches</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
