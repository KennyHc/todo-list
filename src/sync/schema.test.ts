import { describe, expect, it } from 'vitest';
import { mkEntry, mkTask } from '../test/factories';
import { MAX_NOTES_LENGTH } from '../types';
import {
  fromHistoryDoc,
  fromTaskDoc,
  historyOrds,
  fromSettings,
  fromTagColors,
  isEqualSettings,
  isEqualEntry,
  isEqualTagColors,
  isEqualTask,
  SCHEMA_VERSION,
  toHistoryDoc,
  toSettingsDoc,
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

describe('plannedFor', () => {
  it('round-trips a date and a null', () => {
    const planned = mkTask('a', { plannedFor: '2026-10-20' });
    expect(toTaskDoc(planned).plannedFor).toBe('2026-10-20');
    expect(fromTaskDoc('a', toTaskDoc(planned))).toEqual(planned);
    expect(toTaskDoc(mkTask('b')).plannedFor).toBeNull();
    expect(fromTaskDoc('b', toTaskDoc(mkTask('b')))?.plannedFor).toBeNull();
  });

  it('decodes a missing or invalid value to null', () => {
    expect(fromTaskDoc('a', {})?.plannedFor).toBeNull();
    for (const plannedFor of [5, true, [], {}, '', 'today', '2026-1-5', '20261020']) {
      expect(fromTaskDoc('a', { plannedFor })?.plannedFor, JSON.stringify(plannedFor)).toBeNull();
    }
  });

  it('is noticed by isEqualTask', () => {
    const t = mkTask('a', { plannedFor: '2026-10-20' });
    expect(isEqualTask(t, { ...t })).toBe(true);
    expect(isEqualTask(t, { ...t, plannedFor: null })).toBe(false);
    expect(isEqualTask(t, { ...t, plannedFor: '2026-10-21' })).toBe(false);
  });
});

describe('settings', () => {
  const full = { todayView: true, dailyCapacity: 12, hints: { todayOffered: true } };

  it('decodes a well-formed map', () => {
    expect(fromSettings(full)).toEqual(full);
  });

  it('decodes absence and garbage to the defaults', () => {
    const defaults = { todayView: false, dailyCapacity: 8, hints: {} };
    for (const raw of [undefined, null, 'on', 5, [], true]) {
      expect(fromSettings(raw), JSON.stringify(raw)).toEqual(defaults);
    }
  });

  it('repairs individual fields', () => {
    expect(fromSettings({ todayView: 'yes' }).todayView).toBe(false);
    expect(fromSettings({ dailyCapacity: 'lots' }).dailyCapacity).toBe(8);
    expect(fromSettings({ dailyCapacity: NaN }).dailyCapacity).toBe(8);
    expect(fromSettings({ dailyCapacity: 0 }).dailyCapacity).toBe(1);
    expect(fromSettings({ dailyCapacity: 400 }).dailyCapacity).toBe(50);
    expect(fromSettings({ dailyCapacity: 7.6 }).dailyCapacity).toBe(8);
    expect(fromSettings({ hints: { todayOffered: 'yes' } }).hints).toEqual({});
    expect(fromSettings({ hints: 'x' }).hints).toEqual({});
    expect(fromSettings({ hints: { other: true } }).hints).toEqual({});
  });

  it('writes only known keys, without unset hints', () => {
    const doc = toSettingsDoc({ ...full, extra: 1 } as typeof full);
    expect(doc).toEqual(full);
    expect(toSettingsDoc({ todayView: false, dailyCapacity: 8, hints: {} })).toEqual({
      todayView: false,
      dailyCapacity: 8,
      hints: {},
    });
    expect('todayOffered' in toSettingsDoc({ ...full, hints: {} }).hints).toBe(false);
  });

  it('compares by content', () => {
    expect(isEqualSettings(full, { ...full, hints: { todayOffered: true } })).toBe(true);
    expect(isEqualSettings(full, { ...full, todayView: false })).toBe(false);
    expect(isEqualSettings(full, { ...full, dailyCapacity: 9 })).toBe(false);
    expect(isEqualSettings(full, { ...full, hints: {} })).toBe(false);
  });
});

describe('startDate', () => {
  it('round-trips a date and a null', () => {
    const hidden = mkTask('a', { startDate: '2026-11-01' });
    expect(toTaskDoc(hidden).startDate).toBe('2026-11-01');
    expect(fromTaskDoc('a', toTaskDoc(hidden))).toEqual(hidden);
    expect(toTaskDoc(mkTask('b')).startDate).toBeNull();
    expect(fromTaskDoc('b', toTaskDoc(mkTask('b')))?.startDate).toBeNull();
  });

  it('decodes a missing or invalid value to null', () => {
    expect(fromTaskDoc('a', {})?.startDate).toBeNull();
    for (const startDate of [5, true, [], {}, '', 'monday', '2026-1-5', '20261101']) {
      expect(fromTaskDoc('a', { startDate })?.startDate, JSON.stringify(startDate)).toBeNull();
    }
  });

  it('is noticed by isEqualTask', () => {
    const t = mkTask('a', { startDate: '2026-11-01' });
    expect(isEqualTask(t, { ...t })).toBe(true);
    expect(isEqualTask(t, { ...t, startDate: null })).toBe(false);
    expect(isEqualTask(t, { ...t, startDate: '2026-11-02' })).toBe(false);
  });
});

describe('notes', () => {
  it('round-trips, and the key is omitted when there are none', () => {
    const noted = mkTask('a', { notes: 'line 1\nline 2 https://x.test' });
    expect(toTaskDoc(noted).notes).toBe('line 1\nline 2 https://x.test');
    expect(fromTaskDoc('a', toTaskDoc(noted))).toEqual(noted);
    expect('notes' in toTaskDoc(mkTask('b'))).toBe(false);
    expect('notes' in fromTaskDoc('b', toTaskDoc(mkTask('b')))!).toBe(false);
  });

  it('decodes a missing, blank or non-string value to no notes, and clamps a long one', () => {
    for (const notes of [undefined, '', '   \n', 5, true, [], {}, null]) {
      expect('notes' in fromTaskDoc('a', { notes })!, JSON.stringify(notes)).toBe(false);
    }
    expect(fromTaskDoc('a', { notes: 'x'.repeat(MAX_NOTES_LENGTH + 10) })?.notes).toHaveLength(
      MAX_NOTES_LENGTH,
    );
  });

  it('is noticed by isEqualTask', () => {
    const t = mkTask('a', { notes: 'hi' });
    expect(isEqualTask(t, { ...t })).toBe(true);
    expect(isEqualTask(t, { ...t, notes: 'hello' })).toBe(false);
    const without = mkTask('a');
    expect(isEqualTask(t, without)).toBe(false);
    expect(isEqualTask(without, { ...without })).toBe(true);
  });
});
