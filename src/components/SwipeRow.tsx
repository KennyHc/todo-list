import type { CSSProperties, ReactNode } from 'react';
import { motion, useTransform } from 'framer-motion';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { useSwipeRow } from '../hooks/useSwipeRow';
import { swipeThreshold } from '../lib/swipe';
import styles from './SwipeRow.module.css';

type Props = {
  enabled: boolean;
  color: string;
  done: boolean;
  /** Leaf rows slide off before deleting; parents spring back and ask first. */
  deleteKind: 'slide' | 'confirm';
  onComplete: () => void;
  onDelete: () => void;
  children: ReactNode;
};

const POP = { type: 'spring', stiffness: 600, damping: 14 } as const;

/** Wraps a row's content: swipe right to complete or reopen, left to delete. Touch only. */
export function SwipeRow({
  enabled,
  color,
  done,
  deleteKind,
  onComplete,
  onDelete,
  children,
}: Props) {
  const { x, swiping, armed, handlers } = useSwipeRow({
    enabled,
    deleteKind,
    onComplete,
    onDelete,
  });

  // Layers fade in as the row moves; the icon grows toward the threshold (96px floor as a guess
  // until the width is known, which only matters for the first frames of the curve).
  const rightOpacity = useTransform(x, [0, 12], [0, 1]);
  const leftOpacity = useTransform(x, [0, -12], [0, 1]);
  const rightProgress = useTransform(x, (v) => Math.min(Math.max(v / swipeThreshold(0), 0), 1));
  const leftProgress = useTransform(x, (v) => Math.min(Math.max(-v / swipeThreshold(0), 0), 1));
  const rightScale = useTransform(rightProgress, [0, 1], [0.6, 1]);
  const leftScale = useTransform(leftProgress, [0, 1], [0.6, 1]);
  const rightIconOpacity = useTransform(rightProgress, [0, 1], [0.4, 1]);
  const leftIconOpacity = useTransform(leftProgress, [0, 1], [0.4, 1]);

  const Icon = done ? RotateCcw : Check;

  return (
    <div
      className={styles.swipe}
      data-swiping={swiping || undefined}
      data-enabled={enabled || undefined}
      style={{ '--swipe-color': color } as CSSProperties}
    >
      {enabled && (
        <>
          <motion.div
            className={`${styles.layer} ${styles.complete}`}
            style={{ opacity: rightOpacity }}
            data-armed={armed === 'right' || undefined}
            aria-hidden="true"
          >
            <motion.span
              className={styles.action}
              style={{ scale: rightScale, opacity: rightIconOpacity }}
            >
              <motion.span
                className={styles.pop}
                animate={{ scale: armed === 'right' ? [1, 1.3, 1] : 1 }}
                transition={POP}
              >
                <Icon size={18} strokeWidth={2} />
              </motion.span>
              {done ? 'Reopen' : 'Done'}
            </motion.span>
          </motion.div>
          <motion.div
            className={`${styles.layer} ${styles.remove}`}
            style={{ opacity: leftOpacity }}
            data-armed={armed === 'left' || undefined}
            aria-hidden="true"
          >
            <motion.span
              className={styles.action}
              style={{ scale: leftScale, opacity: leftIconOpacity }}
            >
              <motion.span
                className={styles.pop}
                animate={{ scale: armed === 'left' ? [1, 1.3, 1] : 1 }}
                transition={POP}
              >
                <Trash2 size={18} strokeWidth={2} />
              </motion.span>
              Delete
            </motion.span>
          </motion.div>
        </>
      )}
      <motion.div className={styles.surface} style={{ x }} {...handlers}>
        {children}
      </motion.div>
    </div>
  );
}
