// A safety catch on a sheet's remove and unlink buttons.
//
// A character sheet is mostly a list of things with a little bin beside each
// one: items, abilities, traits, wounds, skills, rolls, effects. They are easy
// to hit by accident — on a phone especially — and what goes is someone's
// sword. So a sheet starts with all of them hidden, and the lock beside Share
// shows them until it is pressed again.
//
// It is a guard against the slip, not a permission: what anyone is allowed to
// remove is unchanged, and is still checked on the server. Anywhere outside a
// sheet (the sidebar, the hotbar, a token's menu) nothing is hidden.
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Lock, LockOpen } from "lucide-react";

const Ctx = createContext<{ on: boolean; set: (on: boolean) => void } | null>(null);

/** Wraps a sheet: its remove buttons stay hidden until someone asks for them. */
export function RemoveGuard({ children }: { children: React.ReactNode }) {
  const [on, set] = useState(false);
  const value = useMemo(() => ({ on, set }), [on]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** May a remove / unlink button be shown here? Outside a sheet, always. */
export function useRemovingShown(): boolean {
  return useContext(Ctx)?.on ?? true;
}

/** The lock itself, for the row of buttons at the top of a sheet. */
export function RemoveGuardButton() {
  const ctx = useContext(Ctx);
  const set = ctx?.set;
  const on = !!ctx?.on;
  const toggle = useCallback(() => set?.(!on), [set, on]);
  if (!ctx) return null;
  return (
    <button type="button" onClick={toggle} data-testid="ag-sheet-remove-guard"
      aria-pressed={on}
      title={on
        ? "The remove and unlink buttons are showing. Press to put them away."
        : "Remove and unlink buttons are hidden, so nothing goes by accident. Press to show them."}
      className={`h-7 px-2 rounded text-[11px] inline-flex items-center gap-1 border ${
        on ? "text-red-200 border-red-800/70 bg-red-950/40 hover:bg-red-900/40"
           : "text-stone-400 border-stone-700 hover:text-stone-100 hover:bg-stone-800"}`}>
      {on ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{on ? "Removing" : "Locked"}</span>
    </button>
  );
}
