import { describe, expect, it } from 'vitest';
import { detectImport } from './importDetect';
import { serializeBackup } from './backup';
import type { PersistedTasks } from '../store/tasks';

const data: PersistedTasks = {
  tasks: {
    a: {
      id: 'a',
      title: 'Alpha',
      done: false,
      collapsed: false,
      childIds: [],
      parentId: null,
      tags: [],
      dueDate: null,
      difficulty: 1,
      color: null,
      createdAt: 1000,
    },
  },
  rootIds: ['a'],
  history: [],
  tagColors: {},
};

const backup = serializeBackup(data, new Date('2026-10-19T10:00:00Z'));
const AI =
  '{ "tasks": [ { "title": "One" }, { "title": "Two", "subtasks": [{ "title": "Sub" }] } ] }';

describe('detectImport', () => {
  it('detects a backup', () => {
    const r = detectImport(backup);
    expect(r).toMatchObject({
      kind: 'backup',
      taskCount: 1,
      exportedAt: '2026-10-19T10:00:00.000Z',
    });
  });

  it('detects a backup inside a code fence with surrounding prose', () => {
    const r = detectImport(`Here it is:\n\n\`\`\`json\n${backup}\n\`\`\`\n\n`);
    expect(r).toMatchObject({ kind: 'backup', taskCount: 1 });
  });

  it('detects AI JSON', () => {
    const r = detectImport(AI);
    expect(r).toMatchObject({ kind: 'ai', count: 3 });
  });

  it('detects a bare-array AI reply', () => {
    const r = detectImport('[{"title":"A"},{"title":"B"}]');
    expect(r).toMatchObject({ kind: 'ai', count: 2 });
  });

  it('reports a corrupt backup instead of falling back to the AI parser', () => {
    const corrupt = JSON.stringify({ app: 'tasks', tasks: { a: { id: 'a' } }, rootIds: ['zzz'] });
    const r = detectImport(corrupt);
    expect(r.kind).toBe('error');
    expect(r.kind === 'error' && r.error).toMatch(/damaged/);
    const truncated = detectImport(backup.slice(0, backup.length - 60));
    expect(truncated).toMatchObject({ kind: 'error' });
    expect(truncated.kind === 'error' && truncated.error).toMatch(/damaged/);
  });

  it('returns the AI parser error for garbage', () => {
    const r = detectImport('hello there');
    expect(r.kind).toBe('error');
    expect(r.kind === 'error' && r.error).toMatch(/Couldn.t find any JSON/);
  });

  it('treats blank input as empty', () => {
    expect(detectImport('')).toEqual({ kind: 'empty' });
    expect(detectImport(' \n ')).toEqual({ kind: 'empty' });
  });
});
