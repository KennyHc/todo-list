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
