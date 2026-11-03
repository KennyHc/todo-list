import { beforeEach, describe, expect, it } from 'vitest';
import { migrateTasksState, resetTaskStore, useTaskStore } from './tasks';
import { useUIStore } from './ui';

const get = () => useTaskStore.getState();

beforeEach(() => resetTaskStore());

describe('migrateTasksState', () => {
  const v1Task = {
    id: 'a',
    title: 'A',
    difficulty: 2,
    color: '#A9C6F5',
    done: false,
    collapsed: false,
    parentId: null,
    childIds: [],
    createdAt: 5,
  };

  it('adds tags, dueDate and history to v1 data', () => {
    const out = migrateTasksState({ tasks: { a: v1Task }, rootIds: ['a'] });
    expect(out.tasks.a).toEqual({ ...v1Task, tags: [], dueDate: null });
    expect(out.rootIds).toEqual(['a']);
    expect(out.history).toEqual([]);
  });

  it('is idempotent and keeps existing values', () => {
    const v2 = { ...v1Task, tags: ['x'], dueDate: '2026-01-01' };
    const out = migrateTasksState({ tasks: { a: v2 }, rootIds: ['a'], history: [] });
    expect(out.tasks.a).toEqual(v2);
    expect(migrateTasksState(out)).toEqual(out);
  });

  it('tolerates garbage', () => {
    expect(migrateTasksState(undefined)).toEqual({ tasks: {}, rootIds: [], history: [] });
  });
});

describe('task store history', () => {
  it('logs completions, cascades and removes on uncheck', () => {
    const p = get().add({ title: 'P', tags: ['#X'] });
    const c1 = get().add({ title: 'C1', parentId: p });
    const c2 = get().add({ title: 'C2', parentId: p });
    expect(get().tasks[p].tags).toEqual(['x']);
    get().toggle(c1);
    get().toggle(c2);
    expect(get().history.map((e) => [e.title, e.auto])).toEqual([
      ['C1', false],
      ['C2', false],
      ['P', true],
    ]);
    get().toggle(c1);
    expect(get().history.map((e) => e.title)).toEqual(['C2']);
  });

  it('keeps history when tasks are removed or completed ones cleared', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    get().toggle(a);
    get().toggle(b);
    get().remove(a);
    expect(get().history).toHaveLength(2);
    get().clearCompleted();
    expect(Object.keys(get().tasks)).toEqual([]);
    expect(get().history).toHaveLength(2);
  });

  it('clearCompleted is a no-op without done tasks', () => {
    get().add({ title: 'A' });
    const before = get().tasks;
    get().clearCompleted();
    expect(get().tasks).toBe(before);
  });

  it('clears and removes history entries', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    get().toggle(a);
    get().toggle(b);
    get().removeHistoryEntry(get().history[0].id);
    expect(get().history.map((e) => e.title)).toEqual(['B']);
    get().clearHistory();
    expect(get().history).toEqual([]);
  });
});

