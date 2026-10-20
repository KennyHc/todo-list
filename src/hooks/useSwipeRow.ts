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
  REVEAL_WIDTH,
  rubberBand,
  stagedArmed,
  stagedRelease,
  stagedTravel,
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
  /**
   * Two-stage left swipe (Later + Delete buttons, like iOS Mail). A short or medium swipe opens
   * the buttons; a full swipe still deletes. Off: one stage, a swipe past the threshold deletes.
   */
  staged?: boolean;
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
  staged = false,
  onComplete,
  onDelete,
}: Options) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const [swiping, setSwiping] = useState(false);
  const [armed, setArmed] = useState<SwipeSide | null>(null);
  /** The Later and Delete buttons are showing (staged only). */
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  /** Where the row sat when the current drag began: 0, or -REVEAL_WIDTH for an open row. */
  const base = useRef(0);
  const width = useRef(0);
  const blocked = useRef(true);
  const engaged = useRef(false);
  const armedRef = useRef<SwipeSide | null>(null);
  const justSwiped = useRef(false);
  const latest = useRef({ onComplete, onDelete, deleteKind, allowDelete, staged, reduced });
  latest.current = { onComplete, onDelete, deleteKind, allowDelete, staged, reduced };

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
      if (!engaged.current && !openRef.current) setSwiping(false);
    });
  }, [x]);

  /** Slides an open row home (or just springs a dragged one back). */
  const close = useCallback(() => {
    if (openRef.current) {
      openRef.current = false;
      setOpen(false);
    }
    springBack();
  }, [springBack]);

  const reveal = useCallback(() => {
    openRef.current = true;
    setOpen(true);
    setSwiping(true);
    const to = latest.current.reduced ? { duration: dur.fast, ease: ease.out } : SPRING;
    void animate(x, -REVEAL_WIDTH, to);
  }, [x]);

  /** The Delete button, or a full swipe: the same path as an unrevealed delete. */
  const runDelete = useCallback(
    (rowWidth: number) => {
      const { onDelete, deleteKind, reduced } = latest.current;
      if (deleteKind === 'slide') {
        openRef.current = false;
        setOpen(false);
        const slide = animate(x, -Math.max(rowWidth, 1), {
          duration: reduced ? 0 : SLIDE_SECONDS,
          ease: 'easeIn',
        });
        void slide.then(onDelete);
      } else {
        close();
        onDelete();
      }
    },
    [x, close],
  );

  const reset = useCallback(() => {
    engaged.current = false;
    blocked.current = true;
    setArmedSide(null);
  }, [setArmedSide]);

  /**
   * Release handler: `dx` is finger travel since the drag began, `rowWidth` the row's width.
   * Returns what ran (staged: opening the buttons is not an action).
   */
  const onSwipeEnd = useCallback(
    (dx: number, rowWidth: number): SwipeAction => {
      const { onComplete, onDelete, deleteKind, allowDelete, staged } = latest.current;
      if (staged && allowDelete) {
        const wasOpen = base.current !== 0;
        const release = stagedRelease(base.current + dx, rowWidth, wasOpen);
        if (release === 'delete') runDelete(rowWidth);
        else if (release === 'reveal') reveal();
        else {
          close();
          if (release === 'complete') onComplete();
        }
        return release === 'complete' || release === 'delete' ? release : null;
      }
      const swiped = swipeAction(dx, swipeThreshold(rowWidth));
      const action = swiped === 'delete' && !allowDelete ? null : swiped;
      if (action === 'delete' && deleteKind === 'slide') {
        runDelete(rowWidth);
      } else {
        springBack();
        if (action === 'complete') onComplete();
        else if (action === 'delete') onDelete();
      }
      return action;
    },
    [springBack, close, reveal, runDelete],
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
    base.current = openRef.current ? -REVEAL_WIDTH : 0;
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
    if (latest.current.staged && latest.current.allowDelete) {
      const total = base.current + info.offset.x;
      x.set(stagedTravel(total, width.current));
      setArmedSide(stagedArmed(total, width.current, base.current !== 0));
      return;
    }
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
    // A tap on an open row only closes it; it doesn't also edit, check or open anything.
    if (openRef.current) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (!justSwiped.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Turning off mid-swipe (e.g. a drag or edit starts) puts the row back.
  useEffect(() => {
    if (enabled) return;
    if (engaged.current) reset();
    if (openRef.current) close();
    else if (x.get() !== 0) springBack();
  }, [enabled, reset, springBack, close, x]);

  // An open row closes when the finger lands anywhere else, or when the page scrolls.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onScroll = () => close();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  return {
    x,
    root,
    swiping: swiping || open,
    armed,
    open,
    /** The Delete button's action; also what a full swipe runs. */
    deleteNow: () => runDelete(width.current || root.current?.getBoundingClientRect().width || 0),
    closeRow: close,
    onSwipeEnd,
    handlers: { onPointerDownCapture, onPan, onPanEnd, onClickCapture },
  };
}
