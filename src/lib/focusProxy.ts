import { isTouchDevice } from '../hooks/useIsTouch';

/**
 * iOS only opens the keyboard for an input focused synchronously inside a tap. A new row's
 * input mounts after the state update, too late. So a hidden "proxy" input (rendered once, see
 * components/FocusProxy) is focused inside the tap, and the real input takes focus when it
 * mounts: iOS keeps the keyboard up while focus moves between inputs.
 */
let proxy: HTMLInputElement | null = null;
let releaseTimer: number | undefined;

/** How long the proxy may hold focus when no real input ever claims it. */
const RELEASE_MS = 700;

export function registerFocusProxy(el: HTMLInputElement | null): void {
  proxy = el;
}

/** Call synchronously from a tap handler, before any state update. A no-op without touch. */
export function primeKeyboard(): void {
  if (!proxy || !isTouchDevice()) return;
  proxy.focus({ preventScroll: true });
  window.clearTimeout(releaseTimer);
  // If nothing took over (the add failed), don't leave the keyboard hanging open.
  releaseTimer = window.setTimeout(() => {
    if (document.activeElement === proxy) proxy?.blur();
  }, RELEASE_MS);
}
