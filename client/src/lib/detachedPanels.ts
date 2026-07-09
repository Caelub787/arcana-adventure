// Pure helpers for the detached item-detail panels hosted by Campaign.tsx.
// Extracted so the multi-panel bookkeeping (open/close/stagger) and the
// query-cache mutations used by DetachedItemDetailPanel can be unit-tested
// without booting the full Campaign page.
//
// Why this matters: multiple item panels can be open at once, all reading from
// the SAME ['items', characterId] query cache. A mutation fired from one panel
// (update/delete) must only touch its own item's row — any sloppy cache write
// here silently corrupts every other open panel.

export interface DetachedItemPanel {
  character: any;
  item: any;
  panelKey: string;
  offsetIndex: number;
}

export function itemPanelKey(characterId: string, itemId: string): string {
  return `item-detail-${characterId}-${itemId}`;
}

/**
 * Add a panel for (character, item) to the list. If a panel with the same key
 * is already open, the list is returned unchanged (caller just re-focuses it).
 * New panels get an `offsetIndex` one past the highest index currently in use
 * (NOT `prev.length` — after closing an earlier panel, length could collide
 * with a still-open panel's index and stack the new panel exactly on top of
 * it) so each subsequent panel opens staggered from the previous one.
 */
export function openItemPanel(
  panels: DetachedItemPanel[],
  character: any,
  item: any,
): DetachedItemPanel[] {
  const panelKey = itemPanelKey(character.id, item.id);
  if (panels.some((p) => p.panelKey === panelKey)) return panels;
  const offsetIndex = panels.length === 0 ? 0 : Math.max(...panels.map((p) => p.offsetIndex)) + 1;
  return [...panels, { character, item, panelKey, offsetIndex }];
}

/** Remove exactly the panel with `panelKey`; all other panels are untouched. */
export function closeItemPanel(
  panels: DetachedItemPanel[],
  panelKey: string,
): DetachedItemPanel[] {
  return panels.filter((p) => p.panelKey !== panelKey);
}

/**
 * Stagger position for the Nth panel (offsetIndex > 0). Mirrors the centered
 * default of FloatingPanel for index 0 and shifts each subsequent panel down
 * and right by PANEL_STAGGER_PX so panels never open exactly on top of each
 * other. Returns undefined for index 0 (FloatingPanel centers it itself).
 */
export const PANEL_STAGGER_PX = 30;

export function itemPanelStaggerPosition(
  offsetIndex: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } | undefined {
  if (offsetIndex <= 0) return undefined;
  return {
    x: Math.max(20, Math.floor((viewportWidth - 720) / 2) + offsetIndex * PANEL_STAGGER_PX),
    y: Math.max(
      20,
      Math.floor((viewportHeight - Math.min(880, viewportHeight - 40)) / 2) +
        offsetIndex * PANEL_STAGGER_PX,
    ),
  };
}

/**
 * Optimistic cache write for an item update: patch ONLY the row with `id`,
 * leave every other row (and its object identity) alone so concurrently open
 * panels for other items are not disturbed.
 */
export function applyOptimisticItemUpdate<T extends { id?: string }>(
  old: T[] | undefined,
  id: string,
  data: Partial<T>,
): T[] {
  return (old ?? []).map((it) => (it.id === id ? { ...it, ...data } : it));
}

/**
 * Optimistic cache write for an item delete: remove the row with `deletedId`
 * plus any nested container children, leaving all other rows untouched.
 */
export function applyOptimisticItemDelete<T extends { id?: string; containerId?: string | null }>(
  old: T[] | undefined,
  deletedId: string,
): T[] {
  if (!old) return [];
  const idsToRemove = new Set<string>([deletedId]);
  const findChildren = (parentId: string) => {
    old.forEach((it) => {
      if (it.containerId === parentId && it.id) {
        idsToRemove.add(it.id);
        findChildren(it.id);
      }
    });
  };
  findChildren(deletedId);
  return old.filter((it) => !it.id || !idsToRemove.has(it.id));
}

/**
 * Resolve the live item a panel should render: the snapshot the panel was
 * opened with, overlaid with the current cache row for the SAME id. A missing
 * cache row (e.g. mid-refetch) falls back to the snapshot rather than blanking
 * the panel; a different item's row is never used.
 */
export function resolveLivePanelItem<T extends { id?: string }>(
  item: T | null | undefined,
  items: T[] | null | undefined,
): T | null | undefined {
  if (!item) return item;
  return { ...item, ...(items?.find((it) => it.id === item.id) || {}) };
}
