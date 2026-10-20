import { describe, expect, it } from 'vitest';
import {
  flattenTree,
  getProjection,
  guideFlags,
  itemsFor,
  projectionTarget,
  siblingMoveTarget,
  withoutDescendants,
  type FlatItem,
} from './dnd';
import { addTask, emptyTree, moveTask, toggleDone, updateTask } from './tree';
import type { TaskTree } from '../types';

const item = (id: string, depth: number, parentId: string | null = null): FlatItem => ({
  id,
  depth,
  parentId,
});

describe('getProjection', () => {
  it('nests under the previous sibling when dragged right', () => {
    const items = [item('a', 0), item('b', 0), item('c', 0)];
    expect(getProjection(items, 'b', 'b', 22, 22)).toMatchObject({
      depth: 1,
      parentId: 'a',
      afterId: null,
      index: 0,
    });
  });

  it('rounds the offset to whole indent steps', () => {
    const items = [item('a', 0), item('b', 0)];
    expect(getProjection(items, 'b', 'b', 10, 22)?.depth).toBe(0);
    expect(getProjection(items, 'b', 'b', 12, 22)?.depth).toBe(1);
  });

  it('outdents when dragged left, landing after the old parent', () => {
    const items = [item('a', 0), item('a1', 1, 'a'), item('a2', 1, 'a')];
    expect(getProjection(items, 'a2', 'a2', -22, 22)).toMatchObject({
      depth: 0,
      parentId: null,
      afterId: 'a',
      index: 1,
    });
  });

  it('clamps at the top row: no parent above it', () => {
    const items = [item('a', 0), item('b', 0)];
    const right = getProjection(items, 'a', 'a', 200, 22);
    expect(right).toMatchObject({ depth: 0, maxDepth: 0, parentId: null, index: 0 });
    expect(getProjection(items, 'b', 'a', 200, 22)).toMatchObject({ depth: 0, parentId: null });
    expect(getProjection(items, 'a', 'a', -200, 22)?.depth).toBe(0);
  });

  it('cannot nest deeper than one below the previous row', () => {
    const items = [item('a', 0), item('a1', 1, 'a'), item('b', 0)];
    expect(getProjection(items, 'b', 'b', 220, 22)).toMatchObject({
      depth: 2,
      maxDepth: 2,
      parentId: 'a1',
    });
  });

  it('cannot leave the parent of the row that follows it', () => {
    const items = [item('a', 0), item('a1', 1, 'a'), item('a2', 1, 'a')];
    const p = getProjection(items, 'a2', 'a1', -220, 22);
    expect(p).toMatchObject({ depth: 1, minDepth: 1, parentId: 'a', index: 0 });
  });

  it('moves between rows: dropping over a later row lands after it', () => {
    const items = [item('a', 0), item('b', 0), item('c', 0)];
    expect(getProjection(items, 'a', 'c', 0, 22)).toMatchObject({
      parentId: null,
      afterId: 'c',
      index: 2,
      previousId: 'c',
    });
    expect(getProjection(items, 'c', 'a', 0, 22)).toMatchObject({ afterId: null, index: 0 });
  });

  it('excludes the dragged subtree from drop targets', () => {
    const full = [item('a', 0), item('a1', 1, 'a'), item('a2', 1, 'a'), item('b', 0)];
    const items = withoutDescendants(full, 'a');
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    // Without the subtree, 'b' is directly below 'a', so dragging 'a' down one row lands after b.
    expect(getProjection(items, 'a', 'b', 0, 22)).toMatchObject({ parentId: null, afterId: 'b' });
    // The subtree's rows can't be targets.
    expect(getProjection(items, 'a', 'a1', 0, 22)).toBeNull();
  });

  it('returns null for unknown ids', () => {
    expect(getProjection([item('a', 0)], 'a', 'zzz', 0)).toBeNull();
    expect(getProjection([item('a', 0)], 'zzz', 'a', 0)).toBeNull();
  });
});

describe('withoutDescendants', () => {
  it('only removes the rows directly below that are deeper', () => {
    const items = [
      item('a', 0),
      item('a1', 1, 'a'),
      item('a11', 2, 'a1'),
      item('b', 0),
      item('b1', 1, 'b'),
    ];
    expect(withoutDescendants(items, 'a').map((i) => i.id)).toEqual(['a', 'b', 'b1']);
    expect(withoutDescendants(items, 'a1').map((i) => i.id)).toEqual(['a', 'a1', 'b', 'b1']);
    expect(withoutDescendants(items, 'b1')).toBe(items);
  });
});

function build() {
  let tree: TaskTree = emptyTree();
  const ids: Record<string, string> = {};
  const put = (title: string, parentId: string | null = null) => {
    const r = addTask(tree, { title, parentId });
    tree = r.tree;
    ids[title] = r.id;
  };
  put('A');
  put('a1', ids.A);
  put('a2', ids.A);
  put('B');
  put('C');
  return { tree, ...ids } as { tree: TaskTree } & Record<string, string>;
}

