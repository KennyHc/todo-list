import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../store/ui';
import { msUntilMidnight, useToday } from './useToday';

const setVisibility = (state: DocumentVisibilityState) =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

describe('useToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 23, 59, 0));
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('starts on the real date, even if the store held an older one', () => {
    useUIStore.setState({ today: '2026-11-01' });
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-11-05');
  });

  it('moves to the new day at local midnight, and again the night after', () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-11-05');
    act(() => vi.advanceTimersByTime(59_000));
    expect(result.current).toBe('2026-11-05');
    act(() => vi.advanceTimersByTime(1_000 + 100)); // just past midnight (the timer has slack)
    expect(result.current).toBe('2026-11-06');
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(result.current).toBe('2026-11-07');
  });

  it('rechecks when the page becomes visible again (a phone that slept past midnight)', () => {
    const { result } = renderHook(() => useToday());
    // The clock jumps without the timer firing, as it does while a phone sleeps.
    vi.setSystemTime(new Date(2026, 10, 6, 7, 0));
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-11-05');
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-11-06');
  });

  it('rechecks on window focus', () => {
    const { result } = renderHook(() => useToday());
    vi.setSystemTime(new Date(2026, 10, 6, 7, 0));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe('2026-11-06');
  });

  it('runs one shared clock and stops it when the last user unmounts', () => {
    const a = renderHook(() => useToday());
    const b = renderHook(() => useToday());
    expect(vi.getTimerCount()).toBe(1);
    a.unmount();
    expect(vi.getTimerCount()).toBe(1);
    b.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts to the next local midnight', () => {
    expect(msUntilMidnight(new Date(2026, 10, 5, 23, 0, 0))).toBe(60 * 60 * 1000);
  });
});
