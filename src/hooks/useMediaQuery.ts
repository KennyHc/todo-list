import { useSyncExternalStore } from 'react';

/** Follows a CSS media query. False where matchMedia doesn't exist (SSR, jsdom). */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    const m = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
    m?.addEventListener?.('change', onChange);
    return () => m?.removeEventListener?.('change', onChange);
  };
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' ? (window.matchMedia?.(query)?.matches ?? false) : false),
    () => false,
  );
}

/** Phone-width viewport: popovers become bottom sheets and rows go compact. */
export const useIsPhone = () => useMediaQuery('(max-width: 480px)');
