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

describe('ui store', () => {
  it('sets view and tag filter', () => {
    useUIStore.getState().setView('deadline');
    useUIStore.getState().setTagFilter('x');
    expect(useUIStore.getState()).toMatchObject({ view: 'deadline', tagFilter: 'x' });
    useUIStore.getState().setView('tree');
    useUIStore.getState().setTagFilter(null);
  });
});
