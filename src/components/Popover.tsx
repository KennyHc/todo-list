import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useIsPhone } from '../hooks/useMediaQuery';
import styles from './Popover.module.css';
import { dur, ease, spring } from '../styles/motion';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The trigger. Clicks on it are left to its own handler; the popover is positioned off it. */
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  align?: 'start' | 'end';
  width?: number;
  /** On phones, slide up from the bottom as a full-width sheet instead of anchoring (default). */
  sheetOnMobile?: boolean;
  children: ReactNode;
};

const GAP = 6;
const MARGIN = 8;

/** `maxHeight` is set only when the panel fits on neither side and has to scroll. */
type Pos = { top: number; left: number; flipped: boolean; maxHeight?: number };

function PopoverPanel({
  onClose,
  anchorRef,
  label,
  align = 'start',
  width = 280,
  sheetOnMobile = true,
  children,
}: Omit<Props, 'open'>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0, flipped: false });
  const sheet = useIsPhone() && sheetOnMobile;
  const reduced = useReducedMotion();
  const dragRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number } | null>(null);

  // Place under the anchor, flipping above when there is no room and shifting into the viewport.
  useLayoutEffect(() => {
    if (sheet) return;
    const place = () => {
      const anchor = anchorRef.current;
      const panel = ref.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      const w = panel.offsetWidth;
      // The natural height, even while a max-height from an earlier pass is clipping it.
      const h = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      let left = align === 'end' ? a.right - w : a.left;
      left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
      const below = vh - MARGIN - (a.bottom + GAP);
      const above = a.top - GAP - MARGIN;
      // Below if it fits, else above if that fits, else the roomier side, scrolling inside it.
      const flipped = h > below && (h <= above || above > below);
      const maxHeight = h <= (flipped ? above : below) ? undefined : flipped ? above : below;
      const top = flipped ? a.top - GAP - (maxHeight ?? h) : a.bottom + GAP;
      setPos((p) =>
        p.top === top && p.left === left && p.flipped === flipped && p.maxHeight === maxHeight
          ? p
          : { top, left, flipped, maxHeight },
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (ref.current) observer?.observe(ref.current);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer?.disconnect();
    };
  }, [anchorRef, align, sheet]);

  // A sheet sits on the bottom edge of the layout viewport; lift it above the on-screen keyboard.
  const lift = useKeyboardInset(sheet);

  useEffect(() => {
    const panel = ref.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
      anchorRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  if (sheet) {
    const sheetSpring = reduced ? { duration: 0.01 } : spring.layout;
    return (
      <>
        <motion.div
          className={styles.scrim}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.01 : dur.base }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        />
        <motion.div
          ref={ref}
          className={styles.sheet}
          style={{ bottom: lift }}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={sheetSpring}
        >
          <div ref={dragRef} className={styles.sheetInner}>
            <div
              className={styles.handle}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
                if (dragRef.current) dragRef.current.style.transition = 'none';
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || !dragRef.current) return;
                const dt = Math.max(1, e.timeStamp - d.lastT);
                d.v = (e.clientY - d.lastY) / dt;
                d.lastY = e.clientY;
                d.lastT = e.timeStamp;
                dragRef.current.style.transform = `translateY(${Math.max(0, e.clientY - d.startY)}px)`;
              }}
              onPointerUp={(e) => {
                const d = drag.current;
                drag.current = null;
                if (!d || !dragRef.current) return;
                // Past 80px or flicked downwards: dismiss. Otherwise settle back.
                if (e.clientY - d.startY > 80 || d.v > 0.5) onClose();
                else {
                  dragRef.current.style.transition = 'transform var(--dur-base) var(--ease-out)';
                  dragRef.current.style.transform = '';
                }
              }}
              onPointerCancel={() => {
                drag.current = null;
                if (dragRef.current) dragRef.current.style.transform = '';
              }}
            >
              <span className={styles.grabber} aria-hidden="true" />
            </div>
            <div className={styles.sheetBody}>{children}</div>
          </div>
        </motion.div>
      </>
    );
  }

  const style: CSSProperties = {
    top: pos.top,
    left: pos.left,
    width,
    maxHeight: pos.maxHeight,
    transformOrigin: `${pos.flipped ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}`,
  };

  return (
    <motion.div
      ref={ref}
      className={styles.panel}
      style={style}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.96, y: pos.flipped ? 4 : -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: pos.flipped ? 4 : -4 }}
      transition={{ duration: dur.fast, ease: ease.out }}
    >
      {children}
    </motion.div>
  );
}

/** A non-modal floating panel rendered in a portal, above rows and clear of clipping parents. */
export function Popover({ open, ...rest }: Props) {
  return createPortal(
    <AnimatePresence>{open && <PopoverPanel key="panel" {...rest} />}</AnimatePresence>,
    document.body,
  );
}
