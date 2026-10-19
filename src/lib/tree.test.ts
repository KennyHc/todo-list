import { describe, expect, it } from 'vitest';
import { MAX_TAGS, MAX_TITLE_LENGTH, type Difficulty, type TaskTree } from '../types';
import {
  addTask,
  clearCompleted,
  deleteTask,
  effectiveDifficulty,
  emptyTree,
  getAncestors,
  getDescendants,
  indentTask,
  isLeaf,
  moveTask,
  outdentTask,
  progress,
  sortedChildIds,
  toggleDone,
  updateTask,
} from './tree';

type Opts = { parentId?: string | null; afterId?: string; difficulty?: Difficulty; color?: string };

/** Test helper: adds a task and returns the new tree plus its id. */
function add(tree: TaskTree, title: string, opts: Opts = {}) {
  return addTask(tree, { title, ...opts });
}

/** Builds: root A -> (B -> (D, E), C). Returns ids. */
function sample() {
  let tree = emptyTree();
  const a = add(tree, 'A');
  tree = a.tree;
  const b = add(tree, 'B', { parentId: a.id });
  tree = b.tree;
  const c = add(tree, 'C', { parentId: a.id });
  tree = c.tree;
  const d = add(tree, 'D', { parentId: b.id });
  tree = d.tree;
  const e = add(tree, 'E', { parentId: b.id });
  tree = e.tree;
  return { tree, a: a.id, b: b.id, c: c.id, d: d.id, e: e.id };
}

const done = (tree: TaskTree, id: string) => tree.tasks[id].done;

describe('addTask', () => {
  it('adds at root with defaults', () => {
    const { tree, id } = add(emptyTree(), 'Hello');
    expect(tree.rootIds).toEqual([id]);
    expect(tree.tasks[id]).toMatchObject({
      title: 'Hello',
      difficulty: 1,
      color: null,
      done: false,
      collapsed: false,
      parentId: null,
      childIds: [],
    });
    expect(typeof tree.tasks[id].createdAt).toBe('number');
  });

  it('appends to the end of root by default', () => {
    const one = add(emptyTree(), 'one');
    const two = add(one.tree, 'two');
    expect(two.tree.rootIds).toEqual([one.id, two.id]);
  });

  it('adds as a child and links both directions', () => {
    const p = add(emptyTree(), 'parent');
    const c = add(p.tree, 'child', { parentId: p.id });
    expect(c.tree.tasks[p.id].childIds).toEqual([c.id]);
    expect(c.tree.tasks[c.id].parentId).toBe(p.id);
    expect(c.tree.rootIds).toEqual([p.id]);
  });

  it('never copies a stored colour: children are automatic unless one is given', () => {
    // Inheritance is computed at render time (lib/colorResolve), not written.
    const p = add(emptyTree(), 'parent', { color: '#123456' });
    const plain = add(p.tree, 'a', { parentId: p.id });
    const explicit = add(plain.tree, 'b', { parentId: p.id, color: '#abcdef' });
    expect(explicit.tree.tasks[plain.id].color).toBeNull();
    expect(explicit.tree.tasks[explicit.id].color).toBe('#abcdef');
  });

  it('inserts after afterId among siblings', () => {
    const a = add(emptyTree(), 'a');
    const b = add(a.tree, 'b');
    const mid = add(b.tree, 'mid', { afterId: a.id });
    expect(mid.tree.rootIds).toEqual([a.id, mid.id, b.id]);

    const p = add(emptyTree(), 'p');
    const x = add(p.tree, 'x', { parentId: p.id });
    const y = add(x.tree, 'y', { parentId: p.id });
    const between = add(y.tree, 'between', { parentId: p.id, afterId: x.id });
    expect(between.tree.tasks[p.id].childIds).toEqual([x.id, between.id, y.id]);
  });

  it('appends when afterId is not a sibling', () => {
    const a = add(emptyTree(), 'a');
    const b = add(a.tree, 'b', { afterId: 'nope' });
    expect(b.tree.rootIds).toEqual([a.id, b.id]);
  });

  it('un-dones a done parent and its done ancestors', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.a);
    expect(done(tree, s.b)).toBe(true);
    tree = add(tree, 'new', { parentId: s.b }).tree;
    expect(done(tree, s.b)).toBe(false);
    expect(done(tree, s.a)).toBe(false);
    expect(tree.tasks[s.b].completedAt).toBeUndefined();
    expect(done(tree, s.c)).toBe(true);
  });

  it('returns the tree unchanged for an unknown parent', () => {
    const tree = emptyTree();
    expect(add(tree, 'x', { parentId: 'nope' }).tree).toBe(tree);
  });
});

