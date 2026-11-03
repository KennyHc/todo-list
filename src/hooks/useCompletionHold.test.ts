import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { popDelays, REDUCED_HOLD_MS, useCompletionHold } from './useCompletionHold';

let reduced = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduced,
}));

const get = () => useTaskStore.getState();
const open = () =>
  Object.values(get().tasks)
    .filter((t) => !t.done)
    .map((t) => t.id);

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  resetTaskStore();
});
afterEach(() => vi.useRealTimers());

function setup(extra?: Parameters<typeof useCompletionHold>[1]) {
  const view = renderHook(({ keys }) => useCompletionHold(keys, extra), {
    initialProps: { keys: open() },
  });
  /** Re-renders with the ids of the open tasks, as the list would after a store change. */
  const sync = () => view.rerender({ keys: open() });
  return { ...view, sync };
}

describe('useCompletionHold', () => {
  it('keeps a completed row in place for the strike, then lets it go', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((title) => get().add({ title }));
    const { result, sync } = setup();
    act(() => get().toggle(b));
    sync();
    expect(result.current).toEqual([a, b, c]);
    act(() => void vi.advanceTimersByTime(419));
    expect(result.current).toEqual([a, b, c]);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toEqual([a, c]);
  });

  it('shows added rows immediately while a completed one is held', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    const { result, sync } = setup();
    act(() => get().toggle(a));
    sync();
    let d = '';
    act(() => void (d = get().add({ title: 'D' })));
    sync();
    expect(result.current).toEqual([a, b, d]);
  });

  it('cancels the removal when the task is undone, without dropping the row', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    const { result, sync } = setup();
    act(() => get().toggle(a));
    sync();
    act(() => void vi.advanceTimersByTime(200));
    act(() => get().undoLast());
    sync();
    expect(result.current).toEqual([a, b]);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toEqual([a, b]);
  });

  it('releases a deleted row at once (it leaves with the delete exit)', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    const { result, sync } = setup();
    act(() => get().remove(a));
    sync();
    expect(result.current).toEqual([b]);
  });

  it('holds a whole cascade until the last strike has played, and staggers the pops', () => {
    const p = get().add({ title: 'P' });
    const c1 = get().add({ title: 'C1', parentId: p });
    const c2 = get().add({ title: 'C2', parentId: p });
    const { result, sync } = setup();
    act(() => get().toggle(p));
    sync();
    expect(result.current).toEqual([p, c1, c2]);
    // Second child's strike starts 80ms in, plus the 420ms rest.
    act(() => void vi.advanceTimersByTime(499));
    expect(result.current).toEqual([p, c1, c2]);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toEqual([]);
    expect(popDelays.get(c1)).toBeCloseTo(0.04);
    expect(popDelays.get(c2)).toBeCloseTo(0.08);
    expect(popDelays.get(p)).toBeCloseTo(0.2);
  });

  it('holds only 150ms under reduced motion, with no stagger', () => {
    reduced = true;
    const p = get().add({ title: 'P' });
    const c = get().add({ title: 'C', parentId: p });
    const { result, sync } = setup();
    act(() => get().toggle(p));
    sync();
    expect(result.current).toEqual([p, c]);
    act(() => void vi.advanceTimersByTime(REDUCED_HOLD_MS));
    expect(result.current).toEqual([]);
    expect(popDelays.get(p)).toBe(0);
  });

  it('keeps a companion key (a section header) with the held row', () => {
    const a = get().add({ title: 'A' });
    const b = get().add({ title: 'B' });
    const holdWith = (keys: string[], id: string) => [keys[keys.indexOf(id) - 1]];
    const { result, rerender } = renderHook(({ keys }) => useCompletionHold(keys, { holdWith }), {
      initialProps: { keys: ['section:x', a, 'section:y', b] },
    });
    act(() => get().toggle(a));
    rerender({ keys: ['section:y', b] });
    expect(result.current).toEqual(['section:x', a, 'section:y', b]);
    act(() => void vi.advanceTimersByTime(420));
    expect(result.current).toEqual(['section:y', b]);
  });

  it('does not hold anything on the first render', () => {
    const a = get().add({ title: 'A' });
    act(() => get().toggle(a));
    const { result } = setup();
    expect(result.current).toEqual([]);
  });
});
