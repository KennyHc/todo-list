import { useEffect, type ReactNode } from 'react';
import { animate, motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import styles from './StrikeText.module.css';

type Props = {
  done: boolean;
  children: ReactNode;
  /** Seconds to wait before animating a done-state change (cascade timing). */
  delay?: number;
  /** Let a long title wrap onto up to three lines instead of being cut off. */
  wrap?: boolean;
};

const EASE = [0.65, 0, 0.35, 1] as const;

export function StrikeText({ done, children, delay = 0, wrap = false }: Props) {
  // The strike is a background gradient on an inline element, so it follows every wrapped line.
  // Its width (0–100%) is animated; the anchor side flips so it grows from the left on check
  // and retracts toward the right on uncheck.
  const pct = useMotionValue(done ? 100 : 0);
  const backgroundSize = useMotionTemplate`${pct}% 1.5px`;

  useEffect(() => {
    const controls = animate(
      pct,
      done ? 100 : 0,
      done
        ? { duration: 0.32, ease: EASE, delay: delay + 0.08 }
        : { duration: 0.2, ease: EASE, delay },
    );
    return () => controls.stop();
  }, [done, delay, pct]);

  return (
    <span className={styles.wrap}>
      <span className={`${styles.text} ${wrap ? styles.wrapped : ''}`}>
        <motion.span
          className={styles.strike}
          style={{ backgroundSize, backgroundPosition: done ? '0% 58%' : '100% 58%' }}
        >
          <motion.span
            initial={false}
            animate={{ opacity: done ? 0.62 : 1 }}
            transition={{ duration: 0.3, delay: done ? delay + 0.08 : delay }}
          >
            {children}
          </motion.span>
        </motion.span>
      </span>
    </span>
  );
}
