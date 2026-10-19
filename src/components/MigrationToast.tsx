import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useSyncStore } from '../sync/status';
import styles from './UndoToast.module.css';

const plural = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`;

/** One-shot info toast (no undo) after tasks from this device were moved to the account. */
export function MigrationToast() {
  const count = useSyncStore((s) => s.migratedCount);
  const dismiss = () => useSyncStore.getState().setMigratedCount(null);
  const reduced = useReducedMotion();

  return (
    <div className={styles.region}>
      <AnimatePresence>
        {count !== null && (
          <motion.div
            key="migrated"
            className={styles.card}
            role="status"
            aria-live="polite"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={
              reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 520, damping: 34 }
            }
          >
            <span className={styles.label} style={{ whiteSpace: 'normal' }}>
              Moved {plural(count)} from this device to your account
            </span>
            <button type="button" className={styles.close} aria-label="Dismiss" onClick={dismiss}>
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <span className={styles.bar} aria-hidden="true" onAnimationEnd={dismiss} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
