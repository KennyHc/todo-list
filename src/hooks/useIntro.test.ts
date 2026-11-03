import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hook keeps a module-level "already played" flag, so each test loads a fresh copy.
const load = async () => (await import('./useIntro')).useIntro;

describe('useIntro', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('is active on the first mount and switches off after the duration', async () => {
    const useIntro = await load();
    const { result } = renderHook(() => useIntro(1800));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1800));
    expect(result.current).toBe(false);
  });

  it('plays only once per page load, not on later mounts', async () => {
    const useIntro = await load();
    const first = renderHook(() => useIntro(1800));
    act(() => vi.advanceTimersByTime(1800));
    first.unmount();

    const second = renderHook(() => useIntro(1800));
    expect(second.result.current).toBe(false);
  });

  it('still ends when the first mount is torn down early (StrictMode remount)', async () => {
    const useIntro = await load();
    const { result, rerender } = renderHook(() => useIntro(1800), { reactStrictMode: true });
    expect(result.current).toBe(true);
    rerender();
    act(() => vi.advanceTimersByTime(1800));
    expect(result.current).toBe(false);
  });
});
