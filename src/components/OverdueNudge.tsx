import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useOverdueIds, useTaskStore } from '../store/tasks';
import styles from './OverdueNudge.module.css';
import { spring } from '../styles/motion';
import { useToday } from '../hooks/useToday';

/**
 * One quiet line above the Tree and By deadline lists, only while something open is overdue:
 * "3 overdue · Move to today". The button moves them all in one undoable step.
 */
export function OverdueNudge({ tag }: { tag: string | null }) {
  const count = useOverdueIds(tag, useToday()).length;
  // Reduced motion: the line appears at full height. While it grows, its wrapper clips the
  // button, so a tap (or the hit-area check) can miss it (#65).
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          key="overdue"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduced ? { duration: 0 } : spring.layout}
          style={{ overflow: 'hidden' }}
        >
          <div className={styles.line} role="status">
            <AlertCircle className={styles.icon} size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{count} overdue</span>
            <span className={styles.dot} aria-hidden="true">
              {'·'}
            </span>
            <button
              type="button"
              className={styles.button}
              onClick={() => useTaskStore.getState().moveOverdueToToday(tag)}
            >
              Move to today
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
