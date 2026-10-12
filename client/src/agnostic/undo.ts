// Sheet-level undo for things outside the text editor (value changes,
// template switches). Ctrl+Z inside a document is the editor's own history;
// Ctrl+Z anywhere else on an Agnostic sheet walks this stack.
export interface UndoEntry {
  label: string;
  undo: () => Promise<unknown> | void;
}

const stack: UndoEntry[] = [];
const listeners = new Set<() => void>();
const MAX = 100;

export function pushUndo(e: UndoEntry) {
  stack.push(e);
  if (stack.length > MAX) stack.shift();
  listeners.forEach((l) => l());
}

export async function undoLast(): Promise<UndoEntry | null> {
  const e = stack.pop() ?? null;
  listeners.forEach((l) => l());
  if (e) await e.undo();
  return e;
}

export function peekUndo(): UndoEntry | null {
  return stack[stack.length - 1] ?? null;
}

export function onUndoChange(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** True when the key event belongs to a text field / editor (they have their own undo). */
export function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
