import { describe, expect, it } from 'vitest';
import { mkEntry, mkTask } from '../test/factories';
import {
  fromHistoryDoc,
  fromTaskDoc,
  historyOrds,
  isEqualEntry,
  isEqualTask,
  toHistoryDoc,
  toTaskDoc,
} from './schema';

describe('isEqualTask', () => {
  it('compares deeply', () => {
    const t = mkTask('a', { tags: ['x'], childIds: ['b'] });
    expect(isEqualTask(t, { ...t, tags: ['x'], childIds: ['b'] })).toBe(true);
    expect(isEqualTask(t, { ...t, tags: ['y'] })).toBe(false);
    expect(isEqualTask(t, { ...t, childIds: [] })).toBe(false);
    expect(isEqualTask(t, { ...t, completedAt: 3 })).toBe(false);
    expect(isEqualTask(t, { ...t, parentId: 'z' })).toBe(false);
  });
});

describe('isEqualEntry', () => {
  it('compares deeply', () => {
    const e = mkEntry('h', { path: ['p'], tags: ['t'] });
    expect(isEqualEntry(e, { ...e, path: ['p'], tags: ['t'] })).toBe(true);
    expect(isEqualEntry(e, { ...e, path: [] })).toBe(false);
    expect(isEqualEntry(e, { ...e, auto: true })).toBe(false);
  });
});

describe('task docs', () => {
  it('round-trips and omits an unset completedAt', () => {
    const t = mkTask('a', { tags: ['x'], dueDate: '2026-01-02' });
    const doc = toTaskDoc(t);
    expect('completedAt' in doc).toBe(false);
    expect(fromTaskDoc('a', doc)).toEqual(t);
    const done = mkTask('b', { done: true, completedAt: 9 });
    expect(fromTaskDoc('b', toTaskDoc(done))).toEqual(done);
  });

  it('sanitizes malformed documents', () => {
    expect(fromTaskDoc('a', null)).toBeNull();
    const t = fromTaskDoc('a', { title: 3, difficulty: 99, tags: ['ok', 4], childIds: 'x' });
    expect(t).toMatchObject({ id: 'a', title: '', difficulty: 5, tags: ['ok'], childIds: [] });
  });
});

describe('history docs', () => {
  it('round-trips with an ordinal that restores same-timestamp order', () => {
    const h = [
      mkEntry('z', { completedAt: 5 }),
      mkEntry('a', { completedAt: 5 }),
      mkEntry('m', { completedAt: 7 }),
    ];
    const ords = historyOrds(h);
    expect([...ords.values()]).toEqual([0, 1, 0]);
    const back = fromHistoryDoc('a', toHistoryDoc(h[1], ords.get('a')!));
    expect(back?.ord).toBe(1);
    expect(back?.entry).toEqual(h[1]);
  });

  it('rejects docs without completedAt', () => {
    expect(fromHistoryDoc('x', { title: 'x' })).toBeNull();
  });
});
