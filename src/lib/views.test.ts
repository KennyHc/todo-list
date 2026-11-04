import { describe, expect, it } from 'vitest';
import { mkState, mkTask } from '../test/factories';
import type { TaskTree } from '../types';
import { addTask, emptyTree, toggleDone, updateTask } from './tree';
import {
  COMPLETED_PREVIEW,
  allTags,
  deadlineList,
  dueStatus,
  neighborAfterRemoval,
  taskPath,
  todayISO,
  treeRows,
  upcomingCount,
  visibleOrder,
  visibleTreeIds,
} from './views';

type Spec = { tags?: string[]; dueDate?: string | null; parentId?: string | null };

function build() {
  let tree: TaskTree = emptyTree();
  let clock = 1000;
  const add = (title: string, spec: Spec = {}) => {
    const r = addTask(tree, { title, ...spec }, (clock += 10));
    tree = r.tree;
    return r.id;
  };
  return {
    add,
    get tree() {
      return tree;
    },
    set tree(t: TaskTree) {
      tree = t;
    },
  };
}

describe('allTags', () => {
  it('counts across parents and subtasks, sorted by count desc then name', () => {
    const b = build();
    const p = b.add('p', { tags: ['b', 'z'] });
    b.add('c', { parentId: p, tags: ['b', 'a'] });
    b.add('d', { tags: ['a', 'z', 'b'] });
    expect(allTags(b.tree)).toEqual([
      { tag: 'b', count: 3 },
      { tag: 'a', count: 2 },
      { tag: 'z', count: 2 },
    ]);
  });

  it('is empty without tags', () => {
    expect(allTags(emptyTree())).toEqual([]);
  });
});

describe('taskPath', () => {
  it('returns ancestor titles root first', () => {
    const b = build();
    const a = b.add('A');
    const c = b.add('B', { parentId: a });
    const d = b.add('C', { parentId: c });
    expect(taskPath(b.tree, d)).toEqual(['A', 'B']);
    expect(taskPath(b.tree, a)).toEqual([]);
    expect(taskPath(b.tree, 'nope')).toEqual([]);
  });
});

describe('visibleTreeIds', () => {
  it('returns null without a tag', () => {
    expect(visibleTreeIds(build().tree, null)).toBeNull();
  });

  it('includes matches, their ancestors and descendants of matches, not siblings', () => {
    const b = build();
    const root = b.add('root');
    const mid = b.add('mid', { parentId: root, tags: ['x'] });
    const leaf = b.add('leaf', { parentId: mid });
    const sibling = b.add('sib', { parentId: root });
    const deep = b.add('deep', { parentId: sibling, tags: ['x'] });
    const other = b.add('other');
    const ids = visibleTreeIds(b.tree, 'x')!;
    expect(ids).toEqual(new Set([root, mid, leaf, sibling, deep]));
    expect(ids.has(other)).toBe(false);
  });

  it('does not include descendants of an ancestor-only task', () => {
    const b = build();
    const root = b.add('root');
    const hit = b.add('hit', { parentId: root, tags: ['x'] });
    const miss = b.add('miss', { parentId: root });
    const ids = visibleTreeIds(b.tree, 'x')!;
    expect(ids).toEqual(new Set([root, hit]));
    expect(ids.has(miss)).toBe(false);
  });

  it('is empty for an unknown tag', () => {
    const b = build();
    b.add('a', { tags: ['x'] });
    expect(visibleTreeIds(b.tree, 'nope')!.size).toBe(0);
  });
});

