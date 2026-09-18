// Per-device "compact floating panels" preference — a plain localStorage
// flag, deliberately not synced to the account, so a player can turn it on
// for one cramped device (e.g. a folded/unfolded phone where desktop-style
// floating panels render at full desktop size) without it following them to
// their PC. Off by default everywhere.
import { useEffect, useState } from "react";

const COMPACT_PANELS_KEY = "arcana_compact_floating_panels";
const COMPACT_PANELS_EVENT = "compact-panels-changed";
const COMPACT_PANEL_SCALE_KEY = "arcana_compact_floating_panels_scale";
const COMPACT_PANEL_SCALE_EVENT = "compact-panels-scale-changed";

export const COMPACT_PANEL_SCALE_MIN = 0.5;
export const COMPACT_PANEL_SCALE_MAX = 1;
export const COMPACT_PANEL_SCALE_DEFAULT = 1;

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

// The slider's own scale value - independent of whether compact panels is
// currently on, so turning the toggle off and back on doesn't reset it.
// Defaults to 100% (no shrink) until the player drags it down.
export function getCompactPanelScale(): number {
  if (typeof window === "undefined") return COMPACT_PANEL_SCALE_DEFAULT;
  const raw = localStorage.getItem(COMPACT_PANEL_SCALE_KEY);
  if (raw === null) return COMPACT_PANEL_SCALE_DEFAULT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return COMPACT_PANEL_SCALE_DEFAULT;
  return Math.min(COMPACT_PANEL_SCALE_MAX, Math.max(COMPACT_PANEL_SCALE_MIN, parsed));
}

export function setCompactPanelScale(scale: number) {
  const clamped = Math.min(COMPACT_PANEL_SCALE_MAX, Math.max(COMPACT_PANEL_SCALE_MIN, scale));
  localStorage.setItem(COMPACT_PANEL_SCALE_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent<number>(COMPACT_PANEL_SCALE_EVENT, { detail: clamped }));
}

export function useCompactPanelScale(): number {
  const [scale, setScale] = useState(getCompactPanelScale);
  useEffect(() => {
    const handler = (e: Event) => setScale((e as CustomEvent<number>).detail);
    window.addEventListener(COMPACT_PANEL_SCALE_EVENT, handler);
    return () => window.removeEventListener(COMPACT_PANEL_SCALE_EVENT, handler);
  }, []);
  return scale;
}
