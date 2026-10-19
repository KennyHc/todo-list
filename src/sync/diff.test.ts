import { describe, expect, it } from 'vitest';
import { mkEntry, mkState, mkTask } from '../test/factories';
import { diffState, isEmptyDiff } from './diff';

describe('diffState', () => {
  const a = mkTask('a');
  const b = mkTask('b');

  it('is empty for identical references', () => {
    const s = mkState([a, b], ['a', 'b'], [mkEntry('h1')]);
    const diff = diffState(s, { ...s });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('detects upserts by reference, not by value', () => {
    const prev = mkState([a, b]);
    const next = { ...prev, tasks: { ...prev.tasks, a: { ...a } } };
    const diff = diffState(prev, next);
    expect(diff.taskUpserts).toEqual([a]);
    expect(diff.taskUpserts[0]).toBe(next.tasks.a);
    expect(diff.taskDeletes).toEqual([]);
  });

  it('detects added and removed tasks', () => {
    const c = mkTask('c');
    const prev = mkState([a, b]);
    const next = mkState([a, c]);
    // keep `a` shared
    next.tasks.a = prev.tasks.a;
    const diff = diffState(prev, next);
    expect(diff.taskUpserts.map((t) => t.id)).toEqual(['c']);
    expect(diff.taskDeletes).toEqual(['b']);
  });

  it('flags rootIds changes by content', () => {
    const prev = mkState([a, b], ['a', 'b']);
    expect(diffState(prev, { ...prev, rootIds: ['a', 'b'] }).rootIdsChanged).toBe(false);
    expect(diffState(prev, { ...prev, rootIds: ['b', 'a'] }).rootIdsChanged).toBe(true);
    expect(diffState(prev, { ...prev, rootIds: ['a'] }).rootIdsChanged).toBe(true);
  });

  it('diffs history by id and reference', () => {
    const h1 = mkEntry('h1');
    const h2 = mkEntry('h2');
    const h3 = mkEntry('h3');
    const prev = mkState([a], ['a'], [h1, h2]);
    const diff = diffState(prev, { ...prev, history: [h1, h3] });
    expect(diff.historyUpserts).toEqual([h3]);
    expect(diff.historyDeletes).toEqual(['h2']);
  });

  it('treats a reordered history as no change', () => {
    const h1 = mkEntry('h1');
    const h2 = mkEntry('h2');
    const prev = mkState([a], ['a'], [h1, h2]);
    expect(isEmptyDiff(diffState(prev, { ...prev, history: [h2, h1] }))).toBe(true);
  });
});
