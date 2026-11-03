import { useRef, type KeyboardEvent } from 'react';
import type { Repeat } from '../types';
import styles from './RepeatPicker.module.css';

type Choice = { key: string; label: string; repeat: Repeat | null };

// "Weekly" carries no weekday: it steps seven days from the due date, so it follows the date.
const CHOICES: readonly Choice[] = [
  { key: 'none', label: 'None', repeat: null },
  { key: 'day', label: 'Daily', repeat: { every: 'day' } },
  { key: 'weekday', label: 'Weekdays', repeat: { every: 'weekday' } },
  { key: 'week', label: 'Weekly', repeat: { every: 'week' } },
  { key: 'month', label: 'Monthly', repeat: { every: 'month' } },
];

type Props = {
  value: Repeat | null;
  onChange: (repeat: Repeat | null) => void;
};

/** None / Daily / Weekdays / Weekly / Monthly. "Every Monday" and the like show as Weekly. */
export function RepeatPicker({ value, onChange }: Props) {
  const groupRef = useRef<HTMLDivElement>(null);
  const current = CHOICES.findIndex(
    (c) => (c.repeat?.every ?? 'none') === (value?.every ?? 'none'),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (current + step + CHOICES.length) % CHOICES.length;
    onChange(CHOICES[next].repeat);
    (groupRef.current?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div ref={groupRef} role="radiogroup" aria-label="Repeat" className={styles.group}>
      {CHOICES.map((choice, i) => (
        <button
          key={choice.key}
          type="button"
          role="radio"
          aria-checked={i === current}
          tabIndex={i === current ? 0 : -1}
          className={styles.seg}
          onClick={() => {
            // Re-picking the current choice keeps it as is (an "every Monday" stays Monday).
            if (i !== current) onChange(choice.repeat);
          }}
          onKeyDown={onKeyDown}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
