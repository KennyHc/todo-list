import { describe, expect, it } from 'vitest';
import type { Task, TaskTree } from '../types';
import { PARENT_POP_LAG, popDelays, strikeHoldMs, toggleDelay } from './cascade';

const task = (id: string, parentId: string | null, childIds: string[] = []): Task => ({
  id,
  title: id,
  difficulty: 1,
  color: '#000000',
  done: false,
  collapsed: false,
  tags: [],
  dueDate: null,
  repeat: null,
  parentId,
  childIds,
  createdAt: 0,
});

// root > a > (a1, a2 > a2x), plus sibling root b
const tree: TaskTree = {
  rootIds: ['root', 'b'],
  tasks: {
    root: task('root', null, ['a']),
    a: task('a', 'root', ['a1', 'a2']),
    a1: task('a1', 'a'),
    a2: task('a2', 'a', ['a2x']),
    a2x: task('a2x', 'a2'),
    b: task('b', null),
  },
};

describe('toggleDelay', () => {
  it('is 0 for the toggled task and unrelated tasks', () => {
    expect(toggleDelay(tree, 'a', 'a')).toBe(0);
    expect(toggleDelay(tree, 'a', 'b')).toBe(0);
    expect(toggleDelay(tree, 'a1', 'a2')).toBe(0);
    expect(toggleDelay(tree, 'a', 'missing')).toBe(0);
  });

  it('staggers descendants in pre-order', () => {
    expect(toggleDelay(tree, 'a', 'a1')).toBeCloseTo(0.04);
    expect(toggleDelay(tree, 'a', 'a2')).toBeCloseTo(0.08);
    expect(toggleDelay(tree, 'a', 'a2x')).toBeCloseTo(0.12);
    expect(toggleDelay(tree, 'root', 'a2x')).toBeCloseTo(0.16);
  });

  it('caps the descendant delay at 0.4', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const big: TaskTree = {
      rootIds: ['p'],
      tasks: {
        p: task('p', null, ids),
        ...Object.fromEntries(ids.map((id) => [id, task(id, 'p')])),
      },
    };
    expect(toggleDelay(big, 'p', 'c19')).toBeCloseTo(0.4);
  });

  it('delays ancestors by 0.18 per level', () => {
    expect(toggleDelay(tree, 'a2x', 'a2')).toBeCloseTo(0.18);
    expect(toggleDelay(tree, 'a2x', 'a')).toBeCloseTo(0.36);
    expect(toggleDelay(tree, 'a2x', 'root')).toBeCloseTo(0.54);
  });

  it('caps the ancestor delay at 0.6', () => {
    const chain: TaskTree = { rootIds: ['n0'], tasks: {} };
    for (let i = 0; i < 6; i++) {
      chain.tasks[`n${i}`] = task(
        `n${i}`,
        i === 0 ? null : `n${i - 1}`,
        i < 5 ? [`n${i + 1}`] : [],
      );
    }
    expect(toggleDelay(chain, 'n5', 'n0')).toBeCloseTo(0.6);
  });
});

describe('popDelays', () => {
  it('pops a lone row at once', () => {
    expect([...popDelays(tree, 'b', ['b'])]).toEqual([['b', 0]]);
  });

  it('pops children in order and a parent PARENT_POP_LAG after its last child', () => {
    const out = popDelays(tree, 'a', ['a', 'a1', 'a2', 'a2x']);
    expect(out.get('a1')).toBeCloseTo(0.04);
    expect(out.get('a2x')).toBeCloseTo(0.12);
    expect(out.get('a2')).toBeCloseTo(0.12 + PARENT_POP_LAG);
    expect(out.get('a')).toBeCloseTo(0.12 + PARENT_POP_LAG * 2);
    expect(out.get('a1')!).toBeLessThan(out.get('a2x')!);
  });

  it('pops an auto-completed ancestor after the subtask that completed it', () => {
    const out = popDelays(tree, 'a2x', ['a2x', 'a2']);
    expect(out.get('a2x')).toBe(0);
    expect(out.get('a2')).toBeCloseTo(PARENT_POP_LAG);
  });

  it('does not stagger without a toggled task', () => {
    expect(popDelays(tree, null, ['a1', 'a2x']).get('a2x')).toBe(0);
  });
});

describe('strikeHoldMs', () => {
  it('rests 420ms after the latest strike starts', () => {
    expect(strikeHoldMs(tree, 'b', ['b'])).toBe(420);
    expect(strikeHoldMs(tree, null, ['a'])).toBe(420);
    // a2x is the toggled task's third descendant: its strike starts 0.12s in.
    expect(strikeHoldMs(tree, 'a', ['a', 'a1', 'a2', 'a2x'])).toBe(540);
  });
});