describe('updateTask', () => {
  it('patches allowed fields', () => {
    const { tree, id } = add(emptyTree(), 'old');
    const next = updateTask(tree, id, {
      title: 'new',
      difficulty: 4,
      color: '#000000',
      collapsed: true,
    });
    expect(next.tasks[id]).toMatchObject({
      title: 'new',
      difficulty: 4,
      color: '#000000',
      collapsed: true,
    });
  });

  it('ignores unknown ids', () => {
    const tree = emptyTree();
    expect(updateTask(tree, 'nope', { title: 'x' })).toBe(tree);
  });
});

describe('effectiveDifficulty', () => {
  it('returns a leaf difficulty', () => {
    const { tree, id } = add(emptyTree(), 'leaf', { difficulty: 4 });
    expect(effectiveDifficulty(tree, id)).toBe(4);
  });

  it('sums children (3 + 5 + 2 = 10), which may exceed 5', () => {
    const p = add(emptyTree(), 'p');
    let tree = add(p.tree, 'a', { parentId: p.id, difficulty: 3 }).tree;
    tree = add(tree, 'b', { parentId: p.id, difficulty: 5 }).tree;
    tree = add(tree, 'c', { parentId: p.id, difficulty: 2 }).tree;
    expect(effectiveDifficulty(tree, p.id)).toBe(10);
  });

  it('sums recursively through grandchildren and ignores a parent own difficulty', () => {
    const root = add(emptyTree(), 'root', { difficulty: 5 });
    const mid = add(root.tree, 'mid', { parentId: root.id, difficulty: 5 });
    let tree = add(mid.tree, 'g1', { parentId: mid.id, difficulty: 2 }).tree;
    tree = add(tree, 'g2', { parentId: mid.id, difficulty: 3 }).tree;
    tree = add(tree, 'sib', { parentId: root.id, difficulty: 4 }).tree;
    expect(effectiveDifficulty(tree, mid.id)).toBe(5);
    expect(effectiveDifficulty(tree, root.id)).toBe(9);
  });

  it('returns 0 for unknown ids', () => {
    expect(effectiveDifficulty(emptyTree(), 'nope')).toBe(0);
  });
});

describe('toggleDone', () => {
  it('checking the last undone child completes the parent and grandparent', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.d, 100);
    expect(done(tree, s.b)).toBe(false);
    tree = toggleDone(tree, s.e, 200);
    expect(done(tree, s.b)).toBe(true);
    expect(done(tree, s.a)).toBe(false); // C still open
    tree = toggleDone(tree, s.c, 300);
    expect(done(tree, s.a)).toBe(true);
    expect(tree.tasks[s.b].completedAt).toBe(200);
    expect(tree.tasks[s.a].completedAt).toBe(300);
  });

  it('checking a parent checks all descendants and keeps earlier completedAt', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.d, 100);
    tree = toggleDone(tree, s.a, 500);
    for (const id of [s.a, s.b, s.c, s.d, s.e]) expect(done(tree, id)).toBe(true);
    expect(tree.tasks[s.d].completedAt).toBe(100);
    expect(tree.tasks[s.e].completedAt).toBe(500);
  });

  it('unchecking a grandchild unchecks parent and grandparent but not siblings', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.a);
    tree = toggleDone(tree, s.d);
    expect(done(tree, s.d)).toBe(false);
    expect(done(tree, s.b)).toBe(false);
    expect(done(tree, s.a)).toBe(false);
    expect(done(tree, s.e)).toBe(true);
    expect(done(tree, s.c)).toBe(true);
    expect(tree.tasks[s.a].completedAt).toBeUndefined();
  });

  it('unchecking a parent unchecks all descendants', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.a);
    tree = toggleDone(tree, s.a);
    for (const id of [s.a, s.b, s.c, s.d, s.e]) {
      expect(done(tree, id)).toBe(false);
      expect(tree.tasks[id].completedAt).toBeUndefined();
    }
  });

  it('sets completedAt on check', () => {
    const { tree, id } = add(emptyTree(), 'x');
    expect(toggleDone(tree, id, 42).tasks[id].completedAt).toBe(42);
  });

  it('ignores unknown ids', () => {
    const tree = emptyTree();
    expect(toggleDone(tree, 'nope')).toBe(tree);
  });
});

