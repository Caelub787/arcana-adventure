import { describe, it, expect } from 'vitest';
import {
  splitLeaf,
  closeLeaf,
  assignToPane,
  type PaneTree,
  type PaneLeaf,
  type PaneSplit,
} from './paneTree';

// Deterministic id generator for predictable assertions.
function makeIdGen(prefix = 'gen') {
  let n = 0;
  return () => `${prefix}${n++}`;
}

const leaf = (id: string, nodeKey: string | null = null): PaneLeaf => ({
  type: 'leaf',
  id,
  nodeKey,
});

// Collect leaves left-to-right (depth-first).
function leaves(tree: PaneTree): PaneLeaf[] {
  if (tree.type === 'leaf') return [tree];
  return [...leaves(tree.a), ...leaves(tree.b)];
}

describe('splitLeaf', () => {
  it('splits a single leaf into a split with the original leaf and a new empty leaf', () => {
    const tree = leaf('root', 'node-a');
    const result = splitLeaf(tree, 'root', 'h', makeIdGen());

    expect(result.type).toBe('split');
    const split = result as PaneSplit;
    expect(split.dir).toBe('h');
    expect(split.id).toBe('gen0');
    expect(split.a).toEqual(leaf('root', 'node-a'));
    expect(split.b).toEqual(leaf('gen1', null));
  });

  it('respects the requested split direction', () => {
    const result = splitLeaf(leaf('root'), 'root', 'v', makeIdGen());
    expect((result as PaneSplit).dir).toBe('v');
  });

  it('returns the same leaf unchanged when paneId does not match', () => {
    const tree = leaf('root', 'node-a');
    const result = splitLeaf(tree, 'missing', 'h', makeIdGen());
    expect(result).toBe(tree);
  });

  it('splits a nested leaf inside a split tree without touching siblings', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', 'L'),
      b: leaf('right', 'R'),
    };
    const result = splitLeaf(tree, 'right', 'v', makeIdGen()) as PaneSplit;

    // Left subtree untouched.
    expect(result.a).toEqual(leaf('left', 'L'));
    // Right subtree replaced with a new split containing the original right leaf.
    expect(result.b.type).toBe('split');
    const rightSplit = result.b as PaneSplit;
    expect(rightSplit.dir).toBe('v');
    expect(rightSplit.a).toEqual(leaf('right', 'R'));
    expect(rightSplit.b).toEqual(leaf('gen1', null));
  });

  it('does not mutate the input tree', () => {
    const tree = leaf('root', 'node-a');
    const snapshot = JSON.parse(JSON.stringify(tree));
    splitLeaf(tree, 'root', 'h', makeIdGen());
    expect(tree).toEqual(snapshot);
  });

  it('uses the default id generator when none is supplied', () => {
    const result = splitLeaf(leaf('root'), 'root', 'h') as PaneSplit;
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect((result.b as PaneLeaf).id).not.toBe(result.id);
  });
});

describe('closeLeaf', () => {
  it('returns null when closing the only leaf', () => {
    expect(closeLeaf(leaf('root'), 'root')).toBeNull();
  });

  it('returns the leaf unchanged when paneId does not match', () => {
    const tree = leaf('root', 'X');
    expect(closeLeaf(tree, 'missing')).toBe(tree);
  });

  it('collapses the split into the surviving sibling when one child is closed', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', 'L'),
      b: leaf('right', 'R'),
    };
    expect(closeLeaf(tree, 'left')).toEqual(leaf('right', 'R'));
    expect(closeLeaf(tree, 'right')).toEqual(leaf('left', 'L'));
  });

  it('preserves the split structure when the closed pane lives in a deeper subtree', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', 'L'),
      b: {
        type: 'split',
        id: 's1',
        dir: 'v',
        a: leaf('mid', 'M'),
        b: leaf('right', 'R'),
      },
    };
    const result = closeLeaf(tree, 'mid') as PaneSplit;
    expect(result.type).toBe('split');
    expect(result.a).toEqual(leaf('left', 'L'));
    // The inner split collapses to the surviving right leaf.
    expect(result.b).toEqual(leaf('right', 'R'));
  });

  it('does not mutate the input tree', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', 'L'),
      b: leaf('right', 'R'),
    };
    const snapshot = JSON.parse(JSON.stringify(tree));
    closeLeaf(tree, 'left');
    expect(tree).toEqual(snapshot);
  });
});

describe('assignToPane', () => {
  it('sets the nodeKey on the targeted pane by id', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', null),
      b: leaf('right', null),
    };
    const result = assignToPane(tree, 'right', 'node-x') as PaneSplit;
    expect(result.a).toEqual(leaf('left', null));
    expect(result.b).toEqual(leaf('right', 'node-x'));
  });

  it('can clear a pane by assigning null', () => {
    const result = assignToPane(leaf('root', 'old'), 'root', null);
    expect(result).toEqual(leaf('root', null));
  });

  it('returns an equivalent tree when the target id is not found', () => {
    const tree = leaf('root', 'keep');
    expect(assignToPane(tree, 'missing', 'new')).toEqual(leaf('root', 'keep'));
  });

  it('fills the first empty leaf (left-to-right) when no paneId is given', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', 'occupied'),
      b: {
        type: 'split',
        id: 's1',
        dir: 'v',
        a: leaf('mid', null),
        b: leaf('right', null),
      },
    };
    const result = assignToPane(tree, null, 'node-y');
    const ls = leaves(result);
    expect(ls.map((l) => l.nodeKey)).toEqual(['occupied', 'node-y', null]);
  });

  it('overwrites the first leaf when no pane is empty and no paneId is given', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', 'a'),
      b: leaf('right', 'b'),
    };
    const result = assignToPane(tree, null, 'node-z');
    const ls = leaves(result);
    expect(ls.map((l) => l.nodeKey)).toEqual(['node-z', 'b']);
  });

  it('does not mutate the input tree', () => {
    const tree: PaneSplit = {
      type: 'split',
      id: 's0',
      dir: 'h',
      a: leaf('left', null),
      b: leaf('right', null),
    };
    const snapshot = JSON.parse(JSON.stringify(tree));
    assignToPane(tree, 'left', 'x');
    assignToPane(tree, null, 'y');
    expect(tree).toEqual(snapshot);
  });
});

describe('split → assign → close round trip', () => {
  it('keeps layouts consistent across a sequence of operations', () => {
    const idGen = makeIdGen();
    let tree: PaneTree = leaf('root', 'home');

    // Split the root horizontally -> new empty pane appears.
    tree = splitLeaf(tree, 'root', 'h', idGen);
    expect(leaves(tree).map((l) => l.nodeKey)).toEqual(['home', null]);

    // Assign a node to the new empty pane (auto-fill).
    tree = assignToPane(tree, null, 'wiki');
    expect(leaves(tree).map((l) => l.nodeKey)).toEqual(['home', 'wiki']);

    // Close the original 'root' pane -> tree collapses to the wiki leaf.
    const closed = closeLeaf(tree, 'root');
    expect(closed).toEqual(leaf('gen1', 'wiki'));
  });
});
