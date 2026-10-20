import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { animate, useMotionValue, useReducedMotion, type PanInfo } from 'framer-motion';
import {
  MAX_TRAVEL_RATIO,
  rubberBand,
  swipeAction,
  swipeIntent,
  swipeThreshold,
  type SwipeAction,
} from '../lib/swipe';
import { dur, ease, spring } from '../styles/motion';

export type SwipeSide = 'right' | 'left';

type Options = {
  enabled: boolean;
  /** Leaf: slide the row off, then delete. Parent: spring back and let `onDelete` ask. */
  deleteKind: 'slide' | 'confirm';
  /** False: only the right swipe exists; dragging left does nothing. */
  allowDelete?: boolean;
  onComplete: () => void;
  onDelete: () => void;
};

const SPRING = spring.snappy;
const SLIDE_SECONDS = 0.18;
/** Controls the gesture never starts on. Elements opt back in with data-swipe-through. */
const INTERACTIVE =
  'button, input, textarea, select, a, [role="checkbox"], [role="radio"], [data-no-swipe]';

export function useSwipeRow({
  enabled,
  deleteKind,
  allowDelete = true,
  onComplete,
  onDelete,
}: Options) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const [swiping, setSwiping] = useState(false);
  const [armed, setArmed] = useState<SwipeSide | null>(null);
  const width = useRef(0);
  const blocked = useRef(true);
  const engaged = useRef(false);
  const armedRef = useRef<SwipeSide | null>(null);
  const justSwiped = useRef(false);
  const latest = useRef({ onComplete, onDelete, deleteKind, allowDelete, reduced });
  latest.current = { onComplete, onDelete, deleteKind, allowDelete, reduced };

  const setArmedSide = useCallback((side: SwipeSide | null) => {
    if (armedRef.current === side) return;
    armedRef.current = side;
    setArmed(side);
    if (side) navigator.vibrate?.(8);
  }, []);

  const springBack = useCallback(() => {
    const back = latest.current.reduced ? { duration: dur.fast, ease: ease.out } : SPRING;
    // `swiping` stays on until the row is home, so the clip and opaque backing hold meanwhile.
    void animate(x, 0, back).then(() => {
      if (!engaged.current) setSwiping(false);
    });
  }, [x]);

  const reset = useCallback(() => {
    engaged.current = false;
    blocked.current = true;
    setArmedSide(null);
  }, [setArmedSide]);

  /** Release handler: `dx` is finger travel, `rowWidth` the row's width. Returns what ran. */
  const onSwipeEnd = useCallback(
    (dx: number, rowWidth: number): SwipeAction => {
      const { onComplete, onDelete, deleteKind, allowDelete, reduced } = latest.current;
      const swiped = swipeAction(dx, swipeThreshold(rowWidth));
      const action = swiped === 'delete' && !allowDelete ? null : swiped;
      if (action === 'delete' && deleteKind === 'slide') {
        const slide = animate(x, -Math.max(rowWidth, 1), {
          duration: reduced ? 0 : SLIDE_SECONDS,
          ease: 'easeIn',
        });
        void slide.then(onDelete);
      } else {
        springBack();
        if (action === 'complete') onComplete();
        else if (action === 'delete') onDelete();
      }
      return action;
    },
    [x, springBack],
  );

  const onPointerDownCapture = (e: ReactPointerEvent<HTMLElement>) => {
    engaged.current = false;
    const target = e.target as Element;
    const control = target.closest(INTERACTIVE);
    blocked.current =
      !enabled ||
      e.pointerType === 'mouse' ||
      (control !== null && !control.hasAttribute('data-swipe-through'));
    width.current = e.currentTarget.getBoundingClientRect().width;
  };

  const onPan = (_: Event, info: PanInfo) => {
    if (blocked.current) return;
    if (!engaged.current) {
      const intent = swipeIntent(info.offset.x, info.offset.y);
      if (intent === null) return;
      if (intent === 'y') {
        blocked.current = true;
        return;
      }
      engaged.current = true;
      x.stop();
      setSwiping(true);
    }
    const threshold = swipeThreshold(width.current);
    const dx = latest.current.allowDelete ? info.offset.x : Math.max(0, info.offset.x);
    x.set(rubberBand(dx, threshold, width.current * MAX_TRAVEL_RATIO));
    setArmedSide(dx >= threshold ? 'right' : dx <= -threshold ? 'left' : null);
  };

  const onPanEnd = (_: Event, info: PanInfo) => {
    if (!engaged.current) {
      blocked.current = true;
      return;
    }
    // A touch that moved should not also click whatever it ended on.
    justSwiped.current = true;
    window.setTimeout(() => (justSwiped.current = false), 80);
    const dx = info.offset.x;
    reset();
    onSwipeEnd(dx, width.current);
  };

  const onClickCapture = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (!justSwiped.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Turning off mid-swipe (e.g. a drag or edit starts) puts the row back.
  useEffect(() => {
    if (enabled) return;
    if (engaged.current) reset();
    if (x.get() !== 0) springBack();
  }, [enabled, reset, springBack, x]);

  return {
    x,
    swiping,
    armed,
    onSwipeEnd,
    handlers: { onPointerDownCapture, onPan, onPanEnd, onClickCapture },
  };
}