describe('deleteTask', () => {
  it('removes the whole subtree and detaches from the parent', () => {
    const s = sample();
    const tree = deleteTask(s.tree, s.b);
    expect(Object.keys(tree.tasks).sort()).toEqual([s.a, s.c].sort());
    expect(tree.tasks[s.a].childIds).toEqual([s.c]);
  });

  it('removes root tasks from rootIds', () => {
    const s = sample();
    const tree = deleteTask(s.tree, s.a);
    expect(tree).toEqual(emptyTree());
  });

  it('completes the parent when the only undone child is deleted', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.d);
    tree = deleteTask(tree, s.e);
    expect(done(tree, s.b)).toBe(true);
    expect(done(tree, s.a)).toBe(false);
    tree = toggleDone(tree, s.c);
    expect(done(tree, s.a)).toBe(true);
  });

  it('propagates completion to the grandparent', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.d);
    tree = toggleDone(tree, s.c);
    tree = deleteTask(tree, s.e);
    expect(done(tree, s.b)).toBe(true);
    expect(done(tree, s.a)).toBe(true);
  });

  it('leaves the parent done flag alone when it has no children left', () => {
    const p = add(emptyTree(), 'p');
    const c = add(p.tree, 'c', { parentId: p.id });
    const tree = deleteTask(c.tree, c.id);
    expect(tree.tasks[p.id].childIds).toEqual([]);
    expect(done(tree, p.id)).toBe(false);

    const checked = deleteTask(toggleDone(c.tree, p.id), c.id);
    expect(done(checked, p.id)).toBe(true);
  });

  it('ignores unknown ids', () => {
    const tree = emptyTree();
    expect(deleteTask(tree, 'nope')).toBe(tree);
  });
});

describe('indentTask', () => {
  it('makes the task the last child of its previous sibling', () => {
    const s = sample();
    // A -> (B, C): indent C under B, after D and E.
    const tree = indentTask(s.tree, s.c);
    expect(tree.tasks[s.b].childIds).toEqual([s.d, s.e, s.c]);
    expect(tree.tasks[s.c].parentId).toBe(s.b);
    expect(tree.tasks[s.a].childIds).toEqual([s.b]);
  });

  it('works at root level', () => {
    const a = add(emptyTree(), 'a');
    const b = add(a.tree, 'b');
    const tree = indentTask(b.tree, b.id);
    expect(tree.rootIds).toEqual([a.id]);
    expect(tree.tasks[a.id].childIds).toEqual([b.id]);
  });

  it('is a no-op without a previous sibling', () => {
    const s = sample();
    expect(indentTask(s.tree, s.b)).toBe(s.tree);
    expect(indentTask(s.tree, s.a)).toBe(s.tree);
    expect(indentTask(s.tree, 'nope')).toBe(s.tree);
  });

  it('un-dones a done new parent that receives an undone child', () => {
    const a = add(emptyTree(), 'a');
    const b = add(a.tree, 'b');
    const tree = toggleDone(b.tree, a.id);
    const result = indentTask(tree, b.id);
    expect(done(result, a.id)).toBe(false);
  });

  it('keeps the new parent done when moving a done task in', () => {
    const a = add(emptyTree(), 'a');
    const c = add(a.tree, 'c', { parentId: a.id });
    const d = add(c.tree, 'd');
    let tree = toggleDone(toggleDone(d.tree, a.id), d.id);
    tree = indentTask(tree, d.id);
    expect(tree.tasks[d.id].parentId).toBe(a.id);
    expect(done(tree, a.id)).toBe(true);
  });

  it('completes the old parent if its remaining children are all done', () => {
    const s = sample();
    // B has D, E. Check D, leave E undone, then outdent... instead indent E under D.
    let tree = toggleDone(s.tree, s.d);
    tree = indentTask(tree, s.e); // E becomes child of D; D reopens, B has only D
    expect(done(tree, s.d)).toBe(false);
    tree = toggleDone(tree, s.e);
    expect(done(tree, s.d)).toBe(true);
    expect(done(tree, s.b)).toBe(true);
  });

  it('re-evaluates the old parent when the moved task was the only undone sibling', () => {
    const p = add(emptyTree(), 'p');
    const x = add(p.tree, 'x', { parentId: p.id });
    const y = add(x.tree, 'y', { parentId: p.id });
    const z = add(y.tree, 'z', { parentId: p.id });
    let tree = toggleDone(z.tree, x.id);
    tree = toggleDone(tree, z.id);
    expect(done(tree, p.id)).toBe(false); // y open
    tree = indentTask(tree, y.id); // y under x; p now has x (reopened) and z
    expect(done(tree, x.id)).toBe(false);
    expect(done(tree, p.id)).toBe(false);
  });
});

