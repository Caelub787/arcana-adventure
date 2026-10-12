// Sheet-level undo for things outside the text editor (value changes,
// template switches). Ctrl+Z inside a document is the editor's own history;
// Ctrl+Z anywhere else on an Agnostic sheet walks this stack.
//
// One stack per scope (campaign / library): undoing in one campaign can never
// touch another campaign that was open earlier in the same tab.
export interface UndoEntry {
  label: string;
  undo: () => Promise<unknown> | void;
}

const stacks = new Map<string, UndoEntry[]>();
const listeners = new Set<() => void>();
const MAX = 100;

export function pushUndo(scopeKey: string, e: UndoEntry) {
  const stack = stacks.get(scopeKey) ?? [];
  stack.push(e);
  if (stack.length > MAX) stack.shift();
  stacks.set(scopeKey, stack);
  listeners.forEach((l) => l());
}

export async function undoLast(scopeKey: string): Promise<UndoEntry | null> {
  const e = stacks.get(scopeKey)?.pop() ?? null;
  listeners.forEach((l) => l());
  if (e) await e.undo();
  return e;
}

export function peekUndo(scopeKey: string): UndoEntry | null {
  const stack = stacks.get(scopeKey);
  return stack?.[stack.length - 1] ?? null;
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