describe('flattenTree / itemsFor / guideFlags', () => {
  it('flattens in render order, skipping collapsed subtrees', () => {
    const s = build();
    expect(flattenTree(s.tree, { tag: null })).toEqual([s.A, s.a1, s.a2, s.B, s.C]);
    const collapsed = updateTask(s.tree, s.A, { collapsed: true });
    expect(flattenTree(collapsed, { tag: null })).toEqual([s.A, s.B, s.C]);
  });

  it('leaves out done tasks, and a done parent takes its whole subtree along', () => {
    const s = build();
    const parentDone = toggleDone(s.tree, s.A);
    expect(flattenTree(parentDone, { tag: null })).toEqual([s.B, s.C]);
    // A done subtask disappears on its own; its parent stays.
    const childDone = toggleDone(s.tree, s.a1);
    expect(flattenTree(childDone, { tag: null })).toEqual([s.A, s.a2, s.B, s.C]);
    // Hidden rows never reach the drag projection.
    const items = itemsFor(childDone, flattenTree(childDone, { tag: null }));
    expect(items.map((i) => i.id)).toEqual([s.A, s.a2, s.B, s.C]);
    expect(flattenTree(toggleDone(s.tree, s.B), { tag: null })).toEqual([s.A, s.a1, s.a2, s.C]);
  });

  it('applies a tag filter', () => {
    const s = build();
    const tagged = updateTask(s.tree, s.a2, { tags: ['x'] });
    expect(flattenTree(tagged, { tag: 'x' })).toEqual([s.A, s.a2]);
  });

  it('derives depth and parent', () => {
    const s = build();
    const items = itemsFor(s.tree, flattenTree(s.tree, { tag: null }));
    expect(items.map((i) => [i.depth, i.parentId])).toEqual([
      [0, null],
      [1, s.A],
      [1, s.A],
      [0, null],
      [0, null],
    ]);
    expect(guideFlags(items)).toEqual(['', 'f', 'l', '', '']);
  });

  it('marks single children and deeper levels', () => {
    const items = [
      item('a', 0),
      item('b', 1, 'a'),
      item('c', 2, 'b'),
      item('d', 2, 'b'),
      item('e', 1, 'a'),
    ];
    expect(guideFlags(items)).toEqual(['', 'f', 'nf', 'nl', 'l']);
    expect(guideFlags([item('a', 0), item('b', 1, 'a'), item('c', 0)])).toEqual(['', 'b', '']);
  });
});

describe('projectionTarget', () => {
  it('maps the displayed slot to an index in the real child list', () => {
    const s = build();
    const target = projectionTarget(s.tree, s.C, { parentId: s.A, afterId: s.a1 });
    expect(target).toEqual({ parentId: s.A, index: 1 });
    expect(projectionTarget(s.tree, s.C, { parentId: null, afterId: null })).toEqual({
      parentId: null,
      index: 0,
    });
    // The dragged task is skipped when counting.
    expect(projectionTarget(s.tree, s.B, { parentId: null, afterId: s.C })).toEqual({
      parentId: null,
      index: 2,
    });
  });

  it('lands the moved row where it was shown even with done rows sunk', () => {
    const s = build();
    const tree = toggleDone(s.tree, s.A); // shown: B, C, A(done)
    const target = projectionTarget(tree, s.C, { parentId: null, afterId: null });
    const moved = moveTask(tree, s.C, target);
    expect(flattenTree(moved, { tag: null }).slice(0, 2)).toEqual([s.C, s.B]);
  });
});

describe('siblingMoveTarget', () => {
  it('moves past the neighbouring sibling', () => {
    const s = build();
    expect(siblingMoveTarget(s.tree, s.B, -1)).toEqual({ parentId: null, index: 0 });
    expect(siblingMoveTarget(s.tree, s.B, 1)).toEqual({ parentId: null, index: 2 });
    expect(siblingMoveTarget(s.tree, s.a1, 1)).toEqual({ parentId: s.A, index: 1 });
  });

  it('is null at the ends and for unknown ids', () => {
    const s = build();
    expect(siblingMoveTarget(s.tree, s.A, -1)).toBeNull();
    expect(siblingMoveTarget(s.tree, s.C, 1)).toBeNull();
    expect(siblingMoveTarget(toggleDone(s.tree, s.C), s.B, 1)).toBeNull();
    expect(siblingMoveTarget(s.tree, 'zzz', 1)).toBeNull();
  });

  it('steps over done siblings, which are hidden', () => {
    const s = build();
    const tree = toggleDone(s.tree, s.B);
    // A, [B done], C: C's visible neighbour above is A, past the hidden B.
    expect(siblingMoveTarget(tree, s.C, -1)).toEqual({ parentId: null, index: 0 });
    expect(siblingMoveTarget(tree, s.A, 1)).toEqual({ parentId: null, index: 2 });
  });

  it('skips siblings hidden by a filter', () => {
    const s = build();
    const visible = new Set([s.A, s.C]);
    const target = siblingMoveTarget(s.tree, s.C, -1, visible);
    expect(target).toEqual({ parentId: null, index: 0 });
  });
});
