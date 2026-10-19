import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import styles from './StrikeText.module.css';

type Props = {
  done: boolean;
  children: ReactNode;
  /** Seconds to wait before animating a done-state change (cascade timing). */
  delay?: number;
};

const EASE = [0.65, 0, 0.35, 1] as const;

export function StrikeText({ done, children, delay = 0 }: Props) {
  return (
    <span className={styles.wrap}>
      <motion.span
        className={styles.text}
        initial={false}
        animate={{ opacity: done ? 0.55 : 1 }}
        transition={{ duration: 0.3, delay: done ? delay + 0.08 : delay }}
      >
        {children}
      </motion.span>
      <motion.span
        className={styles.line}
        aria-hidden="true"
        initial={false}
        // Grow from the left on check, retract toward the right on uncheck.
        style={{ transformOrigin: done ? 'left center' : 'right center' }}
        animate={{ scaleX: done ? 1 : 0 }}
        transition={
          done
            ? { duration: 0.32, ease: EASE, delay: delay + 0.08 }
            : { duration: 0.2, ease: EASE, delay }
        }
      />
    </span>
  );
}
