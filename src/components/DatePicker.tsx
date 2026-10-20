import { addDays } from '../lib/dates';
import type { Repeat } from '../types';
import { todayISO } from '../lib/views';
import { RepeatPicker } from './RepeatPicker';
import styles from './DatePicker.module.css';

type Props = {
  value: string | null;
  onChange: (date: string | null) => void;
  /** Called after a quick pick, so a popover can close itself. */
  onPicked?: () => void;
  /** With `onRepeatChange`, a Repeat control follows the date choices. */
  repeat?: Repeat | null;
  onRepeatChange?: (repeat: Repeat | null) => void;
};

const QUICK = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
] as const;

/** Quick picks plus a native date input. */
export function DatePicker({ value, onChange, onPicked, repeat = null, onRepeatChange }: Props) {
  const today = todayISO();
  return (
    <div className={styles.picker}>
      <div className={styles.quick}>
        {QUICK.map(({ label, days }) => {
          const date = addDays(today, days);
          return (
            <button
              key={label}
              type="button"
              className={styles.pick}
              aria-pressed={value === date}
              onClick={() => {
                onChange(date);
                onPicked?.();
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <input
        type="date"
        className={styles.date}
        aria-label="Due date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {onRepeatChange && (
        <>
          <p className={styles.sub}>Repeat</p>
          <RepeatPicker value={repeat} onChange={onRepeatChange} />
        </>
      )}
      {value !== null && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => {
            onChange(null);
            onPicked?.();
          }}
        >
          Clear date
        </button>
      )}
    </div>
  );
}