describe('outdentTask', () => {
  it('moves the task directly after its parent', () => {
    const s = sample();
    const tree = outdentTask(s.tree, s.d);
    expect(tree.tasks[s.a].childIds).toEqual([s.b, s.d, s.c]);
    expect(tree.tasks[s.d].parentId).toBe(s.a);
    expect(tree.tasks[s.b].childIds).toEqual([s.e]);
  });

  it('moves a child of a root task to root, after the parent', () => {
    const s = sample();
    const other = add(s.tree, 'other');
    const tree = outdentTask(other.tree, s.b);
    expect(tree.rootIds).toEqual([s.a, s.b, other.id]);
    expect(tree.tasks[s.b].parentId).toBeNull();
  });

  it('is a no-op at root', () => {
    const s = sample();
    expect(outdentTask(s.tree, s.a)).toBe(s.tree);
    expect(outdentTask(s.tree, 'nope')).toBe(s.tree);
  });

  it('completes the old parent when its remaining children are all done', () => {
    const s = sample();
    let tree = toggleDone(s.tree, s.d);
    expect(done(tree, s.b)).toBe(false);
    tree = outdentTask(tree, s.e);
    expect(done(tree, s.b)).toBe(true);
    expect(done(tree, s.a)).toBe(false); // E (undone) now lives under A
  });

  it('reopens the grandparent when an undone task is moved up into a done one', () => {
    const s = sample();
    // Done: everything except E; outdent D (done) leaves B with only E undone.
    let tree = toggleDone(s.tree, s.d);
    tree = toggleDone(tree, s.c);
    tree = outdentTask(tree, s.e);
    expect(done(tree, s.b)).toBe(true);
    expect(done(tree, s.a)).toBe(false);
  });
});

describe('queries', () => {
  it('isLeaf', () => {
    const s = sample();
    expect(isLeaf(s.tree, s.d)).toBe(true);
    expect(isLeaf(s.tree, s.b)).toBe(false);
    expect(isLeaf(s.tree, 'nope')).toBe(false);
  });

  it('getAncestors is nearest first', () => {
    const s = sample();
    expect(getAncestors(s.tree, s.d)).toEqual([s.b, s.a]);
    expect(getAncestors(s.tree, s.a)).toEqual([]);
    expect(getAncestors(s.tree, 'nope')).toEqual([]);
  });

  it('getDescendants is pre-order', () => {
    const s = sample();
    expect(getDescendants(s.tree, s.a)).toEqual([s.b, s.d, s.e, s.c]);
    expect(getDescendants(s.tree, s.d)).toEqual([]);
    expect(getDescendants(s.tree, 'nope')).toEqual([]);
  });

  it('progress counts leaf descendants', () => {
    const s = sample();
    expect(progress(s.tree, s.a)).toEqual({ done: 0, total: 3 });
    const tree = toggleDone(s.tree, s.d);
    expect(progress(tree, s.a)).toEqual({ done: 1, total: 3 });
    expect(progress(tree, s.b)).toEqual({ done: 1, total: 2 });
    expect(progress(tree, s.d)).toEqual({ done: 1, total: 1 });
    expect(progress(tree, s.e)).toEqual({ done: 0, total: 1 });
    expect(progress(tree, 'nope')).toEqual({ done: 0, total: 0 });
  });
});

