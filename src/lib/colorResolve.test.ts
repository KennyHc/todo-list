import { describe, expect, it } from 'vitest';
import { mkState, mkTask } from '../test/factories';
import { effectiveColor } from './colorResolve';

const PURPLE = '#C9B8F2';
const PEACH = '#FFD3B6';
const MINT = '#B5E5CF';

describe('effectiveColor', () => {
  it('is none when nothing sets a colour', () => {
    const tree = mkState([mkTask('a', { tags: ['x'] })]);
    expect(effectiveColor(tree, {}, 'a')).toEqual({ color: null, source: null });
    expect(effectiveColor(tree, { other: PEACH }, 'a')).toEqual({ color: null, source: null });
  });

  it("prefers the task's own colour over its tags and its parent", () => {
    const tree = mkState([
      mkTask('p', { color: PEACH, childIds: ['c'] }),
      mkTask('c', { parentId: 'p', color: PURPLE, tags: ['work'] }),
    ]);
    expect(effectiveColor(tree, { work: MINT }, 'c')).toEqual({ color: PURPLE, source: 'task' });
  });

  it("uses the first coloured tag in the task's tag order", () => {
    const tree = mkState([mkTask('a', { tags: ['plain', 'home', 'work'] })]);
    expect(effectiveColor(tree, { work: MINT, home: PEACH }, 'a')).toEqual({
      color: PEACH,
      source: 'tag',
      tag: 'home',
    });
    // Tag order, not map order, decides.
    const swapped = mkState([mkTask('a', { tags: ['work', 'home'] })]);
    expect(effectiveColor(swapped, { home: PEACH, work: MINT }, 'a').tag).toBe('work');
  });

  it('inherits from the parent, recursively', () => {
    const tree = mkState([
      mkTask('root', { color: PURPLE, childIds: ['mid'] }),
      mkTask('mid', { parentId: 'root', childIds: ['leaf'] }),
      mkTask('leaf', { parentId: 'mid' }),
    ]);
    expect(effectiveColor(tree, {}, 'leaf')).toEqual({ color: PURPLE, source: 'parent' });
    expect(effectiveColor(tree, {}, 'mid')).toEqual({ color: PURPLE, source: 'parent' });
    expect(effectiveColor(tree, {}, 'root')).toEqual({ color: PURPLE, source: 'task' });
  });

  it("inherits an ancestor's tag colour, and the nearest coloured ancestor wins", () => {
    const tree = mkState([
      mkTask('root', { color: PURPLE, childIds: ['mid'] }),
      mkTask('mid', { parentId: 'root', tags: ['work'], childIds: ['leaf'] }),
      mkTask('leaf', { parentId: 'mid' }),
    ]);
    expect(effectiveColor(tree, { work: MINT }, 'leaf')).toEqual({
      color: MINT,
      source: 'parent',
      tag: 'work',
    });
    // Without the tag colour the root's override shows through.
    expect(effectiveColor(tree, {}, 'leaf').color).toBe(PURPLE);
  });

  it('is none for an unknown id and survives a broken parent cycle', () => {
    const tree = mkState([mkTask('a', { parentId: 'b' }), mkTask('b', { parentId: 'a' })]);
    expect(effectiveColor(tree, {}, 'nope')).toEqual({ color: null, source: null });
    expect(effectiveColor(tree, {}, 'a')).toEqual({ color: null, source: null });
  });
});
