import { describe, expect, it } from 'vitest';
import { mkState, mkTask } from '../test/factories';
import { normalizeTree } from './normalizeTree';

describe('normalizeTree', () => {
  it('returns the same object for a consistent tree', () => {
    const tree = mkState([
      mkTask('a', { childIds: ['b'] }),
      mkTask('b', { parentId: 'a' }),
      mkTask('c'),
    ]);
    expect(normalizeTree(tree)).toBe(tree);
  });

  it('drops ids pointing at missing tasks', () => {
    const tree = mkState(
      [mkTask('a', { childIds: ['gone', 'b'] }), mkTask('b', { parentId: 'a' })],
      ['a', 'ghost'],
    );
    const out = normalizeTree(tree);
    expect(out.rootIds).toEqual(['a']);
    expect(out.tasks.a.childIds).toEqual(['b']);
    expect(out.tasks.b).toBe(tree.tasks.b);
  });

  it('removes duplicates, keeping the list the task belongs to', () => {
    const tree = mkState([
      mkTask('p', { childIds: ['x'] }),
      mkTask('q', { childIds: ['x', 'x'] }),
      mkTask('x', { parentId: 'p' }),
    ]);
    const out = normalizeTree(tree);
    expect(out.tasks.p.childIds).toEqual(['x']);
    expect(out.tasks.q.childIds).toEqual([]);
    expect(out.rootIds).toEqual(['p', 'q']);
  });

  it('removes a root entry for a task that has a parent', () => {
    const tree = mkState(
      [mkTask('p', { childIds: ['x'] }), mkTask('x', { parentId: 'p' })],
      ['p', 'x'],
    );
    expect(normalizeTree(tree).rootIds).toEqual(['p']);
  });

  it('re-attaches a task missing from its parent list, oldest first, at the end', () => {
    const tree = mkState([
      mkTask('p', { childIds: ['k'] }),
      mkTask('k', { parentId: 'p', createdAt: 5 }),
      mkTask('n2', { parentId: 'p', createdAt: 9 }),
      mkTask('n1', { parentId: 'p', createdAt: 7 }),
    ]);
    const out = normalizeTree(tree);
    expect(out.tasks.p.childIds).toEqual(['k', 'n1', 'n2']);
    expect(out.tasks.k).toBe(tree.tasks.k);
  });

  it('appends a root task missing from rootIds', () => {
    const tree = mkState([mkTask('a'), mkTask('b')], ['a']);
    expect(normalizeTree(tree).rootIds).toEqual(['a', 'b']);
  });

  it('turns a task with a missing parent into a root', () => {
    const tree = mkState([mkTask('a'), mkTask('o', { parentId: 'deleted' })], ['a']);
    const out = normalizeTree(tree);
    expect(out.tasks.o.parentId).toBeNull();
    expect(out.rootIds).toEqual(['a', 'o']);
  });

  it('breaks a two-task cycle at the smallest id', () => {
    const tree = mkState(
      [
        mkTask('a', { parentId: 'b', childIds: ['b'] }),
        mkTask('b', { parentId: 'a', childIds: ['a'] }),
      ],
      [],
    );
    const out = normalizeTree(tree);
    expect(out.tasks.a.parentId).toBeNull();
    expect(out.tasks.b.parentId).toBe('a');
    expect(out.rootIds).toEqual(['a']);
    expect(out.tasks.a.childIds).toEqual(['b']);
    expect(out.tasks.b.childIds).toEqual([]);
    expect(normalizeTree(out)).toBe(out);
  });

  it('breaks a longer cycle and keeps tasks hanging off it', () => {
    const tree = mkState(
      [
        mkTask('c', { parentId: 'b', childIds: ['a', 'leaf'] }),
        mkTask('a', { parentId: 'c', childIds: ['b'] }),
        mkTask('b', { parentId: 'a', childIds: ['c'] }),
        mkTask('leaf', { parentId: 'c' }),
      ],
      [],
    );
    const out = normalizeTree(tree);
    expect(out.rootIds).toEqual(['a']);
    expect(out.tasks.a.childIds).toEqual(['b']);
    expect(out.tasks.b.childIds).toEqual(['c']);
    expect(out.tasks.c.childIds).toEqual(['leaf']);
  });

  it('treats a self-parent as a root', () => {
    const out = normalizeTree(mkState([mkTask('a', { parentId: 'a', childIds: ['a'] })], []));
    expect(out.tasks.a.parentId).toBeNull();
    expect(out.tasks.a.childIds).toEqual([]);
    expect(out.rootIds).toEqual(['a']);
  });

  it('never touches done flags, even when a parent disagrees with its children', () => {
    const tree = mkState(
      [
        mkTask('p', { done: false, childIds: ['x'] }),
        mkTask('x', { done: true, parentId: 'p' }),
        mkTask('y', { done: true, parentId: 'p' }),
      ],
      ['p'],
    );
    const out = normalizeTree(tree);
    expect(out.tasks.p.done).toBe(false);
    expect(out.tasks.x.done).toBe(true);
    expect(out.tasks.p.childIds).toEqual(['x', 'y']);
  });

  it('keeps extra fields on the tree object and the identity of untouched tasks', () => {
    const tree = { ...mkState([mkTask('a'), mkTask('b')], ['a']), history: [] };
    const out = normalizeTree(tree);
    expect(out.history).toBe(tree.history);
    expect(out.tasks.a).toBe(tree.tasks.a);
    expect(out.tasks.b).toBe(tree.tasks.b);
  });

  it('is idempotent and deterministic regardless of key order', () => {
    const tasks = [
      mkTask('p', { childIds: [] }),
      mkTask('x', { parentId: 'p', createdAt: 3 }),
      mkTask('y', { parentId: 'p', createdAt: 3 }),
    ];
    const one = normalizeTree(mkState(tasks, ['p']));
    const two = normalizeTree(mkState([...tasks].reverse(), ['p']));
    expect(one.tasks.p.childIds).toEqual(two.tasks.p.childIds);
    expect(normalizeTree(one)).toBe(one);
  });
});
