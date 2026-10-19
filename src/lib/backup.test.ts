import { describe, expect, it } from 'vitest';
import { backupFilename, parseBackup, serializeBackup } from './backup';
import type { PersistedTasks } from '../store/tasks';

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
        difficulty: 1,
        color: 'none',
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
        difficulty: 2,
        color: 'none',
        createdAt: 2000,
      },
    },
    rootIds: ['1'],
    history: [],
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
          color: 'none',
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
            difficulty: 1,
            color: 'none',
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
            difficulty: 1,
            color: 'none',
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
            difficulty: 1,
            color: 'none',
            createdAt: 1000,
          },
        },
        rootIds: ['999'],
        history: [],
      }),
    );
    expect(result).toEqual({ ok: false, error: 'corrupt' });
  });
});
