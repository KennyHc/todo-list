import { describe, expect, it } from 'vitest';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { backupFilename, parseBackup, serializeBackup } from './backup';
import type { PersistedTasks } from '../store/tasks';
import { DEFAULT_SETTINGS, MAX_NOTES_LENGTH } from '../types';

describe('backup', () => {
  const sampleData: PersistedTasks = {
    tasks: {
      '1': {
        id: '1',
        title: 'Task 1',
        done: false,
        collapsed: false,
        childIds: ['2'],
        parentId: null,
        tags: [],
        dueDate: null,
        repeat: null,
        plannedFor: null,
        startDate: null,
        difficulty: 1,
        color: null,
        createdAt: 1000,
      },
      '2': {
        id: '2',
        title: 'Task 2',
        done: false,
        collapsed: false,
        childIds: [],
        parentId: '1',
        tags: ['work'],
        dueDate: '2026-10-20',
        repeat: null,
        plannedFor: null,
        startDate: null,
        difficulty: 2,
        color: null,
        createdAt: 2000,
      },
    },
    rootIds: ['1'],
    history: [],
    tagColors: {},
    settings: DEFAULT_SETTINGS,
  };

  it('round-trip: serialize then parse gives equal data', () => {
    const serialized = serializeBackup(sampleData);
    const result = parseBackup(serialized);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(sampleData);
    expect(result.taskCount).toBe(2);
  });

  it('exports at ISO timestamp', () => {
    const now = new Date('2026-10-19T12:30:45Z');
    const serialized = serializeBackup(sampleData, now);
    const parsed = JSON.parse(serialized);
    expect(parsed.exportedAt).toBe('2026-10-19T12:30:45.000Z');
  });

  it('generates filename from local date', () => {
    const now = new Date(2026, 9, 19); // October 19, 2026
    const name = backupFilename(now);
    expect(name).toBe('tasks-backup-2026-10-19.json');
  });

  it('migrates v1 backup without tags/dueDate/history', () => {
    const v1Backup = {
      app: 'tasks',
      version: 1,
      tasks: {
        '1': {
          id: '1',
          title: 'Old task',
          done: false,
          collapsed: false,
          childIds: [],
          parentId: null,
          difficulty: 1,
          color: null,
          createdAt: 1000,
        },
      },
      rootIds: ['1'],
    };
    const serialized = JSON.stringify(v1Backup);
    const result = parseBackup(serialized);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tasks['1'].tags).toEqual([]);
    expect(result.data.tasks['1'].dueDate).toBe(null);
    expect(result.data.history).toEqual([]);
  });

  it('detects invalid JSON', () => {
    const result = parseBackup('not valid json {]');
    expect(result).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('detects missing app field', () => {
    const result = parseBackup(JSON.stringify({ version: 2, tasks: {}, rootIds: [] }));
    expect(result).toEqual({ ok: false, error: 'not-a-backup' });
  });

  it('detects wrong app value', () => {
    const result = parseBackup(
      JSON.stringify({ app: 'calendar', version: 2, tasks: {}, rootIds: [] }),
    );
    expect(result).toEqual({ ok: false, error: 'not-a-backup' });
  });

  it('detects missing tasks object', () => {
    const result = parseBackup(JSON.stringify({ app: 'tasks', version: 2, rootIds: [] }));
    expect(result).toEqual({ ok: false, error: 'not-a-backup' });
  });

  it('detects dangling child ID in childIds', () => {
    const result = parseBackup(
      JSON.stringify({
        app: 'tasks',
        version: 2,
        tasks: {
          '1': {
            id: '1',
            title: 'Task',
            done: false,
            collapsed: false,
            childIds: ['999'],
            parentId: null,
            tags: [],
            dueDate: null,
            repeat: null,
            plannedFor: null,
            difficulty: 1,
            color: null,
            createdAt: 1000,
          },
        },
        rootIds: ['1'],
        history: [],
      }),
    );
    expect(result).toEqual({ ok: false, error: 'corrupt' });
  });

  it('detects dangling parent ID', () => {
    const result = parseBackup(
      JSON.stringify({
        app: 'tasks',
        version: 2,
        tasks: {
          '1': {
            id: '1',
            title: 'Task',
            done: false,
            collapsed: false,
            childIds: [],
            parentId: '999',
            tags: [],
            dueDate: null,
            repeat: null,
            plannedFor: null,
            difficulty: 1,
            color: null,
            createdAt: 1000,
          },
        },
        rootIds: ['1'],
        history: [],
      }),
    );
    expect(result).toEqual({ ok: false, error: 'corrupt' });
  });

  it('detects dangling root ID', () => {
    const result = parseBackup(
      JSON.stringify({
        app: 'tasks',
        version: 2,
        tasks: {
          '1': {
            id: '1',
            title: 'Task',
            done: false,
            collapsed: false,
            childIds: [],
            parentId: null,
            tags: [],
            dueDate: null,
            repeat: null,
            plannedFor: null,
            difficulty: 1,
            color: null,
            createdAt: 1000,
          },
        },
        rootIds: ['999'],
        history: [],
      }),
    );
    expect(result).toEqual({ ok: false, error: 'corrupt' });
  });
  describe('versions and tag colours', () => {
    const task = (over: Record<string, unknown> = {}) => ({
      id: '1',
      title: 'T',
      done: false,
      collapsed: false,
      childIds: [],
      parentId: null,
      tags: ['work'],
      dueDate: null,
      repeat: null,
      plannedFor: null,
      difficulty: 1,
      color: '#A9C6F5',
      createdAt: 1,
      ...over,
    });

    it('writes version 3 with tagColors, and round-trips them', () => {
      const data = { ...sampleData, tagColors: { work: '#C9B8F2' } };
      const parsed = JSON.parse(serializeBackup(data));
      expect(parsed.version).toBe(3);
      expect(parsed.tagColors).toEqual({ work: '#C9B8F2' });
      const result = parseBackup(serializeBackup(data));
      expect(result.ok && result.data.tagColors).toEqual({ work: '#C9B8F2' });
    });

    it('writes settings and round-trips them, plannedFor included', () => {
      const settings = { todayView: true, dailyCapacity: 12, hints: { todayOffered: true } };
      const planned = { ...sampleData.tasks['1'], plannedFor: '2026-10-20' };
      const data = { ...sampleData, settings, tasks: { ...sampleData.tasks, '1': planned } };
      expect(JSON.parse(serializeBackup(data)).settings).toEqual(settings);
      const result = parseBackup(serializeBackup(data));
      expect(result.ok && result.data.settings).toEqual(settings);
      expect(result.ok && result.data.tasks['1'].plannedFor).toBe('2026-10-20');
    });

    it('keeps the current settings when the backup has none', () => {
      resetTaskStore();
      useTaskStore.getState().setSetting({ todayView: true, dailyCapacity: 20 });
      const old = { app: 'tasks', version: 3, tasks: { '1': task() }, rootIds: ['1'], history: [] };
      const result = parseBackup(JSON.stringify(old));
      expect(result.ok && result.data.settings).toEqual(useTaskStore.getState().settings);
      expect(result.ok && result.data.tasks['1'].plannedFor).toBeNull();
      resetTaskStore();
    });

    it('repairs bad settings in a backup', () => {
      const bad = {
        app: 'tasks',
        version: 3,
        tasks: { '1': task() },
        rootIds: ['1'],
        history: [],
        settings: { todayView: 1, dailyCapacity: 999, hints: 'x' },
      };
      const result = parseBackup(JSON.stringify(bad));
      expect(result.ok && result.data.settings).toEqual({
        todayView: false,
        dailyCapacity: 50,
        hints: {},
      });
    });

    it('imports a version 2 backup: default blue becomes automatic, no tag colours', () => {
      const v2 = {
        app: 'tasks',
        version: 2,
        exportedAt: '2026-01-01T00:00:00Z',
        tasks: { '1': task(), '2': task({ id: '2', color: '#FFD3B6' }) },
        rootIds: ['1', '2'],
        history: [],
      };
      const result = parseBackup(JSON.stringify(v2));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tasks['1'].color).toBeNull();
      expect(result.data.tasks['2'].color).toBe('#FFD3B6');
      expect(result.data.tagColors).toEqual({});
    });

    it('re-importing its own export is stable (idempotent migration)', () => {
      const v2 = { app: 'tasks', version: 2, tasks: { '1': task() }, rootIds: ['1'], history: [] };
      const first = parseBackup(JSON.stringify(v2));
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const second = parseBackup(serializeBackup(first.data));
      expect(second.ok && second.data).toEqual(first.data);
    });

    it('refuses a backup from a newer version', () => {
      const result = parseBackup(
        JSON.stringify({ app: 'tasks', version: 4, tasks: {}, rootIds: [], history: [] }),
      );
      expect(result).toEqual({ ok: false, error: 'not-a-backup' });
    });
  });

  describe('repeat', () => {
    it('serializes repeat and spawnedFrom and reads them back', () => {
      const data = {
        ...sampleData,
        tasks: {
          ...sampleData.tasks,
          '2': {
            ...sampleData.tasks['2'],
            repeat: { every: 'week', weekday: 1 },
            spawnedFrom: '1',
          },
        },
      } as PersistedTasks;
      const result = parseBackup(serializeBackup(data));
      expect(result.ok && result.data.tasks['2']).toMatchObject({
        repeat: { every: 'week', weekday: 1 },
        spawnedFrom: '1',
      });
      expect(result.ok && result.data.tasks['1'].repeat).toBeNull();
    });

    it('accepts older backups without the field (repeat becomes null) and ignores a bad one', () => {
      const old: Record<string, unknown> = { ...sampleData.tasks['1'], childIds: [] };
      delete old.repeat;
      const text = JSON.stringify({
        app: 'tasks',
        version: 3,
        tasks: { '1': old, '3': { ...old, id: '3', repeat: { every: 'fortnight' } } },
        rootIds: ['1', '3'],
        history: [],
      });
      const result = parseBackup(text);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tasks['1'].repeat).toBeNull();
      expect(result.data.tasks['3'].repeat).toBeNull();
    });
  });
});

