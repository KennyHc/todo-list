import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { isTouchDevice } from './useIsTouch';

/** A real Enter this soon after a deferred one is the same key press, sent twice by the IME. */
const ECHO_MS = 150;
let lastDeferred = -Infinity;

/**
 * Enter for single-line inputs that use an IME.
 *
 * On a phone the keyboard's action key (✓ on Android, return on iOS) often arrives while a word
 * is still being composed (underlined). The IME commits that word itself, so the keydown is left
 * alone (preventing it can drop the word) and `onEnter` runs once the composition has ended and
 * React has the committed text. On desktop an Enter that only commits the composition stays
 * commit-only, as IME users expect.
 *
 * Call `intercept(e)` first in onKeyDown and stop when it returns true; spread `handlers` on the
 * input.
 */
export function useImeEnter(onEnter: () => void) {
  const latest = useRef(onEnter);
  useLayoutEffect(() => {
    latest.current = onEnter;
  });
  const composing = useRef(false);
  const pending = useRef(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const intercept = (e: KeyboardEvent): boolean => {
    // Safari sends the committing Enter with keyCode 229 right after compositionend.
    const imeKey = e.nativeEvent.isComposing || e.keyCode === 229;
    if (e.key !== 'Enter') return imeKey;
    if (imeKey) {
      if (composing.current && isTouchDevice()) pending.current = true;
      return true;
    }
    if (timer.current !== null) {
      // The real Enter beat the deferred one: let it run instead.
      window.clearTimeout(timer.current);
      timer.current = null;
      return false;
    }
    if (performance.now() - lastDeferred < ECHO_MS) {
      e.preventDefault();
      return true;
    }
    return false;
  };

  const handlers = {
    onCompositionStart: () => {
      composing.current = true;
      pending.current = false;
    },
    onCompositionEnd: () => {
      composing.current = false;
      if (!pending.current) return;
      pending.current = false;
      // After the input event that carries the committed word has re-rendered.
      timer.current = window.setTimeout(() => {
        timer.current = null;
        lastDeferred = performance.now();
        latest.current();
      });
    },
  };

  return { intercept, handlers };
}
