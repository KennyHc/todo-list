import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettledOrder } from './useSettledOrder';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useSettledOrder', () => {
  it('delays a pure reorder', () => {
    const { result, rerender } = renderHook(({ ids }) => useSettledOrder(ids, 700), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    rerender({ ids: ['b', 'c', 'a'] });
    expect(result.current).toEqual(['a', 'b', 'c']);
    act(() => void vi.advanceTimersByTime(699));
    expect(result.current).toEqual(['a', 'b', 'c']);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toEqual(['b', 'c', 'a']);
  });

  it('applies an added id immediately', () => {
    const { result, rerender } = renderHook(({ ids }) => useSettledOrder(ids, 700), {
      initialProps: { ids: ['a', 'b'] },
    });
    rerender({ ids: ['a', 'b', 'c'] });
    expect(result.current).toEqual(['a', 'b', 'c']);
  });

  it('applies a removed id immediately', () => {
    const { result, rerender } = renderHook(({ ids }) => useSettledOrder(ids, 700), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    rerender({ ids: ['a', 'c'] });
    expect(result.current).toEqual(['a', 'c']);
  });

  it('restarts the timer when the order changes again, and cleans up on unmount', () => {
    const { result, rerender, unmount } = renderHook(({ ids }) => useSettledOrder(ids, 700), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    rerender({ ids: ['b', 'a', 'c'] });
    act(() => void vi.advanceTimersByTime(500));
    rerender({ ids: ['c', 'b', 'a'] });
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current).toEqual(['a', 'b', 'c']);
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current).toEqual(['c', 'b', 'a']);
    rerender({ ids: ['a', 'b', 'c'] });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useSettledOrder options', () => {
  it('applies a reorder immediately when the structure key changes', () => {
    const { result, rerender } = renderHook(({ ids, key }) => useSettledOrder(ids, 700, { key }), {
      initialProps: { ids: ['a', 'b', 'c'], key: '1' },
    });
    rerender({ ids: ['b', 'c', 'a'], key: '1' });
    expect(result.current).toEqual(['a', 'b', 'c']);
    rerender({ ids: ['c', 'b', 'a'], key: '2' });
    expect(result.current).toEqual(['c', 'b', 'a']);
  });

  it('holds the order while frozen, then settles after the delay once released', () => {
    const { result, rerender } = renderHook(
      ({ ids, frozen }) => useSettledOrder(ids, 700, { frozen }),
      { initialProps: { ids: ['a', 'b', 'c'], frozen: true } },
    );
    rerender({ ids: ['b', 'c', 'a'], frozen: true });
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toEqual(['a', 'b', 'c']);
    rerender({ ids: ['b', 'c', 'a'], frozen: false });
    expect(result.current).toEqual(['a', 'b', 'c']);
    act(() => void vi.advanceTimersByTime(700));
    expect(result.current).toEqual(['b', 'c', 'a']);
  });
});

describe('useSettledOrder with additions', () => {
  it('shows a new id at once but keeps the others in their old order until the delay', () => {
    // 'x' is completed (it will sink) and completing it adds 'n' right after it.
    const { result, rerender } = renderHook(({ ids }) => useSettledOrder(ids, 700), {
      initialProps: { ids: ['a', 'x', 'b'] },
    });
    rerender({ ids: ['a', 'n', 'b', 'x'] });
    expect(result.current).toEqual(['a', 'x', 'n', 'b']);
    act(() => void vi.advanceTimersByTime(699));
    expect(result.current).toEqual(['a', 'x', 'n', 'b']);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toEqual(['a', 'n', 'b', 'x']);
  });

  it('appends an added id with no later neighbour at the end', () => {
    const { result, rerender } = renderHook(({ ids }) => useSettledOrder(ids, 700), {
      initialProps: { ids: ['a', 'b'] },
    });
    rerender({ ids: ['b', 'a', 'c'] });
    expect(result.current).toEqual(['a', 'b', 'c']);
  });

  it('applies everything at once when an anchor (a section header) appears or goes', () => {
    const isAnchor = (id: string) => id.startsWith('section:');
    const { result, rerender } = renderHook(({ ids }) => useSettledOrder(ids, 700, { isAnchor }), {
      initialProps: { ids: ['section:today', 'x', 'y'] },
    });
    rerender({ ids: ['section:today', 'y', 'section:done', 'x'] });
    expect(result.current).toEqual(['section:today', 'y', 'section:done', 'x']);
  });

  it('keeps waiting for a plain reorder when only non-anchor ids are added', () => {
    const isAnchor = (id: string) => id.startsWith('section:');
    const { result, rerender } = renderHook(({ ids }) => useSettledOrder(ids, 700, { isAnchor }), {
      initialProps: { ids: ['section:today', 'x', 'section:done', 'z'] },
    });
    rerender({ ids: ['section:today', 'n', 'section:done', 'x', 'z'] });
    expect(result.current).toEqual(['section:today', 'x', 'n', 'section:done', 'z']);
  });
});