describe('deadlineList', () => {
  it('orders dated asc, then undated by createdAt, then done by completedAt desc', () => {
    const b = build();
    const noDate1 = b.add('nd1');
    const late = b.add('late', { dueDate: '2026-03-01' });
    const doneA = b.add('doneA', { dueDate: '2026-01-01' });
    const early = b.add('early', { dueDate: '2026-02-01' });
    const noDate2 = b.add('nd2');
    const doneB = b.add('doneB');
    b.tree = toggleDone(b.tree, doneA, 5000);
    b.tree = toggleDone(b.tree, doneB, 6000);
    expect(deadlineList(b.tree, { tag: null })).toEqual([
      early,
      late,
      noDate1,
      noDate2,
      doneB,
      doneA,
    ]);
  });

  it('flattens subtasks and parents ignoring hierarchy', () => {
    const b = build();
    const p = b.add('p', { dueDate: '2026-05-02' });
    const c = b.add('c', { parentId: p, dueDate: '2026-05-01' });
    expect(deadlineList(b.tree, { tag: null })).toEqual([c, p]);
  });

  it('keeps insertion order for equal due dates (stable)', () => {
    const b = build();
    const x = b.add('x', { dueDate: '2026-05-01' });
    const y = b.add('y', { dueDate: '2026-05-01' });
    const z = b.add('z', { dueDate: '2026-05-01' });
    expect(deadlineList(b.tree, { tag: null })).toEqual([x, y, z]);
  });

  it('keeps insertion order for equal createdAt', () => {
    let tree = emptyTree();
    const ids: string[] = [];
    for (const t of ['a', 'b', 'c']) {
      const r = addTask(tree, { title: t }, 1);
      tree = r.tree;
      ids.push(r.id);
    }
    expect(deadlineList(tree, { tag: null })).toEqual(ids);
    tree = toggleDone(toggleDone(tree, ids[0], 9), ids[1], 9);
    expect(deadlineList(tree, { tag: null })).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('filters by tag', () => {
    const b = build();
    const a = b.add('a', { tags: ['x'], dueDate: '2026-05-01' });
    b.add('b', { tags: ['y'] });
    const c = b.add('c', { tags: ['x'] });
    expect(deadlineList(b.tree, { tag: 'x' })).toEqual([a, c]);
    expect(deadlineList(b.tree, { tag: 'none' })).toEqual([]);
  });

  it('moves a task to the end when completed; a done parent takes its subtasks along', () => {
    const b = build();
    const a = b.add('a', { dueDate: '2026-05-01' });
    const c = b.add('c', { dueDate: '2026-06-01' });
    const kid = b.add('kid', { parentId: c, dueDate: '2026-07-01' });
    b.tree = toggleDone(b.tree, a, 100);
    expect(deadlineList(b.tree, { tag: null })).toEqual([c, kid, a]);
    b.tree = toggleDone(b.tree, c, 200);
    // Newest completion first; the parent and its subtask were completed together.
    const list = deadlineList(b.tree, { tag: null });
    expect(list.slice(0, 2).sort()).toEqual([c, kid].sort());
    expect(list[2]).toBe(a);
  });

  it('puts done tasks last by completedAt desc, respecting the tag filter', () => {
    const b = build();
    const open = b.add('open', { tags: ['x'], dueDate: '2026-05-01' });
    const old = b.add('old', { tags: ['x'] });
    const recent = b.add('recent', { tags: ['x'] });
    const other = b.add('other', { tags: ['y'] });
    b.tree = toggleDone(b.tree, old, 100);
    b.tree = toggleDone(b.tree, recent, 300);
    b.tree = toggleDone(b.tree, other, 200);
    expect(deadlineList(b.tree, { tag: null })).toEqual([open, recent, other, old]);
    expect(deadlineList(b.tree, { tag: 'x' })).toEqual([open, recent, old]);
    expect(deadlineList(b.tree, { tag: 'y' })).toEqual([other]);
  });
});

describe('todayISO', () => {
  it('uses the local date, zero padded', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayISO(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('dueStatus', () => {
  const today = '2026-03-10';
  it('returns null without a date', () => {
    expect(dueStatus(null, today)).toBeNull();
  });

  it('classifies around boundaries', () => {
    expect(dueStatus('2026-03-09', today)).toBe('overdue');
    expect(dueStatus('2026-03-10', today)).toBe('today');
    expect(dueStatus('2026-03-11', today)).toBe('soon');
    expect(dueStatus('2026-03-13', today)).toBe('soon');
    expect(dueStatus('2026-03-14', today)).toBe('later');
  });

  it('works across month and year ends and DST changes', () => {
    expect(dueStatus('2026-01-02', '2025-12-31')).toBe('soon');
    expect(dueStatus('2026-01-04', '2025-12-31')).toBe('later');
    expect(dueStatus('2026-03-01', '2026-02-28')).toBe('soon');
    expect(dueStatus('2026-03-30', '2026-03-28')).toBe('soon');
    expect(dueStatus('2026-11-02', '2026-10-31')).toBe('soon');
    expect(dueStatus('2025-12-31', '2026-01-01')).toBe('overdue');
  });
});

describe('visibleOrder', () => {
  function sample() {
    const b = build();
    const a = b.add('a', { tags: ['x'] });
    const a1 = b.add('a1', { parentId: a });
    const a2 = b.add('a2', { parentId: a, tags: ['x'] });
    const c = b.add('c', { dueDate: '2026-01-01' });
    const d = b.add('d');
    return { b, a, a1, a2, c, d };
  }

  it('lists the Week view day by day, for the current or the chosen week', () => {
    const tree = mkState([
      mkTask('fri', { dueDate: '2026-10-23' }),
      mkTask('mon', { dueDate: '2026-10-19' }),
      mkTask('next', { dueDate: '2026-10-27' }),
    ]);
    const today = '2026-10-21';
    expect(visibleOrder(tree, { view: 'week', tag: null }, today)).toEqual(['mon', 'fri']);
    expect(
      visibleOrder(tree, { view: 'week', tag: null, weekAnchor: '2026-10-26' }, today),
    ).toEqual(['next']);
  });

  it('walks the tree depth first', () => {
    const { b, a, a1, a2, c, d } = sample();
    expect(visibleOrder(b.tree, { view: 'tree', tag: null })).toEqual([a, a1, a2, c, d]);
  });

  it('skips done tasks, and a done parent with its subtree, like the list', () => {
    const { b, a, a1, a2, c, d } = sample();
    b.tree = toggleDone(b.tree, a1, 10);
    expect(visibleOrder(b.tree, { view: 'tree', tag: null })).toEqual([a, a2, c, d]);
    b.tree = toggleDone(b.tree, a, 20);
    expect(visibleOrder(b.tree, { view: 'tree', tag: null })).toEqual([c, d]);
  });

  it('skips the children of collapsed parents', () => {
    const { b, a, c, d } = sample();
    b.tree = updateTask(b.tree, a, { collapsed: true });
    expect(visibleOrder(b.tree, { view: 'tree', tag: null })).toEqual([a, c, d]);
  });

  it('respects the tag filter', () => {
    const { b, a, a1, a2 } = sample();
    expect(visibleOrder(b.tree, { view: 'tree', tag: 'x' })).toEqual([a, a1, a2]);
    expect(visibleOrder(b.tree, { view: 'tree', tag: 'none' })).toEqual([]);
  });

  it('uses deadline order, flat and ignoring collapse', () => {
    const { b, a, a1, a2, c, d } = sample();
    b.tree = updateTask(b.tree, a, { collapsed: true });
    expect(visibleOrder(b.tree, { view: 'deadline', tag: null })).toEqual([c, a, a1, a2, d]);
    expect(visibleOrder(b.tree, { view: 'deadline', tag: 'x' })).toEqual([a, a2]);
  });

  it('ends with the Completed rows, unless that section is collapsed or limited', () => {
    const b = build();
    const open = b.add('open', { dueDate: '2026-05-01' });
    const done: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const id = b.add(`d${i}`);
      b.tree = toggleDone(b.tree, id, 1000 + i);
      done.push(id);
    }
    const newest = [...done].reverse();
    const order = (extra: object) =>
      visibleOrder(b.tree, { view: 'deadline', tag: null, ...extra });
    expect(order({})).toEqual([open, ...newest.slice(0, COMPLETED_PREVIEW)]);
    expect(order({ completedShowAll: true })).toEqual([open, ...newest]);
    expect(order({ completedCollapsed: true, completedShowAll: true })).toEqual([open]);
  });

  it('is empty in the history view', () => {
    expect(visibleOrder(sample().b.tree, { view: 'history', tag: null })).toEqual([]);
  });
});

describe('neighborAfterRemoval', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('prefers the next row, then the previous', () => {
    expect(neighborAfterRemoval(order, 'b')).toBe('c');
    expect(neighborAfterRemoval(order, 'd')).toBe('c');
    expect(neighborAfterRemoval(['a'], 'a')).toBeNull();
  });

  it('skips rows removed along with it', () => {
    expect(neighborAfterRemoval(order, 'b', new Set(['b', 'c']))).toBe('d');
    expect(neighborAfterRemoval(order, 'c', new Set(['c', 'd']))).toBe('b');
  });

  it('returns null for an unknown id', () => {
    expect(neighborAfterRemoval(order, 'zzz')).toBeNull();
  });
});

describe('start dates in the lists', () => {
  const TODAY = '2026-10-20';
  const LATER = '2026-10-26';
  const tree = mkState([
    mkTask('a'),
    mkTask('p', { childIds: ['c1', 'c2'], startDate: LATER }),
    mkTask('c1', { parentId: 'p', childIds: ['g'], dueDate: '2026-10-21' }),
    mkTask('g', { parentId: 'c1' }),
    mkTask('c2', { parentId: 'p' }),
    mkTask('q', { childIds: ['r'] }),
    mkTask('r', { parentId: 'q', startDate: LATER }),
    mkTask('s', { startDate: TODAY }),
    mkTask('t', { startDate: '2026-10-01' }),
    mkTask('u', { startDate: LATER, done: true, completedAt: 5 }),
  ]);

  it('treeRows leaves out a not-started task with its whole subtree', () => {
    expect(treeRows(tree, null, { today: TODAY })).toEqual(['a', 'q', 's', 't']);
  });

  it('a start date of today or earlier shows normally; nothing is cleared', () => {
    expect(treeRows(tree, null, { today: LATER })).toEqual([
      'a',
      'p',
      'c1',
      'g',
      'c2',
      'q',
      'r',
      's',
      't',
    ]);
    expect(tree.tasks.p.startDate).toBe(LATER);
  });

  it('showUpcoming brings them back in tree order', () => {
    expect(treeRows(tree, null, { today: TODAY, showUpcoming: true })).toEqual([
      'a',
      'p',
      'c1',
      'g',
      'c2',
      'q',
      'r',
      's',
      't',
    ]);
  });

  it('deadlineList leaves them out too (subtree included), but not done tasks', () => {
    expect(deadlineList(tree, { tag: null }, TODAY)).toEqual(['a', 'q', 's', 't', 'u']);
    expect(deadlineList(tree, { tag: null }, LATER)).toContain('c1');
  });

  it('visibleOrder follows both views, with showUpcoming for the tree', () => {
    const opts = { tag: null, completedShowAll: true };
    expect(visibleOrder(tree, { ...opts, view: 'tree' }, TODAY)).toEqual(['a', 'q', 's', 't']);
    expect(visibleOrder(tree, { ...opts, view: 'tree', showUpcoming: true }, TODAY)).toHaveLength(
      9,
    );
    expect(visibleOrder(tree, { ...opts, view: 'deadline' }, TODAY)).not.toContain('c1');
  });

  describe('upcomingCount', () => {
    it('counts only the topmost hidden tasks, not their descendants', () => {
      // p (with three descendants) and r; the done one is not counted.
      expect(upcomingCount(tree, TODAY)).toBe(2);
    });

    it('is zero when nothing is hidden, and when the date has come', () => {
      expect(upcomingCount(mkState([mkTask('a'), mkTask('b', { startDate: TODAY })]), TODAY)).toBe(
        0,
      );
      expect(upcomingCount(tree, LATER)).toBe(0);
    });

    it('respects the tag filter and skips tasks under a done parent', () => {
      const tagged = mkState([
        mkTask('a', { startDate: LATER, tags: ['x'] }),
        mkTask('b', { startDate: LATER, tags: ['y'] }),
        mkTask('d', { done: true, childIds: ['e'] }),
        mkTask('e', { parentId: 'd', startDate: LATER, done: true }),
      ]);
      expect(upcomingCount(tagged, TODAY)).toBe(2);
      expect(upcomingCount(tagged, TODAY, 'x')).toBe(1);
    });
  });
});
