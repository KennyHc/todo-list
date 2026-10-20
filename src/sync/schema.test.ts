import { describe, expect, it } from 'vitest';
import { mkEntry, mkTask } from '../test/factories';
import {
  fromHistoryDoc,
  fromTaskDoc,
  historyOrds,
  fromTagColors,
  isEqualEntry,
  isEqualTagColors,
  isEqualTask,
  SCHEMA_VERSION,
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

  it('decodes the old default blue (schema 2) to automatic, and keeps other colours', () => {
    expect(SCHEMA_VERSION).toBe(3);
    expect(fromTaskDoc('a', { color: '#A9C6F5' })?.color).toBeNull();
    expect(fromTaskDoc('a', { color: '#C9B8F2' })?.color).toBe('#C9B8F2');
    expect(fromTaskDoc('a', { color: null })?.color).toBeNull();
    expect(fromTaskDoc('a', {})?.color).toBeNull();
    // Idempotent: re-reading what was written changes nothing.
    const t = fromTaskDoc('a', { color: '#A9C6F5' })!;
    expect(fromTaskDoc('a', toTaskDoc(t))).toEqual(t);
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

describe('tagColors', () => {
  it('decodes defensively and compares by value', () => {
    expect(fromTagColors({ a: '#C9B8F2', b: 3 })).toEqual({ a: '#C9B8F2' });
    expect(fromTagColors(undefined)).toEqual({});
    expect(isEqualTagColors({ a: '#fff' }, { a: '#fff' })).toBe(true);
    expect(isEqualTagColors({ a: '#fff' }, { a: '#000' })).toBe(false);
    expect(isEqualTagColors({ a: '#fff' }, {})).toBe(false);
  });
});

describe('repeat and spawnedFrom in task docs', () => {
  it('round-trips a repeat, null, and spawnedFrom', () => {
    for (const repeat of [
      null,
      { every: 'day' },
      { every: 'weekday' },
      { every: 'week' },
      { every: 'week', weekday: 4 },
      { every: 'month' },
      { every: 'month', anchorDay: 31 },
    ] as const) {
      const t = mkTask('a', { dueDate: '2026-10-20', repeat });
      expect(fromTaskDoc('a', toTaskDoc(t))).toEqual(t);
    }
    const copy = mkTask('b', { repeat: { every: 'day' }, spawnedFrom: 'a' });
    expect(fromTaskDoc('b', toTaskDoc(copy))).toEqual(copy);
  });

  it('writes repeat as null (not undefined) and omits an unset spawnedFrom', () => {
    const doc = toTaskDoc(mkTask('a'));
    expect(doc.repeat).toBeNull();
    expect('spawnedFrom' in doc).toBe(false);
  });

  it('decodes a missing or invalid repeat to null', () => {
    expect(fromTaskDoc('a', {})?.repeat).toBeNull();
    expect(fromTaskDoc('a', { repeat: null })?.repeat).toBeNull();
    for (const repeat of [
      'weekly',
      7,
      [],
      { every: 'year' },
      { every: 'week', weekday: 9 },
      { every: 'month', anchorDay: 40 },
    ]) {
      expect(fromTaskDoc('a', { repeat })?.repeat, JSON.stringify(repeat)).toBeNull();
    }
    expect(fromTaskDoc('a', { spawnedFrom: 4 })?.spawnedFrom).toBeUndefined();
  });

  it('isEqualTask notices repeat and spawnedFrom', () => {
    const t = mkTask('a', { repeat: { every: 'week' } });
    expect(isEqualTask(t, { ...t, repeat: { every: 'week' } })).toBe(true);
    expect(isEqualTask(t, { ...t, repeat: { every: 'day' } })).toBe(false);
    expect(isEqualTask(t, { ...t, repeat: null })).toBe(false);
    expect(isEqualTask(t, { ...t, spawnedFrom: 'x' })).toBe(false);
  });
});
