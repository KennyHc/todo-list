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
