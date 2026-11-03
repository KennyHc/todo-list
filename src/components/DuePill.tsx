import { Repeat as RepeatIcon } from 'lucide-react';
import { dueLabel, weekdayName } from '../lib/dates';
import { repeatPhrase } from '../lib/recur';
import { dueStatus, todayISO } from '../lib/views';
import type { Repeat } from '../types';
import styles from './DuePill.module.css';

type Props = {
  dueDate: string;
  done?: boolean;
  repeat?: Repeat | null;
  /**
   * How much of the date to say. 'full' is the usual label; 'weekday' just the weekday, and
   * 'icon' only the repeat icon, for rows under a section header (Today, Next 7 days) that already
   * says it.
   */
  display?: 'full' | 'weekday' | 'icon';
};

/** A due date as quiet text; overdue gets a tint. A repeating task carries the repeat icon. */
export function DuePill({ dueDate, done, repeat = null, display = 'full' }: Props) {
  const today = todayISO();
  const status = done ? 'done' : dueStatus(dueDate, today);
  const label = dueLabel(dueDate, today);
  const shown = display === 'weekday' ? weekdayName(dueDate) : label;
  return (
    <span
      className={`${styles.pill} ${styles[status ?? 'later']}`}
      title={`Due ${dueDate}`}
      role={repeat ? 'img' : undefined}
      aria-label={repeat ? `Due ${label}, repeats ${repeatPhrase(repeat)}` : undefined}
    >
      {repeat && (
        <RepeatIcon size={12} strokeWidth={1.75} aria-hidden="true" data-testid="repeat-icon" />
      )}
      {display !== 'icon' && <span>{shown}</span>}
    </span>
  );
}
