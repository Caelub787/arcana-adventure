// Roll display sorting / grouping utility shared by RollEntriesEditor and any
// future read-only roll renderers (character sheets, hover cards, etc.).
//
// Concepts
// --------
// Each roll has:
//   - `priority` (int, default 1) — lower = higher up
//   - `sortOrder` (int) — manual reorder tiebreak inside the same priority bucket
//   - `folder` (string|null) — optional visual grouping
//
// Inherited rolls (those with `fromTemplateRollId`) are decorated server-side
// with `templateOwnerKey`, `templatePriority`, and `templateUseOwnOrder`.
// When a template has `templateUseOwnOrder=true`, ALL its inherited rolls on
// this owner render as one contiguous block, anchored at `templatePriority`,
// internally ordered by their own per-roll priorities and folder structure.
// When false, inherited rolls behave like native rolls — they participate in
// the owner's overall priority sort.
//
// Folders are emergent: rolls with the same `folder` string get a folder
// header. A folder's effective priority = the minimum priority of its rolls.
// Bare rolls (folder=null/empty) and folder groups interleave by their own
// effective priority. Same logic recurses inside a template-group block.

export interface RollLike {
  // Optional so client-only drafts (pre-server-id) can be sorted/grouped too.
  id?: string;
  priority?: number | null;
  sortOrder?: number | null;
  folder?: string | null;
  fromTemplateRollId?: string | null;
  templateOwnerKey?: string;
  templateName?: string;
  templatePriority?: number | null;
  templateUseOwnOrder?: boolean | null;
}

export type RollDisplayNode<R extends RollLike> =
  | { kind: 'roll'; roll: R }
  | { kind: 'folder'; folder: string; rolls: R[] }
  | {
      kind: 'template-group';
      templateOwnerKey: string;
      templateName?: string;
      // The template group is itself an ordered list of folder/roll nodes,
      // so a template's internal folder structure is preserved.
      children: Array<
        | { kind: 'roll'; roll: R }
        | { kind: 'folder'; folder: string; rolls: R[] }
      >;
    };

const getPriority = (r: RollLike): number => (r.priority ?? 1);
const getSort = (r: RollLike): number => (r.sortOrder ?? 0);

function compareRolls(a: RollLike, b: RollLike): number {
  const dp = getPriority(a) - getPriority(b);
  if (dp !== 0) return dp;
  return getSort(a) - getSort(b);
}

// Build folder/roll nodes from a list of rolls, interleaving bare rolls and
// folder headers by each item's effective priority.
function buildFolderedList<R extends RollLike>(rolls: R[]): Array<
  | { kind: 'roll'; roll: R }
  | { kind: 'folder'; folder: string; rolls: R[] }
> {
  type Node =
    | { kind: 'roll'; roll: R; effectivePriority: number; effectiveSort: number }
    | { kind: 'folder'; folder: string; rolls: R[]; effectivePriority: number; effectiveSort: number };

  const folderMap = new Map<string, R[]>();
  const bareRolls: R[] = [];
  for (const r of rolls) {
    const f = (r.folder ?? '').trim();
    if (f) {
      if (!folderMap.has(f)) folderMap.set(f, []);
      folderMap.get(f)!.push(r);
    } else {
      bareRolls.push(r);
    }
  }

  const nodes: Node[] = [];
  for (const r of bareRolls) {
    nodes.push({ kind: 'roll', roll: r, effectivePriority: getPriority(r), effectiveSort: getSort(r) });
  }
  for (const [folder, list] of folderMap) {
    list.sort(compareRolls);
    const minPriority = list.reduce((m, r) => Math.min(m, getPriority(r)), Number.POSITIVE_INFINITY);
    const minSort = list.reduce((m, r) => Math.min(m, getSort(r)), Number.POSITIVE_INFINITY);
    nodes.push({ kind: 'folder', folder, rolls: list, effectivePriority: minPriority, effectiveSort: minSort });
  }
  nodes.sort((a, b) => {
    const dp = a.effectivePriority - b.effectivePriority;
    if (dp !== 0) return dp;
    return a.effectiveSort - b.effectiveSort;
  });
  return nodes.map(n => n.kind === 'roll'
    ? { kind: 'roll', roll: n.roll }
    : { kind: 'folder', folder: n.folder, rolls: n.rolls });
}

