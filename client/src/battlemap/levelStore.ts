// The battlemap level this client is currently viewing, per scene. The
// BattleMap decides it (a player follows their own token's elevation, a GM
// picks or follows their selection) and publishes it here so the fog of war,
// wall/door/light tools and pins - which live in separate components - all
// show and edit the same level without threading props through every layer.
import { useCallback, useSyncExternalStore } from "react";
import { BASE_LEVEL_ID, onLevel, storedLevelId } from "@shared/battlemapLevels";

const current = new Map<string, string>();
const listeners = new Set<() => void>();

export function setViewLevel(sceneId: string | null | undefined, levelId: string | null | undefined) {
  if (!sceneId) return;
  const next = levelId || BASE_LEVEL_ID;
  if (current.get(sceneId) === next) return;
  current.set(sceneId, next);
  listeners.forEach((l) => l());
}

export function getViewLevel(sceneId: string | null | undefined): string {
  return (sceneId && current.get(sceneId)) || BASE_LEVEL_ID;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useViewLevel(sceneId: string | null | undefined): string {
  return useSyncExternalStore(subscribe, () => getViewLevel(sceneId), () => BASE_LEVEL_ID);
}

/** `select` for a scene-object query (walls, doors, lights...): only what's on the level being viewed. */
export function useLevelSelect<T extends { levelId?: string | null }>(sceneId: string | null | undefined) {
  const levelId = useViewLevel(sceneId);
  return useCallback((rows: T[]) => (Array.isArray(rows) ? rows.filter((r) => onLevel(r?.levelId, levelId)) : rows), [levelId]);
}

/** The levelId to save on something drawn right now (ground = null). */
export function levelIdForNew(sceneId: string | null | undefined): string | null {
  return storedLevelId(getViewLevel(sceneId));
}
