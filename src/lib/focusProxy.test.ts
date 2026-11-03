import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { primeKeyboard, registerFocusProxy } from './focusProxy';

const setTouch = (touch: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: touch,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as never;
};

describe('primeKeyboard', () => {
  let proxy: HTMLInputElement;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    proxy = document.createElement('input');
    document.body.append(proxy);
    registerFocusProxy(proxy);
  });

  afterEach(() => {
    vi.useRealTimers();
    registerFocusProxy(null);
    proxy.remove();
    window.matchMedia = originalMatchMedia;
  });

  it('focuses the proxy synchronously on touch devices', () => {
    setTouch(true);
    primeKeyboard();
    expect(document.activeElement).toBe(proxy);
  });

  it('does nothing on non-touch devices', () => {
    setTouch(false);
    primeKeyboard();
    expect(document.activeElement).not.toBe(proxy);
  });

  it('releases the keyboard if no real input claims focus', () => {
    setTouch(true);
    primeKeyboard();
    vi.advanceTimersByTime(700);
    expect(document.activeElement).not.toBe(proxy);
  });

  it('leaves focus alone once the real input has taken it', () => {
    setTouch(true);
    const title = document.createElement('input');
    document.body.append(title);
    primeKeyboard();
    title.focus();
    vi.advanceTimersByTime(700);
    expect(document.activeElement).toBe(title);
    title.remove();
  });
});
