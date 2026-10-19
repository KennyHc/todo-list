import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTaskStore, type UndoEntry } from '../store/tasks';
import styles from './UndoToast.module.css';

const SPRING = { type: 'spring', stiffness: 520, damping: 34 } as const;

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function Toast({ entry }: { entry: UndoEntry }) {
  const reduced = useReducedMotion();
  const undo = useTaskStore((s) => s.undoLast);
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
          ? { opacity: 0, transition: { duration: 0.15 } }
          : { opacity: 0, y: 8, transition: { duration: 0.15 } }
      }
      transition={reduced ? { duration: 0.15 } : SPRING}
    >
      <span className={styles.label}>{entry.label}</span>
      <button type="button" className={styles.undo} onClick={undo}>
        Undo
      </button>
      <button type="button" className={styles.close} aria-label="Dismiss" onClick={dismiss}>
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {/* The 5s timer is this CSS animation; hover and focus-within pause it in the stylesheet. */}
      <span
        className={styles.bar}
        aria-hidden="true"
        onAnimationEnd={() => {
          if (useTaskStore.getState().undo?.id === entry.id) dismiss();
        }}
      />
    </motion.div>
  );
}

/** Toast for the latest undoable action. Cmd/Ctrl+Z also undoes, except inside text fields. */
export function UndoToast() {
  const entry = useTaskStore((s) => s.undo);
  const active = entry !== null;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'z' || isTextEntry(e.target)) return;
      e.preventDefault();
      useTaskStore.getState().undoLast();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  return (
    <div className={styles.region}>
      <AnimatePresence>{entry && <Toast key={entry.id} entry={entry} />}</AnimatePresence>
    </div>
  );
}
