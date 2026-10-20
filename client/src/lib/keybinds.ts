// Keyboard shortcuts. Every bindable action lives in KEYBIND_ACTIONS with its
// default keys; a user's own choices are saved to their account
// (/api/me/keybinds) so they're the same in every campaign and on every
// device, and a change pushes live to their other open tabs. One window-level
// listener matches presses against the current bindings and runs whatever
// handlers the page has registered for that action.
import { useEffect, useRef, useSyncExternalStore } from "react";

export type KeybindGroup = "Panels" | "Battlemap" | "Hotbar" | "View";

export interface KeybindAction {
  id: string;
  label: string;
  group: KeybindGroup;
  defaults: string[];
  description?: string;
  gmOnly?: boolean;
  /** Keep firing while the key is held. */
  repeat?: boolean;
}

export const KEYBIND_ACTIONS: KeybindAction[] = [
  { id: "panel.chat", label: "Chat", group: "Panels", defaults: [] },
  { id: "panel.characters", label: "Characters / Sheets", group: "Panels", defaults: [] },
  { id: "panel.initiative", label: "Initiative", group: "Panels", defaults: [] },
  { id: "panel.notes", label: "Notes", group: "Panels", defaults: [] },
  { id: "panel.scene", label: "Scene settings", group: "Panels", defaults: [], gmOnly: true },
  { id: "panel.settings", label: "Settings", group: "Panels", defaults: [] },
  { id: "panel.soundscape", label: "Soundscape", group: "Panels", defaults: [] },
  { id: "panel.search", label: "Search", group: "Panels", defaults: ["Alt+L"] },
  { id: "panel.fogTools", label: "Fog of war tools", group: "Panels", defaults: [], gmOnly: true, description: "Walls, doors, windows, lights and fog settings" },
  { id: "panel.levels", label: "Battlemap levels", group: "Panels", defaults: [], gmOnly: true },
  { id: "panel.playerTracker", label: "Design the player tracker", group: "Panels", defaults: [], gmOnly: true, description: "Agnostic systems" },
  { id: "panel.ledger", label: "Working Ledger", group: "Panels", defaults: [], description: "Swampy" },
  { id: "panel.deck", label: "Deck of Houses", group: "Panels", defaults: [], description: "Swampy" },
  { id: "panel.keybinds", label: "Keyboard shortcuts", group: "Panels", defaults: ["Alt+K"] },
  { id: "view.gmPlayer", label: "Switch GM / Player view", group: "View", defaults: ["Ctrl+K"], gmOnly: true, description: "Agnostic systems" },
  { id: "map.toolSelect", label: "Select tool", group: "Battlemap", defaults: [] },
  { id: "map.toolTarget", label: "Target tool", group: "Battlemap", defaults: [] },
  { id: "map.toolRuler", label: "Ruler tool", group: "Battlemap", defaults: [] },
  { id: "map.elevationUp", label: "Raise selected token", group: "Battlemap", defaults: ["PageUp"], repeat: true, description: "One grid step of elevation" },
  { id: "map.elevationDown", label: "Lower selected token", group: "Battlemap", defaults: ["PageDown"], repeat: true, description: "One grid step of elevation" },
  ...Array.from({ length: 10 }, (_, i): KeybindAction => ({
    id: `hotbar.slot${i + 1}`,
    label: `Hotbar slot ${i + 1}`,
    group: "Hotbar",
    defaults: [i === 9 ? "0" : String(i + 1)],
  })),
];

const ACTION_IDS = new Set(KEYBIND_ACTIONS.map((a) => a.id));

// ---------- combos ----------
const MOD_ORDER = ["Ctrl", "Alt", "Shift"] as const;
const NAMED: Record<string, string> = { " ": "Space", Spacebar: "Space", Esc: "Escape", Del: "Delete", Left: "ArrowLeft", Right: "ArrowRight", Up: "ArrowUp", Down: "ArrowDown" };

/** The base key of a press, independent of Shift and keyboard layout where possible. */
function baseKey(e: KeyboardEvent): string | null {
  const k = e.key;
  if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta" || k === "AltGraph" || k === "CapsLock" || k === "Dead" || k === "Unidentified") return null;
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (/^Numpad[0-9]$/.test(e.code)) return `Num${e.code.slice(6)}`;
  if (NAMED[k]) return NAMED[k];
  if (k.length === 1) return k.toUpperCase();
  return k; // F1, PageUp, ArrowUp, Enter, Tab, Backquote...
}

/** "Ctrl+Shift+K" style string for a key press (Cmd on a Mac counts as Ctrl). */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const key = baseKey(e);
  if (!key) return null;
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, key].join("+");
}

