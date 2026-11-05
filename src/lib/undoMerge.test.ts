import { describe, expect, it } from 'vitest';
import { applyChange, mergeIds, sameValue, type UndoSnapshot } from './undoMerge';
import { mkEntry, mkTask } from '../test/factories';
import type { Task } from '../types';

const snap = (tasks: Task[], rootIds?: string[], over: Partial<UndoSnapshot> = {}) => ({
  tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
  rootIds: rootIds ?? tasks.filter((t) => t.parentId === null).map((t) => t.id),
  history: [],
  tagColors: {},
  ...over,
});

describe('sameValue', () => {
  it('compares plain data deeply', () => {
    expect(sameValue(['a'], ['a'])).toBe(true);
    expect(sameValue({ every: 1, unit: 'day' }, { unit: 'day', every: 1 })).toBe(true);
    expect(sameValue(['a'], ['b'])).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue([], {})).toBe(false);
  });
});

describe('mergeIds', () => {
  it('takes `to` when nothing changed since', () => {
    const from = ['a', 'b'];
    const to = ['b', 'a'];
    expect(mergeIds(from, from, to)).toBe(to);
  });

  it('removes and re-inserts only the ids the change moves', () => {
    // The change removed b; meanwhile x was added at the end.
    expect(mergeIds(['a', 'c', 'x'], ['a', 'c'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'x']);
    // The change added b; meanwhile x was added at the front.
    expect(mergeIds(['x', 'a', 'b'], ['a', 'b'], ['a'])).toEqual(['x', 'a']);
    // Re-inserted at the front when no earlier neighbour is left.
    expect(mergeIds(['x'], ['x'], ['b', 'x'])).toEqual(['b', 'x']);
  });
});

describe('applyChange', () => {
  it('keeps the identity of everything the change did not touch', () => {
    const a = mkTask('a');
    const b = mkTask('b');
    const from = snap([{ ...a, done: true }, b]);
    const to = { ...snap([a, b]), history: from.history };
    const cur = { ...from, tasks: { ...from.tasks, c: mkTask('c') }, rootIds: ['a', 'b', 'c'] };
    const out = applyChange(cur, from, to);
    expect(out.tasks.a).toBe(a);
    expect(out.tasks.b).toBe(b);
    expect(out.tasks.c).toBe(cur.tasks.c);
    expect(out.rootIds).toBe(cur.rootIds);
    expect(out.history).toBe(cur.history);
  });

  it('merges a task field by field, the newer value winning a conflict', () => {
    const from = snap([mkTask('a', { done: true, dueDate: '2026-11-10' })]);
    const to = snap([mkTask('a', { done: false, dueDate: '2026-11-09' })]);
    const cur = snap([mkTask('a', { done: true, dueDate: '2026-11-12', title: 'Renamed' })]);
    expect(applyChange(cur, from, to).tasks.a).toMatchObject({
      done: false,
      dueDate: '2026-11-12',
      title: 'Renamed',
    });
  });

  it('removes and restores optional fields', () => {
    const from = snap([mkTask('a', { notes: 'n' })]);
    const to = snap([mkTask('a')]);
    const out = applyChange(snap([mkTask('a', { notes: 'n', title: 'x' })]), from, to);
    expect('notes' in out.tasks.a).toBe(false);
  });

  it('leaves a task deleted since deleted, and one edited since in place', () => {
    const from = snap([mkTask('a', { title: 'A2' }), mkTask('b')]);
    const to = snap([mkTask('a')]);
    // a was deleted elsewhere; b (created by the change) was edited elsewhere.
    const cur = snap([mkTask('b', { title: 'B edited' })]);
    const out = applyChange(cur, from, to);
    expect(out.tasks.a).toBeUndefined();
    expect(out.tasks.b.title).toBe('B edited');
  });

  it('restores a deleted subtree and re-attaches it', () => {
    const p = mkTask('p', { childIds: ['c'] });
    const c = mkTask('c', { parentId: 'p' });
    const from = snap([mkTask('a')]);
    const to = snap([mkTask('a'), p, c], ['a', 'p']);
    const cur = snap([mkTask('a'), mkTask('x')], ['a', 'x']);
    const out = applyChange(cur, from, to);
    expect(out.rootIds).toEqual(['a', 'p', 'x']);
    expect(out.tasks.p.childIds).toEqual(['c']);
  });

  it('merges child lists so a subtask added elsewhere survives', () => {
    const from = snap([mkTask('p', { childIds: ['c'] }), mkTask('c', { parentId: 'p' })], ['p']);
    const to = snap([mkTask('p')], ['p']);
    const cur = snap(
      [
        mkTask('p', { childIds: ['c', 'r'] }),
        mkTask('c', { parentId: 'p' }),
        mkTask('r', { parentId: 'p' }),
      ],
      ['p'],
    );
    const out = applyChange(cur, from, to);
    expect(out.tasks.c).toBeUndefined();
    expect(out.tasks.p.childIds).toEqual(['r']);
  });

  it('merges History by id and tag colours by tag', () => {
    const e1 = mkEntry('e1');
    const e2 = mkEntry('e2');
    const from = snap([], [], { history: [e1], tagColors: { work: '#c0333a' } });
    const to = snap([], [], { history: [], tagColors: {} });
    const cur = snap([], [], {
      history: [e1, e2],
      tagColors: { work: '#c0333a', home: '#B5E5CF' },
    });
    const out = applyChange(cur, from, to);
    expect(out.history).toEqual([e2]);
    expect(out.tagColors).toEqual({ home: '#B5E5CF' });
  });
});