/**
 * Sort and group an owner's roll list for display.
 *
 * Returns a flat ordered list of nodes:
 *  - `roll`           — a single bare roll (no folder, not in an isolated template group)
 *  - `folder`         — a folder header containing one or more rolls (sorted internally)
 *  - `template-group` — a contiguous block of inherited rolls from a template that
 *                      has `templateUseOwnOrder=true`. The block contains its own
 *                      ordered roll/folder children (folders inside the template
 *                      are preserved). The block is positioned at the template's
 *                      `templatePriority` value.
 */
export function sortRollsForDisplay<R extends RollLike>(rolls: R[]): RollDisplayNode<R>[] {
  // Partition rolls: those belonging to an isolated template group vs everything else.
  // A roll is "isolated" iff it is inherited (`fromTemplateRollId` set) AND its
  // source template has `templateUseOwnOrder=true`. Such rolls render as one
  // contiguous block placed at the template's `templatePriority`.
  const isolatedByTemplate = new Map<string, { templateName?: string; templatePriority: number; rolls: R[] }>();
  const free: R[] = [];
  for (const r of rolls) {
    if (r.fromTemplateRollId && r.templateUseOwnOrder && r.templateOwnerKey) {
      const key = r.templateOwnerKey;
      if (!isolatedByTemplate.has(key)) {
        isolatedByTemplate.set(key, {
          templateName: r.templateName,
          templatePriority: r.templatePriority ?? 1,
          rolls: [],
        });
      }
      isolatedByTemplate.get(key)!.rolls.push(r);
    } else {
      free.push(r);
    }
  }

  // Build the free-roll display list (interleaved folders + bare rolls).
  type TopNode =
    | { kind: 'roll'; roll: R; effectivePriority: number; effectiveSort: number }
    | { kind: 'folder'; folder: string; rolls: R[]; effectivePriority: number; effectiveSort: number }
    | {
        kind: 'template-group';
        templateOwnerKey: string;
        templateName?: string;
        children: Array<{ kind: 'roll'; roll: R } | { kind: 'folder'; folder: string; rolls: R[] }>;
        effectivePriority: number;
        effectiveSort: number;
      };

  const topNodes: TopNode[] = [];

  // Free rolls: bucket by folder
  const folderMap = new Map<string, R[]>();
  const bareRolls: R[] = [];
  for (const r of free) {
    const f = (r.folder ?? '').trim();
    if (f) {
      if (!folderMap.has(f)) folderMap.set(f, []);
      folderMap.get(f)!.push(r);
    } else {
      bareRolls.push(r);
    }
  }
  for (const r of bareRolls) {
    topNodes.push({ kind: 'roll', roll: r, effectivePriority: getPriority(r), effectiveSort: getSort(r) });
  }
  for (const [folder, list] of folderMap) {
    list.sort(compareRolls);
    const minPriority = list.reduce((m, r) => Math.min(m, getPriority(r)), Number.POSITIVE_INFINITY);
    const minSort = list.reduce((m, r) => Math.min(m, getSort(r)), Number.POSITIVE_INFINITY);
    topNodes.push({ kind: 'folder', folder, rolls: list, effectivePriority: minPriority, effectiveSort: minSort });
  }

  // Isolated template groups: each one is a single anchor at templatePriority.
  for (const [ownerKey, group] of isolatedByTemplate) {
    const children = buildFolderedList(group.rolls);
    topNodes.push({
      kind: 'template-group',
      templateOwnerKey: ownerKey,
      templateName: group.templateName,
      children,
      effectivePriority: group.templatePriority,
      effectiveSort: 0,
    });
  }

  topNodes.sort((a, b) => {
    const dp = a.effectivePriority - b.effectivePriority;
    if (dp !== 0) return dp;
    return a.effectiveSort - b.effectiveSort;
  });

  return topNodes.map((n): RollDisplayNode<R> => {
    if (n.kind === 'roll') return { kind: 'roll', roll: n.roll };
    if (n.kind === 'folder') return { kind: 'folder', folder: n.folder, rolls: n.rolls };
    return {
      kind: 'template-group',
      templateOwnerKey: n.templateOwnerKey,
      templateName: n.templateName,
      children: n.children,
    };
  });
}

/** Collect all distinct folder strings across a roll list (for autocomplete). */
export function collectFolderNames(rolls: RollLike[]): string[] {
  const set = new Set<string>();
  for (const r of rolls) {
    const f = (r.folder ?? '').trim();
    if (f) set.add(f);
  }
  return Array.from(set).sort();
}
