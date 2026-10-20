import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLegacyLocalTasks,
  migrateTasksState,
  readLegacyLocalTasks,
  resetTaskStore,
  useTaskStore,
} from './tasks';
import { useUIStore } from './ui';

const get = () => useTaskStore.getState();

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
});

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
    // The old default blue meant "unset": it migrates to automatic (null).
    expect(out.tasks.a).toEqual({ ...v1Task, color: null, tags: [], dueDate: null, repeat: null });
    expect(out.rootIds).toEqual(['a']);
    expect(out.history).toEqual([]);
  });

  it('is idempotent and keeps existing values', () => {
    const v2 = { ...v1Task, color: '#C9B8F2', tags: ['x'], dueDate: '2026-01-01', repeat: null };
    const out = migrateTasksState({ tasks: { a: v2 }, rootIds: ['a'], history: [] });
    expect(out.tasks.a).toEqual(v2);
    expect(migrateTasksState(out)).toEqual(out);
  });

  it('tolerates garbage', () => {
    expect(migrateTasksState(undefined)).toEqual({
      tasks: {},
      rootIds: [],
      history: [],
      tagColors: {},
    });
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
    get().replaceAll({ tasks: {}, rootIds: [], history: [], tagColors: {} }, 'Imported backup');
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

describe('legacy local data', () => {
  const task = {
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

  it('reads and migrates the old persisted state, then clears it', () => {
    localStorage.setItem(
      'tasks-v1',
      JSON.stringify({ state: { tasks: { a: task }, rootIds: ['a'] }, version: 1 }),
    );
    const data = readLegacyLocalTasks();
    expect(data?.tasks.a).toEqual({ ...task, color: null, tags: [], dueDate: null, repeat: null });
    expect(data?.rootIds).toEqual(['a']);
    clearLegacyLocalTasks();
    expect(localStorage.getItem('tasks-v1')).toBeNull();
    expect(readLegacyLocalTasks()).toBeNull();
  });

  it('returns null for missing, empty or corrupt data', () => {
    expect(readLegacyLocalTasks()).toBeNull();
    localStorage.setItem('tasks-v1', JSON.stringify({ state: { tasks: {}, rootIds: [] } }));
    expect(readLegacyLocalTasks()).toBeNull();
    localStorage.setItem('tasks-v1', '{nope');
    expect(readLegacyLocalTasks()).toBeNull();
  });

  it('no longer persists tasks to localStorage', () => {
    get().add({ title: 'in memory only' });
    expect(localStorage.getItem('tasks-v1')).toBeNull();
  });
});

describe('hydrate', () => {
  it('sets remote data without touching undo', () => {
    const id = get().add({ title: 'A' });
    get().toggle(id);
    const undo = get().undo;
    expect(undo).not.toBeNull();
    get().hydrate({ rootIds: [id] });
    expect(get().undo).toBe(undo);
    expect(get().lastToggle?.id).toBe(id);
  });

  it('clears lastToggle only when the toggled task changed remotely', () => {
    const id = get().add({ title: 'A' });
    const other = get().add({ title: 'B' });
    get().toggle(id);
    get().hydrate({ tasks: { ...get().tasks, [other]: { ...get().tasks[other], title: 'B2' } } });
    expect(get().lastToggle?.id).toBe(id);
    get().hydrate({ tasks: { ...get().tasks, [id]: { ...get().tasks[id], title: 'A2' } } });
    expect(get().lastToggle).toBeNull();
    expect(get().undo).not.toBeNull();
  });
});

describe('AI import actions', () => {
  const imported = [
    {
      title: 'Plan',
      difficulty: 1 as const,
      tags: [],
      subtasks: [
        { title: 'Step 1', difficulty: 2 as const, tags: [], subtasks: [] },
        { title: 'Step 2', difficulty: 3 as const, tags: [], subtasks: [] },
      ],
    },
  ];

  it('appendTasks adds at the root, records an undo with the label, and undo restores', () => {
    const existing = get().add({ title: 'Existing' });
    const ids = get().appendTasks(imported, 'Added 3 tasks from AI');
    expect(ids).toHaveLength(1);
    expect(get().rootIds).toEqual([existing, ids[0]]);
    expect(get().tasks[ids[0]].childIds).toHaveLength(2);
    expect(get().undo?.label).toBe('Added 3 tasks from AI');
    get().undoLast();
    expect(get().rootIds).toEqual([existing]);
    expect(Object.keys(get().tasks)).toEqual([existing]);
  });

  it('appendTasks ignores an empty import', () => {
    expect(get().appendTasks([], 'nothing')).toEqual([]);
    expect(get().undo).toBeNull();
  });

  it('replaceWithTasks starts from an empty tree, keeps the history, and undoes', () => {
    const a = get().add({ title: 'Old' });
    get().toggle(a);
    const history = get().history;
    expect(history).toHaveLength(1);
    const ids = get().replaceWithTasks(imported, 'Replaced list');
    expect(get().rootIds).toEqual(ids);
    expect(get().tasks[a]).toBeUndefined();
    expect(Object.keys(get().tasks)).toHaveLength(3);
    expect(get().history).toBe(history);
    expect(get().undo?.label).toBe('Replaced list');
    get().undoLast();
    expect(get().tasks[a]).toBeDefined();
    expect(get().rootIds).toEqual([a]);
  });
});

describe('tag colours', () => {
  beforeEach(() => resetTaskStore());

  it('sets, changes and clears a tag colour, each with an undo', () => {
    const { setTagColor } = useTaskStore.getState();
    setTagColor('#Work', '#C9B8F2');
    expect(useTaskStore.getState().tagColors).toEqual({ work: '#C9B8F2' });
    expect(useTaskStore.getState().undo?.label).toBe('Changed #work colour');

    setTagColor('work', '#FFD3B6');
    expect(useTaskStore.getState().tagColors.work).toBe('#FFD3B6');
    setTagColor('work', null);
    expect(useTaskStore.getState().tagColors).toEqual({});
  });

  it('undo restores the previous map; no-ops record nothing', () => {
    const { setTagColor } = useTaskStore.getState();
    setTagColor('work', '#C9B8F2');
    useTaskStore.getState().dismissUndo();
    setTagColor('work', '#C9B8F2'); // unchanged
    expect(useTaskStore.getState().undo).toBeNull();
    setTagColor('nothing', null); // already unset
    expect(useTaskStore.getState().undo).toBeNull();

    setTagColor('work', '#FFD3B6');
    useTaskStore.getState().undoLast();
    expect(useTaskStore.getState().tagColors).toEqual({ work: '#C9B8F2' });
    expect(useTaskStore.getState().undo).toBeNull();
  });

  it('rejects invalid colours and reserved names, and keeps colours of unused tags', () => {
    const s = useTaskStore.getState();
    s.setTagColor('work', 'not-a-colour');
    s.setTagColor('__proto__', '#C9B8F2');
    expect(useTaskStore.getState().tagColors).toEqual({});

    s.setTagColor('work', '#C9B8F2');
    const id = s.add({ title: 'x', tags: ['work'] });
    s.update(id, { tags: [] }); // nobody uses the tag any more
    expect(useTaskStore.getState().tagColors).toEqual({ work: '#C9B8F2' });
  });

  it('is replaced by an import (with undo) and applied by hydrate', () => {
    const s = useTaskStore.getState();
    s.setTagColor('a', '#C9B8F2');
    s.replaceAll({ tasks: {}, rootIds: [], history: [], tagColors: { b: '#FFD3B6' } }, 'Imported');
    expect(useTaskStore.getState().tagColors).toEqual({ b: '#FFD3B6' });
    useTaskStore.getState().undoLast();
    expect(useTaskStore.getState().tagColors).toEqual({ a: '#C9B8F2' });
    useTaskStore.getState().hydrate({ tagColors: { c: '#B5E5CF' } });
    expect(useTaskStore.getState().tagColors).toEqual({ c: '#B5E5CF' });
    expect(useTaskStore.getState().undo).toBeNull();
  });
});

describe('migrateTasksState: v2 to v3', () => {
  const base = { id: 'a', title: 'A', difficulty: 1, done: false, collapsed: false, childIds: [] };

  it('turns the old default blue into automatic, keeps explicit colours, adds tagColors', () => {
    const out = migrateTasksState({
      tasks: {
        a: { ...base, parentId: null, color: '#A9C6F5', createdAt: 1 },
        b: { ...base, id: 'b', parentId: null, color: '#C9B8F2', createdAt: 2 },
      },
      rootIds: ['a', 'b'],
      history: [],
    });
    expect(out.tasks.a.color).toBeNull();
    expect(out.tasks.b.color).toBe('#C9B8F2');
    expect(out.tagColors).toEqual({});
  });

  it('is idempotent and keeps tagColors', () => {
    const once = migrateTasksState({
      tasks: { a: { ...base, parentId: null, color: '#A9C6F5', createdAt: 1 } },
      rootIds: ['a'],
      tagColors: { work: '#C9B8F2', bad: 'zzz' },
    });
    expect(once.tagColors).toEqual({ work: '#C9B8F2' });
    expect(migrateTasksState(once)).toEqual(once);
  });
});

describe('recurring tasks', () => {
  // Tue 20 Oct 2026, local time.
  const NOW = new Date(2026, 9, 20, 10, 30);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const sunday = { every: 'week', weekday: 0 } as const;
  const copiesOf = (id: string) =>
    Object.values(get().tasks).filter((task) => task.spawnedFrom === id);

  it('completing a repeating task spawns exactly one next occurrence, right after it', () => {
    const before = get().add({ title: 'Before' });
    const id = get().add({
      title: 'Water plants',
      dueDate: '2026-10-18',
      repeat: sunday,
      afterId: before,
    });
    const after = get().add({ title: 'After' });
    get().toggle(id);

    const [copy] = copiesOf(id);
    expect(copiesOf(id)).toHaveLength(1);
    expect(copy).toMatchObject({
      title: 'Water plants',
      done: false,
      dueDate: '2026-10-25',
      repeat: sunday,
    });
    expect(get().tasks[id].done).toBe(true);
    expect(get().rootIds).toEqual([before, id, copy.id, after]);
  });

  it('labels the undo "Completed “Water plants” · next on Sun"', () => {
    const id = get().add({ title: 'Water plants', dueDate: '2026-10-18', repeat: sunday });
    get().toggle(id);
    expect(get().undo?.label).toBe('Completed “Water plants” · next on Sun');
  });

  it('logs one history entry for the completion, none for the copy', () => {
    const id = get().add({ title: 'Water plants', dueDate: '2026-10-18', repeat: sunday });
    get().toggle(id);
    expect(get().history).toHaveLength(1);
    expect(get().history[0]).toMatchObject({ taskId: id, title: 'Water plants', auto: false });
  });

  it('undo removes the copy and reopens the original', () => {
    const id = get().add({ title: 'Water plants', dueDate: '2026-10-18', repeat: sunday });
    get().toggle(id);
    expect(Object.keys(get().tasks)).toHaveLength(2);
    get().undoLast();
    expect(Object.keys(get().tasks)).toEqual([id]);
    expect(get().tasks[id].done).toBe(false);
    expect(get().rootIds).toEqual([id]);
    expect(get().history).toEqual([]);
  });

  it('does not spawn on plain tasks, tasks without a due date, or when reopening', () => {
    const plain = get().add({ title: 'Plain', dueDate: '2026-10-18' });
    const undated = get().add({ title: 'Undated' });
    get().toggle(plain);
    get().toggle(undated);
    expect(Object.keys(get().tasks)).toHaveLength(2);

    const rep = get().add({ title: 'Rep', dueDate: '2026-10-18', repeat: sunday });
    get().toggle(rep); // done: one copy
    expect(Object.keys(get().tasks)).toHaveLength(4);
    get().toggle(rep); // reopen: no new copy, the existing one stays
    expect(Object.keys(get().tasks)).toHaveLength(4);
    expect(get().tasks[rep].done).toBe(false);
    expect(copiesOf(rep)).toHaveLength(1);
  });

  it('a double toggle (done, undone, done) does not create a second copy for the same date', () => {
    const id = get().add({ title: 'Water plants', dueDate: '2026-10-18', repeat: sunday });
    get().toggle(id);
    get().toggle(id);
    get().toggle(id);
    expect(get().tasks[id].done).toBe(true);
    expect(copiesOf(id)).toHaveLength(1);
    expect(Object.keys(get().tasks)).toHaveLength(2);
  });

  it('a parent that auto-completes through a cascade spawns', () => {
    const parent = get().add({ title: 'Weekly review', dueDate: '2026-10-20', repeat: sunday });
    const a = get().add({ title: 'A', parentId: parent });
    const b = get().add({ title: 'B', parentId: parent });
    get().toggle(a);
    expect(copiesOf(parent)).toHaveLength(0);
    get().toggle(b);
    expect(get().tasks[parent].done).toBe(true);
    const [copy] = copiesOf(parent);
    expect(copy).toMatchObject({ title: 'Weekly review', done: false, dueDate: '2026-10-25' });
    // The copy brings its own, undone subtasks.
    expect(copy.childIds).toHaveLength(2);
    expect(copy.childIds.every((c) => get().tasks[c].done === false)).toBe(true);
    // History: A, B and the cascaded parent, once each.
    expect(get().history.map((e) => e.title)).toEqual(['A', 'B', 'Weekly review']);
  });

  it('toggling a parent done spawns for the parent only, not again for repeating subtasks', () => {
    const parent = get().add({ title: 'P', dueDate: '2026-10-20', repeat: { every: 'day' } });
    const child = get().add({
      title: 'C',
      parentId: parent,
      dueDate: '2026-10-20',
      repeat: { every: 'day' },
    });
    get().toggle(parent);
    expect(copiesOf(parent)).toHaveLength(1);
    expect(copiesOf(child)).toHaveLength(0);
    expect(Object.keys(get().tasks)).toHaveLength(4);
  });

  it('a repeating subtask leaves its next occurrence beside it, keeping the parent open', () => {
    const parent = get().add({ title: 'Chores' });
    const child = get().add({
      title: 'Bins',
      parentId: parent,
      dueDate: '2026-10-20',
      repeat: { every: 'week' },
    });
    get().toggle(child);
    expect(get().tasks[child].done).toBe(true);
    const [copy] = copiesOf(child);
    expect(copy).toMatchObject({ parentId: parent, dueDate: '2026-10-27' });
    expect(get().tasks[parent].childIds).toEqual([child, copy.id]);
    expect(get().tasks[parent].done).toBe(false);
    expect(get().history.map((e) => e.title)).toEqual(['Bins']);
  });

  it('records lastToggle for the original and leaves the copy undone', () => {
    const id = get().add({ title: 'T', dueDate: '2026-10-20', repeat: { every: 'day' } });
    get().toggle(id);
    expect(get().lastToggle?.id).toBe(id);
    expect(copiesOf(id)[0].dueDate).toBe('2026-10-21');
  });

  it('migrateTasksState defaults a missing or invalid repeat to null and keeps a valid one', () => {
    const base = { id: 'a', title: 'A', difficulty: 1, done: false, collapsed: false };
    const out = migrateTasksState({
      tasks: {
        a: { ...base, childIds: [], parentId: null, createdAt: 1 },
        b: { ...base, id: 'b', repeat: { every: 'nope' }, childIds: [], parentId: null },
        c: { ...base, id: 'c', repeat: { every: 'week', weekday: 2 }, spawnedFrom: 'a' },
      },
      rootIds: ['a', 'b', 'c'],
    });
    expect(out.tasks.a.repeat).toBeNull();
    expect(out.tasks.b.repeat).toBeNull();
    expect(out.tasks.c.repeat).toEqual({ every: 'week', weekday: 2 });
    expect(out.tasks.c.spawnedFrom).toBe('a');
    expect('spawnedFrom' in out.tasks.a).toBe(false);
  });

  it('update: setting and clearing repeat and due date', () => {
    const id = get().add({ title: 'T', dueDate: '2026-10-22' });
    get().update(id, { repeat: { every: 'day' } });
    expect(get().tasks[id].repeat).toEqual({ every: 'day' });
    get().update(id, { dueDate: null });
    expect(get().tasks[id]).toMatchObject({ dueDate: null, repeat: null });
  });
});
