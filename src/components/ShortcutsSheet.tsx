import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { shortcutGroups } from '../lib/shortcuts';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { Keys } from './Kbd';
import styles from './ShortcutsSheet.module.css';
import { dur, ease } from '../styles/motion';

function Sheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const todayView = useTaskStore((s) => s.settings.todayView);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -6 }}
        transition={{ duration: dur.base, ease: ease.out }}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={onClose}
          >
            <X size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.groups}>
          {shortcutGroups(todayView).map((group) => (
            <section key={group.title} className={styles.group}>
              <h3 className={styles.heading}>{group.title}</h3>
              <ul className={styles.list}>
                {group.items.map((item) => (
                  <li key={item.label} className={styles.row}>
                    <span className={styles.label}>{item.label}</span>
                    <span className={styles.keys}>
                      {item.keys.map((combo, i) => (
                        <span key={combo.join('+')} className={styles.alt}>
                          {i > 0 && <span className={styles.or}>or</span>}
                          <Keys keys={combo} />
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** A modal listing every keyboard shortcut. Opened with `?` or from the palette. */
export function ShortcutsSheet() {
  const open = useUIStore((s) => s.sheetOpen);
  const setOpen = useUIStore((s) => s.setSheetOpen);
  return createPortal(
    <AnimatePresence>
      {open && <Sheet key="sheet" onClose={() => setOpen(false)} />}
    </AnimatePresence>,
    document.body,
  );
}
