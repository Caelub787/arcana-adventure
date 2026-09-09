// The map editor's undo.
//
// Not "keep the last few pictures of the canvas". A map has hundreds of
// independent objects on it and a canvas snapshot can neither undo moving one
// of them nor be kept a hundred deep without eating the tab's memory. So this
// is a command stack: every edit says how to do itself and how to undo itself,
// and Ctrl+Z walks back through them.
//
// The payoff beyond depth is the History panel: because each entry carries a
// label, the editor can show what was done and let someone click back to any
// point in it, which a stack of bitmaps cannot do.

export interface MapCommand {
  /** What this shows as in the History panel: "Placed oak tree". */
  label: string;
  /** Apply the change. Called once when the command is pushed, and again on redo. */
  redo: () => void | Promise<void>;
  /** Put things back exactly as they were. */
  undo: () => void | Promise<void>;
  /**
   * Commands with the same non-null key made in quick succession collapse into
   * one - dragging an object is a hundred pointer moves and one undo step.
   */
  coalesceKey?: string | null;
  at?: number;
}

export interface HistoryEntry {
  label: string;
  at: number;
}

const DEFAULT_LIMIT = 200;
/** Two edits closer together than this, with the same key, are one edit. */
const COALESCE_MS = 700;

export class MapHistory {
  private done: MapCommand[] = [];
  private undone: MapCommand[] = [];
  private listeners = new Set<() => void>();
  private busy = false;

  constructor(private limit = DEFAULT_LIMIT) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    for (const fn of Array.from(this.listeners)) fn();
  }

  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
  get depth() { return this.done.length; }

  /** Newest last, the order the History panel reads in. */
  entries(): HistoryEntry[] {
    return this.done.map((c) => ({ label: c.label, at: c.at ?? 0 }));
  }

  /**
   * Run a command and remember it.
   *
   * `redo` runs immediately: a command IS the edit, so the caller doesn't
   * apply the change and then separately describe it - that is how the two
   * drift apart and undo starts restoring something that was never there.
   */
  async push(command: MapCommand): Promise<void> {
    if (this.busy) return;
    const at = Date.now();
    const previous = this.done[this.done.length - 1];
    const coalesces =
      !!command.coalesceKey &&
      previous?.coalesceKey === command.coalesceKey &&
      at - (previous.at ?? 0) < COALESCE_MS;

    await command.redo();

    if (coalesces) {
      // Keep the ORIGINAL undo - it restores the state before the whole drag,
      // not before its last frame - and the newest redo, which lands where the
      // drag actually ended.
      this.done[this.done.length - 1] = {
        ...command,
        undo: previous.undo,
        at,
      };
    } else {
      this.done.push({ ...command, at });
      if (this.done.length > this.limit) this.done.shift();
    }
    // Anything undone is unreachable the moment a new edit lands, the same as
    // every other editor.
    this.undone = [];
    this.emit();
  }

  async undo(): Promise<boolean> {
    if (this.busy || this.done.length === 0) return false;
    const command = this.done.pop()!;
    this.busy = true;
    try {
      await command.undo();
    } finally {
      this.busy = false;
    }
    this.undone.push(command);
    this.emit();
    return true;
  }

  async redo(): Promise<boolean> {
    if (this.busy || this.undone.length === 0) return false;
    const command = this.undone.pop()!;
    this.busy = true;
    try {
      await command.redo();
    } finally {
      this.busy = false;
    }
    this.done.push(command);
    this.emit();
    return true;
  }

  /**
   * Roll back to a point in the History panel. `index` is the entry that
   * should end up as the newest one still applied; -1 undoes everything.
   */
  async revertTo(index: number): Promise<void> {
    while (this.done.length > index + 1) {
      const ok = await this.undo();
      if (!ok) break;
    }
  }

  clear() {
    this.done = [];
    this.undone = [];
    this.emit();
  }
}
