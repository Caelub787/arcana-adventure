/**
 * Folders.
 *
 * A folder is nothing but a path written on the sheet itself —
 * "Weapons/Templates" means the sheet sits in Templates, inside Weapons.
 * Nothing else stores them, so there is no second list to keep in step, no
 * ids to go stale, and filing something is one word changing on one row.
 *
 * A folder nobody has put anything in yet has no sheet to be written on, so
 * the browser remembers those itself until something lands in one.
 */
export const FOLDER_SEP = "/";

export const splitFolder = (path: string | null | undefined): string[] =>
  String(path ?? "").split(FOLDER_SEP).map((s) => s.trim()).filter(Boolean);

export const joinFolder = (parts: string[]): string => parts.filter(Boolean).join(FOLDER_SEP);

/** "Weapons/Templates" → "Weapons/Templates" with the stray spaces and slashes gone. */
export const normalizeFolder = (path: string | null | undefined): string => joinFolder(splitFolder(path));

/** The last part: what the folder is called. */
export const folderName = (path: string): string => splitFolder(path).slice(-1)[0] ?? "";

/** The folder it sits in ("" for one at the top). */
export const parentFolder = (path: string): string => joinFolder(splitFolder(path).slice(0, -1));

/** A folder inside another. */
export const childFolder = (parent: string, name: string): string =>
  joinFolder([...splitFolder(parent), ...splitFolder(name)]);

/** True for the folder itself and for everything filed anywhere under it. */
export const inFolder = (path: string | null | undefined, folder: string): boolean => {
  const p = normalizeFolder(path);
  const f = normalizeFolder(folder);
  return !f || p === f || p.startsWith(f + FOLDER_SEP);
};

/** Where a path ends up once `from` has been moved to `to`. Others are left alone. */
export const movedFolder = (path: string | null | undefined, from: string, to: string): string => {
  const p = normalizeFolder(path);
  const f = normalizeFolder(from);
  if (!f || !inFolder(p, f)) return p;
  return joinFolder([...splitFolder(to), ...splitFolder(p.slice(f.length))]);
};

/** A folder can't be dropped into itself, or into one of its own folders. */
export const canMoveFolder = (from: string, to: string): boolean => {
  const f = normalizeFolder(from), t = normalizeFolder(to);
  return !!f && f !== t && !inFolder(t, f) && parentFolder(f) !== t;
};

/** Typed-in names are one folder, not a path: a slash would make a second one. */
export const cleanFolderName = (name: string): string =>
  String(name ?? "").replace(/[\/\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export interface FolderNode<T> {
  /** Full path; "" is the top of the tab. */
  path: string;
  name: string;
  folders: FolderNode<T>[];
  items: T[];
}

/**
 * The tree a tab shows: every folder anything is filed in, every folder
 * someone made and hasn't filled yet, and the folders in between.
 */
export function buildFolderTree<T extends { folder: string | null }>(items: T[], known: string[] = []): FolderNode<T> {
  const root: FolderNode<T> = { path: "", name: "", folders: [], items: [] };
  const byPath = new Map<string, FolderNode<T>>([["", root]]);
  const ensure = (path: string): FolderNode<T> => {
    const p = normalizeFolder(path);
    const have = byPath.get(p);
    if (have) return have;
    const node: FolderNode<T> = { path: p, name: folderName(p), folders: [], items: [] };
    byPath.set(p, node);
    ensure(parentFolder(p)).folders.push(node);
    return node;
  };
  for (const k of known) if (normalizeFolder(k)) ensure(k);
  for (const item of items) ensure(item.folder ?? "").items.push(item);
  const sort = (n: FolderNode<T>) => { n.folders.sort((a, b) => a.name.localeCompare(b.name)); n.folders.forEach(sort); };
  sort(root);
  return root;
}

/** Every folder in the tree, deepest last — for pickers and menus. */
export function flattenFolders<T>(node: FolderNode<T>, out: FolderNode<T>[] = []): FolderNode<T>[] {
  for (const f of node.folders) { out.push(f); flattenFolders(f, out); }
  return out;
}

/** How much is in a folder, counting everything in the folders inside it. */
export function countIn<T>(node: FolderNode<T>): number {
  return node.items.length + node.folders.reduce((n, f) => n + countIn(f), 0);
}

/**
 * A folder nobody has filled yet belongs to one tab of the browser, so it is
 * remembered as "items::Weapons" — the tab, then the path.
 */
export const tabFolderKey = (tab: string, path: string): string => `${tab}::${normalizeFolder(path)}`;
export const parseTabFolder = (key: string): { tab: string; path: string } | null => {
  const i = String(key ?? "").indexOf("::");
  if (i < 1) return null;
  const path = normalizeFolder(key.slice(i + 2));
  return path ? { tab: key.slice(0, i), path } : null;
};
