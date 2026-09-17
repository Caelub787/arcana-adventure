// Per-device "compact floating panels" preference — a plain localStorage
// flag, deliberately not synced to the account, so a player can turn it on
// for one cramped device (e.g. a folded/unfolded phone where desktop-style
// floating panels render at full desktop size) without it following them to
// their PC. Off by default everywhere.
import { useEffect, useState } from "react";

const COMPACT_PANELS_KEY = "arcana_compact_floating_panels";
const COMPACT_PANELS_EVENT = "compact-panels-changed";

export const COMPACT_PANEL_SCALE = 0.6;

export function getCompactPanelsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(COMPACT_PANELS_KEY) === "1";
}

export function setCompactPanelsEnabled(enabled: boolean) {
  localStorage.setItem(COMPACT_PANELS_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent<boolean>(COMPACT_PANELS_EVENT, { detail: enabled }));
}

export function useCompactPanelsEnabled(): boolean {
  const [enabled, setEnabled] = useState(getCompactPanelsEnabled);
  useEffect(() => {
    const handler = (e: Event) => setEnabled((e as CustomEvent<boolean>).detail);
    window.addEventListener(COMPACT_PANELS_EVENT, handler);
    return () => window.removeEventListener(COMPACT_PANELS_EVENT, handler);
  }, []);
  return enabled;
}
