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
import { useIsPhone } from '../hooks/useMediaQuery';
import styles from './Popover.module.css';

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

type Pos = { top: number; left: number; flipped: boolean };

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
  const [lift, setLift] = useState(0);

  // Place under the anchor, flipping above when there is no room and shifting into the viewport.
  useLayoutEffect(() => {
    if (sheet) return;
    const place = () => {
      const anchor = anchorRef.current;
      const panel = ref.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      let left = align === 'end' ? a.right - w : a.left;
      left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
      let top = a.bottom + GAP;
      let flipped = false;
      if (top + h > vh - MARGIN && a.top - GAP - h >= MARGIN) {
        top = a.top - GAP - h;
        flipped = true;
      }
      setPos((p) =>
        p.top === top && p.left === left && p.flipped === flipped ? p : { top, left, flipped },
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
  useEffect(() => {
    const vv = window.visualViewport;
    if (!sheet || !vv) return;
    const update = () =>
      setLift(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [sheet]);

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
    const spring = reduced
      ? { duration: 0.01 }
      : ({ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const);
    return (
      <>
        <motion.div
          className={styles.scrim}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.18 }}
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
          transition={spring}
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
                  dragRef.current.style.transition = 'transform 160ms var(--ease-out)';
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
      transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
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
