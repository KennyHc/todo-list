import { useSyncExternalStore } from 'react';

const QUERY = '(hover: none) and (pointer: coarse)';

const mql = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;

function subscribe(onChange: () => void) {
  const m = mql();
  m?.addEventListener?.('change', onChange);
  return () => m?.removeEventListener?.('change', onChange);
}

/** True on touch-primary devices (no hover, coarse pointer); follows changes. */
export function useIsTouch(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mql()?.matches ?? false,
    () => false,
  );
}
