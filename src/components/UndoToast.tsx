import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTaskStore, type UndoEntry } from '../store/tasks';
import styles from './UndoToast.module.css';
import { dur, ease, spring } from '../styles/motion';

/** How long the toast stays up (paused while hovered or focused). */
const UNDO_MS = 8000;

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function Toast({ entry }: { entry: UndoEntry }) {
  const reduced = useReducedMotion();
  const undo = useTaskStore((s) => s.undoToast);
  const dismiss = useTaskStore((s) => s.dismissUndo);

  return (
    <motion.div
      className={styles.card}
      role="status"
      aria-live="polite"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: dur.fast, ease: ease.out } }
          : { opacity: 0, y: 8, transition: { duration: dur.fast, ease: ease.out } }
      }
      transition={reduced ? { duration: dur.fast } : spring.snappy}
    >
      {/* A newer action swaps the label in place, so rapid actions never stack two cards. */}
      <motion.span
        key={`label-${entry.id}`}
        className={styles.label}
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: dur.fast, ease: ease.out }}
      >
        {entry.label}
      </motion.span>
      <button type="button" className={styles.undo} onClick={undo}>
        Undo
      </button>
      <button type="button" className={styles.close} aria-label="Dismiss" onClick={dismiss}>
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {/* The timer is this CSS animation; hover and focus-within pause it in the stylesheet.
          Keyed by entry so a newer action restarts it. */}
      <span
        key={`bar-${entry.id}`}
        className={styles.bar}
        style={{ animationDuration: `${UNDO_MS}ms` }}
        aria-hidden="true"
        onAnimationEnd={() => {
          if (useTaskStore.getState().undo?.id === entry.id) dismiss();
        }}
      />
    </motion.div>
  );
}

/**
 * Toast for the latest undoable action. Cmd/Ctrl+Z steps back through the undo history, toast or
 * not, and Shift+Cmd/Ctrl+Z or Ctrl+Y redoes; text fields keep their own undo.
 */
export function UndoToast() {
  const entry = useTaskStore((s) => s.undo);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || isTextEntry(e.target)) return;
      const key = e.key.toLowerCase();
      const redo = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.shiftKey);
      if (!redo && (key !== 'z' || e.shiftKey)) return;
      e.preventDefault();
      if (redo) useTaskStore.getState().redoLast();
      else useTaskStore.getState().undoLast();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={styles.region}>
      <AnimatePresence>{entry && <Toast key="undo" entry={entry} />}</AnimatePresence>
    </div>
  );
}