describe('backup: notes and start dates', () => {
  const task = (over: Record<string, unknown> = {}) => ({
    id: '1',
    title: 'Task',
    done: false,
    collapsed: false,
    childIds: [],
    parentId: null,
    tags: [],
    dueDate: null,
    repeat: null,
    plannedFor: null,
    difficulty: 1,
    color: null,
    createdAt: 1000,
    ...over,
  });
  const file = (tasks: Record<string, unknown>) =>
    JSON.stringify({ app: 'tasks', version: 3, tasks, rootIds: Object.keys(tasks), history: [] });

  it('round-trips both fields', () => {
    const data: PersistedTasks = {
      tasks: {
        '1': {
          ...(task() as unknown as PersistedTasks['tasks'][string]),
          notes: 'Remember\nthe milk',
          startDate: '2026-11-01',
        },
      },
      rootIds: ['1'],
      history: [],
      tagColors: {},
      settings: { ...DEFAULT_SETTINGS, hints: {} },
    };
    const json = JSON.parse(serializeBackup(data));
    expect(json.tasks['1']).toMatchObject({ notes: 'Remember\nthe milk', startDate: '2026-11-01' });
    const result = parseBackup(serializeBackup(data));
    expect(result.ok && result.data.tasks['1']).toMatchObject({
      notes: 'Remember\nthe milk',
      startDate: '2026-11-01',
    });
  });

  it('reads an old backup (neither field) as no notes and no start date', () => {
    const result = parseBackup(file({ '1': task() }));
    if (!result.ok) throw new Error(result.error);
    expect(result.data.tasks['1'].startDate).toBeNull();
    expect('notes' in result.data.tasks['1']).toBe(false);
  });

  it('repairs bad values: a bad start date becomes null, blank or non-string notes vanish', () => {
    const result = parseBackup(
      file({
        '1': task({ startDate: 'soon', notes: '   ' }),
        '2': task({ id: '2', startDate: 20261101, notes: 5 }),
        '3': task({ id: '3', notes: 'x'.repeat(MAX_NOTES_LENGTH + 5) }),
      }),
    );
    if (!result.ok) throw new Error(result.error);
    for (const id of ['1', '2']) {
      expect(result.data.tasks[id].startDate).toBeNull();
      expect('notes' in result.data.tasks[id]).toBe(false);
    }
    expect(result.data.tasks['3'].notes).toHaveLength(MAX_NOTES_LENGTH);
  });
});