export function normalizeCombo(c: string): string {
  const parts = c.split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = MOD_ORDER.filter((m) => parts.some((p) => p.toLowerCase() === m.toLowerCase() || (m === "Ctrl" && /^(cmd|meta|mod)$/i.test(p))));
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join("+");
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
/** For display: Ctrl shows as ⌘ on a Mac. */
export function comboLabel(c: string): string {
  return c.split("+").map((p) => (p === "Ctrl" && isMac ? "⌘" : p === "PageUp" ? "Page Up" : p === "PageDown" ? "Page Down" : p.startsWith("Arrow") ? p.replace("Arrow", "") + " Arrow" : p)).join(" + ");
}

// ---------- current bindings ----------
let overrides: Record<string, string[]> = {};
let version = 0;
const listeners = new Set<() => void>();

export function setKeybindOverrides(next: Record<string, string[]> | null | undefined) {
  const clean: Record<string, string[]> = {};
  for (const [id, combos] of Object.entries(next ?? {})) {
    if (ACTION_IDS.has(id) && Array.isArray(combos)) clean[id] = combos.map(normalizeCombo);
  }
  if (JSON.stringify(clean) === JSON.stringify(overrides)) return;
  overrides = clean;
  version++;
  listeners.forEach((l) => l());
}

export function getKeybindOverrides() { return overrides; }

export function bindingsFor(actionId: string): string[] {
  const a = KEYBIND_ACTIONS.find((x) => x.id === actionId);
  return overrides[actionId] ?? a?.defaults ?? [];
}

export function useKeybindVersion(): number {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => 0);
}

/** The keys bound to an action, for tooltips ("Search (Alt+L)"). */
export function useBindingLabel(actionId: string): string {
  useKeybindVersion();
  const b = bindingsFor(actionId);
  return b.length ? b.map(comboLabel).join(" / ") : "";
}

// ---------- dispatch ----------
const handlers = new Map<string, Set<(e: KeyboardEvent) => void>>();
let recording = false;
/** While the shortcut editor is listening for a new combo, no actions fire. */
export function setKeybindRecording(on: boolean) { recording = on; }

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = ((t as HTMLInputElement).type || "text").toLowerCase();
    return !["checkbox", "radio", "button", "range", "color", "submit", "reset"].includes(type);
  }
  return !!t.closest?.("[contenteditable='true'], .ProseMirror, .cm-editor");
}

let installed = false;
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", (e) => {
    if (recording || e.defaultPrevented) return;
    const combo = comboFromEvent(e);
    if (!combo) return;
    // Plain keys never fire while you're typing; Ctrl/Alt combos still do.
    const hasMod = e.ctrlKey || e.metaKey || e.altKey;
    if (!hasMod && isTyping(e)) return;
    for (const a of KEYBIND_ACTIONS) {
      if (!bindingsFor(a.id).includes(combo)) continue;
      const hs = handlers.get(a.id);
      if (!hs || hs.size === 0) continue;
      if (e.repeat && !a.repeat) { e.preventDefault(); continue; }
      e.preventDefault();
      e.stopPropagation();
      hs.forEach((h) => h(e));
    }
  }, true);
}

/** Run `handler` whenever the user presses one of the keys bound to `actionId`. */
export function useKeybind(actionId: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    install();
    const h = (e: KeyboardEvent) => ref.current(e);
    let set = handlers.get(actionId);
    if (!set) handlers.set(actionId, (set = new Set()));
    set.add(h);
    return () => { set!.delete(h); };
  }, [actionId, enabled]);
}

/** Which other action already uses `combo` (to warn about clashes). */
export function actionUsing(combo: string, exceptId?: string): KeybindAction | undefined {
  return KEYBIND_ACTIONS.find((a) => a.id !== exceptId && bindingsFor(a.id).includes(combo));
}

export async function saveKeybindOverrides(next: Record<string, string[]>): Promise<Record<string, string[]>> {
  setKeybindOverrides(next); // instant locally; the server echo updates other devices
  const res = await fetch("/api/me/keybinds", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keybinds: next }),
  });
  if (!res.ok) throw new Error("Could not save your shortcuts");
  const data = await res.json();
  setKeybindOverrides(data.keybinds);
  return data.keybinds;
}

/** Like useKeybind for a fixed list of actions sharing one handler (e.g. the ten hotbar slots). */
export function useKeybindMany(actionIds: readonly string[], handler: (actionId: string, e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = actionIds.join("|");
  useEffect(() => {
    if (!enabled) return;
    install();
    const added: Array<[Set<(e: KeyboardEvent) => void>, (e: KeyboardEvent) => void]> = [];
    for (const id of key.split("|")) {
      const h = (e: KeyboardEvent) => ref.current(id, e);
      let set = handlers.get(id);
      if (!set) handlers.set(id, (set = new Set()));
      set.add(h);
      added.push([set, h]);
    }
    return () => { for (const [set, h] of added) set.delete(h); };
  }, [key, enabled]);
}
