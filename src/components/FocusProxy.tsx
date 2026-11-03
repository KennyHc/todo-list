import { useEffect, useRef } from 'react';
import { registerFocusProxy } from '../lib/focusProxy';

/** The offscreen input behind primeKeyboard(). Render once, at app level. */
export function FocusProxy() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    registerFocusProxy(ref.current);
    return () => registerFocusProxy(null);
  }, []);
  return (
    <input
      ref={ref}
      aria-hidden="true"
      tabIndex={-1}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-focus-proxy=""
      // 16px stops iOS from zooming; the input is invisible and out of the way.
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        padding: 0,
        border: 0,
        opacity: 0,
        fontSize: 16,
        pointerEvents: 'none',
      }}
    />
  );
}