describe('undo', () => {
  it('restores a deleted subtree and the history', () => {
    const p = get().add({ title: 'P' });
    const c = get().add({ title: 'C', parentId: p });
    const other = get().add({ title: 'O' });
    get().toggle(other);
    const before = { tasks: get().tasks, rootIds: get().rootIds, history: get().history };
    get().remove(p);
    expect(get().undo?.label).toBe('Deleted \u201cP\u201d and 1 subtask');
    expect(get().tasks[c]).toBeUndefined();
    get().undoLast();
    expect(get().tasks).toBe(before.tasks);
    expect(get().rootIds).toBe(before.rootIds);
    expect(get().history).toBe(before.history);
    expect(get().undo).toBeNull();
  });

  it('undoes a cascade completion, including the history entries', () => {
    const p = get().add({ title: 'P' });
    const c1 = get().add({ title: 'C1', parentId: p });
    const c2 = get().add({ title: 'C2', parentId: p });
    get().toggle(c1);
    get().toggle(c2);
    expect(get().undo?.label).toBe('Completed 2 tasks');
    expect(get().tasks[p].done).toBe(true);
    expect(get().history).toHaveLength(3);
    get().undoLast();
    expect(get().tasks[p].done).toBe(false);
    expect(get().tasks[c2].done).toBe(false);
    expect(get().tasks[c1].done).toBe(true);
    expect(get().history.map((e) => e.title)).toEqual(['C1']);
    expect(get().lastToggle).toBeNull();
  });

  it('labels single completions and reopens', () => {
    const a = get().add({ title: 'A' });
    get().toggle(a);
    expect(get().undo?.label).toBe('Completed \u201cA\u201d');
    get().toggle(a);
    expect(get().undo?.label).toBe('Reopened \u201cA\u201d');
  });

  it('undoes clearCompleted', () => {
    const a = get().add({ title: 'A' });
    get().add({ title: 'B' });
    get().toggle(a);
    get().clearCompleted();
    expect(get().undo?.label).toBe('Cleared 1 completed');
    expect(get().tasks[a]).toBeUndefined();
    get().undoLast();
    expect(get().tasks[a].done).toBe(true);
    expect(get().rootIds).toContain(a);
  });

  it('records and undoes a move, and ignores no-op moves', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    const before = { tasks: get().tasks, rootIds: get().rootIds };
    get().move(a, { parentId: a, index: 0 });
    get().move(a, { parentId: null, index: 0 });
    expect(get().undo).toBeNull();
    get().move(a, { parentId: b, index: 0 });
    expect(get().undo?.label).toBe('Moved \u201cA\u201d');
    expect(get().tasks[b].childIds).toEqual([a]);
    expect(get().lastToggle).toBeNull();
    get().undoLast();
    expect(get().tasks).toBe(before.tasks);
    expect(get().rootIds).toBe(before.rootIds);
  });

  it('does not record an undo for a no-op clearCompleted', () => {
    get().add({ title: 'A' });
    get().clearCompleted();
    expect(get().undo).toBeNull();
  });

  it('only undoes the latest action, and non-undoable actions keep the entry', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    get().remove(a);
    get().remove(b);
    const entry = get().undo;
    get().add({ title: 'C' });
    get().update(b, {});
    expect(get().undo).toBe(entry);
    get().undoLast();
    expect(get().tasks[b]).toBeDefined();
    expect(get().tasks[a]).toBeUndefined();
    get().undoLast();
    expect(get().tasks[a]).toBeUndefined();
  });

  it('undoes history clearing and replaceAll', () => {
    const a = get().add({ title: 'A' });
    get().toggle(a);
    get().clearHistory();
    expect(get().undo?.label).toBe('Cleared history (1 entry)');
    get().undoLast();
    expect(get().history).toHaveLength(1);
    get().replaceAll({ tasks: {}, rootIds: [], history: [] }, 'Imported backup');
    expect(get().rootIds).toEqual([]);
    get().undoLast();
    expect(get().tasks[a]).toBeDefined();
  });
});

describe('ui store', () => {
  it('sets view and tag filter', () => {
    useUIStore.getState().setView('deadline');
    useUIStore.getState().setTagFilter('x');
    expect(useUIStore.getState()).toMatchObject({ view: 'deadline', tagFilter: 'x' });
    useUIStore.getState().setView('tree');
    useUIStore.getState().setTagFilter(null);
  });
});

describe('revealTask', () => {
  it('expands every collapsed ancestor in one update, without an undo entry', () => {
    const s = useTaskStore.getState();
    const a = s.add({ title: 'a' });
    const b = s.add({ title: 'b', parentId: a });
    const c = s.add({ title: 'c', parentId: b });
    s.update(a, { collapsed: true });
    s.update(b, { collapsed: true });
    let updates = 0;
    const unsubscribe = useTaskStore.subscribe(() => (updates += 1));
    useTaskStore.getState().revealTask(c);
    unsubscribe();
    const { tasks, undo } = useTaskStore.getState();
    expect(tasks[a].collapsed).toBe(false);
    expect(tasks[b].collapsed).toBe(false);
    expect(updates).toBe(1);
    expect(undo).toBeNull();
  });

  it('does nothing when nothing is collapsed', () => {
    const s = useTaskStore.getState();
    const a = s.add({ title: 'a' });
    const b = s.add({ title: 'b', parentId: a });
    const before = useTaskStore.getState().tasks;
    useTaskStore.getState().revealTask(b);
    expect(useTaskStore.getState().tasks).toBe(before);
  });
});