describe('sortedChildIds', () => {
  it('puts undone first then done, preserving order within groups', () => {
    let tree = emptyTree();
    const ids: string[] = [];
    for (const title of ['a', 'b', 'c', 'd', 'e']) {
      const r = add(tree, title);
      tree = r.tree;
      ids.push(r.id);
    }
    const [a, b, c, d, e] = ids;
    tree = toggleDone(toggleDone(tree, a), c);
    expect(sortedChildIds(tree, ids)).toEqual([b, d, e, a, c]);
  });

  it('does not mutate its input and keeps order when nothing is done', () => {
    const s = sample();
    const ids = [s.a, s.b, s.c];
    const sorted = sortedChildIds(s.tree, ids);
    expect(sorted).toEqual(ids);
    expect(sorted).not.toBe(ids);
  });
});

describe('immutability', () => {
  const operations: [string, (s: ReturnType<typeof sample>) => TaskTree][] = [
    ['addTask', (s) => add(s.tree, 'new', { parentId: s.b, afterId: s.d }).tree],
    ['updateTask', (s) => updateTask(s.tree, s.b, { title: 'x', collapsed: true })],
    ['deleteTask', (s) => deleteTask(s.tree, s.b)],
    ['toggleDone check', (s) => toggleDone(s.tree, s.a)],
    ['toggleDone uncheck', (s) => toggleDone(toggleDone(s.tree, s.a), s.d)],
    ['indentTask', (s) => indentTask(s.tree, s.c)],
    ['outdentTask', (s) => outdentTask(s.tree, s.d)],
  ];

  it.each(operations)('%s does not mutate its input', (_name, run) => {
    const s = sample();
    const before = structuredClone(s.tree);
    const result = run(s);
    expect(s.tree).toEqual(before);
    expect(result).not.toBe(s.tree);
  });

  it('queries do not mutate the tree', () => {
    const s = sample();
    const before = structuredClone(s.tree);
    effectiveDifficulty(s.tree, s.a);
    progress(s.tree, s.a);
    getAncestors(s.tree, s.d);
    getDescendants(s.tree, s.a);
    sortedChildIds(s.tree, s.tree.tasks[s.a].childIds);
    expect(s.tree).toEqual(before);
  });
});

describe('structural sharing', () => {
  /** Two branches: R -> (A -> (a1, a2), B -> (b1)). */
  function branches() {
    let tree = emptyTree();
    const r = add(tree, 'R');
    tree = r.tree;
    const a = add(tree, 'A', { parentId: r.id });
    tree = a.tree;
    const b = add(tree, 'B', { parentId: r.id });
    tree = b.tree;
    const a1 = add(tree, 'a1', { parentId: a.id });
    tree = a1.tree;
    const a2 = add(tree, 'a2', { parentId: a.id });
    tree = a2.tree;
    const b1 = add(tree, 'b1', { parentId: b.id });
    return { tree: b1.tree, r: r.id, a: a.id, b: b.id, a1: a1.id, a2: a2.id, b1: b1.id };
  }

  it('toggleDone leaves other branches untouched and replaces the toggled chain', () => {
    const s = branches();
    let tree = toggleDone(s.tree, s.a2);
    const before = tree;
    tree = toggleDone(tree, s.a1); // completes A; R still open because of B
    expect(tree.tasks[s.b]).toBe(before.tasks[s.b]);
    expect(tree.tasks[s.b1]).toBe(before.tasks[s.b1]);
    expect(tree.tasks[s.r]).toBe(before.tasks[s.r]); // R's value did not change
    for (const id of [s.a1, s.a]) expect(tree.tasks[id]).not.toBe(before.tasks[id]);
    expect(tree.tasks[s.a2]).toBe(before.tasks[s.a2]);
    expect(tree.tasks).not.toBe(before.tasks);
    expect(tree.rootIds).toBe(before.rootIds);
  });

  it('toggleDone replaces every task in the changed ancestor chain', () => {
    const s = branches();
    let tree = toggleDone(s.tree, s.a1);
    tree = toggleDone(tree, s.a2);
    tree = toggleDone(tree, s.b1);
    const before = toggleDone(tree, s.b1); // b1 open again, everything above reopened
    const after = toggleDone(before, s.b1);
    for (const id of [s.b1, s.b, s.r]) expect(after.tasks[id]).not.toBe(before.tasks[id]);
    expect(after.tasks[s.a]).toBe(before.tasks[s.a]);
  });

  it('updateTask only replaces the edited task', () => {
    const s = branches();
    const tree = updateTask(s.tree, s.a1, { title: 'renamed' });
    expect(tree.tasks[s.a1]).not.toBe(s.tree.tasks[s.a1]);
    for (const id of [s.r, s.a, s.b, s.a2, s.b1]) expect(tree.tasks[id]).toBe(s.tree.tasks[id]);
  });

  it('returns the same tree for no-op updates', () => {
    const s = branches();
    expect(updateTask(s.tree, s.a, { title: 'A', collapsed: false })).toBe(s.tree);
    expect(updateTask(s.tree, s.a, {})).toBe(s.tree);
  });

  it('addTask only replaces the parent', () => {
    const s = branches();
    const { tree } = add(s.tree, 'new', { parentId: s.b });
    expect(tree.tasks[s.b]).not.toBe(s.tree.tasks[s.b]);
    for (const id of [s.r, s.a, s.a1, s.a2, s.b1]) expect(tree.tasks[id]).toBe(s.tree.tasks[id]);
    expect(tree.rootIds).toBe(s.tree.rootIds);
  });
});

