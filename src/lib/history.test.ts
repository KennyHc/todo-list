import { describe, expect, it } from 'vitest';
import type { TaskTree } from '../types';
import { applyHistory, diffCompletions, synthesizeHistory } from './history';
import { addTask, deleteTask, emptyTree, toggleDone, updateTask } from './tree';

function sample() {
  let tree: TaskTree = emptyTree();
  const a = addTask(tree, { title: 'A', tags: ['t'], dueDate: '2026-05-01', color: '#111111' }, 1);
  tree = a.tree;
  const b = addTask(tree, { title: 'B', parentId: a.id, difficulty: 3 }, 2);
  tree = b.tree;
  const c = addTask(tree, { title: 'C', parentId: a.id, difficulty: 2 }, 3);
  tree = c.tree;
  return { tree, a: a.id, b: b.id, c: c.id };
}

const run = (before: TaskTree, id: string, now: number) => {
  const after = toggleDone(before, id, now);
  return { after, diff: diffCompletions(before, after, id, now) };
};

describe('diffCompletions', () => {
  it('logs a toggled leaf with a full snapshot', () => {
    const s = sample();
    const { diff } = run(s.tree, s.b, 100);
    expect(diff.reopenedTaskIds).toEqual([]);
    expect(diff.completed).toHaveLength(1);
    expect(diff.completed[0]).toMatchObject({
      taskId: s.b,
      title: 'B',
      difficulty: 3,
      isParent: false,
      subtaskCount: 0,
      path: ['A'],
      createdAt: 2,
      completedAt: 100,
      auto: false,
    });
    expect(typeof diff.completed[0].id).toBe('string');
  });

  it('checking the last open subtask logs only that subtask, never the parent (#74)', () => {
    const s = sample();
    const one = run(s.tree, s.b, 100);
    const two = run(one.after, s.c, 200);
    expect(two.diff.completed.map((e) => [e.taskId, e.auto])).toEqual([[s.c, false]]);
  });

  it('logs a toggled parent with a full snapshot, after its subtasks', () => {
    const s = sample();
    const { diff } = run(s.tree, s.a, 200);
    const parent = diff.completed[2];
    expect(parent).toMatchObject({
      taskId: s.a,
      auto: false,
      title: 'A',
      color: '#111111',
      tags: ['t'],
      dueDate: '2026-05-01',
      difficulty: 5,
      isParent: true,
      subtaskCount: 2,
      path: [],
      completedAt: 200,
    });
  });

  it('marks descendants as auto when a parent is toggled', () => {
    const s = sample();
    const { diff } = run(s.tree, s.a, 50);
    expect(diff.completed.map((e) => [e.taskId, e.auto])).toEqual([
      [s.b, true],
      [s.c, true],
      [s.a, false],
    ]);
  });

  it('only logs tasks whose state changed (already done descendants are skipped)', () => {
    const s = sample();
    const mid = run(s.tree, s.b, 10).after;
    const { diff } = run(mid, s.a, 20);
    expect(diff.completed.map((e) => e.taskId)).toEqual([s.c, s.a]);
  });

  it('reports reopened tasks including cascaded ancestors', () => {
    const s = sample();
    const all = run(s.tree, s.a, 10).after;
    const { diff } = run(all, s.b, 20);
    expect(diff.completed).toEqual([]);
    expect(diff.reopenedTaskIds.sort()).toEqual([s.a, s.b].sort());
  });

  it('is empty for a no-op', () => {
    const s = sample();
    expect(diffCompletions(s.tree, s.tree, 'x', 1)).toEqual({
      completed: [],
      reopenedTaskIds: [],
    });
  });
});

