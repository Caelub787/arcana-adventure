// Just the handle on the open sheet windows: who is open, open one, close one.
//
// Its own file on purpose. Anything that only wants to ask "is this sheet
// open?" — the hotbar, say — would otherwise have to import the window stack,
// and with it every sheet, block and stylesheet underneath.
import { createContext, useContext } from "react";

export interface AgWindowsHandle {
  open: (noteId: string) => void;
  close: (noteId: string) => void;
  openIds: string[];
}
export const AgWindowsCtx = createContext<AgWindowsHandle | null>(null);
/** Null outside the windows: callers fall back to whatever their host does. */
export const useAgWindows = () => useContext(AgWindowsCtx);