describe('tags and dueDate', () => {
  it('addTask defaults and normalizes', () => {
    const { tree, id } = addTask(emptyTree(), { title: 'x', tags: [' #Home ', 'home', '', 'B'] });
    expect(tree.tasks[id].tags).toEqual(['home', 'b']);
    expect(tree.tasks[id].dueDate).toBeNull();
    const plain = add(emptyTree(), 'y');
    expect(plain.tree.tasks[plain.id].tags).toEqual([]);
    const dated = addTask(emptyTree(), { title: 'z', dueDate: '2026-01-02' });
    expect(dated.tree.tasks[dated.id].dueDate).toBe('2026-01-02');
  });

  it('updateTask normalizes tags and sets/clears dueDate', () => {
    const { tree, id } = add(emptyTree(), 'x');
    const tagged = updateTask(tree, id, { tags: ['#Work', 'work', 'Home'] });
    expect(tagged.tasks[id].tags).toEqual(['work', 'home']);
    const dated = updateTask(tagged, id, { dueDate: '2026-05-01' });
    expect(dated.tasks[id].dueDate).toBe('2026-05-01');
    expect(updateTask(dated, id, { dueDate: null }).tasks[id].dueDate).toBeNull();
  });

  it('treats arrays by value in no-op detection', () => {
    const { tree, id } = addTask(emptyTree(), { title: 'x', tags: ['a', 'b'] });
    expect(updateTask(tree, id, { tags: ['a', 'b'] })).toBe(tree);
    expect(updateTask(tree, id, { tags: ['#A', 'b'] })).toBe(tree);
    expect(updateTask(tree, id, { dueDate: null })).toBe(tree);
    const reordered = updateTask(tree, id, { tags: ['b', 'a'] });
    expect(reordered).not.toBe(tree);
    expect(reordered.tasks[id].tags).toEqual(['b', 'a']);
  });
});

describe('clearCompleted', () => {
  it('returns the same tree when nothing is done', () => {
    const s = sample();
    expect(clearCompleted(s.tree)).toBe(s.tree);
  });

  it('removes done tasks with their subtree and keeps the rest by identity', () => {
    const s = sample();
    const tree = toggleDone(s.tree, s.b);
    const cleared = clearCompleted(tree);
    expect(Object.keys(cleared.tasks).sort()).toEqual([s.a, s.c].sort());
    expect(cleared.tasks[s.a].childIds).toEqual([s.c]);
    expect(cleared.tasks[s.a].done).toBe(false);
    expect(cleared.tasks[s.c]).toBe(tree.tasks[s.c]);
  });

  it('removes a fully done root and clears root ids', () => {
    const s = sample();
    const cleared = clearCompleted(toggleDone(s.tree, s.a));
    expect(cleared).toEqual(emptyTree());
  });

  it('removes done root-level leaves', () => {
    const a = add(emptyTree(), 'a');
    const b = add(a.tree, 'b');
    const cleared = clearCompleted(toggleDone(b.tree, a.id));
    expect(cleared.rootIds).toEqual([b.id]);
  });

  it('leaves an undone parent with zero children undone', () => {
    const p = add(emptyTree(), 'p');
    const c = add(p.tree, 'c', { parentId: p.id });
    const d = add(c.tree, 'd', { parentId: p.id });
    const partial = clearCompleted(toggleDone(d.tree, c.id));
    expect(partial.tasks[p.id].childIds).toEqual([d.id]);
    expect(partial.tasks[p.id].done).toBe(false);
  });
});

