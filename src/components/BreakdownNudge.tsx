import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import styles from './BreakdownNudge.module.css';
import { spring } from '../styles/motion';

type Props = {
  onBreakdown: () => void;
  /** -1 inside a task row, which is the Tab stop for its controls (roving tabindex). */
  tabIndex?: number;
};

export function BreakdownNudge({ onBreakdown, tabIndex }: Props) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={spring.layout}
      style={{ overflow: 'hidden' }}
    >
      <div className={styles.nudge}>
        <span className={styles.message}>
          <Sparkles className={styles.icon} size={13} strokeWidth={1.75} aria-hidden="true" />
          <span className={styles.full}>Large task — consider breaking it down</span>
          <span className={styles.short}>Large task</span>
        </span>
        <button type="button" className={styles.button} tabIndex={tabIndex} onClick={onBreakdown}>
          Add subtasks →
        </button>
      </div>
    </motion.div>
  );
}
