import type { KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useThemeStore, type ThemePref } from '../store/theme';
import styles from './ThemeToggle.module.css';

const OPTIONS: { value: ThemePref; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function ThemeToggle() {
  const pref = useThemeStore((s) => s.pref);
  const setPref = useThemeStore((s) => s.setPref);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    const i = OPTIONS.findIndex((o) => o.value === pref);
    const n = (i + step + OPTIONS.length) % OPTIONS.length;
    setPref(OPTIONS[n].value);
    (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Theme" className={styles.track}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = pref === value;
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
            onClick={() => setPref(value)}
            onKeyDown={onKeyDown}
          >
            {active && (
              <motion.span
                layoutId="theme-thumb"
                className={styles.thumb}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <Icon size={14} strokeWidth={1.75} className={styles.icon} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
