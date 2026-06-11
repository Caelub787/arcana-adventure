type Handlers = { undo: () => void; redo: () => void };

const registry = new Map<string, Handlers>();
let lastActivePaneId: string | null = null;

export function registerPaneShortcuts(
  paneId: string,
  handlers: Handlers,
): () => void {
  registry.set(paneId, handlers);
  return () => {
    if (registry.get(paneId) === handlers) registry.delete(paneId);
    if (lastActivePaneId === paneId) lastActivePaneId = null;
  };
}

export function notePaneActive(paneId: string): void {
  if (registry.has(paneId)) lastActivePaneId = paneId;
}

export function getPaneHandlers(
  preferredPaneId: string | null,
): Handlers | null {
  if (preferredPaneId) {
    const h = registry.get(preferredPaneId);
    if (h) return h;
  }
  if (lastActivePaneId) {
    const h = registry.get(lastActivePaneId);
    if (h) return h;
  }
  return null;
}
