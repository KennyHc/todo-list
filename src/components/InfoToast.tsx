import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import styles from './UndoToast.module.css';
import { dur, ease, spring } from '../styles/motion';

/** A one-shot info toast (no undo) that dismisses itself via the CSS timer bar. */
export function InfoToast({
  id,
  message,
  action,
  persistent = false,
  onDismiss,
}: {
  /** Changes for every new message so a repeat restarts the timer. */
  id: string | number;
  message: string | null;
  /** An optional button, styled like Undo. Running it also dismisses the toast. */
  action?: { label: string; run: () => void };
  /** Stays until dismissed: no countdown bar, no auto-dismiss. */
  persistent?: boolean;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <div className={styles.region}>
      <AnimatePresence>
        {message !== null && (
          <motion.div
            key={id}
            className={styles.card}
            role="status"
            aria-live="polite"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: dur.fast, ease: ease.out } }}
            transition={reduced ? { duration: dur.fast } : spring.snappy}
          >
            <span className={styles.label} style={{ whiteSpace: 'normal' }}>
              {message}
            </span>
            {action && (
              <button
                type="button"
                className={styles.undo}
                onClick={() => {
                  action.run();
                  onDismiss();
                }}
              >
                {action.label}
              </button>
            )}
            <button type="button" className={styles.close} aria-label="Dismiss" onClick={onDismiss}>
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
            {!persistent && (
              <span className={styles.bar} aria-hidden="true" onAnimationEnd={onDismiss} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
