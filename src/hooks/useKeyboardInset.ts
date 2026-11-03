import { useEffect, useState } from 'react';

/**
 * How far the on-screen keyboard (or any other overlay that shrinks the visual viewport) covers
 * the bottom of the layout viewport, in px. Fixed bottom elements sit on the layout viewport, so
 * they are lifted by this much to stay in view. Zero where `visualViewport` is missing, and where
 * the browser already resizes the layout with the keyboard (Android `resizes-content`).
 */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) {
      setInset(0);
      return;
    }
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}