describe('applyHistory', () => {
  it('appends newest last', () => {
    const s = sample();
    const first = run(s.tree, s.b, 1);
    const second = run(first.after, s.a, 2);
    const h = applyHistory(applyHistory([], first.diff), second.diff);
    expect(h.map((e) => e.taskId)).toEqual([s.b, s.c, s.a]);
  });

  it('unchecking removes only the latest entry of that task', () => {
    const s = sample();
    let tree = s.tree;
    let history = applyHistory([], run(tree, s.b, 1).diff);
    tree = toggleDone(tree, s.b, 1);
    // uncheck then recheck -> two completions in total, one entry remaining after uncheck
    const un = run(tree, s.b, 2);
    history = applyHistory(history, un.diff);
    expect(history).toEqual([]);

    const again = run(un.after, s.b, 3);
    const h1 = applyHistory(history, again.diff);
    const h2 = applyHistory(h1, run(again.after, s.c, 4).diff);
    const un2 = run(toggleDone(again.after, s.c, 4), s.b, 5);
    const h3 = applyHistory(h2, un2.diff);
    expect(h3.map((e) => e.taskId).filter((id) => id === s.b)).toHaveLength(0);

    // Two entries for the same task: only the newest goes.
    const e1 = { ...h2[0], id: 'old' };
    const e2 = { ...h2[0], id: 'new' };
    const out = applyHistory([e1, e2], { completed: [], reopenedTaskIds: [e1.taskId] });
    expect(out.map((e) => e.id)).toEqual(['old']);
  });

  it('unchecking a child of a completed parent removes the parent entry too', () => {
    const s = sample();
    const one = run(s.tree, s.b, 1);
    const two = run(one.after, s.a, 2);
    let h = applyHistory(applyHistory([], one.diff), two.diff);
    expect(h).toHaveLength(3);
    const un = run(two.after, s.b, 3);
    h = applyHistory(h, un.diff);
    expect(h.map((e) => e.taskId)).toEqual([s.c]);
  });

  it('returns the same array for an empty diff and ignores unknown reopened ids', () => {
    const h = applyHistory([], { completed: [], reopenedTaskIds: [] });
    expect(applyHistory(h, { completed: [], reopenedTaskIds: [] })).toBe(h);
    expect(applyHistory(h, { completed: [], reopenedTaskIds: ['zzz'] })).toEqual([]);
  });

  it('keeps history when a task is later deleted (history is independent of the tree)', () => {
    const s = sample();
    const one = run(s.tree, s.b, 1);
    const h = applyHistory([], one.diff);
    const afterDelete = deleteTask(one.after, s.b);
    expect(afterDelete.tasks[s.b]).toBeUndefined();
    expect(h).toHaveLength(1);
  });

  it('snapshots the after tree', () => {
    const s = sample();
    const renamed = updateTask(s.tree, s.b, { title: 'B2' });
    const { diff } = run(renamed, s.b, 1);
    expect(diff.completed[0].title).toBe('B2');
  });
});

describe('synthesizeHistory', () => {
  const data = (tree: TaskTree, history: ReturnType<typeof applyHistory> = []) => ({
    ...tree,
    history,
    tagColors: {},
  });

  it('returns the same array when every done task has an entry', () => {
    const s = sample();
    const after = toggleDone(s.tree, s.b, 100);
    const history = applyHistory([], diffCompletions(s.tree, after, s.b, 100));
    const input = data(after, history);
    expect(synthesizeHistory(input)).toBe(input.history);
    expect(synthesizeHistory(data(s.tree))).toEqual([]);
  });

  it('adds entries for done tasks lacking one, children first, ordered by completedAt', () => {
    const s = sample();
    const done = toggleDone(s.tree, s.a, 700);
    const existing = applyHistory(
      [],
      diffCompletions(s.tree, toggleDone(s.tree, s.b, 100), s.b, 100),
    );
    const out = synthesizeHistory(data(done, existing), 999);
    expect(out.map((e) => e.taskId)).toEqual([s.b, s.c, s.a]);
    const parent = out.find((e) => e.taskId === s.a)!;
    expect(parent).toMatchObject({
      id: `h-${s.a}`,
      title: 'A',
      isParent: true,
      subtaskCount: 2,
      completedAt: 700,
      color: '#111111',
      auto: false,
    });
  });

  it('falls back to now when the task has no completedAt', () => {
    const s = sample();
    const done = toggleDone(s.tree, s.b, 100);
    const stripped = {
      ...done,
      tasks: { ...done.tasks, [s.b]: { ...done.tasks[s.b], completedAt: undefined } },
    };
    expect(synthesizeHistory(data(stripped), 4242)[0].completedAt).toBe(4242);
  });
});
