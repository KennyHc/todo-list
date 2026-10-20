import type { KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, History, ListTree, Sun, type LucideIcon } from 'lucide-react';
import { useTaskStore } from '../store/tasks';
import { useUIStore, useView, viewOrder, type View } from '../store/ui';
import styles from './ViewSwitch.module.css';
import { spring } from '../styles/motion';

const OPTION: Record<View, { label: string; Icon: LucideIcon }> = {
  today: { label: 'Today', Icon: Sun },
  tree: { label: 'Tree', Icon: ListTree },
  deadline: { label: 'By deadline', Icon: CalendarClock },
  history: { label: 'History', Icon: History },
};

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function ViewSwitch() {
  const view = useView();
  const setView = useUIStore((s) => s.setView);
  const todayView = useTaskStore((s) => s.settings.todayView);
  // Today comes first, and only exists while the feature is on.
  const options = viewOrder(todayView).map((value) => ({ value, ...OPTION[value] }));

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === view);
    const n = (i + step + options.length) % options.length;
    setView(options[n].value);
    (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
  };

  return (
    <div role="radiogroup" aria-label="View" className={styles.track} data-count={options.length}>
      {options.map(({ value, label, Icon }) => {
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
                transition={spring.snappy}
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
