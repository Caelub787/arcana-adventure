// --- Pane tiling tree (pure helpers, extracted for testability) ---
export type PaneLeaf = { type: 'leaf'; id: string; nodeKey: string | null };
export type PaneSplit = { type: 'split'; id: string; dir: 'h' | 'v'; a: PaneTree; b: PaneTree };
export type PaneTree = PaneLeaf | PaneSplit;

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function splitLeaf(tree: PaneTree, paneId: string, dir: 'h' | 'v', idGen: () => string = newId): PaneTree {
  if (tree.type === 'leaf') {
    if (tree.id !== paneId) return tree;
    return {
      type: 'split',
      id: idGen(),
      dir,
      a: tree,
      b: { type: 'leaf', id: idGen(), nodeKey: null },
    };
  }
  return { ...tree, a: splitLeaf(tree.a, paneId, dir, idGen), b: splitLeaf(tree.b, paneId, dir, idGen) };
}

export function closeLeaf(tree: PaneTree, paneId: string): PaneTree | null {
  if (tree.type === 'leaf') {
    return tree.id === paneId ? null : tree;
  }
  const a = closeLeaf(tree.a, paneId);
  const b = closeLeaf(tree.b, paneId);
  if (a === null) return b;
  if (b === null) return a;
  return { ...tree, a, b };
}

// Set nodeKey on the leaf matching paneId (returns same ref if not found).
function setPaneNodeById(tree: PaneTree, paneId: string, key: string | null): PaneTree {
  if (tree.type === 'leaf') {
    return tree.id === paneId ? { ...tree, nodeKey: key } : tree;
  }
  return { ...tree, a: setPaneNodeById(tree.a, paneId, key), b: setPaneNodeById(tree.b, paneId, key) };
}

// Fill the first (left-to-right, depth-first) empty leaf. Returns null when none.
function fillFirstEmpty(tree: PaneTree, key: string | null): PaneTree | null {
  if (tree.type === 'leaf') {
    return tree.nodeKey === null ? { ...tree, nodeKey: key } : null;
  }
  const a = fillFirstEmpty(tree.a, key);
  if (a) return { ...tree, a };
  const b = fillFirstEmpty(tree.b, key);
  if (b) return { ...tree, b };
  return null;
}

// Replace the first (left-to-right) leaf's nodeKey regardless of occupancy.
function replaceFirstLeaf(tree: PaneTree, key: string | null): PaneTree {
  if (tree.type === 'leaf') return { ...tree, nodeKey: key };
  return { ...tree, a: replaceFirstLeaf(tree.a, key) };
}

export function assignToPane(tree: PaneTree, paneId: string | null, key: string | null): PaneTree {
  if (paneId) return setPaneNodeById(tree, paneId, key);
  // No explicit target: prefer the first empty leaf, otherwise overwrite the first leaf.
  return fillFirstEmpty(tree, key) ?? replaceFirstLeaf(tree, key);
}
