import { motion } from 'framer-motion';
import styles from './BreakdownNudge.module.css';

type Props = { onBreakdown: () => void };

export function BreakdownNudge({ onBreakdown }: Props) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 36 }}
      style={{ overflow: 'hidden' }}
    >
      <div className={styles.card}>
        <span>This looks big — break it down?</span>
        <button type="button" className={styles.button} onClick={onBreakdown}>
          Add subtasks
        </button>
      </div>
    </motion.div>
  );
}
