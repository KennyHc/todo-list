import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import styles from './BreakdownNudge.module.css';

type Props = { onBreakdown: () => void; flat?: boolean };

export function BreakdownNudge({ onBreakdown, flat }: Props) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 36 }}
      style={{ overflow: 'hidden' }}
    >
      <div className={`${styles.nudge} ${flat ? styles.flat : ''}`}>
        <span className={styles.message}>
          <Sparkles className={styles.icon} size={13} strokeWidth={1.75} aria-hidden="true" />
          <span className={styles.full}>Large task — consider breaking it down</span>
          <span className={styles.short}>Large task</span>
        </span>
        <button type="button" className={styles.button} onClick={onBreakdown}>
          Add subtasks →
        </button>
      </div>
    </motion.div>
  );
}
