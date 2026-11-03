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
import { AnimatePresence, motion } from 'framer-motion';
import styles from './Popover.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The trigger. Clicks on it are left to its own handler; the popover is positioned off it. */
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  align?: 'start' | 'end';
  width?: number;
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
  children,
}: Omit<Props, 'open'>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0, flipped: false });

  // Place under the anchor, flipping above when there is no room and shifting into the viewport.
  useLayoutEffect(() => {
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
  }, [anchorRef, align]);

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