describe('moveTask', () => {
  /** Roots P, Q, R; P -> (p1, p2, p3). */
  function flat() {
    let tree = emptyTree();
    const ids: Record<string, string> = {};
    const put = (title: string, parentId: string | null = null) => {
      const r = add(tree, title, { parentId });
      tree = r.tree;
      ids[title] = r.id;
    };
    put('P');
    put('Q');
    put('R');
    put('p1', ids.P);
    put('p2', ids.P);
    put('p3', ids.P);
    return { tree, ...ids } as { tree: TaskTree } & Record<string, string>;
  }

  it('reorders among siblings, down', () => {
    const s = flat();
    const tree = moveTask(s.tree, s.p1, { parentId: s.P, index: 2 });
    expect(tree.tasks[s.P].childIds).toEqual([s.p2, s.p3, s.p1]);
    expect(tree.tasks[s.p1].parentId).toBe(s.P);
  });

  it('reorders among siblings, up', () => {
    const s = flat();
    const tree = moveTask(s.tree, s.p3, { parentId: s.P, index: 0 });
    expect(tree.tasks[s.P].childIds).toEqual([s.p3, s.p1, s.p2]);
    const roots = moveTask(s.tree, s.R, { parentId: null, index: 1 });
    expect(roots.rootIds).toEqual([s.P, s.R, s.Q]);
  });

  it('moves a nested task to the root at a given position', () => {
    const s = flat();
    const tree = moveTask(s.tree, s.p2, { parentId: null, index: 1 });
    expect(tree.rootIds).toEqual([s.P, s.p2, s.Q, s.R]);
    expect(tree.tasks[s.p2].parentId).toBeNull();
    expect(tree.tasks[s.P].childIds).toEqual([s.p1, s.p3]);
  });

  it('moves a root task under another parent, subtree included', () => {
    const s = flat();
    const tree = moveTask(s.tree, s.P, { parentId: s.Q, index: 0 });
    expect(tree.rootIds).toEqual([s.Q, s.R]);
    expect(tree.tasks[s.Q].childIds).toEqual([s.P]);
    expect(tree.tasks[s.P].parentId).toBe(s.Q);
    expect(tree.tasks[s.P].childIds).toEqual([s.p1, s.p2, s.p3]);
  });

  it('nests under a leaf, which becomes a parent and is re-evaluated', () => {
    const s = flat();
    let tree = toggleDone(s.tree, s.R); // R is a done leaf
    tree = moveTask(tree, s.Q, { parentId: s.R, index: 0 });
    expect(isLeaf(tree, s.R)).toBe(false);
    expect(tree.tasks[s.R].childIds).toEqual([s.Q]);
    expect(done(tree, s.R)).toBe(false); // gained an undone child
    // A done child under an open leaf completes it.
    let t2 = toggleDone(s.tree, s.Q);
    t2 = moveTask(t2, s.Q, { parentId: s.R, index: 0 });
    expect(done(t2, s.R)).toBe(true);
  });

  it('refuses to move into its own subtree', () => {
    const s = sample();
    expect(moveTask(s.tree, s.a, { parentId: s.a, index: 0 })).toBe(s.tree);
    expect(moveTask(s.tree, s.a, { parentId: s.b, index: 0 })).toBe(s.tree);
    expect(moveTask(s.tree, s.a, { parentId: s.d, index: 0 })).toBe(s.tree);
    expect(moveTask(s.tree, s.b, { parentId: s.e, index: 0 })).toBe(s.tree);
  });

  it('reopens a done parent that gains an undone child', () => {
    const s = flat();
    let tree = toggleDone(s.tree, s.P); // P and all its children done
    expect(done(tree, s.P)).toBe(true);
    tree = moveTask(tree, s.Q, { parentId: s.P, index: 1 });
    expect(done(tree, s.P)).toBe(false);
    expect(done(tree, s.p1)).toBe(true);
  });

  it('completes the old parent when its remaining children are all done', () => {
    const s = flat();
    let tree = toggleDone(s.tree, s.p1);
    tree = toggleDone(tree, s.p2);
    expect(done(tree, s.P)).toBe(false);
    tree = moveTask(tree, s.p3, { parentId: null, index: 3 });
    expect(done(tree, s.P)).toBe(true);
    expect(tree.tasks[s.P].completedAt).toBeDefined();
  });

  it('re-evaluates when the new parent is a descendant of the old one', () => {
    const s = sample();
    // Complete D; B is open because of E. Move E to C: B is done, A has the open C and E.
    let tree = toggleDone(s.tree, s.d);
    tree = moveTask(tree, s.e, { parentId: s.c, index: 0 });
    expect(done(tree, s.b)).toBe(true);
    expect(done(tree, s.a)).toBe(false);
    tree = toggleDone(tree, s.e);
    expect(done(tree, s.c)).toBe(true);
    expect(done(tree, s.a)).toBe(true);
  });

  it('clamps the index to the valid range', () => {
    const s = flat();
    expect(moveTask(s.tree, s.p1, { parentId: s.P, index: 99 }).tasks[s.P].childIds).toEqual([
      s.p2,
      s.p3,
      s.p1,
    ]);
    expect(moveTask(s.tree, s.p3, { parentId: s.P, index: -5 }).tasks[s.P].childIds).toEqual([
      s.p3,
      s.p1,
      s.p2,
    ]);
    expect(moveTask(s.tree, s.R, { parentId: s.P, index: 99 }).tasks[s.P].childIds).toEqual([
      s.p1,
      s.p2,
      s.p3,
      s.R,
    ]);
    expect(moveTask(s.tree, s.R, { parentId: s.Q, index: -1 }).tasks[s.Q].childIds).toEqual([s.R]);
  });

  it('returns the same tree for no-ops', () => {
    const s = flat();
    expect(moveTask(s.tree, s.p2, { parentId: s.P, index: 1 })).toBe(s.tree);
    expect(moveTask(s.tree, s.p2, { parentId: s.P, index: 50 }).tasks[s.P].childIds).toEqual([
      s.p1,
      s.p3,
      s.p2,
    ]);
    expect(moveTask(s.tree, s.Q, { parentId: null, index: 1 })).toBe(s.tree);
    expect(moveTask(s.tree, 'nope', { parentId: null, index: 0 })).toBe(s.tree);
    expect(moveTask(s.tree, s.Q, { parentId: 'nope', index: 0 })).toBe(s.tree);
  });

  it('keeps unrelated branches referentially equal', () => {
    let tree = emptyTree();
    const mk = (title: string, parentId: string | null = null) => {
      const r = add(tree, title, { parentId });
      tree = r.tree;
      return r.id;
    };
    const x = mk('X');
    const y = mk('Y');
    const z = mk('Z');
    const x1 = mk('x1', x);
    const y1 = mk('y1', y);
    const z1 = mk('z1', z);
    const before = tree;
    const after = moveTask(before, x1, { parentId: y, index: 1 });
    expect(after.tasks[z]).toBe(before.tasks[z]);
    expect(after.tasks[z1]).toBe(before.tasks[z1]);
    expect(after.tasks[y1]).toBe(before.tasks[y1]);
    expect(after.rootIds).toBe(before.rootIds);
    for (const id of [x, y, x1]) expect(after.tasks[id]).not.toBe(before.tasks[id]);
    // The input is never mutated.
    expect(before.tasks[x].childIds).toEqual([x1]);
    expect(before.tasks[y].childIds).toEqual([y1]);
  });
});

describe('limits mirrored from firestore.rules', () => {
  it('clamps titles and tag counts so cloud writes are never rejected', () => {
    const long = 'x'.repeat(600);
    const tags = Array.from({ length: 25 }, (_, i) => `t${i}`);
    const { tree, id } = addTask(emptyTree(), { title: long, tags });
    expect(tree.tasks[id].title).toHaveLength(MAX_TITLE_LENGTH);
    expect(tree.tasks[id].tags).toHaveLength(MAX_TAGS);
    const updated = updateTask(tree, id, { title: 'y'.repeat(700) });
    expect(updated.tasks[id].title).toHaveLength(MAX_TITLE_LENGTH);
  });
});
