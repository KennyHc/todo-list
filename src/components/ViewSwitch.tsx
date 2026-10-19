import type { KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, History, ListTree, type LucideIcon } from 'lucide-react';
import { useUIStore, type View } from '../store/ui';
import styles from './ViewSwitch.module.css';

const OPTIONS: { value: View; label: string; Icon: LucideIcon }[] = [
  { value: 'tree', label: 'Tree', Icon: ListTree },
  { value: 'deadline', label: 'By deadline', Icon: CalendarClock },
  { value: 'history', label: 'History', Icon: History },
];

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function ViewSwitch() {
  const view = useUIStore((s) => s.view);
  const setView = useUIStore((s) => s.setView);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    const i = OPTIONS.findIndex((o) => o.value === view);
    const n = (i + step + OPTIONS.length) % OPTIONS.length;
    setView(OPTIONS[n].value);
    (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
  };

  return (
    <div role="radiogroup" aria-label="View" className={styles.track}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            tabIndex={active ? 0 : -1}
            className={`${styles.option} ${active ? styles.active : ''}`}
            onClick={() => setView(value)}
            onKeyDown={onKeyDown}
          >
            {active && (
              <motion.span
                layoutId="view-thumb"
                className={styles.thumb}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <Icon size={14} strokeWidth={1.75} className={styles.icon} aria-hidden="true" />
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
